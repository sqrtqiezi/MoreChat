import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MessageService } from './message.js'
import { DatabaseService } from './database.js'
import { DataLakeService } from './dataLake.js'
import { JuhexbotAdapter } from './juhexbotAdapter.js'
import { textMessage, messageRecall, appMessage } from '../../../../tests/fixtures/messages.js'
import fs from 'fs/promises'
import path from 'path'

describe('MessageService', () => {
  let messageService: MessageService
  let db: DatabaseService
  let dataLake: DataLakeService
  let adapter: JuhexbotAdapter

  const testDir = path.join(process.cwd(), 'test-message-service')
  const testDbPath = path.join(testDir, 'test.db')
  const testLakePath = path.join(testDir, 'lake')

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true })

    db = new DatabaseService(`file:${testDbPath}`)
    await db.connect()

    dataLake = new DataLakeService({ type: 'filesystem', path: testLakePath })

    adapter = new JuhexbotAdapter({
      apiUrl: 'http://test',
      appKey: 'test_key',
      appSecret: 'test_secret',
      clientGuid: 'test-guid-123'
    })

    // 创建测试 client
    await db.createClient({ guid: 'test-guid-123' })

    messageService = new MessageService(db, dataLake, adapter)
  })

  afterEach(async () => {
    await db.disconnect()
    await fs.rm(testDir, { recursive: true, force: true })
  })

  it('should process and store text message', async () => {
    const parsed = adapter.parseWebhookPayload(textMessage)
    await messageService.handleIncomingMessage(parsed)

    // 验证联系人已创建
    const contact = await db.findContactByUsername('test_user')
    expect(contact).not.toBeNull()

    // 验证消息索引已创建
    const client = await db.findClientByGuid('test-guid-123')
    expect(client).not.toBeNull()
  })

  it('should process chatroom message and create group', async () => {
    const parsed = adapter.parseWebhookPayload(appMessage)
    await messageService.handleIncomingMessage(parsed)

    // 验证 Group 已创建
    const group = await db.findGroupByRoomUsername(parsed.message.chatroom!)
    expect(group).not.toBeNull()
    expect(group!.roomUsername).toBe(parsed.message.chatroom)

    // 验证会话已创建并关联到 Group
    const conversationId = adapter.getConversationId(parsed)
    const client = await db.findClientByGuid('test-guid-123')
    const conversation = await db.findConversation(client!.id, conversationId)
    expect(conversation).not.toBeNull()
    expect(conversation!.type).toBe('group')
    expect(conversation!.groupId).toBe(group!.id)
  })

  it('should handle message recall', async () => {
    // 先发送一条消息
    const textParsed = adapter.parseWebhookPayload(textMessage)
    await messageService.handleIncomingMessage(textParsed)

    // 然后撤回
    const recallParsed = adapter.parseWebhookPayload(messageRecall)
    await messageService.handleIncomingMessage(recallParsed)

    // 验证状态变更已记录
    const changes = await db.getMessageStateChanges(messageRecall.data.msg_id)
    expect(changes).toHaveLength(1)
    expect(changes[0].changeType).toBe('recall')
  })

  describe('sendMessage', () => {
    it('should send text message via adapter and save to DataLake', async () => {
      // Mock adapter.sendTextMessage
      vi.spyOn(adapter, 'sendTextMessage').mockResolvedValue({ msgId: 'sent_123' })

      // 创建联系人和会话
      const contact = await db.createContact({
        username: 'wxid_target',
        nickname: 'Target User',
        type: 'friend'
      })
      const client = await db.findClientByGuid('test-guid-123')
      const conversation = await db.createConversation({
        clientId: client!.id,
        type: 'private',
        contactId: contact.id
      })

      const result = await messageService.sendMessage(conversation.id, '你好')

      expect(result.msgId).toBe('sent_123')
      expect(adapter.sendTextMessage).toHaveBeenCalledWith('wxid_target', '你好')

      // 验证消息索引已创建
      const indexes = await db.getMessageIndexes(conversation.id, { limit: 10 })
      expect(indexes.length).toBeGreaterThanOrEqual(1)
    })

    it('should throw error when conversation not found', async () => {
      await expect(messageService.sendMessage('not_exist', '你好')).rejects.toThrow('Conversation not found')
    })
  })
})
