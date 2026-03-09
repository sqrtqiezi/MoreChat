import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { serve } from '@hono/node-server'
import WebSocket from 'ws'
import { DataLakeService } from './services/dataLake.js'
import { DatabaseService } from './services/database.js'
import { MessageService } from './services/message.js'
import { JuhexbotAdapter } from './services/juhexbotAdapter.js'
import { WebSocketService } from './services/websocket.js'
import { createApp } from './app.js'
import type { ParsedWebhookPayload } from './services/juhexbotAdapter.js'
import type { Server } from 'http'

describe('Integration Tests - Phase 1', () => {
  let server: Server
  let wsService: WebSocketService
  let databaseService: DatabaseService
  let baseUrl: string
  let wsUrl: string

  beforeAll(async () => {
    // 1. Data Lake Service
    const dataLakeService = new DataLakeService({
      type: 'local',
      path: './data/test-datalake'
    })

    // 2. Database Service
    databaseService = new DatabaseService()
    await databaseService.connect()

    // 3. Juhexbot Adapter
    const juhexbotAdapter = new JuhexbotAdapter({
      apiUrl: 'https://test.api.com',
      appKey: 'test-key',
      appSecret: 'test-secret',
      clientGuid: 'test-guid'
    })

    // 4. Message Service
    const messageService = new MessageService(
      databaseService,
      dataLakeService,
      juhexbotAdapter
    )

    // 5. Message Handler
    async function handleWebhookMessage(parsed: ParsedWebhookPayload) {
      await messageService.handleIncomingMessage(parsed)
    }

    // 6. Create Hono App
    const app = createApp(juhexbotAdapter, handleWebhookMessage)

    // 7. Start HTTP Server (use port 0 for random port)
    server = serve({
      fetch: app.fetch,
      port: 0
    })

    // 8. Get actual port
    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Failed to get server address')
    }
    const port = address.port
    baseUrl = `http://localhost:${port}`
    wsUrl = `ws://localhost:${port}`

    // 9. Create WebSocket Service
    wsService = new WebSocketService(server)
  })

  afterAll(async () => {
    // Cleanup
    wsService.close()
    await databaseService.disconnect()
    server.close()
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
          // Send client:connect event
          ws.send(JSON.stringify({
            event: 'client:connect',
            data: { guid: 'test-client-123' }
          }))
        })

        ws.on('message', (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString())

            // Verify connected event
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
})

