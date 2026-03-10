import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConversationService } from './conversationService.js'
import type { DatabaseService } from './database.js'
import type { DataLakeService } from './dataLake.js'

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
      const mockRawMessages = [
        { msg_id: 'msg1', msg_type: 1, from_username: 'user1', to_username: 'user2', content: 'hello', create_time: 1000 },
        { msg_id: 'msg2', msg_type: 1, from_username: 'user2', to_username: 'user1', content: 'world', create_time: 900 }
      ]
      const expectedMessages = [
        { msgId: 'msg2', msgType: 1, fromUsername: 'user2', toUsername: 'user1', content: 'world', createTime: 900, chatroomSender: undefined, desc: undefined, isChatroomMsg: undefined, chatroom: undefined, source: undefined, displayType: 'text', displayContent: 'world' },
        { msgId: 'msg1', msgType: 1, fromUsername: 'user1', toUsername: 'user2', content: 'hello', createTime: 1000, chatroomSender: undefined, desc: undefined, isChatroomMsg: undefined, chatroom: undefined, source: undefined, displayType: 'text', displayContent: 'hello' }
      ]

      vi.mocked(mockDb.getMessageIndexes).mockResolvedValue(mockIndexes)
      vi.mocked(mockDataLake.getMessages).mockResolvedValue(mockRawMessages)

      const result = await service.getMessages('conv_1', { limit: 20 })
      expect(result.messages).toEqual(expectedMessages)
      expect(result.hasMore).toBe(false)
    })

    it('should indicate hasMore when limit is reached', async () => {
      const mockIndexes = Array(21).fill({ dataLakeKey: 'key', createTime: 1000 })
      vi.mocked(mockDb.getMessageIndexes).mockResolvedValue(mockIndexes)
      vi.mocked(mockDataLake.getMessages).mockResolvedValue([])

      const result = await service.getMessages('conv_1', { limit: 20 })
      expect(result.hasMore).toBe(true)
    })

    it('should process non-text messages with displayType and displayContent', async () => {
      const mockIndexes = [
        { dataLakeKey: 'key1', createTime: 1000 }
      ]
      const mockRawMessages = [
        { msg_id: 'msg1', msg_type: 3, from_username: 'user1', to_username: 'user2', content: '', create_time: 1000 }
      ]

      vi.mocked(mockDb.getMessageIndexes).mockResolvedValue(mockIndexes)
      vi.mocked(mockDataLake.getMessages).mockResolvedValue(mockRawMessages)

      const result = await service.getMessages('conv_1', { limit: 20 })
      expect(result.messages[0].displayType).toBe('image')
      expect(result.messages[0].displayContent).toBe('[图片]')
    })
  })
})
