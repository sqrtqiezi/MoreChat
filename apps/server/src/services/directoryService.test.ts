import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DirectoryService } from './directoryService.js'

describe('DirectoryService', () => {
  let db: any
  let service: DirectoryService

  beforeEach(() => {
    db = {
      findClientByGuid: vi.fn(),
      getDirectoryContacts: vi.fn(),
      getDirectoryGroups: vi.fn(),
    }
    service = new DirectoryService(db)
  })

  it('should return contacts and groups for the client guid', async () => {
    db.findClientByGuid.mockResolvedValue({ id: 'client_1' })
    db.getDirectoryContacts.mockResolvedValue([{ username: 'friend_1', conversationId: 'conv_1' }])
    db.getDirectoryGroups.mockResolvedValue([{ roomUsername: 'room_1@chatroom', conversationId: null }])

    await expect(service.list('guid_1')).resolves.toEqual({
      contacts: [{ username: 'friend_1', conversationId: 'conv_1' }],
      groups: [{ roomUsername: 'room_1@chatroom', conversationId: null }],
    })
  })

  it('should throw when client guid is unknown', async () => {
    db.findClientByGuid.mockResolvedValue(null)

    await expect(service.list('bad_guid')).rejects.toThrow('Client not found')
  })
})
