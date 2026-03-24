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
        msgId: 'sent_123',
        msgType: 1,
        fromUsername: 'wxid_me',
        toUsername: 'wxid_target',
        content: '你好',
        createTime: 1234567890,
        displayType: 'text',
        displayContent: '你好'
      })

      const res = await app.request('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: 'conv_1', content: '你好' })
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.data.message).toBeDefined()
      expect(body.data.message.msgId).toBe('sent_123')
      expect(body.data.message.msgType).toBe(1)
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
      const mockResult = {
        msgId: 'refer_789',
        msgType: 49,
        fromUsername: 'me',
        toUsername: 'target',
        content: '回复',
        createTime: 1234567890,
        displayType: 'quote',
        displayContent: '回复',
        referMsg: { type: 1, senderName: 'Sender', content: '原始', msgId: 'orig_123' },
      }
      vi.mocked(mockMessageService.sendMessage).mockResolvedValue(mockResult)

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
        msgId: 'img_123',
        msgType: 3,
        fromUsername: 'wxid_me',
        toUsername: 'wxid_target',
        content: '<msg><img /></msg>',
        createTime: 1234567890,
        displayType: 'image',
        displayContent: '[图片]'
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
      expect(body.data.message.msgId).toBe('img_123')
      expect(body.data.message.msgType).toBe(3)
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
