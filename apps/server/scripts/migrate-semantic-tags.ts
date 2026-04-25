// ABOUTME: 将历史消息应用语义重要性标签
// ABOUTME: 批量读取 MessageIndex，从 DataLake 获取内容并应用 SemanticImportanceService 评估

import { DatabaseService } from '../src/services/database.js'
import { DataLakeService } from '../src/services/dataLake.js'
import { EmbeddingService } from '../src/services/embeddingService.js'
import { SemanticImportanceService } from '../src/services/semanticImportanceService.js'
import { env } from '../src/lib/env.js'
import { logger } from '../src/lib/logger.js'

interface MigrationStats {
  total: number
  processed: number
  tagged: number
  skipped: number
  failed: number
}

async function main() {
  logger.info('开始历史消息语义标签迁移')

  // 初始化服务
  const databaseService = new DatabaseService()
  await databaseService.connect()

  const dataLakeService = new DataLakeService({
    type: env.DATA_LAKE_TYPE as 'filesystem',
    path: env.DATA_LAKE_PATH
  })

  const embeddingService = new EmbeddingService()
  await embeddingService.initialize()
  logger.info('EmbeddingService 初始化完成')

  const semanticImportanceService = new SemanticImportanceService(embeddingService)
  await semanticImportanceService.initialize()
  logger.info('SemanticImportanceService 初始化完成')

  const stats: MigrationStats = {
    total: 0,
    processed: 0,
    tagged: 0,
    skipped: 0,
    failed: 0
  }

  try {
    // 获取所有消息索引记录（仅文本消息）
    const BATCH_SIZE = 50
    let offset = 0
    let hasMore = true

    while (hasMore) {
      const messages = await databaseService.prisma.messageIndex.findMany({
        where: {
          msgType: 1, // 仅文本消息
          isRecalled: false
        },
        take: BATCH_SIZE,
        skip: offset,
        orderBy: { createTime: 'asc' }
      })

      if (messages.length === 0) {
        hasMore = false
        break
      }

      stats.total += messages.length

      // 批量处理消息
      for (const msgIndex of messages) {
        stats.processed++

        try {
          // 检查是否已有语义标签（幂等性）
          const existingTag = await databaseService.prisma.messageTag.findFirst({
            where: {
              msgId: msgIndex.msgId,
              source: 'ai:semantic'
            }
          })

          if (existingTag) {
            stats.skipped++
            continue
          }

          // 从 DataLake 读取完整消息
          const message = await dataLakeService.getMessage(msgIndex.dataLakeKey)

          // 跳过空内容
          if (!message.content || message.content.trim() === '') {
            stats.skipped++
            continue
          }

          // 语义分析
          const tags = await semanticImportanceService.analyze(message.content)

          // 插入标签
          if (tags.length > 0) {
            await databaseService.prisma.messageTag.createMany({
              data: tags.map((t) => ({
                msgId: msgIndex.msgId,
                tag: t.tag,
                source: t.source
              })),
              skipDuplicates: true
            })
            stats.tagged++
          } else {
            stats.skipped++
          }
        } catch (error: any) {
          // DataLake 文件不存在时跳过
          if (error.code === 'ENOENT' || error.message?.includes('not found')) {
            stats.skipped++
          } else {
            stats.failed++
            logger.warn({ msgId: msgIndex.msgId, err: error.message }, '语义标签分析失败')
          }
        }

        // 每 50 条报告进度
        if (stats.processed % 50 === 0) {
          logger.info(
            { processed: stats.processed, tagged: stats.tagged, skipped: stats.skipped, failed: stats.failed },
            '迁移进度'
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
      skipped: stats.skipped,
      failed: stats.failed
    },
    '迁移完成'
  )
}

main().catch((error) => {
  logger.error({ err: error }, '迁移脚本执行失败')
  process.exit(1)
})
