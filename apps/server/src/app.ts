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
import { messageRoutes } from './routes/messages.js'
import type { ClientService } from './services/clientService.js'
import type { ConversationService } from './services/conversationService.js'
import type { MessageService } from './services/message.js'
import type { JuhexbotAdapter } from './services/juhexbotAdapter.js'
import type { WebSocketService } from './services/websocket.js'

export interface AppDependencies {
  clientService: ClientService
  conversationService: ConversationService
  messageService: MessageService
  juhexbotAdapter: JuhexbotAdapter
  wsService: WebSocketService
  clientGuid: string
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
      await deps.messageService.handleIncomingMessage(parsed)
      return c.json({ success: true })
    } catch (error) {
      console.error('Webhook error:', error)
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
  app.route('/api/messages', messageRoutes({ messageService: deps.messageService }))

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
