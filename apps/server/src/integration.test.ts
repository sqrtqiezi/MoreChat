import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { serve } from '@hono/node-server'
import WebSocket from 'ws'
import { DataLakeService } from './services/dataLake.js'
import { DatabaseService } from './services/database.js'
import { MessageService } from './services/message.js'
import { JuhexbotAdapter } from './services/juhexbotAdapter.js'
import { WebSocketService } from './services/websocket.js'
import { ClientService } from './services/clientService.js'
import { ConversationService } from './services/conversationService.js'
import { createApp } from './app.js'
import type { Server } from 'http'

const TEST_PASSWORD = 'test123'
const TEST_PASSWORD_HASH = '$2b$10$zC.9OzD0p0tx9b/w8pU2K.ijNk2vjHM4YU0.PxJBvKNkUZ85tqTtu'
const TEST_JWT_SECRET = 'test-jwt-secret'

describe('Integration Tests', () => {
  let server: Server
  let wsService: WebSocketService
  let databaseService: DatabaseService
  let baseUrl: string
  let wsUrl: string
  let authToken: string

  beforeAll(async () => {
    const dataLakeService = new DataLakeService({
      type: 'filesystem',
      path: './data/test-datalake'
    })

    databaseService = new DatabaseService()
    await databaseService.connect()

    const juhexbotAdapter = new JuhexbotAdapter({
      apiUrl: 'https://test.api.com',
      appKey: 'test-key',
      appSecret: 'test-secret',
      clientGuid: 'test-guid',
      cloudApiUrl: 'https://test.cloud.com'
    })

    const clientService = new ClientService(juhexbotAdapter)
    const conversationService = new ConversationService(databaseService, dataLakeService)
    const messageService = new MessageService(databaseService, dataLakeService, juhexbotAdapter)

    // wsService 需要在 server 创建后初始化，用 getter 延迟访问
    let _wsService: WebSocketService

    const app = createApp({
      clientService,
      conversationService,
      messageService,
      juhexbotAdapter,
      get wsService() { return _wsService },
      clientGuid: 'test-guid',
      auth: {
        passwordHash: TEST_PASSWORD_HASH,
        jwtSecret: TEST_JWT_SECRET,
      },
    } as any)

    server = serve({ fetch: app.fetch, port: 0 })

    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Failed to get server address')
    }
    const port = address.port
    baseUrl = `http://localhost:${port}`
    wsUrl = `ws://localhost:${port}`

    _wsService = new WebSocketService(server)
    wsService = _wsService

    // Login to get auth token
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: TEST_PASSWORD }),
    })
    const loginBody = await loginRes.json() as any
    authToken = loginBody.data.token
  })

  afterAll(async () => {
    wsService?.close()
    await databaseService?.disconnect()
    server?.close()
  })

  describe('HTTP Health Check', () => {
    it('should return 200 and status ok', async () => {
      const response = await fetch(`${baseUrl}/health`)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data).toHaveProperty('status', 'ok')
      expect(data).toHaveProperty('timestamp')
      expect(typeof data.timestamp).toBe('number')
    })
  })

  describe('WebSocket Connection', () => {
    it('should connect and receive connected event', async () => {
      return new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(wsUrl)
        const timeout = setTimeout(() => {
          ws.close()
          reject(new Error('Test timeout'))
        }, 5000)

        ws.on('open', () => {
          ws.send(JSON.stringify({
            event: 'client:connect',
            data: { guid: 'test-client-123' }
          }))
        })

        ws.on('message', (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString())
            if (message.event === 'connected') {
              expect(message.data).toHaveProperty('clientId', 'test-client-123')
              clearTimeout(timeout)
              ws.close()
              resolve()
            }
          } catch (error) {
            clearTimeout(timeout)
            ws.close()
            reject(error)
          }
        })

        ws.on('error', (error) => {
          clearTimeout(timeout)
          ws.close()
          reject(error)
        })
      })
    })
  })

  describe('Phase 2 - API Routes', () => {
    it('GET /api/conversations should return empty list initially', async () => {
      const res = await fetch(`${baseUrl}/api/conversations`, {
        headers: { 'Authorization': `Bearer ${authToken}` },
      })
      const body = await res.json() as any

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.data.conversations).toEqual([])
    })

    it('POST /api/messages/send should return 400 when missing params', async () => {
      const res = await fetch(`${baseUrl}/api/messages/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ conversationId: 'conv_1' })
      })
      const body = await res.json() as any

      expect(res.status).toBe(400)
      expect(body.success).toBe(false)
    })
  })
})
