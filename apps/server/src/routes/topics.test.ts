import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { topicsRoutes } from './topics.js'
import type { DatabaseService } from '../services/database.js'

describe('topics routes', () => {
  let app: Hono
  let mockDb: DatabaseService

  beforeEach(() => {
    mockDb = {
      prisma: {
        topic: {
          findMany: vi.fn(),
          findUnique: vi.fn(),
        },
        topicMessage: {
          findMany: vi.fn(),
        },
        messageIndex: {
          findMany: vi.fn(),
        },
      },
    } as any

    app = new Hono()
    app.route('/api/topics', topicsRoutes({ db: mockDb }))
  })

  it('lists recent window topics', async () => {
    vi.mocked(mockDb.prisma.topic.findMany).mockResolvedValue([
      {
        id: 'topic_1',
        title: '预算主题',
        summary: '近期预算讨论',
        kind: 'window',
        status: 'active',
      },
    ] as any)

    const res = await app.request('/api/topics?limit=10&offset=0')
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(mockDb.prisma.topic.findMany).toHaveBeenCalledWith({
      where: { kind: 'window' },
      orderBy: { lastSeenAt: 'desc' },
      take: 10,
      skip: 0,
    })
  })

  it('returns topic metadata with ordered messages', async () => {
    vi.mocked(mockDb.prisma.topic.findUnique).mockResolvedValue({
      id: 'topic_1',
      title: '预算主题',
      summary: '近期预算讨论',
      messageCount: 2,
      participantCount: 3,
      lastSeenAt: 200,
      status: 'active',
      kind: 'window',
    } as any)
    vi.mocked(mockDb.prisma.topicMessage.findMany).mockResolvedValue([
      { msgId: 'm1', topicId: 'topic_1' },
      { msgId: 'm2', topicId: 'topic_1' },
    ] as any)
    vi.mocked(mockDb.prisma.messageIndex.findMany).mockResolvedValue([
      { msgId: 'm1', createTime: 100 },
      { msgId: 'm2', createTime: 200 },
    ] as any)

    const res = await app.request('/api/topics/topic_1/messages')
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toEqual({
      topic: expect.objectContaining({ id: 'topic_1', title: '预算主题' }),
      messages: [
        expect.objectContaining({ msgId: 'm1', createTime: 100 }),
        expect.objectContaining({ msgId: 'm2', createTime: 200 }),
      ],
    })
  })

  it('returns 404 when the topic does not exist', async () => {
    vi.mocked(mockDb.prisma.topic.findUnique).mockResolvedValue(null)

    const res = await app.request('/api/topics/missing/messages')
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.success).toBe(false)
    expect(body.error.message).toBe('Topic not found')
  })

  it('returns empty list when a topic has no messages', async () => {
    vi.mocked(mockDb.prisma.topic.findUnique).mockResolvedValue({
      id: 'topic_1',
      title: '预算主题',
      summary: '近期预算讨论',
      messageCount: 0,
      participantCount: 0,
      lastSeenAt: 0,
      status: 'active',
      kind: 'window',
    } as any)
    vi.mocked(mockDb.prisma.topicMessage.findMany).mockResolvedValue([])

    const res = await app.request('/api/topics/topic_1/messages')
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data).toEqual({
      topic: expect.objectContaining({ id: 'topic_1' }),
      messages: [],
    })
  })
})
