import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseService } from './database.js'
import fs from 'fs/promises'
import path from 'path'

describe('DatabaseService', () => {
  let db: DatabaseService
  const testDir = path.join(process.cwd(), 'test-data')
  const testDbPath = path.join(testDir, 'test.db')

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true })
    db = new DatabaseService(`file:${testDbPath}`)
    await db.connect()
  })

  afterEach(async () => {
    await db.disconnect()
    await fs.rm(testDir, { recursive: true, force: true })
  })

  describe('Client', () => {
    it('should create and find client', async () => {
      const client = await db.createClient({
        guid: 'test-guid-123'
      })

      expect(client.guid).toBe('test-guid-123')
      expect(client.isActive).toBe(true)

      const found = await db.findClientByGuid('test-guid-123')
      expect(found).not.toBeNull()
      expect(found!.guid).toBe('test-guid-123')
    })
  })

  describe('Contact', () => {
    it('should create and find contact', async () => {
      const contact = await db.createContact({
        username: 'user_123',
        nickname: 'Test User',
        type: 'friend'
      })

      expect(contact.username).toBe('user_123')
      expect(contact.nickname).toBe('Test User')

      const found = await db.findContactByUsername('user_123')
      expect(found).not.toBeNull()
      expect(found!.nickname).toBe('Test User')
    })

    it('should list contacts with matching conversation ids', async () => {
      const client = await db.createClient({ guid: 'guid_1' })
      const contact = await db.createContact({
        username: 'friend_1',
        nickname: 'Friend 1',
        type: 'friend',
      })
      const conversation = await db.createConversation({
        clientId: client.id,
        type: 'private',
        contactId: contact.id,
      })

      const contacts = await (db as any).getDirectoryContacts(client.id)

      expect(contacts).toEqual([
        expect.objectContaining({
          username: 'friend_1',
          conversationId: conversation.id,
        }),
      ])
    })

    it('should exclude member-only contacts from directory list', async () => {
      const client = await db.createClient({ guid: 'guid_filter' })
      const room = await db.createGroup({
        roomUsername: 'room_filter@chatroom',
        name: 'Room Filter',
      })

      const directContact = await db.createContact({
        username: 'direct_friend',
        nickname: 'Direct Friend',
        type: 'friend',
      })
      const memberOnlyContact = await db.createContact({
        username: 'member_only',
        nickname: 'Member Only',
        type: 'friend',
      })
      const memberWithConversation = await db.createContact({
        username: 'member_with_conv',
        nickname: 'Member With Conv',
        type: 'friend',
      })

      await db.upsertGroupMember({
        groupId: room.id,
        username: memberOnlyContact.username,
        nickname: memberOnlyContact.nickname,
      })
      await db.upsertGroupMember({
        groupId: room.id,
        username: memberWithConversation.username,
        nickname: memberWithConversation.nickname,
      })
      await db.createConversation({
        clientId: client.id,
        type: 'private',
        contactId: memberWithConversation.id,
      })

      const contacts = await db.getDirectoryContacts(client.id)
      const usernames = contacts.map((item) => item.username)

      expect(usernames).toContain(directContact.username)
      expect(usernames).toContain(memberWithConversation.username)
      expect(usernames).not.toContain(memberOnlyContact.username)
    })
  })

  describe('Group', () => {
    it('should list groups with null conversationId when no session exists', async () => {
      await db.createGroup({
        roomUsername: 'room_1@chatroom',
        name: 'Room 1',
      })

      const groups = await (db as any).getDirectoryGroups('missing_client_id')

      expect(groups).toEqual([
        expect.objectContaining({
          roomUsername: 'room_1@chatroom',
          conversationId: null,
        }),
      ])
    })
  })

  describe('MessageIndex', () => {
    it('should create message index and query by conversation', async () => {
      const client = await db.createClient({ guid: 'test-guid' })
      const contact = await db.createContact({
        username: 'user_1',
        nickname: 'User 1',
        type: 'friend'
      })
      const conversation = await db.createConversation({
        clientId: client.id,
        type: 'private',
        contactId: contact.id
      })

      await db.createMessageIndex({
        conversationId: conversation.id,
        msgId: 'msg_001',
        msgType: 1,
        fromUsername: 'user_1',
        toUsername: 'me',
        createTime: 1000,
        dataLakeKey: 'conversations/conv1/messages/1000_msg_001.json'
      })

      await db.createMessageIndex({
        conversationId: conversation.id,
        msgId: 'msg_002',
        msgType: 1,
        fromUsername: 'me',
        toUsername: 'user_1',
        createTime: 2000,
        dataLakeKey: 'conversations/conv1/messages/2000_msg_002.json'
      })

      const indexes = await db.getMessageIndexes(conversation.id, { limit: 10 })

      expect(indexes).toHaveLength(2)
      // 按时间倒序
      expect(indexes[0].msgId).toBe('msg_002')
      expect(indexes[1].msgId).toBe('msg_001')
    })

    it('should find message index by msgId', async () => {
      const client = await db.createClient({ guid: 'test-guid' })
      const contact = await db.createContact({
        username: 'wxid_test',
        nickname: 'Test',
        type: 'friend'
      })
      const conversation = await db.createConversation({
        clientId: client.id,
        type: 'private',
        contactId: contact.id
      })

      await db.createMessageIndex({
        conversationId: conversation.id,
        msgId: 'msg_123',
        msgType: 1,
        fromUsername: 'wxid_test',
        toUsername: 'wxid_me',
        createTime: 1234567890,
        dataLakeKey: 'test/key'
      })

      const found = await db.findMessageIndexByMsgId('msg_123')
      expect(found).not.toBeNull()
      expect(found!.msgId).toBe('msg_123')

      const notFound = await db.findMessageIndexByMsgId('not_exist')
      expect(notFound).toBeNull()
    })

    it('should update MessageIndex isRecalled', async () => {
      const client = await db.createClient({ guid: 'recall-guid' })
      const contact = await db.createContact({
        username: 'test_user',
        nickname: 'Test User',
        type: 'friend'
      })
      const conversation = await db.createConversation({
        clientId: client.id,
        type: 'private',
        contactId: contact.id
      })

      await db.createMessageIndex({
        conversationId: conversation.id,
        msgId: 'recall_test_msg',
        msgType: 1,
        fromUsername: 'test_user',
        toUsername: 'test_receiver',
        createTime: 1772989439,
        dataLakeKey: 'hot/conv1/2026-03-10.jsonl:recall_test_msg'
      })

      await db.updateMessageIndex('recall_test_msg', { isRecalled: true })

      const index = await db.findMessageIndexByMsgId('recall_test_msg')
      expect(index!.isRecalled).toBe(true)
    })
  })

  describe('getConversations', () => {
    it('should return conversations ordered by lastMessageAt desc', async () => {
      const client = await db.createClient({ guid: 'conv_test_guid' })

      await db.createConversation({ clientId: client.id, type: 'private' })
      const conv2 = await db.createConversation({ clientId: client.id, type: 'group' })
      await db.updateConversationLastMessage(conv2.id, new Date('2026-03-09'))

      const result = await db.getConversations('conv_test_guid', { limit: 50, offset: 0 })
      expect(result.length).toBe(2)
      // conv2 有更新的 lastMessageAt，应该排在前面
      expect(result[0].id).toBe(conv2.id)
    })
  })

  describe('findConversationById', () => {
    it('should return conversation by id', async () => {
      const client = await db.createClient({ guid: 'find_conv_guid' })
      const conv = await db.createConversation({ clientId: client.id, type: 'private' })

      const result = await db.findConversationById(conv.id)
      expect(result).not.toBeNull()
      expect(result!.id).toBe(conv.id)
    })

    it('should return null when not found', async () => {
      const result = await db.findConversationById('not_exist')
      expect(result).toBeNull()
    })
  })

  describe('updateConversation', () => {
    it('should update unreadCount', async () => {
      const client = await db.createClient({ guid: 'update_conv_guid' })
      const conv = await db.createConversation({ clientId: client.id, type: 'private' })

      await db.updateConversation(conv.id, { unreadCount: 0 })
      const updated = await db.findConversationById(conv.id)
      expect(updated!.unreadCount).toBe(0)
    })
  })

  describe('findContactById', () => {
    it('should return contact by id', async () => {
      const contact = await db.createContact({
        username: 'find_by_id_user',
        nickname: 'Find User',
        type: 'friend'
      })

      const result = await db.findContactById(contact.id)
      expect(result).not.toBeNull()
      expect(result!.username).toBe('find_by_id_user')
    })

    it('should return null when not found', async () => {
      const result = await db.findContactById('not_exist')
      expect(result).toBeNull()
    })
  })

  describe('findGroupById', () => {
    it('should return group by id', async () => {
      const group = await db.createGroup({
        roomUsername: 'room@chatroom',
        name: 'Test Group'
      })

      const result = await db.findGroupById(group.id)
      expect(result).not.toBeNull()
      expect(result!.roomUsername).toBe('room@chatroom')
    })

    it('should return null when not found', async () => {
      const result = await db.findGroupById('not_exist')
      expect(result).toBeNull()
    })
  })

  describe('MessageStateChange', () => {
    it('should record message state change', async () => {
      await db.createMessageStateChange({
        msgId: 'msg_001',
        changeType: 'recall',
        changeTime: 3000,
        changeData: JSON.stringify({ replacemsg: '"User" 撤回了一条消息' })
      })

      const changes = await db.getMessageStateChanges('msg_001')

      expect(changes).toHaveLength(1)
      expect(changes[0].changeType).toBe('recall')
    })
  })

  describe('Knowledge models', () => {
    it('should persist DigestEntry and KnowledgeCard records', async () => {
      const digest = await db.prisma.digestEntry.create({
        data: {
          conversationId: 'conv_knowledge',
          startTime: 100,
          endTime: 200,
          summary: '摘要内容',
          messageCount: 3,
          sourceKind: 'manual',
          status: 'ready',
        }
      })

      const card = await db.prisma.knowledgeCard.create({
        data: {
          digestEntryId: digest.id,
          conversationId: digest.conversationId,
          title: '预算讨论',
          summary: '讨论预算审批与上线安排',
          decisions: '[]',
          actionItems: '[]',
          risks: '[]',
          participants: '[]',
          timeAnchors: '[]',
        }
      })

      expect(card.digestEntryId).toBe(digest.id)
      expect(card.conversationId).toBe('conv_knowledge')
    })

    it('should persist topic metadata and topic knowledge-card memberships', async () => {
      const digest = await db.prisma.digestEntry.create({
        data: {
          conversationId: 'conv_topic',
          startTime: 100,
          endTime: 200,
          summary: '摘要',
          messageCount: 3,
          sourceKind: 'manual',
          status: 'ready',
        }
      })

      const card = await db.prisma.knowledgeCard.create({
        data: {
          digestEntryId: digest.id,
          conversationId: 'conv_topic',
          title: '预算讨论',
          summary: '讨论预算审批',
          decisions: '[]',
          actionItems: '[]',
          risks: '[]',
          participants: '[]',
          timeAnchors: '[]',
        }
      })

      const topic = await db.prisma.topic.create({
        data: {
          kind: 'window',
          status: 'active',
          title: '预算主题',
          summary: '近期预算讨论',
          description: null,
          keywords: '["预算","审批"]',
          messageCount: 0,
          participantCount: 2,
          sourceCardCount: 1,
          clusterKey: 'budget-window',
          firstSeenAt: 100,
          lastSeenAt: 200,
        }
      })

      const membership = await db.prisma.topicKnowledgeCard.create({
        data: {
          topicId: topic.id,
          knowledgeCardId: card.id,
          score: 0.91,
          rank: 1,
        }
      })

      expect(membership.topicId).toBe(topic.id)
    })
  })
})
