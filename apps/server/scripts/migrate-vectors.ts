// ABOUTME: 将历史消息数据迁移到 DuckDB 向量索引
// ABOUTME: 批量读取 MessageIndex，从 DataLake 获取内容并生成向量嵌入

import { DatabaseService } from '../src/services/database.js'
import { DataLakeService } from '../src/services/dataLake.js'
import { DuckDBService } from '../src/services/duckdbService.js'
import { EmbeddingService } from '../src/services/embeddingService.js'
import { env } from '../src/lib/env.js'
import { logger } from '../src/lib/logger.js'

interface MigrationStats {
  total: number
  processed: number
  indexed: number
  skipped: number
  failed: number
}

async function main() {
  logger.info('开始向量历史数据迁移')

  // 初始化服务
  const databaseService = new DatabaseService()
  await databaseService.connect()

  const dataLakeService = new DataLakeService({
    type: env.DATA_LAKE_TYPE as 'filesystem',
    path: env.DATA_LAKE_PATH
  })

  const duckdbService = new DuckDBService({ dbPath: 'data/search.duckdb' })
  await duckdbService.initialize()

  const embeddingService = new EmbeddingService()
  await embeddingService.initialize()
  logger.info('EmbeddingService 初始化完成')

  const stats: MigrationStats = {
    total: 0,
    processed: 0,
    indexed: 0,
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
          // 检查向量是否已存在
          const existing = await duckdbService.query(
            'SELECT msg_id FROM message_vectors WHERE msg_id = $1',
            [msgIndex.msgId]
          )

          if (existing.length > 0) {
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

          // 生成向量嵌入
          const embedding = await embeddingService.generateEmbedding(message.content)

          // 插入 DuckDB 向量表
          await duckdbService.insertVector({
            msgId: message.msg_id,
            embedding,
            createTime: message.create_time
          })

          stats.indexed++
        } catch (error: any) {
          // 文件不存在（hot 文件已过期）时跳过，其他错误记录
          if (error.code === 'ENOENT' || error.message?.includes('not found')) {
            stats.skipped++
          } else {
            stats.failed++
            logger.warn({ msgId: msgIndex.msgId, err: error.message }, '向量生成失败')
          }
        }

        // 每 50 条报告进度
        if (stats.processed % 50 === 0) {
          logger.info(
            { processed: stats.processed, indexed: stats.indexed, skipped: stats.skipped, failed: stats.failed },
            '迁移进度'
          )
        }
      }

      offset += BATCH_SIZE
    }
  } finally {
    await duckdbService.close()
    await databaseService.disconnect()
  }

  logger.info(
    {
      total: stats.total,
      indexed: stats.indexed,
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
