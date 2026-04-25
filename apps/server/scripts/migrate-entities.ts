// ABOUTME: 将历史消息应用实体提取，写入 MessageEntity 表
// ABOUTME: 批量读取 MessageIndex，从 DataLake 获取内容并调用 EntityExtractorService

import { DatabaseService } from '../src/services/database.js'
import { DataLakeService } from '../src/services/dataLake.js'
import { EntityExtractorService } from '../src/services/entityExtractorService.js'
import { env } from '../src/lib/env.js'
import { logger } from '../src/lib/logger.js'

interface MigrationStats {
  total: number
  processed: number
  extracted: number
  skipped: number
  failed: number
}

async function main() {
  logger.info('开始历史消息实体提取迁移')

  const databaseService = new DatabaseService()
  await databaseService.connect()

  const dataLakeService = new DataLakeService({
    type: env.DATA_LAKE_TYPE as 'filesystem',
    path: env.DATA_LAKE_PATH
  })

  const entityExtractorService = new EntityExtractorService(databaseService)
  await entityExtractorService.refreshContacts()
  logger.info('EntityExtractorService 初始化完成')

  const stats: MigrationStats = {
    total: 0,
    processed: 0,
    extracted: 0,
    skipped: 0,
    failed: 0
  }

  try {
    const BATCH_SIZE = 100
    let offset = 0
    let hasMore = true

    while (hasMore) {
      const messages = await databaseService.prisma.messageIndex.findMany({
        where: {
          msgType: 1,
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

      for (const msgIndex of messages) {
        stats.processed++

        try {
          const existingEntity = await databaseService.prisma.messageEntity.findFirst({
            where: { msgId: msgIndex.msgId }
          })

          if (existingEntity) {
            stats.skipped++
            continue
          }

          const message = await dataLakeService.getMessage(msgIndex.dataLakeKey)

          if (!message.content || message.content.trim() === '') {
            stats.skipped++
            continue
          }

          const entities = await entityExtractorService.extract(message.content)

          if (entities.length > 0) {
            await databaseService.prisma.messageEntity.createMany({
              data: entities.map((e) => ({
                msgId: msgIndex.msgId,
                type: e.type,
                value: e.value
              })),
              skipDuplicates: true
            })
            stats.extracted++
          } else {
            stats.skipped++
          }
        } catch (error: any) {
          if (error.code === 'ENOENT' || error.message?.includes('not found')) {
            stats.skipped++
          } else {
            stats.failed++
            logger.warn({ msgId: msgIndex.msgId, err: error.message }, '实体提取失败')
          }
        }

        if (stats.processed % 100 === 0) {
          logger.info(
            { processed: stats.processed, extracted: stats.extracted, skipped: stats.skipped, failed: stats.failed },
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
      extracted: stats.extracted,
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
