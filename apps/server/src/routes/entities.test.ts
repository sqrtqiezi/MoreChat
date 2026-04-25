// ABOUTME: 实体查询路由的单元测试
// ABOUTME: 验证 GET /api/entities/by-message/:msgId 和 GET /api/entities/top 的参数校验和结果返回

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { entitiesRoutes } from './entities.js'
import type { DatabaseService } from '../services/database.js'

describe('entities routes', () => {
  let app: Hono
  let mockDb: DatabaseService

  beforeEach(() => {
    mockDb = {
      prisma: {
        messageEntity: {
          findMany: vi.fn(),
          groupBy: vi.fn(),
        }
      }
    } as any

    app = new Hono()
    app.route('/api/entities', entitiesRoutes({ db: mockDb }))
  })

  describe('GET /api/entities/by-message/:msgId', () => {
    it('should return all entities for a message', async () => {
      const mockEntities = [
        { id: 1, msgId: 'msg_1', type: 'person', value: '张三', createdAt: new Date('2026-01-01') },
        { id: 2, msgId: 'msg_1', type: 'project', value: 'MoreChat', createdAt: new Date('2026-01-02') },
      ]
      vi.mocked(mockDb.prisma.messageEntity.findMany).mockResolvedValue(mockEntities as any)

      const res = await app.request('/api/entities/by-message/msg_1')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.data).toHaveLength(2)
      expect(body.data[0].type).toBe('person')
      expect(body.data[1].type).toBe('project')
      expect(mockDb.prisma.messageEntity.findMany).toHaveBeenCalledWith({
        where: { msgId: 'msg_1' },
        orderBy: { createdAt: 'asc' }
      })
    })

    it('should return empty array when message has no entities', async () => {
      vi.mocked(mockDb.prisma.messageEntity.findMany).mockResolvedValue([])

      const res = await app.request('/api/entities/by-message/msg_unknown')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.data).toHaveLength(0)
    })
  })

  describe('GET /api/entities/top', () => {
    it('should return top entities grouped by type and value', async () => {
      const mockGrouped = [
        { type: 'person', value: '张三', _count: { value: 5 } },
        { type: 'project', value: 'MoreChat', _count: { value: 3 } },
      ]
      vi.mocked(mockDb.prisma.messageEntity.groupBy).mockResolvedValue(mockGrouped as any)

      const res = await app.request('/api/entities/top')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.data).toHaveLength(2)
      expect(body.data[0]).toEqual({ type: 'person', value: '张三', count: 5 })
      expect(body.data[1]).toEqual({ type: 'project', value: 'MoreChat', count: 3 })
    })

    it('should filter by type when type param is provided', async () => {
      vi.mocked(mockDb.prisma.messageEntity.groupBy).mockResolvedValue([])

      const res = await app.request('/api/entities/top?type=person')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(mockDb.prisma.messageEntity.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { type: 'person' }
        })
      )
    })

    it('should return 400 for invalid type', async () => {
      const res = await app.request('/api/entities/top?type=invalid_type')
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.success).toBe(false)
    })

    it('should respect limit param with default of 50', async () => {
      vi.mocked(mockDb.prisma.messageEntity.groupBy).mockResolvedValue([])

      const res = await app.request('/api/entities/top?limit=10')
      expect(res.status).toBe(200)
      expect(mockDb.prisma.messageEntity.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 })
      )
    })
  })
})
