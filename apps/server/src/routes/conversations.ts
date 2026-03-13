import { Hono } from 'hono'
import type { ConversationService } from '../services/conversationService.js'
import { logger } from '../lib/logger.js'

interface ConversationRouteDeps {
  conversationService: ConversationService
  clientGuid: string
}

export function conversationRoutes(deps: ConversationRouteDeps) {
  const router = new Hono()

  router.post('/open', async (c) => {
    try {
      const body = await c.req.json()
      const isPrivate = body?.type === 'private' && typeof body?.username === 'string'
      const isGroup = body?.type === 'group' && typeof body?.roomUsername === 'string'

      if (!isPrivate && !isGroup) {
        return c.json({ success: false, error: { message: 'Invalid request body' } }, 400)
      }

      const result = await deps.conversationService.openConversation(
        deps.clientGuid,
        isPrivate
          ? { type: 'private', username: body.username }
          : { type: 'group', roomUsername: body.roomUsername }
      )
      return c.json({ success: true, data: result })
    } catch (error: any) {
      if (error.message === 'Contact not found' || error.message === 'Group not found') {
        return c.json({ success: false, error: { message: error.message } }, 404)
      }
      if (error instanceof SyntaxError) {
        return c.json({ success: false, error: { message: 'Invalid request body' } }, 400)
      }

      logger.error({ err: error }, 'Failed to open conversation')
      return c.json({ success: false, error: { message: 'Failed to open conversation' } }, 500)
    }
  })

  // GET /api/conversations - 会话列表
  router.get('/', async (c) => {
    try {
      const limit = parseInt(c.req.query('limit') || '50')
      const offset = parseInt(c.req.query('offset') || '0')

      const conversations = await deps.conversationService.list(deps.clientGuid, limit, offset)
      return c.json({ success: true, data: { conversations } })
    } catch (error) {
      logger.error({ err: error }, 'Failed to get conversations')
      return c.json({ success: false, error: { message: 'Failed to get conversations' } }, 500)
    }
  })

  // GET /api/conversations/:id - 会话详情
  router.get('/:id', async (c) => {
    try {
      const id = c.req.param('id')
      const conversation = await deps.conversationService.getById(id)
      return c.json({ success: true, data: conversation })
    } catch (error: any) {
      if (error.message === 'Conversation not found') {
        return c.json({ success: false, error: { message: 'Conversation not found' } }, 404)
      }
      logger.error({ err: error }, 'Failed to get conversation')
      return c.json({ success: false, error: { message: 'Failed to get conversation' } }, 500)
    }
  })

  // PUT /api/conversations/:id/read - 标记已读
  router.put('/:id/read', async (c) => {
    try {
      const id = c.req.param('id')
      await deps.conversationService.markAsRead(id)
      return c.json({ success: true })
    } catch (error) {
      logger.error({ err: error }, 'Failed to mark as read')
      return c.json({ success: false, error: { message: 'Failed to mark as read' } }, 500)
    }
  })

  // GET /api/conversations/:id/messages - 消息历史
  router.get('/:id/messages', async (c) => {
    try {
      const id = c.req.param('id')
      const limit = parseInt(c.req.query('limit') || '50')
      const before = c.req.query('before') ? parseInt(c.req.query('before')!) : undefined

      const result = await deps.conversationService.getMessages(id, { limit, before })
      return c.json({ success: true, data: result })
    } catch (error) {
      logger.error({ err: error }, 'Failed to get messages')
      return c.json({ success: false, error: { message: 'Failed to get messages' } }, 500)
    }
  })

  return router
}
