// ABOUTME: 重要消息读取 API，按时间倒序返回 important 消息
// ABOUTME: 为 Feed 页面尽力补齐摘要和知识卡片信息

import { Hono } from 'hono'
import { z } from 'zod'
import type { DatabaseService } from '../services/database.js'
import type { DataLakeService } from '../services/dataLake.js'
import { logger } from '../lib/logger.js'

interface HighlightsRouteDeps {
  db: DatabaseService
  dataLake: DataLakeService
}

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

export function highlightsRoutes(deps: HighlightsRouteDeps) {
  const router = new Hono()

  router.get('/', async (c) => {
    try {
      const parsed = listQuerySchema.safeParse(c.req.query())
      if (!parsed.success) {
        return c.json({
          success: false,
          error: { message: 'Invalid query parameters', details: parsed.error.errors },
        }, 400)
      }

      const allTags = await deps.db.prisma.messageTag.findMany({
        where: { tag: 'important' },
        orderBy: { createdAt: 'desc' },
      })

      // 按 msgId 分组，聚合所有 source，取最新 createdAt 用于排序
      const grouped = new Map<string, { tags: { tag: string; source: string }[]; latestAt: Date }>()
      for (const t of allTags) {
        const existing = grouped.get(t.msgId)
        if (existing) {
          existing.tags.push({ tag: t.tag, source: t.source })
          if (t.createdAt > existing.latestAt) existing.latestAt = t.createdAt
        } else {
          grouped.set(t.msgId, { tags: [{ tag: t.tag, source: t.source }], latestAt: t.createdAt })
        }
      }

      const sortedMsgIds = [...grouped.entries()]
        .sort((a, b) => b[1].latestAt.getTime() - a[1].latestAt.getTime())
      const total = sortedMsgIds.length
      const page = sortedMsgIds.slice(parsed.data.offset, parsed.data.offset + parsed.data.limit)

      if (page.length === 0) {
        return c.json({
          success: true,
          data: { items: [], total, limit: parsed.data.limit, offset: parsed.data.offset },
        })
      }

      type IndexRecord = {
        msgId: string
        dataLakeKey: string
        createTime: number
        fromUsername: string
        toUsername: string
        conversationId: string
      }

      const indexes = await deps.db.prisma.messageIndex.findMany({
        where: { msgId: { in: page.map(([msgId]) => msgId) } },
      }) as unknown as IndexRecord[]
      const indexById = new Map(indexes.map((record) => [record.msgId, record]))

      const items = await Promise.all(page.map(async ([msgId, group]) => {
        const index = indexById.get(msgId)
        if (!index) {
          return null
        }

        let content = ''
        try {
          const msg = await deps.dataLake.getMessage(index.dataLakeKey)
          content = msg.content
        } catch {
          logger.warn(`无法从 DataLake 获取消息 ${msgId}`)
        }

        const digest = await deps.db.prisma.digestEntry.findFirst({
          where: {
            conversationId: index.conversationId,
            status: 'ready',
            startTime: { lte: index.createTime },
            endTime: { gte: index.createTime },
          },
          orderBy: { endTime: 'desc' },
        })

        const knowledgeCard = digest
          ? await deps.db.prisma.knowledgeCard.findUnique({ where: { digestEntryId: digest.id } })
          : null

        return {
          msgId: index.msgId,
          content,
          createTime: index.createTime,
          fromUsername: index.fromUsername,
          toUsername: index.toUsername,
          conversationId: index.conversationId,
          tags: group.tags,
          digest: digest
            ? {
                id: digest.id,
                summary: digest.summary,
                messageCount: digest.messageCount,
                startTime: digest.startTime,
                endTime: digest.endTime,
              }
            : undefined,
          knowledgeCard: knowledgeCard
            ? {
                id: knowledgeCard.id,
                title: knowledgeCard.title,
                summary: knowledgeCard.summary,
                decisions: knowledgeCard.decisions,
                actionItems: knowledgeCard.actionItems,
              }
            : undefined,
        }
      }))

      return c.json({
        success: true,
        data: {
          items: items.filter(Boolean),
          total,
          limit: parsed.data.limit,
          offset: parsed.data.offset,
        },
      })
    } catch (error) {
      logger.error({ err: error }, 'Failed to list highlights')
      return c.json({ success: false, error: { message: 'Failed to list highlights' } }, 500)
    }
  })

  return router
}
