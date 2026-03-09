import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { conversationRoutes } from './conversations'
import type { ConversationService } from '../services/conversationService.js'

describe('conversation routes', () => {
  let app: Hono
  let mockConvService: ConversationService

  beforeEach(() => {
    mockConvService = {
      list: vi.fn(),
      getById: vi.fn(),
      markAsRead: vi.fn(),
      getMessages: vi.fn()
    } as any

    app = new Hono()
    app.route('/api/conversations', conversationRoutes({
      conversationService: mockConvService,
      clientGuid: 'test_guid'
    }))
  })

  describe('GET /api/conversations', () => {
    it('should return conversation list', async () => {
      vi.mocked(mockConvService.list).mockResolvedValue([
        { id: 'conv_1', type: 'private', unreadCount: 2 }
      ])

      const res = await app.request('/api/conversations')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.data.conversations).toHaveLength(1)
    })
  })

  describe('GET /api/conversations/:id', () => {
    it('should return conversation detail', async () => {
      vi.mocked(mockConvService.getById).mockResolvedValue({
        id: 'conv_1', type: 'private'
      })

      const res = await app.request('/api/conversations/conv_1')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.data.id).toBe('conv_1')
    })

    it('should return 404 when not found', async () => {
      vi.mocked(mockConvService.getById).mockRejectedValue(
        new Error('Conversation not found')
      )

      const res = await app.request('/api/conversations/not_exist')
      expect(res.status).toBe(404)
    })
  })

  describe('PUT /api/conversations/:id/read', () => {
    it('should mark conversation as read', async () => {
      vi.mocked(mockConvService.markAsRead).mockResolvedValue(undefined)

      const res = await app.request('/api/conversations/conv_1/read', {
        method: 'PUT'
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
    })
  })

  describe('GET /api/conversations/:id/messages', () => {
    it('should return paginated messages', async () => {
      vi.mocked(mockConvService.getMessages).mockResolvedValue({
        messages: [{ msg_id: 'msg1', content: 'hello' }],
        hasMore: false
      })

      const res = await app.request('/api/conversations/conv_1/messages?limit=50')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.data.messages).toHaveLength(1)
      expect(body.data.hasMore).toBe(false)
    })
  })
})
