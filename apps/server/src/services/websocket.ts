import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'http'

export interface WebSocketMessage {
  event: string
  data: any
}

export class WebSocketService {
  private wss: WebSocketServer
  private clients: Map<string, WebSocket> = new Map()

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server })
    this.setupEventHandlers()
  }

  private setupEventHandlers() {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('WebSocket client connected')

      ws.on('message', (data: Buffer) => {
        try {
          const message: WebSocketMessage = JSON.parse(data.toString())
          this.handleMessage(ws, message)
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      })

      ws.on('close', () => {
        console.log('WebSocket client disconnected')
        // 从 clients Map 中移除
        for (const [clientId, client] of this.clients.entries()) {
          if (client === ws) {
            this.clients.delete(clientId)
            break
          }
        }
      })

      ws.on('error', (error) => {
        console.error('WebSocket error:', error)
      })
    })
  }

  private handleMessage(ws: WebSocket, message: WebSocketMessage) {
    switch (message.event) {
      case 'client:connect':
        const clientId = message.data.guid
        this.clients.set(clientId, ws)
        this.send(ws, 'connected', { clientId })
        console.log(`Client registered: ${clientId}`)
        break

      default:
        console.log('Unknown event:', message.event)
    }
  }

  /**
   * 发送消息给指定 WebSocket 连接
   */
  send(ws: WebSocket, event: string, data: any) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event, data }))
    }
  }

  /**
   * 广播消息给所有客户端
   */
  broadcast(event: string, data: any) {
    const message = JSON.stringify({ event, data })
    this.wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message)
      }
    })
  }

  /**
   * 发送消息给指定客户端 ID
   */
  sendToClient(clientId: string, event: string, data: any) {
    const ws = this.clients.get(clientId)
    if (ws) {
      this.send(ws, event, data)
    }
  }

  /**
   * 获取当前连接数
   */
  getConnectionCount(): number {
    return this.clients.size
  }

  /**
   * 关闭所有连接
   */
  close() {
    this.wss.clients.forEach(client => {
      client.close()
    })
    this.wss.close()
  }
}
