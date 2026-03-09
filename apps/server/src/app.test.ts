import { describe, it, expect } from 'vitest'
import { createApp } from './app'
import { JuhexbotAdapter } from './services/juhexbotAdapter'
import { textMessage, appMessage } from '../../../tests/fixtures/messages'

describe('App', () => {
  const adapter = new JuhexbotAdapter({
    apiUrl: 'http://test',
    appKey: 'test_key',
    appSecret: 'test_secret',
    clientGuid: 'test-guid-123'
  })

  describe('GET /health', () => {
    it('should return ok', async () => {
      const app = createApp(adapter)
      const res = await app.request('/health')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.status).toBe('ok')
      expect(body.timestamp).toBeDefined()
    })
  })

  describe('POST /webhook', () => {
    it('should accept valid webhook payload', async () => {
      const received: any[] = []
      const app = createApp(adapter, async (parsed) => {
        received.push(parsed)
      })

      const res = await app.request('/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(textMessage)
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(received).toHaveLength(1)
      expect(received[0].message.msgType).toBe(1)
      expect(received[0].message.content).toBe('Hello, this is a test message')
    })

    it('should handle chatroom message', async () => {
      const received: any[] = []
      const app = createApp(adapter, async (parsed) => {
        received.push(parsed)
      })

      const res = await app.request('/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(appMessage)
      })

      expect(res.status).toBe(200)
      expect(received[0].message.isChatroomMsg).toBe(true)
    })

    it('should return 500 on invalid payload', async () => {
      const app = createApp(adapter)

      const res = await app.request('/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json'
      })

      expect(res.status).toBe(500)
    })
  })
})
