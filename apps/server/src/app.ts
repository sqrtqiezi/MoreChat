import { Hono } from 'hono'
import { authRoutes } from './routes/auth'
import { authMiddleware } from './middleware/auth'
import { clientRoutes } from './routes/client'
import { conversationRoutes } from './routes/conversations'
import { messageRoutes } from './routes/messages'
import type { ClientService } from './services/clientService'
import type { ConversationService } from './services/conversationService'
import type { MessageService } from './services/message'
import type { JuhexbotAdapter } from './services/juhexbotAdapter'
import type { WebSocketService } from './services/websocket'

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
}

export function createApp(deps: AppDependencies) {
  const app = new Hono()

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

  return app
}
