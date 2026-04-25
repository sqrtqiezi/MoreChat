// ABOUTME: 测试 RuleEngine 服务的规则评估和标签应用功能
// ABOUTME: 覆盖 watchlist、keyword、mention 三种规则类型

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { RuleEngine } from './ruleEngine.js'
import type { DatabaseService } from './database.js'

describe('RuleEngine', () => {
  let mockDb: DatabaseService
  let ruleEngine: RuleEngine

  beforeEach(() => {
    mockDb = {
      prisma: {
        importanceRule: {
          findMany: vi.fn(),
        },
        messageTag: {
          createMany: vi.fn(),
        },
      },
    } as any

    ruleEngine = new RuleEngine(mockDb)
  })

  describe('evaluateMessage', () => {
    it('应该跳过非文本消息', async () => {
      const context = {
        msgId: 'msg1',
        fromUsername: 'user1',
        toUsername: 'user2',
        content: 'test',
        msgType: 3, // 图片消息
      }

      const tags = await ruleEngine.evaluateMessage(context)

      expect(tags).toEqual([])
      expect(mockDb.prisma.importanceRule.findMany).not.toHaveBeenCalled()
    })

    it('应该对文本消息评估 watchlist 规则', async () => {
      vi.mocked(mockDb.prisma.importanceRule.findMany).mockResolvedValue([
        { id: '1', type: 'watchlist', value: 'user1', priority: 0, isActive: true, createdAt: new Date(), updatedAt: new Date() },
      ])

      const context = {
        msgId: 'msg1',
        fromUsername: 'user1',
        toUsername: 'user2',
        content: 'hello',
        msgType: 1,
      }

      const tags = await ruleEngine.evaluateMessage(context)

      expect(tags).toEqual([
        { msgId: 'msg1', tag: 'important', source: 'rule:watchlist' },
      ])
    })

    it('应该对文本消息评估 keyword 规则', async () => {
      vi.mocked(mockDb.prisma.importanceRule.findMany).mockResolvedValue([
        { id: '1', type: 'keyword', value: '紧急', priority: 0, isActive: true, createdAt: new Date(), updatedAt: new Date() },
      ])

      const context = {
        msgId: 'msg1',
        fromUsername: 'user1',
        toUsername: 'user2',
        content: '这是紧急消息',
        msgType: 1,
      }

      const tags = await ruleEngine.evaluateMessage(context)

      expect(tags).toEqual([
        { msgId: 'msg1', tag: 'important', source: 'rule:keyword' },
      ])
    })

    it('应该对文本消息评估 mention 规则', async () => {
      vi.mocked(mockDb.prisma.importanceRule.findMany).mockResolvedValue([
        { id: '1', type: 'mention', value: '@me', priority: 0, isActive: true, createdAt: new Date(), updatedAt: new Date() },
      ])

      const context = {
        msgId: 'msg1',
        fromUsername: 'user1',
        toUsername: 'group1',
        content: '@alice 请看一下',
        msgType: 1,
        currentUsername: 'alice',
      }

      const tags = await ruleEngine.evaluateMessage(context)

      expect(tags).toEqual([
        { msgId: 'msg1', tag: 'important', source: 'rule:mention' },
      ])
    })

    it('应该在规则都匹配时去重 source', async () => {
      vi.mocked(mockDb.prisma.importanceRule.findMany).mockResolvedValue([
        { id: '1', type: 'keyword', value: '紧急', priority: 0, isActive: true, createdAt: new Date(), updatedAt: new Date() },
        { id: '2', type: 'keyword', value: '紧急', priority: 0, isActive: true, createdAt: new Date(), updatedAt: new Date() },
      ])

      const context = {
        msgId: 'msg1',
        fromUsername: 'user1',
        toUsername: 'user2',
        content: '紧急处理',
        msgType: 1,
      }

      const tags = await ruleEngine.evaluateMessage(context)

      expect(tags).toEqual([
        { msgId: 'msg1', tag: 'important', source: 'rule:keyword' },
      ])
    })

    it('应该忽略空内容关键词规则', async () => {
      vi.mocked(mockDb.prisma.importanceRule.findMany).mockResolvedValue([
        { id: '1', type: 'keyword', value: '', priority: 0, isActive: true, createdAt: new Date(), updatedAt: new Date() },
      ])

      const context = {
        msgId: 'msg1',
        fromUsername: 'user1',
        toUsername: 'user2',
        content: '任意内容',
        msgType: 1,
      }

      const tags = await ruleEngine.evaluateMessage(context)

      expect(tags).toEqual([])
    })

    it('应该使用规则缓存并在 clearCache 后重新加载', async () => {
      vi.mocked(mockDb.prisma.importanceRule.findMany)
        .mockResolvedValueOnce([
          { id: '1', type: 'watchlist', value: 'user1', priority: 0, isActive: true, createdAt: new Date(), updatedAt: new Date() },
        ])
        .mockResolvedValueOnce([
          { id: '2', type: 'watchlist', value: 'user2', priority: 0, isActive: true, createdAt: new Date(), updatedAt: new Date() },
        ])

      await ruleEngine.evaluateMessage({
        msgId: 'msg1',
        fromUsername: 'user1',
        toUsername: 'x',
        content: 'hello',
        msgType: 1,
      })

      await ruleEngine.evaluateMessage({
        msgId: 'msg2',
        fromUsername: 'user2',
        toUsername: 'x',
        content: 'hello',
        msgType: 1,
      })

      expect(mockDb.prisma.importanceRule.findMany).toHaveBeenCalledTimes(1)

      ruleEngine.clearCache()

      await ruleEngine.evaluateMessage({
        msgId: 'msg3',
        fromUsername: 'user2',
        toUsername: 'x',
        content: 'hello',
        msgType: 1,
      })

      expect(mockDb.prisma.importanceRule.findMany).toHaveBeenCalledTimes(2)
    })
  })

  describe('applyTags', () => {
    it('应该在有标签时调用 createMany 并跳过重复', async () => {
      vi.mocked(mockDb.prisma.messageTag.createMany).mockResolvedValue({ count: 1 })

      const tags = [
        { msgId: 'msg1', tag: 'important', source: 'rule:watchlist' },
      ]

      const count = await ruleEngine.applyTags(tags)

      expect(count).toBe(1)
      expect(mockDb.prisma.messageTag.createMany).toHaveBeenCalledWith({
        data: tags,
        skipDuplicates: true,
      })
    })

    it('应该在空标签时直接返回 0', async () => {
      const count = await ruleEngine.applyTags([])

      expect(count).toBe(0)
      expect(mockDb.prisma.messageTag.createMany).not.toHaveBeenCalled()
    })
  })
})
