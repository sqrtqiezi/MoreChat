import { serve } from '@hono/node-server'
import type { Server } from 'http'
import { env } from './lib/env.js'
import { DataLakeService } from './services/dataLake.js'
import { DatabaseService } from './services/database.js'
import { MessageService } from './services/message.js'
import { JuhexbotAdapter } from './services/juhexbotAdapter.js'
import { WebSocketService } from './services/websocket.js'
import { ClientService } from './services/clientService.js'
import { ConversationService } from './services/conversationService.js'
import { DirectoryService } from './services/directoryService.js'
import { ContactSyncService } from './services/contactSyncService.js'
import { ArchiveService } from './services/archiveService.js'
import { ImageService } from './services/imageService.js'
import { OssService } from './services/ossService.js'
import { EmojiService } from './services/emojiService.js'
import { EmojiDownloadQueue } from './services/emojiDownloadQueue.js'
import { FileService } from './services/fileService.js'
import { DuckDBService } from './services/duckdbService.js'
import { Tokenizer } from './services/tokenizer.js'
import { SearchService } from './services/searchService.js'
import { EmbeddingService } from './services/embeddingService.js'
import { EmbeddingQueue } from './services/embeddingQueue.js'
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

    const juhexbotAdapter = new JuhexbotAdapter({
      apiUrl: env.JUHEXBOT_API_URL,
      appKey: env.JUHEXBOT_APP_KEY,
      appSecret: env.JUHEXBOT_APP_SECRET,
      clientGuid: env.JUHEXBOT_CLIENT_GUID,
      cloudApiUrl: env.JUHEXBOT_CLOUD_API_URL
    })

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

    // 初始化 EmbeddingService 和 EmbeddingQueue（用于语义搜索）
    const embeddingService = new EmbeddingService()
    await embeddingService.initialize()
    logger.info('EmbeddingService initialized')

    const embeddingQueue = new EmbeddingQueue(embeddingService, duckdbService)
    logger.info('EmbeddingQueue initialized')

    // 2. 业务服务层
    const clientService = new ClientService(juhexbotAdapter)
    const conversationService = new ConversationService(databaseService, dataLakeService)
    const directoryService = new DirectoryService(databaseService)
    const searchService = new SearchService(duckdbService, tokenizer, databaseService, dataLakeService, embeddingService)
    logger.info('SearchService initialized')

    // 初始化 EmojiService
    const emojiService = new EmojiService(databaseService, juhexbotAdapter, ossService)

    // MessageService 需要 emojiQueue，使用 getter 延迟访问
    let emojiQueue: EmojiDownloadQueue
    let fileServiceRef: FileService
    const messageService = new MessageService(
      databaseService,
      dataLakeService,
      juhexbotAdapter,
      profileState.username,
      ossService,
      emojiService,
      { enqueue: (msgId: string, conversationId: string) => emojiQueue.enqueue(msgId, conversationId) } as any,
      { processFileMessage: (msgId: string, content: string) => fileServiceRef.processFileMessage(msgId, content) } as any,
      duckdbService,
      tokenizer,
      embeddingQueue
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
      emojiService,
      fileService,
      contactSyncService,
      juhexbotAdapter,
      get wsService() { return wsService },
      searchService,
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

    // 初始化 EmojiDownloadQueue
    emojiQueue = new EmojiDownloadQueue(emojiService, wsService)
    logger.info('EmojiDownloadQueue initialized')

    // 6. 启动联系人同步后台任务
    contactSyncService.startBackfillScheduler()

    // 7. 启动归档定时任务
    archiveService.start()
    logger.info('Archive service started')

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
