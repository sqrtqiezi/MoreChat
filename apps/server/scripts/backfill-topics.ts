// ABOUTME: 回填历史消息的语义分析和 topic 生成
// ABOUTME: 批量处理历史文本消息，进行语义重要性分析并触发 digest 生成

import { DatabaseService } from '../src/services/database.js'
import { DataLakeService } from '../src/services/dataLake.js'
import { EmbeddingService } from '../src/services/embeddingService.js'
import { SemanticImportanceService } from '../src/services/semanticImportanceService.js'
import { RuleEngine } from '../src/services/ruleEngine.js'
import { KnowledgeQueue } from '../src/services/knowledgeQueue.js'
import { DigestWorkflowService } from '../src/services/digestWorkflowService.js'
import { DigestWindowService } from '../src/services/digestWindowService.js'
import { DigestService } from '../src/services/digestService.js'
import { KnowledgeExtractionService } from '../src/services/knowledgeExtractionService.js'
import { LlmClient } from '../src/services/llmClient.js'
import { TopicCandidateService } from '../src/services/topicCandidateService.js'
import { TopicClusteringService } from '../src/services/topicClusteringService.js'
import { TopicBackfillService } from '../src/services/topicBackfillService.js'
import { env } from '../src/lib/env.js'
import { logger } from '../src/lib/logger.js'

interface BackfillStats {
  total: number
  processed: number
  tagged: number
  digestQueued: number
  skipped: number
  failed: number
}

async function main() {
  logger.info('开始历史消息 topic 回填')

  // 初始化服务
  const databaseService = new DatabaseService()
  await databaseService.connect()

  const dataLakeService = new DataLakeService({
    type: env.DATA_LAKE_TYPE as 'filesystem',
    path: env.DATA_LAKE_PATH
  })

  // 初始化 embedding 服务
  const embeddingService = new EmbeddingService()
  await embeddingService.initialize()

  if (!embeddingService) {
    logger.error('Embedding service not available, cannot proceed')
    process.exit(1)
  }

  // 初始化语义重要性服务
  const semanticImportanceService = new SemanticImportanceService(embeddingService)
  await semanticImportanceService.initialize()

  // 初始化规则引擎
  const ruleEngine = new RuleEngine(databaseService)

  // 初始化 LLM 和 digest 服务
  const llmClient = LlmClient.tryCreate({
    baseUrl: env.LLM_BASE_URL,
    apiKey: env.LLM_API_KEY,
    model: env.LLM_MODEL,
  })

  if (!llmClient) {
    logger.error('LLM client not available, cannot proceed')
    process.exit(1)
  }

  const digestWindowService = new DigestWindowService(databaseService, dataLakeService)
  const digestService = new DigestService(digestWindowService, databaseService, llmClient)
  const knowledgeExtractionService = new KnowledgeExtractionService(databaseService, llmClient)

  // 初始化 topic 服务
  const topicCandidateService = new TopicCandidateService(embeddingService)
  const topicClusteringService = new TopicClusteringService(databaseService, topicCandidateService)
  const topicBackfillService = new TopicBackfillService(databaseService)

  const stats: BackfillStats = {
    total: 0,
    processed: 0,
    tagged: 0,
    digestQueued: 0,
    skipped: 0,
    failed: 0
  }

  try {
    // 获取所有未处理的文本消息（没有 MessageTag 的消息）
    const BATCH_SIZE = 50
    let offset = 0
    let hasMore = true

    while (hasMore) {
      // 查询未标记的消息
      const messages = await databaseService.prisma.$queryRaw<Array<{ msgId: string, dataLakeKey: string }>>`
        SELECT mi.msgId, mi.dataLakeKey
        FROM MessageIndex mi
        LEFT JOIN MessageTag mt ON mi.msgId = mt.msgId
        WHERE mi.msgType = 1
          AND mi.isRecalled = 0
          AND mt.msgId IS NULL
        ORDER BY mi.createTime DESC
        LIMIT ${BATCH_SIZE}
        OFFSET ${offset}
      `

      if (messages.length === 0) {
        hasMore = false
        break
      }

      stats.total += messages.length

      // 批量处理消息
      for (const msgIndex of messages) {
        stats.processed++

        try {
          // 从 DataLake 读取完整消息
          const message = await dataLakeService.getMessage(msgIndex.dataLakeKey)

          // 跳过空内容
          if (!message.content || message.content.trim() === '') {
            stats.skipped++
            continue
          }

          // 1. 规则引擎评估
          let ruleHitImportant = false
          try {
            const tags = await ruleEngine.evaluateMessage({
              msgId: message.msg_id,
              fromUsername: message.from_username,
              toUsername: message.to_username,
              content: message.content,
              msgType: message.msg_type,
              currentUsername: message.to_username
            })

            if (tags.length > 0) {
              await ruleEngine.applyTags(tags)
              stats.tagged += tags.length
              ruleHitImportant = tags.some((t) => t.tag === 'important')
            }
          } catch (error: any) {
            logger.warn({ err: error.message, msgId: message.msg_id }, '规则评估失败')
          }

          // 2. 语义重要性分析（如果规则未标记）
          if (!ruleHitImportant) {
            try {
              const semanticTags = await semanticImportanceService.analyze(message.content)

              if (semanticTags.length > 0) {
                const tagData = semanticTags.map((t) => ({
                  msgId: message.msg_id,
                  tag: t.tag,
                  source: t.source
                }))
                await ruleEngine.applyTags(tagData)
                stats.tagged += semanticTags.length

                // 检查是否命中 important
                if (semanticTags.some((t) => t.tag === 'important')) {
                  ruleHitImportant = true
                }
              }
            } catch (error: any) {
              logger.warn({ err: error.message, msgId: message.msg_id }, '语义分析失败')
            }
          }

          // 3. 如果标记为 important，生成 digest
          if (ruleHitImportant) {
            try {
              // 直接调用 digest workflow
              const result = await digestService.generateDigest(message.msg_id)

              if (result.knowledgeCard) {
                // 进行 topic clustering
                const clusterResult = await topicClusteringService.clusterKnowledgeCard(result.knowledgeCard)

                // 回填 topic messages
                await topicBackfillService.backfillTopicMessages({
                  topicIds: clusterResult.topicIds,
                  knowledgeCard: result.knowledgeCard,
                })

                stats.digestQueued++
                logger.info({ msgId: message.msg_id, topics: clusterResult.topicIds.length }, 'Digest 和 topic 生成成功')
              }
            } catch (error: any) {
              logger.warn({ err: error.message, msgId: message.msg_id }, 'Digest 生成失败')
            }
          }

        } catch (error: any) {
          // 文件不存在时跳过
          if (error.code === 'ENOENT' || error.message?.includes('not found')) {
            stats.skipped++
          } else {
            stats.failed++
            logger.warn({ msgId: msgIndex.msgId, err: error.message }, '消息处理失败')
          }
        }

        // 每 10 条报告进度
        if (stats.processed % 10 === 0) {
          logger.info(
            {
              processed: stats.processed,
              tagged: stats.tagged,
              digestQueued: stats.digestQueued,
              skipped: stats.skipped,
              failed: stats.failed
            },
            '回填进度'
          )
        }
      }

      offset += BATCH_SIZE
    }
  } finally {
    await databaseService.disconnect()
  }

  logger.info(
    {
      total: stats.total,
      tagged: stats.tagged,
      digestQueued: stats.digestQueued,
      skipped: stats.skipped,
      failed: stats.failed
    },
    '回填完成'
  )
}

main().catch((error) => {
  logger.error({ err: error }, '回填脚本执行失败')
  process.exit(1)
})
