// ABOUTME: 重要消息读取 API，按时间倒序返回 important 消息
// ABOUTME: 为 Feed 页面尽力补齐摘要和知识卡片信息

import { Hono } from 'hono'
import { z } from 'zod'
import type { DatabaseService } from '../services/database.js'
import { logger } from '../lib/logger.js'

interface HighlightsRouteDeps {
  db: DatabaseService
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

      const tags = await deps.db.prisma.messageTag.findMany({
        where: { tag: 'important' },
        orderBy: { createdAt: 'desc' },
        take: parsed.data.limit,
        skip: parsed.data.offset,
      })
      const total = await deps.db.prisma.messageTag.count({ where: { tag: 'important' } })

      if (tags.length === 0) {
        return c.json({
          success: true,
          data: { items: [], total, limit: parsed.data.limit, offset: parsed.data.offset },
        })
      }

      const indexes = await deps.db.prisma.messageIndex.findMany({
        where: { msgId: { in: tags.map((tag: { msgId: string }) => tag.msgId) } },
      })
      const indexById = new Map(indexes.map((index: any) => [index.msgId, index]))

      const items = await Promise.all(tags.map(async (tag: any) => {
        const index = indexById.get(tag.msgId)
        if (!index) {
          return null
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
          content: index.content,
          createTime: index.createTime,
          fromUsername: index.fromUsername,
          toUsername: index.toUsername,
          conversationId: index.conversationId,
          tags: [{ tag: tag.tag, source: tag.source }],
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
