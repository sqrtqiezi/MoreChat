import { Hono } from 'hono'
import { logger } from '../lib/logger.js'

export function directoryRoutes(deps: { directoryService: { list: (clientGuid: string) => Promise<unknown> }; clientGuid: string }) {
  const router = new Hono()

  router.get('/', async (c) => {
    try {
      const result = await deps.directoryService.list(deps.clientGuid)
      return c.json({ success: true, data: result })
    } catch (error) {
      logger.error({ err: error }, 'Failed to get directory')
      return c.json({ success: false, error: { message: 'Failed to get directory' } }, 500)
    }
  })

  return router
}
