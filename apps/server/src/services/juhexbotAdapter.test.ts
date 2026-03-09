import { describe, it, expect, vi, afterEach } from 'vitest'
import { JuhexbotAdapter } from './juhexbotAdapter.js'
import { textMessage, imageMessage, messageRecall, voiceCallMessage, appMessage } from '../../../../tests/fixtures/messages.js'

describe('JuhexbotAdapter', () => {
  const adapter = new JuhexbotAdapter({
    apiUrl: 'http://chat-api.juhebot.com/open/GuidRequest',
    appKey: 'test_key',
    appSecret: 'test_secret',
    clientGuid: 'test-guid-123'
  })

  describe('parseWebhookPayload', () => {
    it('should parse text message', () => {
      const result = adapter.parseWebhookPayload(textMessage)

      expect(result.guid).toBe('test-guid-123')
      expect(result.notifyType).toBe(1010)
      expect(result.message.msgType).toBe(1)
      expect(result.message.content).toBe('Hello, this is a test message')
      expect(result.message.fromUsername).toBe('test_user')
      expect(result.message.toUsername).toBe('filehelper')
      expect(result.message.isChatroomMsg).toBe(false)
    })

    it('should parse image message', () => {
      const result = adapter.parseWebhookPayload(imageMessage)

      expect(result.message.msgType).toBe(3)
      expect(result.message.isChatroomMsg).toBe(false)
    })

    it('should parse message recall', () => {
      const result = adapter.parseWebhookPayload(messageRecall)

      expect(result.message.msgType).toBe(10002)
      expect(result.message.content).toContain('revokemsg')
    })

    it('should parse voice/video call message', () => {
      const result = adapter.parseWebhookPayload(voiceCallMessage)

      expect(result.message.msgType).toBe(51)
    })

    it('should parse chatroom message', () => {
      const result = adapter.parseWebhookPayload(appMessage)

      expect(result.message.msgType).toBe(49)
      expect(result.message.isChatroomMsg).toBe(true)
      expect(result.message.chatroomSender).toBe('test_sender')
      expect(result.message.chatroom).toBe('test_chatroom@chatroom')
    })
  })

  describe('getConversationId', () => {
    it('should return contact username for private message', () => {
      const parsed = adapter.parseWebhookPayload(textMessage)
      const convId = adapter.getConversationId(parsed)

      expect(convId).toBe('test_user')
    })

    it('should return chatroom id for group message', () => {
      const parsed = adapter.parseWebhookPayload(appMessage)
      const convId = adapter.getConversationId(parsed)

      expect(convId).toBe('test_chatroom@chatroom')
    })
  })

  describe('buildGatewayRequest', () => {
    it('should build correct gateway request', () => {
      const request = adapter.buildGatewayRequest('/msg/send_text', {
        guid: 'test-guid-123',
        conversation_id: '5:1xxxx',
        content: 'hello'
      })

      expect(request.app_key).toBe('test_key')
      expect(request.app_secret).toBe('test_secret')
      expect(request.path).toBe('/msg/send_text')
      expect(request.data.content).toBe('hello')
    })
  })

  describe('getClientStatus', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should return online status when client is active', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          errcode: 0,
          data: { status: 1, guid: 'test-guid-123' }
        })
      })

      const result = await adapter.getClientStatus()
      expect(result).toEqual({ online: true, guid: 'test-guid-123' })
    })

    it('should return offline status when client is inactive', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          errcode: 0,
          data: { status: 0, guid: 'test-guid-123' }
        })
      })

      const result = await adapter.getClientStatus()
      expect(result).toEqual({ online: false, guid: 'test-guid-123' })
    })

    it('should throw error when API returns error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          errcode: 1001,
          err_msg: 'Invalid credentials'
        })
      })

      await expect(adapter.getClientStatus()).rejects.toThrow('Invalid credentials')
    })
  })

  describe('sendTextMessage', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should send text message successfully', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          errcode: 0,
          data: { msg_id: 'sent_msg_123' }
        })
      })

      const result = await adapter.sendTextMessage('wxid_target', '你好')
      expect(result).toEqual({ msgId: 'sent_msg_123' })

      expect(fetch).toHaveBeenCalledWith('http://chat-api.juhebot.com/open/GuidRequest', expect.objectContaining({
        method: 'POST'
      }))
    })

    it('should throw error when send fails', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          errcode: 2001,
          err_msg: 'Client offline'
        })
      })

      await expect(adapter.sendTextMessage('wxid_target', '你好')).rejects.toThrow('Client offline')
    })
  })

  describe('setNotifyUrl', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should set notify URL successfully', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          errcode: 0,
          data: {}
        })
      })

      await adapter.setNotifyUrl('https://example.com/webhook')

      expect(fetch).toHaveBeenCalledWith('http://chat-api.juhebot.com/open/GuidRequest', expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('/client/set_notify_url')
      }))
    })

    it('should throw error when setting notify URL fails', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          errcode: 3001,
          err_msg: 'Invalid URL format'
        })
      })

      await expect(adapter.setNotifyUrl('invalid-url')).rejects.toThrow('Invalid URL format')
    })
  })
})
