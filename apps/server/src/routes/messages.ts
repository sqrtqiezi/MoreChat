import { Hono } from 'hono'
import type { MessageService } from '../services/message.js'
import type { ImageService } from '../services/imageService.js'
import { logger } from '../lib/logger.js'

interface MessageRouteDeps {
  messageService: MessageService
  imageService: ImageService
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
      return c.json({ success: true, data: { message: result } })
    } catch (error) {
      logger.error({ err: error }, 'Failed to send message')
      return c.json({ success: false, error: { message: 'Failed to send message' } }, 500)
    }
  })

  // GET /api/messages/:msgId/image - 获取图片下载 URL
  router.get('/:msgId/image', async (c) => {
    try {
      const msgId = c.req.param('msgId')

      if (!msgId) {
        return c.json({ success: false, error: { message: 'msgId is required' } }, 400)
      }

      const imageUrl = await deps.imageService.getImageUrl(msgId)
      return c.json({ success: true, data: { imageUrl } })
    } catch (error: any) {
      logger.error({ err: error, msgId: c.req.param('msgId') }, 'Failed to get image URL')

      if (error.message === 'Message not found' || error.message?.includes('Message not found')) {
        return c.json({ success: false, error: { message: 'Message not found' } }, 404)
      }

      if (error.message === 'Not an image message' || error.message?.includes('parse')) {
        return c.json({ success: false, error: { message: 'Not an image message or unsupported format' } }, 422)
      }

      if (error.message?.includes('Cloud API') || error.message?.includes('CDN')) {
        return c.json({ success: false, error: { message: 'Failed to download image from cloud service' } }, 502)
      }

      return c.json({ success: false, error: { message: 'Internal server error' } }, 500)
    }
  })

  return router
}
