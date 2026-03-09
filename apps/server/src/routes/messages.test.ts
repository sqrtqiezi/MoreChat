import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { messageRoutes } from './messages.js'
import type { MessageService } from '../services/message.js.js'

describe('message routes', () => {
  let app: Hono
  let mockMessageService: MessageService

  beforeEach(() => {
    mockMessageService = {
      sendMessage: vi.fn()
    } as any

    app = new Hono()
    app.route('/api/messages', messageRoutes({ messageService: mockMessageService }))
  })

  describe('POST /api/messages/send', () => {
    it('should send message successfully', async () => {
      vi.mocked(mockMessageService.sendMessage).mockResolvedValue({ msgId: 'sent_123' })

      const res = await app.request('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: 'conv_1', content: '你好' })
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.data.msgId).toBe('sent_123')
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith('conv_1', '你好')
    })

    it('should return 400 when missing parameters', async () => {
      const res = await app.request('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: 'conv_1' })
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.success).toBe(false)
    })

    it('should return 500 on service error', async () => {
      vi.mocked(mockMessageService.sendMessage).mockRejectedValue(
        new Error('Send failed')
      )

      const res = await app.request('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: 'conv_1', content: '你好' })
      })
      const body = await res.json()

      expect(res.status).toBe(500)
      expect(body.success).toBe(false)
    })
  })
})
