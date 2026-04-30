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
import { OssService } from './services/ossService.js'
import { ImageService } from './services/imageService.js'
import { DirectoryService } from './services/directoryService.js'
// ContactSyncService requires wsService at construction time, stub it for integration tests
import { createApp } from './app.js'
import type { Server } from 'http'

import fs from 'fs/promises'
import path from 'path'

const TEST_PASSWORD = 'test123'
const TEST_PASSWORD_HASH = '$2b$10$zC.9OzD0p0tx9b/w8pU2K.ijNk2vjHM4YU0.PxJBvKNkUZ85tqTtu'
const TEST_JWT_SECRET = 'test-jwt-secret'

const describeIfSocketsAvailable = process.env.CODEX_SANDBOX_NETWORK_DISABLED ? describe.skip : describe

describeIfSocketsAvailable('Integration Tests', () => {
  let server: Server
  let wsService: WebSocketService
  let databaseService: DatabaseService
  let baseUrl: string
  let wsUrl: string
  let authToken: string
  const testDir = path.join(process.cwd(), 'test-integration')
  const testDbPath = path.join(testDir, 'test.db')
  const testLakePath = path.join(testDir, 'lake')

  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true })

    const dataLakeService = new DataLakeService({
      type: 'filesystem',
      path: testLakePath
    })

    databaseService = new DatabaseService(`file:${testDbPath}`)
    await databaseService.connect()

    // Create test client
    await databaseService.createClient({ guid: 'test-guid' })

    const juhexbotAdapter = new JuhexbotAdapter({
      apiUrl: 'https://test.api.com',
      appKey: 'test-key',
      appSecret: 'test-secret',
      clientGuid: 'test-guid',
      cloudApiUrl: 'https://test.cloud.com'
    })

    const ossService = new OssService({
      region: 'test-region',
      bucket: 'test-bucket',
      accessKeyId: 'test-key',
      accessKeySecret: 'test-secret',
      endpoint: 'test.endpoint.com'
    })

    const clientService = new ClientService(juhexbotAdapter)
    const conversationService = new ConversationService(databaseService, dataLakeService)
    const imageService = new ImageService(databaseService.prisma, dataLakeService, juhexbotAdapter)
    const directoryService = new DirectoryService(databaseService)

    // wsService 需要在 server 创建后初始化，用 getter 延迟访问
    let _wsService: WebSocketService

    const contactSyncService = {
      syncGroup: async () => {},
      syncContact: async () => {},
    } as any

    const messageService = new MessageService(databaseService, dataLakeService, juhexbotAdapter, 'test-guid', ossService)

    const app = createApp({
      clientService,
      conversationService,
      directoryService,
      messageService,
      imageService,
      contactSyncService,
      juhexbotAdapter,
      get wsService() { return _wsService },
      clientGuid: 'test-guid',
      userProfile: {
        username: 'test-guid',
        nickname: 'Test User',
      },
      auth: {
        passwordHash: TEST_PASSWORD_HASH,
        jwtSecret: TEST_JWT_SECRET,
      },
    })

    server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' })

    // Wait for server to start listening
    await new Promise<void>((resolve) => {
      if (server.listening) {
        resolve()
      } else {
        server.on('listening', resolve)
      }
    })

    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Failed to get server address')
    }
    const port = address.port
    baseUrl = `http://127.0.0.1:${port}`
    wsUrl = `ws://127.0.0.1:${port}`

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
    await fs.rm(testDir, { recursive: true, force: true })
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
