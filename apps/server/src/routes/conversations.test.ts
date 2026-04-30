import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { conversationRoutes } from './conversations.js'
import type { ConversationService } from '../services/conversationService.js'

describe('conversation routes', () => {
  let app: Hono
  let mockConvService: ConversationService

  beforeEach(() => {
    mockConvService = {
      list: vi.fn(),
      getById: vi.fn(),
      markAsRead: vi.fn(),
      getMessages: vi.fn(),
      getMessagesAround: vi.fn(),
      openConversation: vi.fn()
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

    it('should return conversations with contactType field for private conversations', async () => {
      vi.mocked(mockConvService.list).mockResolvedValue([
        { id: 'conv_1', type: 'private', unreadCount: 0, contact: { id: 'c1', username: 'user1', nickname: 'User 1', type: '3' } }
      ] as any)

      const res = await app.request('/api/conversations')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.data.conversations[0].contactType).toBe(3)
    })

    it('should return null contactType for group conversations', async () => {
      vi.mocked(mockConvService.list).mockResolvedValue([
        { id: 'conv_2', type: 'group', unreadCount: 0, contact: null, group: { id: 'g1', roomUsername: 'room1', name: 'Group 1' } }
      ] as any)

      const res = await app.request('/api/conversations')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.data.conversations[0].contactType).toBeNull()
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

  describe('POST /api/conversations/open', () => {
    it('should open a private conversation', async () => {
      vi.mocked((mockConvService as any).openConversation).mockResolvedValue({ conversationId: 'conv_1' })

      const res = await app.request('/api/conversations/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'private', username: 'friend_1' }),
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.data.conversationId).toBe('conv_1')
    })
  })

  describe('GET /api/conversations/:id/messages?around=msgId', () => {
    it('should return messages around target message', async () => {
      vi.mocked(mockConvService.getMessagesAround).mockResolvedValue({
        messages: [
          { msgId: 'msg-1', content: 'msg 1', createTime: 1000 },
          { msgId: 'msg-2', content: 'msg 2', createTime: 2000 },
          { msgId: 'msg-3', content: 'msg 3', createTime: 3000 },
        ],
        targetIndex: 1
      } as any)

      const res = await app.request('/api/conversations/conv-1/messages?around=msg-2&limit=3')

      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
      expect(json.data.messages).toHaveLength(3)
      expect(json.data.targetIndex).toBe(1)
    })

    it('should return 404 if message not found', async () => {
      vi.mocked(mockConvService.getMessagesAround).mockRejectedValue(
        new Error('Message not found')
      )

      const res = await app.request('/api/conversations/conv-1/messages?around=non-existent')

      expect(res.status).toBe(404)
    })

    it('should return 400 if both around and before are provided', async () => {
      const res = await app.request('/api/conversations/conv-1/messages?around=msg-1&before=1000')

      expect(res.status).toBe(400)
    })
  })
})
