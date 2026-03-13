import { describe, expect, it, vi } from 'vitest'
import { DatabaseService } from './database.js'

type MockFn = ReturnType<typeof vi.fn>

function createServiceWithMockPrisma() {
  const contactFindMany = vi.fn().mockResolvedValue([
    { id: 'contact_1', username: 'a', nickname: 'A', remark: null, avatar: null },
    { id: 'contact_2', username: 'b', nickname: 'B', remark: 'BB', avatar: null },
  ])
  const groupFindMany = vi.fn().mockResolvedValue([
    { id: 'group_1', roomUsername: 'room_1@chatroom', name: 'Room 1', avatar: null, memberCount: 3 },
  ])
  const conversationFindMany = vi.fn().mockResolvedValue([
    { id: 'conv_1', contactId: 'contact_1', groupId: null },
    { id: 'conv_2', contactId: null, groupId: 'group_1' },
  ])
  const conversationFindFirst = vi.fn()

  const service = Object.create(DatabaseService.prototype) as DatabaseService & {
    prisma: {
      contact: { findMany: MockFn }
      group: { findMany: MockFn }
      conversation: { findMany: MockFn; findFirst: MockFn }
    }
  }

  service.prisma = {
    contact: { findMany: contactFindMany },
    group: { findMany: groupFindMany },
    conversation: {
      findMany: conversationFindMany,
      findFirst: conversationFindFirst,
    },
  }

  return {
    service,
    mocks: { contactFindMany, groupFindMany, conversationFindMany, conversationFindFirst },
  }
}

describe('DatabaseService directory query strategy', () => {
  it('should resolve contact conversation ids via one batched conversation query', async () => {
    const { service, mocks } = createServiceWithMockPrisma()

    const contacts = await service.getDirectoryContacts('client_1')

    expect(contacts).toEqual([
      expect.objectContaining({ id: 'contact_1', conversationId: 'conv_1' }),
      expect.objectContaining({ id: 'contact_2', conversationId: null }),
    ])
    expect(mocks.conversationFindMany).toHaveBeenCalledTimes(1)
    expect(mocks.conversationFindFirst).not.toHaveBeenCalled()
  })

  it('should resolve group conversation ids via one batched conversation query', async () => {
    const { service, mocks } = createServiceWithMockPrisma()

    const groups = await service.getDirectoryGroups('client_1')

    expect(groups).toEqual([
      expect.objectContaining({ id: 'group_1', conversationId: 'conv_2' }),
    ])
    expect(mocks.conversationFindMany).toHaveBeenCalledTimes(1)
    expect(mocks.conversationFindFirst).not.toHaveBeenCalled()
  })
})
