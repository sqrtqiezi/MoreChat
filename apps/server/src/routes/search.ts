// ABOUTME: 搜索 API 路由，处理全文搜索请求
// ABOUTME: 支持关键词搜索、过滤条件和分页

import { Hono } from 'hono'
import { z } from 'zod'
import type { SearchService } from '../services/searchService.js'
import { logger } from '../lib/logger.js'

interface SearchRouteDeps {
  searchService: SearchService
}

const searchQuerySchema = z.object({
  q: z.string().min(1, 'Query cannot be empty'),
  type: z.enum(['keyword', 'semantic', 'hybrid']).default('keyword'),
  from: z.string().optional(),
  group: z.string().optional(),
  after: z.coerce.number().optional(),
  before: z.coerce.number().optional(),
  important: z.coerce.boolean().optional(),
  limit: z.coerce.number().max(100).default(20),
  offset: z.coerce.number().default(0),
})

export function searchRoutes(deps: SearchRouteDeps) {
  const router = new Hono()

  router.get('/', async (c) => {
    try {
      const rawQuery = c.req.query()
      const parsed = searchQuerySchema.safeParse(rawQuery)

      if (!parsed.success) {
        return c.json({
          success: false,
          error: { message: 'Invalid query parameters', details: parsed.error.errors }
        }, 400)
      }

      const results = await deps.searchService.search(parsed.data)

      return c.json({
        success: true,
        data: {
          results,
          total: results.length,
          query: parsed.data.q,
        }
      })
    } catch (error) {
      logger.error({ err: error }, 'Search failed')
      return c.json({
        success: false,
        error: { message: 'Search failed' }
      }, 500)
    }
  })

  return router
}
