// ABOUTME: 实体查询 API 路由，提供按消息查询和 top 实体统计
// ABOUTME: 支持按类型过滤和限制返回数量

import { Hono } from 'hono'
import { z } from 'zod'
import type { DatabaseService } from '../services/database.js'
import { logger } from '../lib/logger.js'

interface EntitiesRouteDeps {
  db: DatabaseService
}

const entityTypeSchema = z.enum(['person', 'project', 'date', 'amount', 'action_item'])

const topQuerySchema = z.object({
  type: entityTypeSchema.optional(),
  limit: z.coerce.number().max(100).default(50),
})

export function entitiesRoutes(deps: EntitiesRouteDeps) {
  const router = new Hono()

  router.get('/by-message/:msgId', async (c) => {
    try {
      const msgId = c.req.param('msgId')

      const entities = await deps.db.prisma.messageEntity.findMany({
        where: { msgId },
        orderBy: { createdAt: 'asc' }
      })

      return c.json({
        success: true,
        data: entities
      })
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch entities by message')
      return c.json({
        success: false,
        error: { message: 'Failed to fetch entities' }
      }, 500)
    }
  })

  router.get('/top', async (c) => {
    try {
      const rawQuery = c.req.query()
      const parsed = topQuerySchema.safeParse(rawQuery)

      if (!parsed.success) {
        return c.json({
          success: false,
          error: { message: 'Invalid query parameters', details: parsed.error.errors }
        }, 400)
      }

      const { type, limit } = parsed.data

      const grouped = await deps.db.prisma.messageEntity.groupBy({
        by: ['type', 'value'],
        where: type ? { type } : undefined,
        _count: { value: true },
        orderBy: { _count: { value: 'desc' } },
        take: limit,
      })

      const data = grouped.map((item: { type: string; value: string; _count: { value: number } }) => ({
        type: item.type,
        value: item.value,
        count: item._count.value,
      }))

      return c.json({
        success: true,
        data
      })
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch top entities')
      return c.json({
        success: false,
        error: { message: 'Failed to fetch top entities' }
      }, 500)
    }
  })

  return router
}
