import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConversationService } from './conversationService'
import type { DatabaseService } from './database'
import type { DataLakeService } from './dataLake'

describe('ConversationService', () => {
  let service: ConversationService
  let mockDb: DatabaseService
  let mockDataLake: DataLakeService

  beforeEach(() => {
    mockDb = {
      getConversations: vi.fn(),
      findConversationById: vi.fn(),
      updateConversation: vi.fn(),
      getMessageIndexes: vi.fn()
    } as any

    mockDataLake = {
      getMessages: vi.fn()
    } as any

    service = new ConversationService(mockDb, mockDataLake)
  })

  describe('list', () => {
    it('should return conversations ordered by lastMessageAt', async () => {
      const mockConversations = [
        { id: 'conv_1', type: 'private', lastMessageAt: new Date('2026-03-09'), unreadCount: 2 },
        { id: 'conv_2', type: 'group', lastMessageAt: new Date('2026-03-08'), unreadCount: 0 }
      ]
      vi.mocked(mockDb.getConversations).mockResolvedValue(mockConversations)

      const result = await service.list('client_1')
      expect(result).toEqual(mockConversations)
      expect(mockDb.getConversations).toHaveBeenCalledWith('client_1', { limit: 50, offset: 0 })
    })
  })

  describe('getById', () => {
    it('should return conversation detail', async () => {
      const mockConv = { id: 'conv_1', type: 'private', unreadCount: 3 }
      vi.mocked(mockDb.findConversationById).mockResolvedValue(mockConv)

      const result = await service.getById('conv_1')
      expect(result).toEqual(mockConv)
    })

    it('should throw error when conversation not found', async () => {
      vi.mocked(mockDb.findConversationById).mockResolvedValue(null)

      await expect(service.getById('not_exist')).rejects.toThrow('Conversation not found')
    })
  })

  describe('markAsRead', () => {
    it('should clear unread count', async () => {
      vi.mocked(mockDb.findConversationById).mockResolvedValue({ id: 'conv_1' })
      vi.mocked(mockDb.updateConversation).mockResolvedValue(undefined)

      await service.markAsRead('conv_1')
      expect(mockDb.updateConversation).toHaveBeenCalledWith('conv_1', { unreadCount: 0 })
    })
  })

  describe('getMessages', () => {
    it('should return paginated messages from DataLake', async () => {
      const mockIndexes = [
        { dataLakeKey: 'key1', createTime: 1000 },
        { dataLakeKey: 'key2', createTime: 900 }
      ]
      const mockMessages = [
        { msg_id: 'msg1', content: 'hello' },
        { msg_id: 'msg2', content: 'world' }
      ]

      vi.mocked(mockDb.getMessageIndexes).mockResolvedValue(mockIndexes)
      vi.mocked(mockDataLake.getMessages).mockResolvedValue(mockMessages)

      const result = await service.getMessages('conv_1', { limit: 50 })
      expect(result.messages).toEqual(mockMessages)
      expect(result.hasMore).toBe(false)
    })

    it('should indicate hasMore when limit is reached', async () => {
      const mockIndexes = Array(51).fill({ dataLakeKey: 'key', createTime: 1000 })
      vi.mocked(mockDb.getMessageIndexes).mockResolvedValue(mockIndexes)
      vi.mocked(mockDataLake.getMessages).mockResolvedValue([])

      const result = await service.getMessages('conv_1', { limit: 50 })
      expect(result.hasMore).toBe(true)
    })
  })
})
