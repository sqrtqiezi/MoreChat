// ABOUTME: 重要消息 API 的测试套件
// ABOUTME: 验证 highlights 路由的分页、摘要和知识卡片关联逻辑

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { highlightsRoutes } from './highlights.js'
import type { DatabaseService } from '../services/database.js'

describe('highlights routes', () => {
  let app: Hono
  let mockDb: DatabaseService

  beforeEach(() => {
    mockDb = {
      prisma: {
        messageTag: {
          findMany: vi.fn(),
          count: vi.fn(),
        },
        messageIndex: {
          findMany: vi.fn(),
        },
        digestEntry: {
          findFirst: vi.fn(),
        },
        knowledgeCard: {
          findUnique: vi.fn(),
        },
      },
    } as any

    app = new Hono()
    app.route('/api/highlights', highlightsRoutes({ db: mockDb }))
  })

  it('returns important messages with digest and knowledge card when available', async () => {
    vi.mocked(mockDb.prisma.messageTag.findMany).mockResolvedValue([
      { msgId: 'm1', tag: 'important', source: 'rule:keyword', createdAt: new Date('2026-04-28T10:00:00Z') },
    ] as any)
    vi.mocked(mockDb.prisma.messageTag.count).mockResolvedValue(1)
    vi.mocked(mockDb.prisma.messageIndex.findMany).mockResolvedValue([
      {
        msgId: 'm1',
        content: '预算今晚确认',
        createTime: 1714298400,
        fromUsername: 'alice',
        toUsername: 'room-1',
        conversationId: 'conversation-1',
      },
    ] as any)
    vi.mocked(mockDb.prisma.digestEntry.findFirst).mockResolvedValue({
      id: 'd1',
      summary: '今天确认预算安排',
      messageCount: 6,
      startTime: 1714298300,
      endTime: 1714298500,
    } as any)
    vi.mocked(mockDb.prisma.knowledgeCard.findUnique).mockResolvedValue({
      id: 'k1',
      title: '预算确认',
      summary: '预算将在今晚定稿',
      decisions: '今晚确认预算版本',
      actionItems: '财务同步表格',
    } as any)

    const res = await app.request('/api/highlights?limit=20&offset=0')
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.total).toBe(1)
    expect(body.data.items[0]).toMatchObject({
      msgId: 'm1',
      digest: {
        id: 'd1',
        summary: '今天确认预算安排',
      },
      knowledgeCard: {
        id: 'k1',
        title: '预算确认',
      },
    })
  })

  it('deduplicates important messages by msgId and keeps all tag sources', async () => {
    vi.mocked(mockDb.prisma.messageTag.findMany).mockResolvedValue([
      { msgId: 'm3', tag: 'important', source: 'ai:semantic', createdAt: new Date('2026-04-28T12:01:00Z') },
      { msgId: 'm3', tag: 'important', source: 'rule:keyword', createdAt: new Date('2026-04-28T12:00:00Z') },
    ] as any)
    vi.mocked(mockDb.prisma.messageIndex.findMany).mockResolvedValue([
      {
        msgId: 'm3',
        content: '这个事项要重点跟进',
        createTime: 1714305600,
        fromUsername: 'carol',
        toUsername: 'room-3',
        conversationId: 'conversation-3',
      },
    ] as any)
    vi.mocked(mockDb.prisma.digestEntry.findFirst).mockResolvedValue(null)

    const res = await app.request('/api/highlights?limit=20&offset=0')
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.total).toBe(1)
    expect(body.data.items).toHaveLength(1)
    expect(body.data.items[0]).toMatchObject({
      msgId: 'm3',
      content: '这个事项要重点跟进',
    })
    expect(body.data.items[0].tags).toEqual(expect.arrayContaining([
      { tag: 'important', source: 'ai:semantic' },
      { tag: 'important', source: 'rule:keyword' },
    ]))
    expect(mockDb.prisma.digestEntry.findFirst).toHaveBeenCalledTimes(1)
  })

  it('returns the raw message when no digest is available', async () => {
    vi.mocked(mockDb.prisma.messageTag.findMany).mockResolvedValue([
      { msgId: 'm2', tag: 'important', source: 'rule:mention', createdAt: new Date('2026-04-28T11:00:00Z') },
    ] as any)
    vi.mocked(mockDb.prisma.messageIndex.findMany).mockResolvedValue([
      {
        msgId: 'm2',
        content: '@你 明早带合同',
        createTime: 1714302000,
        fromUsername: 'bob',
        toUsername: 'room-2',
        conversationId: 'conversation-2',
      },
    ] as any)
    vi.mocked(mockDb.prisma.digestEntry.findFirst).mockResolvedValue(null)

    const res = await app.request('/api/highlights')
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.items[0]).toMatchObject({
      msgId: 'm2',
      content: '@你 明早带合同',
    })
    expect(body.data.items[0]).not.toHaveProperty('digest')
    expect(body.data.items[0]).not.toHaveProperty('knowledgeCard')
  })

  it('returns 400 for invalid pagination', async () => {
    const res = await app.request('/api/highlights?limit=0&offset=-1')
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error.message).toBe('Invalid query parameters')
  })

  it('returns 500 when highlight query fails', async () => {
    vi.mocked(mockDb.prisma.messageTag.findMany).mockRejectedValue(new Error('db down'))

    const res = await app.request('/api/highlights')
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.success).toBe(false)
    expect(body.error.message).toBe('Failed to list highlights')
  })
})
