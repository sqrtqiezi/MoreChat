import { Hono } from 'hono'
import type { ClientService } from '../services/clientService'

interface ClientRouteDeps {
  clientService: ClientService
}

export function clientRoutes(deps: ClientRouteDeps) {
  const router = new Hono()

  router.get('/status', async (c) => {
    try {
      const status = await deps.clientService.getStatus()
      return c.json({ success: true, data: status })
    } catch (error) {
      console.error('Failed to get client status:', error)
      return c.json({ success: false, error: { message: 'Failed to get client status' } }, 500)
    }
  })

  return router
}
