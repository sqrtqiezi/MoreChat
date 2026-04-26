// ABOUTME: Minimal topic query routes for listing recent window topics and loading their messages
// ABOUTME: Keeps topic API read-only and scoped to phase 2E backend validation needs

import { Hono } from 'hono'
import { z } from 'zod'
import type { DatabaseService } from '../services/database.js'
import { logger } from '../lib/logger.js'

interface TopicsRouteDeps {
  db: DatabaseService
}

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

export function topicsRoutes(deps: TopicsRouteDeps) {
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

      const topics = await deps.db.prisma.topic.findMany({
        where: { kind: 'window' },
        orderBy: { lastSeenAt: 'desc' },
        take: parsed.data.limit,
        skip: parsed.data.offset,
      })

      return c.json({ success: true, data: topics })
    } catch (error) {
      logger.error({ err: error }, 'Failed to list topics')
      return c.json({ success: false, error: { message: 'Failed to list topics' } }, 500)
    }
  })

  router.get('/:topicId/messages', async (c) => {
    try {
      const topicId = c.req.param('topicId')
      const rows = await deps.db.prisma.topicMessage.findMany({
        where: { topicId },
        orderBy: { msgId: 'asc' },
      })

      if (rows.length === 0) {
        return c.json({ success: true, data: [] })
      }

      const indexes = await deps.db.prisma.messageIndex.findMany({
        where: {
          msgId: { in: rows.map((row: { msgId: string }) => row.msgId) },
        },
        orderBy: { createTime: 'asc' },
      })

      return c.json({ success: true, data: indexes })
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch topic messages')
      return c.json({ success: false, error: { message: 'Failed to fetch topic messages' } }, 500)
    }
  })

  return router
}
