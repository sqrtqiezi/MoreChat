import { Hono } from 'hono'
import type { MessageService } from '../services/message.js'
import { logger } from '../lib/logger.js'

interface MessageRouteDeps {
  messageService: MessageService
}

export function messageRoutes(deps: MessageRouteDeps) {
  const router = new Hono()

  // POST /api/messages/send - 发送消息
  router.post('/send', async (c) => {
    try {
      const body = await c.req.json()
      const { conversationId, content } = body

      if (!conversationId || !content) {
        return c.json({ success: false, error: { message: 'conversationId and content are required' } }, 400)
      }

      const result = await deps.messageService.sendMessage(conversationId, content)
      return c.json({ success: true, data: result })
    } catch (error) {
      logger.error({ err: error }, 'Failed to send message')
      return c.json({ success: false, error: { message: 'Failed to send message' } }, 500)
    }
  })

  return router
}
