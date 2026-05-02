import { serve } from '@hono/node-server'
import type { Server } from 'http'
import { env } from './lib/env.js'
import { DataLakeService } from './services/dataLake.js'
import { DatabaseService } from './services/database.js'
import { MessageService } from './services/message.js'
import { JuhexbotAdapter } from './services/juhexbotAdapter.js'
import { JuhexbotAdapterFake } from './services/juhexbotAdapter.fake.js'
import { WebSocketService } from './services/websocket.js'
import { ClientService } from './services/clientService.js'
import { ConversationService } from './services/conversationService.js'
import { DirectoryService } from './services/directoryService.js'
import { ContactSyncService } from './services/contactSyncService.js'
import { ArchiveService } from './services/archiveService.js'
import { ImageService } from './services/imageService.js'
import { OssService } from './services/ossService.js'
import { FileService } from './services/fileService.js'
import { DuckDBService } from './services/duckdbService.js'
import { Tokenizer } from './services/tokenizer.js'
import { SearchService } from './services/searchService.js'
// EmbeddingService 使用动态 import，避免在禁用时加载 onnxruntime
// import { EmbeddingService } from './services/embeddingService.js'
import { EmbeddingQueue } from './services/embeddingQueue.js'
import { RuleEngine } from './services/ruleEngine.js'
import { KnowledgeQueue } from './services/knowledgeQueue.js'
import { SemanticImportanceService } from './services/semanticImportanceService.js'
import { EntityExtractorService } from './services/entityExtractorService.js'
import { LlmClient } from './services/llmClient.js'
import { DigestService } from './services/digestService.js'
import { DigestWindowService } from './services/digestWindowService.js'
import { KnowledgeExtractionService } from './services/knowledgeExtractionService.js'
import { DigestWorkflowService } from './services/digestWorkflowService.js'
import { TopicCandidateService } from './services/topicCandidateService.js'
import { TopicClusteringService } from './services/topicClusteringService.js'
import { TopicBackfillService } from './services/topicBackfillService.js'
import { TopicRepairService } from './services/topicRepairService.js'
import { createApp } from './app.js'
import { retryWithBackoff } from './lib/retry.js'
import type { ProfileState } from './routes/me.js'
import { logger } from './lib/logger.js'

// ============================================================================
// 主函数
// ============================================================================

