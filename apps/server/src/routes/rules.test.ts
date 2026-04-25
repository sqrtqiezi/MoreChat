// ABOUTME: 规则管理 API 的单元测试
// ABOUTME: 验证 CRUD 操作、参数校验和缓存清理

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { rulesRoutes } from './rules.js'
import type { DatabaseService } from '../services/database.js'
import type { RuleEngine } from '../services/ruleEngine.js'

describe('rules routes', () => {
  let app: Hono
  let mockDb: DatabaseService
  let mockRuleEngine: RuleEngine

  beforeEach(() => {
    mockDb = {
      prisma: {
        importanceRule: {
          findMany: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
        }
      }
    } as any

    mockRuleEngine = {
      clearCache: vi.fn()
    } as any

    app = new Hono()
    app.route('/api/rules', rulesRoutes({
      db: mockDb,
      ruleEngine: mockRuleEngine
    }))
  })

  describe('GET /api/rules', () => {
    it('should return all rules sorted by priority desc then createdAt desc', async () => {
      const mockRules = [
        {
          id: 'rule_1',
          type: 'watchlist',
          value: 'alice',
          priority: 100,
          isActive: true,
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
          updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        }
      ]
      vi.mocked(mockDb.prisma.importanceRule.findMany).mockResolvedValue(mockRules as any)

      const res = await app.request('/api/rules')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.data).toEqual([
        {
          id: 'rule_1',
          type: 'watchlist',
          value: 'alice',
          priority: 100,
          isActive: true,
          createdAt: '2026-01-02T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        }
      ])
      expect(mockDb.prisma.importanceRule.findMany).toHaveBeenCalledWith({
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'desc' },
        ],
      })
    })

    it('should return 500 when database query fails', async () => {
      vi.mocked(mockDb.prisma.importanceRule.findMany).mockRejectedValue(new Error('DB error'))

      const res = await app.request('/api/rules')
      const body = await res.json()

      expect(res.status).toBe(500)
      expect(body.success).toBe(false)
    })
  })

  describe('POST /api/rules', () => {
    it('should create rule and clear rule engine cache', async () => {
      const createdRule = {
        id: 'rule_2',
        type: 'keyword',
        value: '紧急',
        priority: 80,
        isActive: true,
        createdAt: new Date('2026-01-03T00:00:00.000Z'),
        updatedAt: new Date('2026-01-03T00:00:00.000Z'),
      }
      vi.mocked(mockDb.prisma.importanceRule.create).mockResolvedValue(createdRule as any)

      const res = await app.request('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'keyword', value: '紧急', priority: 80, isActive: true }),
      })
      const body = await res.json()

      expect(res.status).toBe(201)
      expect(body.success).toBe(true)
      expect(body.data).toEqual({
        id: 'rule_2',
        type: 'keyword',
        value: '紧急',
        priority: 80,
        isActive: true,
        createdAt: '2026-01-03T00:00:00.000Z',
        updatedAt: '2026-01-03T00:00:00.000Z',
      })
      expect(mockDb.prisma.importanceRule.create).toHaveBeenCalledWith({
        data: { type: 'keyword', value: '紧急', priority: 80, isActive: true },
      })
      expect(mockRuleEngine.clearCache).toHaveBeenCalledTimes(1)
    })

    it('should return 400 for invalid body', async () => {
      const res = await app.request('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'unknown', value: '' }),
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.success).toBe(false)
      expect(mockDb.prisma.importanceRule.create).not.toHaveBeenCalled()
      expect(mockRuleEngine.clearCache).not.toHaveBeenCalled()
    })
  })

  describe('PUT /api/rules/:id', () => {
    it('should update rule and clear rule engine cache', async () => {
      const updatedRule = {
        id: 'rule_3',
        type: 'mention',
        value: '@me',
        priority: 60,
        isActive: false,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-04T00:00:00.000Z'),
      }
      vi.mocked(mockDb.prisma.importanceRule.update).mockResolvedValue(updatedRule as any)

      const res = await app.request('/api/rules/rule_3', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: 60, isActive: false }),
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.data).toEqual({
        id: 'rule_3',
        type: 'mention',
        value: '@me',
        priority: 60,
        isActive: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-04T00:00:00.000Z',
      })
      expect(mockDb.prisma.importanceRule.update).toHaveBeenCalledWith({
        where: { id: 'rule_3' },
        data: { priority: 60, isActive: false },
      })
      expect(mockRuleEngine.clearCache).toHaveBeenCalledTimes(1)
    })

    it('should return 400 for invalid body', async () => {
      const res = await app.request('/api/rules/rule_3', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'invalid_type' }),
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.success).toBe(false)
      expect(mockDb.prisma.importanceRule.update).not.toHaveBeenCalled()
      expect(mockRuleEngine.clearCache).not.toHaveBeenCalled()
    })

    it('should return 404 when rule does not exist', async () => {
      vi.mocked(mockDb.prisma.importanceRule.update).mockRejectedValue({ code: 'P2025' })

      const res = await app.request('/api/rules/missing_rule', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: 10 }),
      })
      const body = await res.json()

      expect(res.status).toBe(404)
      expect(body.success).toBe(false)
      expect(mockRuleEngine.clearCache).not.toHaveBeenCalled()
    })
  })

  describe('DELETE /api/rules/:id', () => {
    it('should delete rule and clear rule engine cache', async () => {
      vi.mocked(mockDb.prisma.importanceRule.delete).mockResolvedValue({ id: 'rule_4' } as any)

      const res = await app.request('/api/rules/rule_4', {
        method: 'DELETE',
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.data).toEqual({ id: 'rule_4' })
      expect(mockDb.prisma.importanceRule.delete).toHaveBeenCalledWith({
        where: { id: 'rule_4' },
      })
      expect(mockRuleEngine.clearCache).toHaveBeenCalledTimes(1)
    })

    it('should return 404 when deleting non-existent rule', async () => {
      vi.mocked(mockDb.prisma.importanceRule.delete).mockRejectedValue({ code: 'P2025' })

      const res = await app.request('/api/rules/missing_rule', {
        method: 'DELETE',
      })
      const body = await res.json()

      expect(res.status).toBe(404)
      expect(body.success).toBe(false)
      expect(mockRuleEngine.clearCache).not.toHaveBeenCalled()
    })
  })
})
