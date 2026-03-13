import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ContactSyncService } from './contactSyncService.js'

function createMockDeps() {
  return {
    db: {
      findContactByUsername: vi.fn(),
      updateContact: vi.fn(),
      findGroupByRoomUsername: vi.fn(),
      updateGroup: vi.fn(),
      upsertGroupMember: vi.fn(),
      findStaleContacts: vi.fn().mockResolvedValue([]),
      findStaleGroups: vi.fn().mockResolvedValue([]),
      createContact: vi.fn(),
    } as any,
    adapter: {
      getContact: vi.fn(),
      getChatroomDetail: vi.fn(),
      getChatroomMemberDetail: vi.fn(),
    } as any,
    wsService: {
      broadcast: vi.fn(),
    } as any,
  }
}

describe('ContactSyncService', () => {
  let deps: ReturnType<typeof createMockDeps>
  let service: ContactSyncService

  beforeEach(() => {
    deps = createMockDeps()
    service = new ContactSyncService(deps.db, deps.adapter, deps.wsService)
    // Mock rateLimiter to avoid real delays in all tests
    ;(service as any).rateLimiter = { acquire: vi.fn().mockResolvedValue(undefined) }
  })

  describe('syncContact', () => {
    it('should fetch contact from API and update DB', async () => {
      deps.db.findContactByUsername.mockResolvedValue({
        username: 'wxid_test',
        nickname: 'wxid_test',
        lastSyncAt: null
      })
      deps.adapter.getContact.mockResolvedValue([{
        username: 'wxid_test',
        nickname: '张三',
        remark: '备注',
        avatar: 'https://avatar.jpg'
      }])

      await service.syncContact('wxid_test')

      expect(deps.adapter.getContact).toHaveBeenCalledWith(['wxid_test'])
      expect(deps.db.updateContact).toHaveBeenCalledWith('wxid_test', expect.objectContaining({
        nickname: '张三',
        remark: '备注',
        avatar: 'https://avatar.jpg',
        lastSyncAt: expect.any(Date)
      }))
      expect(deps.wsService.broadcast).toHaveBeenCalledWith('contact:updated', expect.objectContaining({
        username: 'wxid_test',
        nickname: '张三'
      }))
    })

    it('should skip if contact was synced within TTL', async () => {
      deps.db.findContactByUsername.mockResolvedValue({
        username: 'wxid_test',
        nickname: '张三',
        lastSyncAt: new Date() // just synced
      })

      await service.syncContact('wxid_test')

      expect(deps.adapter.getContact).not.toHaveBeenCalled()
    })

    it('should not throw on API failure', async () => {
      deps.db.findContactByUsername.mockResolvedValue({
        username: 'wxid_test',
        nickname: 'wxid_test',
        lastSyncAt: null
      })
      deps.adapter.getContact.mockRejectedValue(new Error('API error'))

      await expect(service.syncContact('wxid_test')).resolves.not.toThrow()
    })
  })

  describe('syncGroup', () => {
    it('should fetch group detail and members from API and update DB', async () => {
      deps.db.findGroupByRoomUsername.mockResolvedValue({
        id: 'group_1',
        roomUsername: 'room@chatroom',
        name: 'room@chatroom',
        lastSyncAt: null,
        version: 0
      })
      deps.adapter.getChatroomDetail.mockResolvedValue({
        roomUsername: 'room@chatroom',
        name: '开发群',
        avatar: 'https://group.jpg',
        memberCount: 2
      })
      deps.adapter.getChatroomMemberDetail.mockResolvedValue({
        version: 5,
        members: [
          { username: 'wxid_a', nickname: '成员A' },
          { username: 'wxid_b', nickname: '成员B' },
        ]
      })
      deps.db.findContactByUsername.mockResolvedValue(null)

      await service.syncGroup('room@chatroom')

      expect(deps.adapter.getChatroomDetail).toHaveBeenCalledWith('room@chatroom')
      expect(deps.db.updateGroup).toHaveBeenCalledWith('room@chatroom', expect.objectContaining({
        name: '开发群',
        avatar: 'https://group.jpg',
        memberCount: 2,
      }))
      // lastSyncAt 在成员同步完成后单独更新
      expect(deps.db.updateGroup).toHaveBeenCalledWith('room@chatroom', expect.objectContaining({
        lastSyncAt: expect.any(Date)
      }))
      expect(deps.db.createContact).toHaveBeenCalledWith(expect.objectContaining({
        username: 'wxid_a',
        type: 'group_member',
      }))
      expect(deps.db.createContact).toHaveBeenCalledWith(expect.objectContaining({
        username: 'wxid_b',
        type: 'group_member',
      }))
      expect(deps.wsService.broadcast).toHaveBeenCalledWith('group:updated', expect.objectContaining({
        roomUsername: 'room@chatroom',
        name: '开发群'
      }))
    })

    it('should skip if group was synced within TTL', async () => {
      deps.db.findGroupByRoomUsername.mockResolvedValue({
        id: 'group_1',
        roomUsername: 'room@chatroom',
        name: '开发群',
        lastSyncAt: new Date()
      })

      await service.syncGroup('room@chatroom')

      expect(deps.adapter.getChatroomDetail).not.toHaveBeenCalled()
    })
  })

  describe('runBackfillTask', () => {
    beforeEach(() => {
      // Mock delay and rateLimiter to avoid real waiting
      vi.spyOn(service as any, 'delay').mockResolvedValue(undefined)
      ;(service as any).rateLimiter = { acquire: vi.fn().mockResolvedValue(undefined) }
    })

    it('should sync stale contacts and groups', async () => {
      deps.db.findStaleContacts.mockResolvedValue([
        { username: 'wxid_stale1', nickname: 'wxid_stale1', lastSyncAt: null }
      ])
      deps.db.findStaleGroups.mockResolvedValue([
        { id: 'g1', roomUsername: 'stale@chatroom', name: 'stale@chatroom', lastSyncAt: null, version: 0 }
      ])
      deps.db.findContactByUsername.mockResolvedValue({
        username: 'wxid_stale1',
        nickname: 'wxid_stale1',
        lastSyncAt: null
      })
      deps.db.findGroupByRoomUsername.mockResolvedValue({
        id: 'g1',
        roomUsername: 'stale@chatroom',
        name: 'stale@chatroom',
        lastSyncAt: null,
        version: 0
      })
      deps.adapter.getContact.mockResolvedValue([{
        username: 'wxid_stale1',
        nickname: '补全联系人',
        avatar: null,
        remark: null
      }])
      deps.adapter.getChatroomDetail.mockResolvedValue({
        roomUsername: 'stale@chatroom',
        name: '补全群组',
        avatar: null,
        memberCount: 5
      })
      deps.adapter.getChatroomMemberDetail.mockResolvedValue({
        version: 1,
        members: []
      })

      await service.runBackfillTask()

      expect(deps.db.findStaleContacts).toHaveBeenCalledWith(20)
      expect(deps.db.findStaleGroups).toHaveBeenCalledWith(20)
      expect(deps.adapter.getContact).toHaveBeenCalled()
      expect(deps.adapter.getChatroomDetail).toHaveBeenCalled()
    })

    it('should handle empty stale list gracefully', async () => {
      deps.db.findStaleContacts.mockResolvedValue([])
      deps.db.findStaleGroups.mockResolvedValue([])

      await service.runBackfillTask()

      expect(deps.adapter.getContact).not.toHaveBeenCalled()
      expect(deps.adapter.getChatroomDetail).not.toHaveBeenCalled()
    })
  })
})
