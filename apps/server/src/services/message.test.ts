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

    messageService = new MessageService(db, dataLake, adapter, 'test-guid-123')
  })

  afterEach(async () => {
    await db.disconnect()
    await fs.rm(testDir, { recursive: true, force: true })
  })

  it('should process and store text message', async () => {
    const parsed = adapter.parseWebhookPayload(textMessage)
    const result = await messageService.handleIncomingMessage(parsed)

    // 验证返回值
    expect(result).not.toBeNull()
    expect(result!.conversationId).toBeDefined()
    expect(result!.message).toBeDefined()
    expect(result!.message.msgId).toBe(parsed.message.msgId)
    expect(result!.message.displayType).toBe('text')
    expect(result!.message.displayContent).toBe(parsed.message.content)

    // 验证联系人已创建
    const contact = await db.findContactByUsername('test_user')
    expect(contact).not.toBeNull()
  })

  it('should process chatroom message and create group', async () => {
    const parsed = adapter.parseWebhookPayload(appMessage)
    const result = await messageService.handleIncomingMessage(parsed)

    expect(result).not.toBeNull()
    expect(result!.conversationId).toBeDefined()
    expect(result!.message.msgType).toBe(parsed.message.msgType)

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
    const result = await messageService.handleIncomingMessage(recallParsed)

    expect(result).toBeNull()

    // 验证状态变更已记录
    const changes = await db.getMessageStateChanges(messageRecall.data.msg_id)
    expect(changes).toHaveLength(1)
    expect(changes[0].changeType).toBe('recall')
  })

  it('should skip duplicate message when msgId already exists', async () => {
    vi.spyOn(adapter, 'sendTextMessage').mockResolvedValue({ msgId: 'dup_123' })

    const contact = await db.createContact({
      username: 'wxid_target',
      nickname: 'Target',
      type: 'friend'
    })
    const client = await db.findClientByGuid('test-guid-123')
    const conversation = await db.createConversation({
      clientId: client!.id,
      type: 'private',
      contactId: contact.id
    })

    await messageService.sendMessage(conversation.id, '测试')

    // 模拟 webhook 回传相同 msgId 的消息
    const webhookPayload = {
      guid: 'test-guid-123',
      notify_type: 1,
      data: {
        msg_id: 'dup_123',
        msg_type: 1,
        from_username: 'test-guid-123',
        to_username: 'wxid_target',
        content: '测试',
        create_time: Math.floor(Date.now() / 1000),
        chatroom_sender: '',
        chatroom: '',
        desc: '',
        is_chatroom_msg: 0,
        source: ''
      }
    }

    const parsed = adapter.parseWebhookPayload(webhookPayload)
    const result = await messageService.handleIncomingMessage(parsed)

    expect(result).toBeNull()

    const indexes = await db.getMessageIndexes(conversation.id, { limit: 10 })
    expect(indexes.length).toBe(1)
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

      // 验证返回完整消息对象
      expect(result.msgId).toBe('sent_123')
      expect(result.msgType).toBe(1)
      expect(result.fromUsername).toBe('test-guid-123')
      expect(result.toUsername).toBe('wxid_target')
      expect(result.content).toBe('你好')
      expect(result.createTime).toBeGreaterThan(0)
      expect(result.displayType).toBe('text')
      expect(result.displayContent).toBe('你好')
      expect(result.chatroomSender).toBeUndefined()

      expect(adapter.sendTextMessage).toHaveBeenCalledWith('wxid_target', '你好')

      // 验证消息索引已创建
      const indexes = await db.getMessageIndexes(conversation.id, { limit: 10 })
      expect(indexes.length).toBeGreaterThanOrEqual(1)
    })

    it('should throw error when conversation not found', async () => {
      await expect(messageService.sendMessage('not_exist', '你好')).rejects.toThrow('Conversation not found')
    })

    it('should include chatroomSender for group messages', async () => {
      vi.spyOn(adapter, 'sendTextMessage').mockResolvedValue({ msgId: 'group_msg_123' })

      const group = await db.createGroup({
        roomUsername: '12345@chatroom',
        name: 'Test Group'
      })
      const client = await db.findClientByGuid('test-guid-123')
      const conversation = await db.createConversation({
        clientId: client!.id,
        type: 'group',
        groupId: group.id
      })

      const result = await messageService.sendMessage(conversation.id, '群消息')

      expect(result.msgId).toBe('group_msg_123')
      expect(result.chatroomSender).toBe('test-guid-123')
      expect(adapter.sendTextMessage).toHaveBeenCalledWith('12345@chatroom', '群消息')
    })
  })
})
