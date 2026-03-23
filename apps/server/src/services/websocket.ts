import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'http'
import { logger } from '../lib/logger.js'

export interface WebSocketMessage<T = unknown> {
  event: string
  data: T
}

export interface ClientConnectData {
  guid: string
}

export class WebSocketService {
  private wss: WebSocketServer
  private clients: Map<string, WebSocket> = new Map()
  private wsToClientId: Map<WebSocket, string> = new Map()

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server })
    this.setupEventHandlers()
  }

  private setupEventHandlers() {
    this.wss.on('connection', (ws: WebSocket) => {
      logger.debug('WebSocket client connected')

      ws.on('message', (data: Buffer) => {
        try {
          const message: WebSocketMessage = JSON.parse(data.toString())
          this.handleMessage(ws, message)
        } catch (error) {
          logger.error({ err: error }, 'Failed to parse WebSocket message')
        }
      })

      ws.on('close', () => {
        const clientId = this.wsToClientId.get(ws)
        if (clientId) {
          this.clients.delete(clientId)
          this.wsToClientId.delete(ws)
          logger.debug({ clientId }, 'Client disconnected')
        }
      })

      ws.on('error', (error) => {
        logger.error({ err: error }, 'WebSocket error')
      })
    })
  }

  private handleMessage(ws: WebSocket, message: WebSocketMessage) {
    switch (message.event) {
      case 'client:connect':
        const data = message.data as ClientConnectData
        if (!data?.guid || typeof data.guid !== 'string') {
          logger.error({ data }, 'Invalid client:connect data')
          return
        }
        const clientId = data.guid

        // 处理重复注册
        const existingWs = this.clients.get(clientId)
        if (existingWs && existingWs !== ws) {
          logger.warn({ clientId }, 'Client already connected, closing old connection')
          existingWs.close()
        }

        this.clients.set(clientId, ws)
        this.wsToClientId.set(ws, clientId)
        this.send(ws, 'connected', { clientId })
        logger.debug({ clientId }, 'Client registered')
        break

      default:
        logger.debug({ event: message.event }, 'Unknown event')
    }
  }

  /**
   * 发送消息给指定 WebSocket 连接
   */
  send(ws: WebSocket, event: string, data: any) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ event, data }))
      } catch (error) {
        logger.error({ err: error }, 'Failed to send message')
      }
    }
  }

  /**
   * 广播消息给所有客户端
   */
  broadcast(event: string, data: any) {
    const message = JSON.stringify({ event, data })
    this.wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message)
        } catch (error) {
          logger.error({ err: error }, 'Failed to broadcast message')
        }
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
   * 广播表情下载完成消息
   */
  broadcastEmojiDownloaded(data: {
    msgId: string
    conversationId: string
    ossUrl: string
  }): void {
    this.broadcast('emoji_downloaded', data)
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
