// ABOUTME: 规则管理 API 路由，处理 ImportanceRule 的 CRUD 请求
// ABOUTME: 提供规则列表、创建、更新、删除并在变更后清理规则缓存

import { Hono } from 'hono'
import { z } from 'zod'
import { logger } from '../lib/logger.js'
import type { DatabaseService } from '../services/database.js'
import type { RuleEngine } from '../services/ruleEngine.js'

interface RulesRouteDeps {
  db: DatabaseService
  ruleEngine: RuleEngine
}

const createRuleSchema = z.object({
  type: z.enum(['watchlist', 'keyword', 'mention']),
  value: z.string().min(1, 'value is required'),
  priority: z.number().int().optional().default(0),
  isActive: z.boolean().optional().default(true),
})

const updateRuleSchema = z.object({
  type: z.enum(['watchlist', 'keyword', 'mention']).optional(),
  value: z.string().min(1, 'value cannot be empty').optional(),
  priority: z.number().int().optional(),
  isActive: z.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field is required',
})

function isNotFoundError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  return 'code' in error && error.code === 'P2025'
}

export function rulesRoutes(deps: RulesRouteDeps) {
  const router = new Hono()

  router.get('/', async (c) => {
    try {
      const rules = await deps.db.prisma.importanceRule.findMany({
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'desc' },
        ],
      })

      return c.json({
        success: true,
        data: rules,
      })
    } catch (error) {
      logger.error({ err: error }, '获取规则列表失败')
      return c.json({
        success: false,
        error: { message: 'Failed to list rules' },
      }, 500)
    }
  })

  router.post('/', async (c) => {
    try {
      const body = await c.req.json()
      const parsed = createRuleSchema.safeParse(body)

      if (!parsed.success) {
        return c.json({
          success: false,
          error: { message: 'Invalid request body', details: parsed.error.errors },
        }, 400)
      }

      const rule = await deps.db.prisma.importanceRule.create({
        data: parsed.data,
      })

      deps.ruleEngine.clearCache()

      return c.json({
        success: true,
        data: rule,
      }, 201)
    } catch (error) {
      logger.error({ err: error }, '创建规则失败')
      return c.json({
        success: false,
        error: { message: 'Failed to create rule' },
      }, 500)
    }
  })

  router.put('/:id', async (c) => {
    try {
      const body = await c.req.json()
      const parsed = updateRuleSchema.safeParse(body)

      if (!parsed.success) {
        return c.json({
          success: false,
          error: { message: 'Invalid request body', details: parsed.error.errors },
        }, 400)
      }

      const rule = await deps.db.prisma.importanceRule.update({
        where: { id: c.req.param('id') },
        data: parsed.data,
      })

      deps.ruleEngine.clearCache()

      return c.json({
        success: true,
        data: rule,
      })
    } catch (error) {
      if (isNotFoundError(error)) {
        return c.json({
          success: false,
          error: { message: 'Rule not found' },
        }, 404)
      }

      logger.error({ err: error }, '更新规则失败')
      return c.json({
        success: false,
        error: { message: 'Failed to update rule' },
      }, 500)
    }
  })

  router.delete('/:id', async (c) => {
    try {
      const rule = await deps.db.prisma.importanceRule.delete({
        where: { id: c.req.param('id') },
      })

      deps.ruleEngine.clearCache()

      return c.json({
        success: true,
        data: { id: rule.id },
      })
    } catch (error) {
      if (isNotFoundError(error)) {
        return c.json({
          success: false,
          error: { message: 'Rule not found' },
        }, 404)
      }

      logger.error({ err: error }, '删除规则失败')
      return c.json({
        success: false,
        error: { message: 'Failed to delete rule' },
      }, 500)
    }
  })

  return router
}
