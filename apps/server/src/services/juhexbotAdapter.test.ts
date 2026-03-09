import { describe, it, expect } from 'vitest'
import { JuhexbotAdapter } from './juhexbotAdapter'
import { textMessage, imageMessage, messageRecall, voiceCallMessage, appMessage } from '../../../../tests/fixtures/messages'

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
})
