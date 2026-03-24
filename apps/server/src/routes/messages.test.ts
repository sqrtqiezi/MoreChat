import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { messageRoutes } from './messages.js'
import type { MessageService } from '../services/message.js'
import type { ImageService } from '../services/imageService.js'

describe('message routes', () => {
  let app: Hono
  let mockMessageService: MessageService
  let mockImageService: ImageService

  beforeEach(() => {
    mockMessageService = {
      sendMessage: vi.fn(),
      sendImageMessage: vi.fn()
    } as any

    mockImageService = {
      getImageUrl: vi.fn()
    } as any

    app = new Hono()
    app.route('/api/messages', messageRoutes({
      messageService: mockMessageService,
      imageService: mockImageService
    }))
  })

  describe('POST /api/messages/send', () => {
    it('should send message successfully', async () => {
      vi.mocked(mockMessageService.sendMessage).mockResolvedValue({
        msgId: 'sent_123'
      })

      const res = await app.request('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: 'conv_1', content: '你好' })
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.data.msgId).toBe('sent_123')
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith('conv_1', '你好', undefined)
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

    it('should pass replyToMsgId to messageService.sendMessage', async () => {
      vi.mocked(mockMessageService.sendMessage).mockResolvedValue({
        msgId: 'refer_789'
      })

      const res = await app.request('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: 'conv_1', content: '回复', replyToMsgId: 'orig_123' }),
      })

      expect(res.status).toBe(200)
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith('conv_1', '回复', 'orig_123')
    })
  })

  describe('POST /api/messages/send-image', () => {
    it('should send image successfully', async () => {
      vi.mocked(mockMessageService.sendImageMessage).mockResolvedValue({
        msgId: 'img_123'
      })

      const formData = new FormData()
      formData.append('conversationId', 'conv_1')
      formData.append('image', new Blob(['fake-image'], { type: 'image/jpeg' }), 'test.jpg')

      const res = await app.request('/api/messages/send-image', {
        method: 'POST',
        body: formData
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.data.msgId).toBe('img_123')
    })

    it('should return 400 when missing conversationId', async () => {
      const formData = new FormData()
      formData.append('image', new Blob(['fake-image'], { type: 'image/jpeg' }), 'test.jpg')

      const res = await app.request('/api/messages/send-image', {
        method: 'POST',
        body: formData
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.success).toBe(false)
    })

    it('should return 400 when missing image', async () => {
      const formData = new FormData()
      formData.append('conversationId', 'conv_1')

      const res = await app.request('/api/messages/send-image', {
        method: 'POST',
        body: formData
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.success).toBe(false)
    })

    it('should return 500 on service error', async () => {
      vi.mocked(mockMessageService.sendImageMessage).mockRejectedValue(
        new Error('Send failed')
      )

      const formData = new FormData()
      formData.append('conversationId', 'conv_1')
      formData.append('image', new Blob(['fake-image'], { type: 'image/jpeg' }), 'test.jpg')

      const res = await app.request('/api/messages/send-image', {
        method: 'POST',
        body: formData
      })
      const body = await res.json()

      expect(res.status).toBe(500)
      expect(body.success).toBe(false)
    })
  })
})
