// ABOUTME: 将历史消息应用规则引擎标签
// ABOUTME: 批量读取 MessageIndex，从 DataLake 获取内容并应用 RuleEngine 评估

import { DatabaseService } from '../src/services/database.js'
import { DataLakeService } from '../src/services/dataLake.js'
import { RuleEngine } from '../src/services/ruleEngine.js'
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
  logger.info('开始历史消息标签迁移')

  // 初始化服务
  const databaseService = new DatabaseService()
  await databaseService.connect()

  const dataLakeService = new DataLakeService({
    type: env.DATA_LAKE_TYPE as 'filesystem',
    path: env.DATA_LAKE_PATH
  })

  const ruleEngine = new RuleEngine(databaseService)

  const stats: MigrationStats = {
    total: 0,
    processed: 0,
    tagged: 0,
    skipped: 0,
    failed: 0
  }

  try {
    // 获取所有消息索引记录（仅文本消息）
    const BATCH_SIZE = 100
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
          // 从 DataLake 读取完整消息
          const message = await dataLakeService.getMessage(msgIndex.dataLakeKey)

          // 跳过空内容
          if (!message.content || message.content.trim() === '') {
            stats.skipped++
            continue
          }

          // 应用规则引擎评估
          const tags = await ruleEngine.evaluateMessage({
            msgId: message.msg_id,
            fromUsername: message.from_username,
            toUsername: message.to_username,
            content: message.content,
            msgType: message.msg_type
          })

          // 过滤掉已存在的标签（幂等性）
          const tagsToApply = []
          for (const tag of tags) {
            const existing = await databaseService.prisma.messageTag.findFirst({
              where: {
                msgId: tag.msgId,
                tag: tag.tag,
                source: tag.source
              }
            })
            if (!existing) {
              tagsToApply.push(tag)
            }
          }

          // 应用新标签
          if (tagsToApply.length > 0) {
            await ruleEngine.applyTags(tagsToApply)
            stats.tagged++
          } else {
            stats.skipped++
          }
        } catch (error: any) {
          // 文件不存在（hot 文件已过期）时跳过，其他错误记录
          if (error.code === 'ENOENT' || error.message?.includes('not found')) {
            stats.skipped++
          } else {
            stats.failed++
            logger.warn({ msgId: msgIndex.msgId, err: error.message }, '消息标签应用失败')
          }
        }

        // 每 100 条报告进度
        if (stats.processed % 100 === 0) {
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
