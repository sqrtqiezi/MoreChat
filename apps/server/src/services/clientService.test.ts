import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ClientService } from './clientService.js'
import type { JuhexbotAdapter } from './juhexbotAdapter.js'

describe('ClientService', () => {
  let clientService: ClientService
  let mockAdapter: JuhexbotAdapter

  beforeEach(() => {
    mockAdapter = {
      getClientStatus: vi.fn()
    } as any

    clientService = new ClientService(mockAdapter)
  })

  it('should return online status', async () => {
    vi.mocked(mockAdapter.getClientStatus).mockResolvedValue({
      online: true,
      guid: 'test_guid'
    })

    const result = await clientService.getStatus()
    expect(result).toEqual({ online: true, guid: 'test_guid' })
  })

  it('should return offline status', async () => {
    vi.mocked(mockAdapter.getClientStatus).mockResolvedValue({
      online: false,
      guid: 'test_guid'
    })

    const result = await clientService.getStatus()
    expect(result).toEqual({ online: false, guid: 'test_guid' })
  })

  it('should handle API error gracefully', async () => {
    vi.mocked(mockAdapter.getClientStatus).mockRejectedValue(
      new Error('Network error')
    )

    await expect(clientService.getStatus()).rejects.toThrow('Network error')
  })
})
