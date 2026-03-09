import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseService } from './database'
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
})
