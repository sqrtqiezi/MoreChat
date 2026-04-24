// ABOUTME: 搜索路由的单元测试
// ABOUTME: 验证 GET /api/search 的参数校验、分页和结果返回

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { searchRoutes } from './search.js'
import type { SearchService } from '../services/searchService.js'

describe('search routes', () => {
  let app: Hono
  let mockSearchService: SearchService

  beforeEach(() => {
    mockSearchService = {
      search: vi.fn()
    } as any

    app = new Hono()
    app.route('/api/search', searchRoutes({ searchService: mockSearchService }))
  })

  describe('GET /api/search', () => {
    it('should return search results', async () => {
      vi.mocked(mockSearchService.search).mockResolvedValue([
        {
          msgId: 'msg_1',
          content: '你好世界',
          createTime: 1700000000,
          fromUsername: 'user_a',
        }
      ])

      const res = await app.request('/api/search?q=你好')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.data.results).toHaveLength(1)
      expect(body.data.results[0].msgId).toBe('msg_1')
      expect(body.data.query).toBe('你好')
      expect(mockSearchService.search).toHaveBeenCalledWith(
        expect.objectContaining({ q: '你好', type: 'keyword', limit: 20, offset: 0 })
      )
    })

    it('should return 400 when query parameter is missing', async () => {
      const res = await app.request('/api/search')
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.success).toBe(false)
    })

    it('should return 400 when query is empty string', async () => {
      const res = await app.request('/api/search?q=')
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.success).toBe(false)
    })

    it('should support pagination', async () => {
      vi.mocked(mockSearchService.search).mockResolvedValue([])

      const res = await app.request('/api/search?q=test&limit=10&offset=20')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(mockSearchService.search).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10, offset: 20 })
      )
    })

    it('should pass optional filters to search service', async () => {
      vi.mocked(mockSearchService.search).mockResolvedValue([])

      const res = await app.request('/api/search?q=hello&from=user_a&group=room_1&after=1000&before=2000')
      expect(res.status).toBe(200)
      expect(mockSearchService.search).toHaveBeenCalledWith(
        expect.objectContaining({
          q: 'hello',
          from: 'user_a',
          group: 'room_1',
          after: 1000,
          before: 2000,
        })
      )
    })

    it('should return 500 on service error', async () => {
      vi.mocked(mockSearchService.search).mockRejectedValue(new Error('DB error'))

      const res = await app.request('/api/search?q=test')
      const body = await res.json()

      expect(res.status).toBe(500)
      expect(body.success).toBe(false)
    })
  })
})
