import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from '@hono/node-server/serve-static'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { authRoutes } from './routes/auth.js'
import { authMiddleware } from './middleware/auth.js'
import { clientRoutes } from './routes/client.js'
import { conversationRoutes } from './routes/conversations.js'
import { directoryRoutes } from './routes/directory.js'
import { messageRoutes } from './routes/messages.js'
import { meRoutes } from './routes/me.js'
import type { ProfileState } from './routes/me.js'
import type { ClientService } from './services/clientService.js'
import type { ConversationService } from './services/conversationService.js'
import type { MessageService } from './services/message.js'
import type { JuhexbotAdapter } from './services/juhexbotAdapter.js'
import type { WebSocketService } from './services/websocket.js'
import type { ContactSyncService } from './services/contactSyncService.js'
import type { ImageService } from './services/imageService.js'
import type { EmojiService } from './services/emojiService.js'
import type { FileService } from './services/fileService.js'
import type { DirectoryService } from './services/directoryService.js'
import { logger } from './lib/logger.js'

export interface AppDependencies {
  clientService: ClientService
  conversationService: ConversationService
  directoryService: DirectoryService
  messageService: MessageService
  imageService: ImageService
  emojiService: EmojiService
  fileService: FileService
  contactSyncService: ContactSyncService
  juhexbotAdapter: JuhexbotAdapter
  wsService: WebSocketService
  clientGuid: string
  userProfile: { getProfileState: () => ProfileState }
  auth: {
    passwordHash: string
    jwtSecret: string
  }
  corsOrigin?: string
  nodeEnv?: string
}

export function createApp(deps: AppDependencies) {
  const app = new Hono()

  // CORS
  if (deps.corsOrigin) {
    app.use('*', cors({ origin: deps.corsOrigin }))
  }

  // Health check
  app.get('/health', (c) => {
    return c.json({ status: 'ok', timestamp: Date.now() })
  })

  // Webhook
  app.post('/webhook', async (c) => {
    try {
      const payload = await c.req.json()
      const parsed = deps.juhexbotAdapter.parseWebhookPayload(payload)
      const result = await deps.messageService.handleIncomingMessage(parsed)

      // 广播新消息给所有 WebSocket 客户端
      if (result) {
        if ('message' in result) {
          deps.wsService.broadcast('message:new', {
            conversationId: result.conversationId,
            message: result.message,
          })
          logger.debug({ conversationId: result.conversationId, msgId: result.message.msgId }, 'Message broadcasted via WebSocket')

          // 异步同步联系人信息（不阻塞 webhook 响应）
          const msg = parsed.message
          if (msg.isChatroomMsg && msg.chatroom) {
            deps.contactSyncService.syncGroup(msg.chatroom).catch(() => {})
            if (msg.chatroomSender) {
              deps.contactSyncService.syncContact(msg.chatroomSender).catch(() => {})
            }
          } else {
            deps.contactSyncService.syncContact(msg.fromUsername).catch(() => {})
          }
        } else {
          deps.wsService.broadcast('message:recall', {
            conversationId: result.conversationId,
            msgId: result.revokedMsgId,
          })
          logger.debug({ conversationId: result.conversationId, revokedMsgId: result.revokedMsgId }, 'Recall broadcasted via WebSocket')
        }
      }

      return c.json({ success: true })
    } catch (error) {
      logger.error({ err: error }, 'Webhook error')
      return c.json({ success: false, error: 'Internal error' }, 500)
    }
  })

  // Auth login (no auth required — must be before middleware)
  app.route('/api/auth', authRoutes({
    passwordHash: deps.auth.passwordHash,
    jwtSecret: deps.auth.jwtSecret,
  }))

  // JWT middleware for all /api/* routes (login is already matched above)
  app.use('/api/*', authMiddleware(deps.auth.jwtSecret))

  // Mount protected routes
  app.route('/api/client', clientRoutes({ clientService: deps.clientService }))
  app.route('/api/conversations', conversationRoutes({
    conversationService: deps.conversationService,
    clientGuid: deps.clientGuid
  }))
  app.route('/api/directory', directoryRoutes({
    directoryService: deps.directoryService,
    clientGuid: deps.clientGuid
  }))
  app.route('/api/messages', messageRoutes({ messageService: deps.messageService, imageService: deps.imageService, emojiService: deps.emojiService, fileService: deps.fileService }))
  app.route('/api/me', meRoutes({ getProfileState: deps.userProfile.getProfileState }))

  // 生产环境：serve 前端静态文件
  if (deps.nodeEnv === 'production') {
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(__filename)
    // 构建后路径: apps/server/dist/app.js → apps/web/dist/
    const webDistPath = path.resolve(__dirname, '../../web/dist')

    app.use('/*', serveStatic({ root: webDistPath }))

    // SPA fallback: 所有未匹配路由返回 index.html
    app.get('*', (c) => {
      const indexPath = path.join(webDistPath, 'index.html')
      const html = fs.readFileSync(indexPath, 'utf-8')
      return c.html(html)
    })
  }

  return app
}
