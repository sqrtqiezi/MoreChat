import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { WebSocketService } from './websocket.js.js'
import { createServer } from 'http'
import WebSocket from 'ws'

describe('WebSocketService', () => {
  let server: ReturnType<typeof createServer>
  let wsService: WebSocketService
  let port: number

  beforeEach(async () => {
    server = createServer()
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        port = (server.address() as any).port
        wsService = new WebSocketService(server)
        resolve()
      })
    })
  })

  afterEach(async () => {
    wsService?.close()
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
  })

  it('should accept WebSocket connections', async () => {
    const client = new WebSocket(`ws://localhost:${port}`)

    await new Promise<void>((resolve) => {
      client.on('open', () => {
        expect(client.readyState).toBe(WebSocket.OPEN)
        client.close()
        resolve()
      })
    })
  })

  it('should handle client:connect event', async () => {
    const client = new WebSocket(`ws://localhost:${port}`)

    await new Promise<void>((resolve) => {
      client.on('open', () => {
        client.send(JSON.stringify({
          event: 'client:connect',
          data: { guid: 'test_client_123' }
        }))
      })

      client.on('message', (data) => {
        const message = JSON.parse(data.toString())
        expect(message.event).toBe('connected')
        expect(message.data.clientId).toBe('test_client_123')
        client.close()
        resolve()
      })
    })
  })

  it('should send message to specific client', async () => {
    const client = new WebSocket(`ws://localhost:${port}`)

    await new Promise<void>((resolve) => {
      client.on('open', () => {
        client.send(JSON.stringify({
          event: 'client:connect',
          data: { guid: 'test_client_456' }
        }))
      })

      let connectedReceived = false
      client.on('message', (data) => {
        const message = JSON.parse(data.toString())

        if (message.event === 'connected') {
          connectedReceived = true
          // 发送测试消息
          wsService.sendToClient('test_client_456', 'test:event', { foo: 'bar' })
        } else if (message.event === 'test:event' && connectedReceived) {
          expect(message.data.foo).toBe('bar')
          client.close()
          resolve()
        }
      })
    })
  })
})
