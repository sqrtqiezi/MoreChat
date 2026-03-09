import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { clientRoutes } from './client'
import type { ClientService } from '../services/clientService'

describe('client routes', () => {
  let app: Hono
  let mockClientService: ClientService

  beforeEach(() => {
    mockClientService = {
      getStatus: vi.fn()
    } as any

    app = new Hono()
    app.route('/api/client', clientRoutes({ clientService: mockClientService }))
  })

  describe('GET /api/client/status', () => {
    it('should return client status', async () => {
      vi.mocked(mockClientService.getStatus).mockResolvedValue({
        online: true,
        guid: 'test_guid'
      })

      const res = await app.request('/api/client/status')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.data.online).toBe(true)
    })

    it('should return 500 on error', async () => {
      vi.mocked(mockClientService.getStatus).mockRejectedValue(
        new Error('API error')
      )

      const res = await app.request('/api/client/status')
      const body = await res.json()

      expect(res.status).toBe(500)
      expect(body.success).toBe(false)
    })
  })
})
