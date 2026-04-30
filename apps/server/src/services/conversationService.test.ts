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
      getMessageIndexes: vi.fn(),
      findContactsByUsernames: vi.fn().mockResolvedValue([]),
      findClientByGuid: vi.fn(),
      findContactByUsername: vi.fn(),
      findGroupByRoomUsername: vi.fn(),
      findConversation: vi.fn(),
      createConversation: vi.fn()
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

  describe('openConversation', () => {
    it('should return existing private conversation id', async () => {
      vi.mocked(mockDb.findClientByGuid).mockResolvedValue({ id: 'client_1' } as any)
      vi.mocked(mockDb.findContactByUsername).mockResolvedValue({ id: 'contact_1' } as any)
      vi.mocked(mockDb.findConversation).mockResolvedValue({ id: 'conv_1' } as any)

      await expect(
        (service as any).openConversation('guid_1', { type: 'private', username: 'friend_1' })
      ).resolves.toEqual({ conversationId: 'conv_1' })
    })

    it('should create a group conversation when missing', async () => {
      vi.mocked(mockDb.findClientByGuid).mockResolvedValue({ id: 'client_1' } as any)
      vi.mocked(mockDb.findGroupByRoomUsername).mockResolvedValue({ id: 'group_1' } as any)
      vi.mocked(mockDb.findConversation).mockResolvedValue(null)
      vi.mocked(mockDb.createConversation).mockResolvedValue({ id: 'conv_new' } as any)

      await expect(
        (service as any).openConversation('guid_1', { type: 'group', roomUsername: 'room_1@chatroom' })
      ).resolves.toEqual({ conversationId: 'conv_new' })
    })

    it('should reject unknown contacts', async () => {
      vi.mocked(mockDb.findClientByGuid).mockResolvedValue({ id: 'client_1' } as any)
      vi.mocked(mockDb.findContactByUsername).mockResolvedValue(null)
      vi.mocked(mockDb.findConversation).mockResolvedValue(null)

      await expect(
        (service as any).openConversation('guid_1', { type: 'private', username: 'missing' })
      ).rejects.toThrow('Contact not found')
    })
  })

  describe('getMessages', () => {
    it('should return paginated messages from DataLake', async () => {
      const mockIndexes = [
        { dataLakeKey: 'key1', createTime: 1000, isRecalled: false },
        { dataLakeKey: 'key2', createTime: 900, isRecalled: false }
      ]
      const mockRawMessages = [
        { msg_id: 'msg1', msg_type: 1, from_username: 'user1', to_username: 'user2', content: 'hello', create_time: 1000 },
        { msg_id: 'msg2', msg_type: 1, from_username: 'user2', to_username: 'user1', content: 'world', create_time: 900 }
      ]
      const expectedMessages = [
        { msgId: 'msg2', msgType: 1, fromUsername: 'user2', toUsername: 'user1', content: 'world', createTime: 900, chatroomSender: undefined, senderNickname: undefined, desc: undefined, isChatroomMsg: undefined, chatroom: undefined, source: undefined, displayType: 'text', displayContent: 'world', referMsg: undefined, isRecalled: false },
        { msgId: 'msg1', msgType: 1, fromUsername: 'user1', toUsername: 'user2', content: 'hello', createTime: 1000, chatroomSender: undefined, senderNickname: undefined, desc: undefined, isChatroomMsg: undefined, chatroom: undefined, source: undefined, displayType: 'text', displayContent: 'hello', referMsg: undefined, isRecalled: false }
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
        { dataLakeKey: 'key1', createTime: 1000, isRecalled: false }
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

    it('should include isRecalled in getMessages response', async () => {
      const mockIndexes = [
        { dataLakeKey: 'key1', createTime: 1000, isRecalled: true },
        { dataLakeKey: 'key2', createTime: 900, isRecalled: false }
      ]
      const mockRawMessages = [
        { msg_id: 'msg1', msg_type: 1, from_username: 'user1', to_username: 'user2', content: 'recalled', create_time: 1000 },
        { msg_id: 'msg2', msg_type: 1, from_username: 'user2', to_username: 'user1', content: 'normal', create_time: 900 }
      ]

      vi.mocked(mockDb.getMessageIndexes).mockResolvedValue(mockIndexes)
      vi.mocked(mockDataLake.getMessages).mockResolvedValue(mockRawMessages)
      vi.mocked(mockDb.findContactsByUsernames).mockResolvedValue([])

      const result = await service.getMessages('conv_1', { limit: 20 })
      expect(result.messages[1].isRecalled).toBe(true)
      expect(result.messages[0].isRecalled).toBe(false)
    })
  })

  describe('getMessagesAround', () => {
    beforeEach(() => {
      mockDb.findMessageIndexInConversation = vi.fn()
    })

    it('should return messages around target message', async () => {
      // Mock 目标消息
      vi.mocked(mockDb.findMessageIndexInConversation).mockResolvedValue({
        msgId: 'msg-5',
        createTime: 5000,
        dataLakeKey: 'test/msg-5'
      })

      // Mock 前面的消息（倒序）
      vi.mocked(mockDb.getMessageIndexes)
        .mockResolvedValueOnce([
          { msgId: 'msg-4', createTime: 4000, dataLakeKey: 'test/msg-4' },
          { msgId: 'msg-3', createTime: 3000, dataLakeKey: 'test/msg-3' }
        ])
        // Mock 后面的消息（倒序）
        .mockResolvedValueOnce([
          { msgId: 'msg-7', createTime: 7000, dataLakeKey: 'test/msg-7' },
          { msgId: 'msg-6', createTime: 6000, dataLakeKey: 'test/msg-6' },
          { msgId: 'msg-5', createTime: 5000, dataLakeKey: 'test/msg-5' }
        ])

      // Mock DataLake 返回
      vi.mocked(mockDataLake.getMessages).mockResolvedValue([
        { msg_id: 'msg-3', msg_type: 1, content: 'msg 3', create_time: 3000, from_username: 'u1', to_username: 'u2' },
        { msg_id: 'msg-4', msg_type: 1, content: 'msg 4', create_time: 4000, from_username: 'u1', to_username: 'u2' },
        { msg_id: 'msg-5', msg_type: 1, content: 'msg 5', create_time: 5000, from_username: 'u1', to_username: 'u2' },
        { msg_id: 'msg-6', msg_type: 1, content: 'msg 6', create_time: 6000, from_username: 'u1', to_username: 'u2' },
        { msg_id: 'msg-7', msg_type: 1, content: 'msg 7', create_time: 7000, from_username: 'u1', to_username: 'u2' }
      ])

      vi.mocked(mockDb.findContactsByUsernames).mockResolvedValue([])

      const result = await service.getMessagesAround('conv-1', 'msg-5', 5)

      expect(result.messages).toHaveLength(5)
      expect(result.targetIndex).toBe(2)
      expect(result.messages[2].msgId).toBe('msg-5')
    })

    it('should throw error if message not found', async () => {
      vi.mocked(mockDb.findMessageIndexInConversation).mockResolvedValue(null)

      await expect(
        service.getMessagesAround('conv-1', 'non-existent', 5)
      ).rejects.toThrow('Message not found')
    })
  })
})
