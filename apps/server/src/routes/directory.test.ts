import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import { directoryRoutes } from './directory.js'

describe('directory routes', () => {
  let app: Hono
  let directoryService: any

  beforeEach(() => {
    directoryService = { list: vi.fn() }
    app = new Hono()
    app.route('/api/directory', directoryRoutes({
      directoryService,
      clientGuid: 'guid_1',
    }))
  })

  it('should return contacts and groups', async () => {
    directoryService.list.mockResolvedValue({
      contacts: [{ username: 'friend_1' }],
      groups: [{ roomUsername: 'room_1@chatroom' }],
    })

    const res = await app.request('/api/directory')
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.contacts).toHaveLength(1)
    expect(body.data.groups).toHaveLength(1)
  })
})