async function main() {
  try {
    logger.info('Initializing services...')

    // 1. 基础设施层
    const dataLakeService = new DataLakeService({
      type: env.DATA_LAKE_TYPE as 'filesystem',
      path: env.DATA_LAKE_PATH
    })

    const databaseService = new DatabaseService()
    await databaseService.connect()

    // 确保 client 记录存在
    const existingClient = await databaseService.findClientByGuid(env.JUHEXBOT_CLIENT_GUID)
    if (!existingClient) {
      await databaseService.createClient({ guid: env.JUHEXBOT_CLIENT_GUID })
      logger.info({ guid: env.JUHEXBOT_CLIENT_GUID }, 'Client record created')
    }

    const juhexbotConfig = {
      apiUrl: env.JUHEXBOT_API_URL,
      appKey: env.JUHEXBOT_APP_KEY,
      appSecret: env.JUHEXBOT_APP_SECRET,
      clientGuid: env.JUHEXBOT_CLIENT_GUID,
      cloudApiUrl: env.JUHEXBOT_CLOUD_API_URL
    }
    const juhexbotAdapter: JuhexbotAdapter = env.E2E_BOT_MODE
      ? new JuhexbotAdapterFake(juhexbotConfig)
      : new JuhexbotAdapter(juhexbotConfig)

    if (env.E2E_BOT_MODE) {
      logger.warn('E2E_BOT_MODE enabled: using offline Juhexbot adapter')
    }

    // 获取登录用户信息（带重试 + 降级）
    let profileState: ProfileState = {
      username: '',
      nickname: '未连接',
      degraded: true
    }
    let profileRetryTimer: ReturnType<typeof setTimeout> | undefined

    try {
      logger.info('Fetching user profile...')
      const userProfile = await retryWithBackoff(
        () => juhexbotAdapter.getProfile(),
        { maxRetries: 3, initialDelayMs: 2000 }
      )
      profileState = {
        username: userProfile.username,
        nickname: userProfile.nickname,
        avatar: userProfile.avatar,
        degraded: false
      }
      juhexbotAdapter['config'].clientUsername = userProfile.username
      logger.info({ username: userProfile.username, nickname: userProfile.nickname }, 'User profile fetched')
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch profile after retries, starting in degraded mode')
    }

    const ossService = new OssService({
      region: env.alicloudOssRegion,
      bucket: env.alicloudOssBucket,
      accessKeyId: env.alicloudOssAccessKeyId,
      accessKeySecret: env.alicloudOssAccessKeySecret,
      endpoint: env.alicloudOssEndpoint,
    })

    // 初始化 DuckDB 和 Tokenizer（用于全文搜索）
    const duckdbService = new DuckDBService({ dbPath: 'data/search.duckdb' })
    await duckdbService.initialize()
    logger.info('DuckDB service initialized')

    const tokenizer = new Tokenizer()
    logger.info('Tokenizer initialized')

    // 初始化 KnowledgeQueue（用于实体提取和语义重要性分析）
    const knowledgeQueue = new KnowledgeQueue()
    const ruleEngine = new RuleEngine(databaseService)
    let embeddingService: any | undefined
    let embeddingQueue: EmbeddingQueue | undefined
    let semanticImportanceService: SemanticImportanceService | undefined

    // 初始化 EmbeddingService 和 EmbeddingQueue（用于语义搜索）
    // 使用动态 import 避免在禁用时加载 onnxruntime 依赖
    if (env.EMBEDDING_ENABLED) {
      try {
        const { EmbeddingService } = await import('./services/embeddingService.js')
        const candidateEmbeddingService = new EmbeddingService()
        await candidateEmbeddingService.initialize()
        if (candidateEmbeddingService.isAvailable()) {
          embeddingService = candidateEmbeddingService
          logger.info('EmbeddingService initialized')

          embeddingQueue = new EmbeddingQueue(embeddingService, duckdbService)
          logger.info('EmbeddingQueue initialized')

          semanticImportanceService = new SemanticImportanceService(embeddingService)
          await semanticImportanceService.initialize()
          logger.info('SemanticImportanceService initialized')
        } else {
          logger.warn('Embedding features disabled because the model could not be loaded')
        }
      } catch (error) {
        logger.error({ err: error }, 'Failed to load EmbeddingService, embedding features disabled')
      }
    } else {
      logger.info('Embedding features disabled via EMBEDDING_ENABLED=false')
    }

    // 初始化 EntityExtractorService（用于实体提取）
    const entityExtractorService = new EntityExtractorService(databaseService)
    await entityExtractorService.refreshContacts()
    logger.info('EntityExtractorService initialized')

    // 注册语义重要性分析处理器
    if (semanticImportanceService) {
      knowledgeQueue.registerHandler('semantic-importance', async (task) => {
        try {
          const tags = await semanticImportanceService.analyze(task.data.content)
          if (tags.length > 0) {
            const tagData = tags.map(t => ({
              msgId: task.msgId,
              tag: t.tag,
              source: t.source
            }))
            await ruleEngine.applyTags(tagData)
            logger.info({ msgId: task.msgId, tags: tags.map(t => t.tag) }, 'Applied semantic tags')

            if (env.DIGEST_ENABLED && tags.some((t) => t.tag === 'important')) {
              await knowledgeQueue.enqueue({
                type: 'digest-generation',
                msgId: task.msgId,
                data: {}
              })
            }
          }
        } catch (error) {
          logger.error({ err: error, msgId: task.msgId }, 'Failed to process semantic importance task')
        }
      })
    } else {
      logger.warn('Semantic importance handler disabled because embeddings are unavailable')
    }

    // 注册实体提取处理器
    knowledgeQueue.registerHandler('entity-extraction', async (task) => {
      try {
        const entities = await entityExtractorService.extract(task.data.content)
        if (entities.length > 0) {
          const entityData = Array.from(new Map(entities.map((entity) => [
            `${task.msgId}:${entity.type}:${entity.value}`,
            {
              msgId: task.msgId,
              type: entity.type,
              value: entity.value,
            },
          ])).values())
          await databaseService.prisma.messageEntity.createMany({
            data: entityData,
          })
          logger.info({ msgId: task.msgId, count: entities.length }, 'Extracted entities')
        }
      } catch (error) {
        logger.error({ err: error, msgId: task.msgId }, 'Failed to process entity extraction task')
      }
    })
    logger.info('KnowledgeQueue initialized')

    // 初始化云端 LLM 与 DigestService（缺配置时优雅关闭）
    let digestWorkflowService: DigestWorkflowService | undefined
    let topicClusteringService: TopicClusteringService | undefined
    let topicBackfillService: TopicBackfillService | undefined
    let topicRepairService: TopicRepairService | undefined
    let topicRepairTimer: ReturnType<typeof setInterval> | undefined
    if (env.DIGEST_ENABLED) {
      const llmClient = LlmClient.tryCreate({
        baseUrl: env.LLM_BASE_URL,
        apiKey: env.LLM_API_KEY,
        model: env.LLM_MODEL,
      })
      if (llmClient) {
        if (embeddingService) {
          const topicCandidateService = new TopicCandidateService(embeddingService)
          topicClusteringService = new TopicClusteringService(databaseService, topicCandidateService)
          topicBackfillService = new TopicBackfillService(databaseService)
          topicRepairService = new TopicRepairService(databaseService)

          knowledgeQueue.registerHandler('topic-clustering', async (task) => {
            try {
              const card = await databaseService.prisma.knowledgeCard.findUnique({
                where: { id: task.data.knowledgeCardId as string },
              })
              if (!card) {
                return
              }

              const result = await topicClusteringService!.clusterKnowledgeCard(card)
              await topicBackfillService!.backfillTopicMessages({
                topicIds: result.topicIds,
                knowledgeCard: card,
              })
            } catch (error) {
              logger.error(
                { err: error, knowledgeCardId: task.data.knowledgeCardId },
                'Failed to process topic clustering task'
              )
            }
          })
          logger.info('Topic clustering services initialized')
        } else {
          logger.warn('Topic clustering disabled because embeddings are unavailable')
        }

        const digestWindowService = new DigestWindowService(databaseService, dataLakeService)
        const digestService = new DigestService(digestWindowService, databaseService, llmClient)
        const knowledgeExtractionService = new KnowledgeExtractionService(databaseService, llmClient)
        digestWorkflowService = new DigestWorkflowService(
          digestService,
          knowledgeExtractionService,
          async (knowledgeCard) => {
            if (!topicClusteringService) {
              return
            }
            await knowledgeQueue.enqueue({
              type: 'topic-clustering',
              msgId: knowledgeCard.id,
              data: { knowledgeCardId: knowledgeCard.id },
            })
          }
        )
        knowledgeQueue.registerHandler('digest-generation', async (task) => {
          try {
            const result = await digestWorkflowService!.generateAutomaticDigest(task.msgId)
            if (result.digest) {
              logger.info({ msgId: task.msgId, digestId: result.digest.id }, 'Generated digest')
            }
          } catch (error) {
            logger.warn({ err: error, msgId: task.msgId }, 'Failed to process digest task')
          }
        })
        logger.info({ baseUrl: env.LLM_BASE_URL, model: env.LLM_MODEL }, 'Digest workflow initialized')
      } else {
        logger.warn('Digest features disabled because LLM_BASE_URL/LLM_API_KEY/LLM_MODEL is not fully configured')
      }
    } else {
      logger.warn('Digest features disabled by DIGEST_ENABLED=false')
    }

    // 2. 业务服务层
    const clientService = new ClientService(juhexbotAdapter)
    const conversationService = new ConversationService(databaseService, dataLakeService)
    const directoryService = new DirectoryService(databaseService)
    const searchService = new SearchService(duckdbService, tokenizer, databaseService, dataLakeService, embeddingService)
    logger.info('SearchService initialized')

    let fileServiceRef: FileService
    const messageService = new MessageService(
      databaseService,
      dataLakeService,
      juhexbotAdapter,
      profileState.username,
      ossService,
      { processFileMessage: (msgId: string, content: string) => fileServiceRef.processFileMessage(msgId, content) } as any,
      duckdbService,
      tokenizer,
      embeddingQueue,
      ruleEngine,
      knowledgeQueue
    )

    const imageService = new ImageService(
      databaseService.prisma,
      dataLakeService,
      juhexbotAdapter
    )

    const fileService = new FileService(databaseService, juhexbotAdapter, ossService)
    fileServiceRef = fileService

    // ContactSyncService 需要 wsService，使用 getter 延迟访问
    const contactSyncService = new ContactSyncService(
      databaseService,
      juhexbotAdapter,
      { broadcast: (event: string, data: unknown) => wsService.broadcast(event, data) } as any
    )

    // ArchiveService 负责 hot/ 数据清理
    const archiveService = new ArchiveService({
      lakePath: env.DATA_LAKE_PATH,
      hotRetentionDays: 3,
      prisma: databaseService.prisma
    })

    // 3. 创建 HTTP 应用
    // 注意：wsService 需要在 HTTP server 创建后才能初始化，用 getter 延迟访问
    let wsService: WebSocketService

    const app = createApp({
      clientService,
      conversationService,
      directoryService,
      messageService,
      imageService,
      fileService,
      contactSyncService,
      juhexbotAdapter,
      get wsService() { return wsService },
      searchService,
      digestWorkflowService,
      dataLake: dataLakeService,
      clientGuid: env.JUHEXBOT_CLIENT_GUID,
      userProfile: {
        getProfileState: () => profileState
      },
      auth: {
        passwordHash: env.AUTH_PASSWORD_HASH,
        jwtSecret: env.AUTH_JWT_SECRET,
      },
      corsOrigin: env.CORS_ORIGIN,
      nodeEnv: env.NODE_ENV,
    } as any)

    // 4. 启动 HTTP 服务器
    const port = parseInt(env.PORT)
    logger.info({ port }, 'Starting server')

    const server = serve({ fetch: app.fetch, port })

    // 5. 创建 WebSocket 服务
    wsService = new WebSocketService(server as unknown as Server)
    logger.info('WebSocket service initialized')

    // 6. 启动联系人同步后台任务
    contactSyncService.startBackfillScheduler()

    // 7. 启动归档定时任务
    archiveService.start()
    logger.info('Archive service started')

    if (topicRepairService) {
      topicRepairTimer = setInterval(() => {
        topicRepairService!
          .repairRecentTopics({ now: Math.floor(Date.now() / 1000) })
          .catch((error) => {
            logger.warn({ err: error }, 'Topic repair tick failed')
          })
      }, 30 * 60 * 1000)
      logger.info('Topic repair scheduler started')
    }

    // 8. 检查 juhexbot 状态
    try {
      const status = await clientService.getStatus()
      logger.info({ online: status.online }, 'juhexbot client status')
    } catch (error) {
      logger.warn({ err: error }, 'Could not check juhexbot status')
    }

    // 9. 注册 webhook 到 juhexbot
    if (env.WEBHOOK_URL) {
      try {
        logger.info({ webhookUrl: env.WEBHOOK_URL }, 'Registering webhook')
        await juhexbotAdapter.setNotifyUrl(env.WEBHOOK_URL)
        logger.info('Webhook registered successfully')
      } catch (error) {
        logger.warn({ err: error }, 'Could not register webhook')
      }
    } else {
      logger.warn('WEBHOOK_URL not configured, skipping webhook registration')
    }

    // 10. 优雅关闭
    async function gracefulShutdown(signal: string) {
      logger.info({ signal }, 'Shutting down gracefully...')
      try {
        if (profileRetryTimer) clearTimeout(profileRetryTimer)
        if (topicRepairTimer) clearInterval(topicRepairTimer)
        archiveService.stop()
        contactSyncService.stopBackfillScheduler()
        wsService.close()
        logger.info('WebSocket connections closed')
        await duckdbService.close()
        logger.info('DuckDB disconnected')
        await databaseService.disconnect()
        logger.info('Database disconnected')
        logger.info('Shutdown complete')
        process.exit(0)
      } catch (error) {
        logger.error({ err: error }, 'Error during shutdown')
        process.exit(1)
      }
    }

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
    process.on('SIGINT', () => gracefulShutdown('SIGINT'))

    logger.info('Server is ready')

    // 降级模式：后台重试获取 profile
    if (profileState.degraded) {
      startProfileRetry()
    }

    function startProfileRetry() {
      const delays = [30_000, 60_000, 120_000] // 30s, 60s, 120s, then 5min
      let retryIndex = 0

      async function tryFetchProfile() {
        try {
          logger.info('Background profile retry...')
          const userProfile = await juhexbotAdapter.getProfile()
          profileState = {
            username: userProfile.username,
            nickname: userProfile.nickname,
            avatar: userProfile.avatar,
            degraded: false
          }
          juhexbotAdapter['config'].clientUsername = userProfile.username
          logger.info({ username: userProfile.username }, 'Profile recovered from degraded mode')
          wsService.broadcast('profile_status', { status: 'recovered', message: '用户信息已恢复' })
        } catch (error) {
          logger.warn({ err: error, retryIndex }, 'Background profile retry failed')
          const delay = retryIndex < delays.length ? delays[retryIndex] : 300_000
          retryIndex++
          profileRetryTimer = setTimeout(tryFetchProfile, delay)
        }
      }

      wsService.broadcast('profile_status', { status: 'degraded', message: '无法获取用户信息，部分功能受限' })
      const delay = delays[0]
      profileRetryTimer = setTimeout(tryFetchProfile, delay)
    }
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start server')
    process.exit(1)
  }
}

// 只在直接运行时启动
main()
