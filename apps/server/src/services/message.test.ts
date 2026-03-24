import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MessageService } from './message.js'
import { DatabaseService } from './database.js'
import { DataLakeService } from './dataLake.js'
import { JuhexbotAdapter } from './juhexbotAdapter.js'
import { OssService } from './ossService.js'
import { textMessage, messageRecall, appMessage } from '../../../../tests/fixtures/messages.js'
import fs from 'fs/promises'
import path from 'path'
import sharp from 'sharp'

vi.mock('sharp')

describe('MessageService', () => {
  let messageService: MessageService
  let db: DatabaseService
  let dataLake: DataLakeService
  let adapter: JuhexbotAdapter
  let ossService: OssService

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
      clientGuid: 'test-guid-123',
      cloudApiUrl: 'http://cloud.test.com'
    })

    ossService = new OssService({
      region: 'test-region',
      bucket: 'test-bucket',
      accessKeyId: 'test-key',
      accessKeySecret: 'test-secret',
      endpoint: 'test.endpoint.com'
    })

    // 创建测试 client
    await db.createClient({ guid: 'test-guid-123' })

    messageService = new MessageService(db, dataLake, adapter, 'test-guid-123', ossService)
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

  it('should handle message recall and mark original message without mutating DataLake', async () => {
    // 先发送一条消息
    const textParsed = adapter.parseWebhookPayload(textMessage)
    const textResult = await messageService.handleIncomingMessage(textParsed)
    expect(textResult).not.toBeNull()

    // 然后撤回
    const recallParsed = adapter.parseWebhookPayload(messageRecall)
    const recallResult = await messageService.handleIncomingMessage(recallParsed)

    expect(recallResult).not.toBeNull()
    expect(recallResult).toHaveProperty('type', 'recall')
    expect(recallResult).toHaveProperty('revokedMsgId', textMessage.data.msg_id)
    expect(recallResult).toHaveProperty('conversationId')

    const index = await db.findMessageIndexByMsgId(textMessage.data.msg_id)
    expect(index).not.toBeNull()
    expect(index!.isRecalled).toBe(true)

    const recalledRawMessage = await dataLake.getMessage(index!.dataLakeKey)
    expect(recalledRawMessage.is_recalled).toBeUndefined()

    const changes = await db.getMessageStateChanges(messageRecall.data.msg_id)
    expect(changes).toHaveLength(1)
    expect(changes[0].changeType).toBe('recall')
  })

  it('should return null when recalled message not found', async () => {
    const recallParsed = adapter.parseWebhookPayload(messageRecall)
    const result = await messageService.handleIncomingMessage(recallParsed)

    expect(result).toBeNull()

    const changes = await db.getMessageStateChanges(messageRecall.data.msg_id)
    expect(changes).toHaveLength(1)
  })

  it('should allow webhook to process message after sendMessage (no dedup)', async () => {
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

    // webhook 回传相同 msgId 的消息 — 应该正常处理
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

    expect(result).not.toBeNull()
    expect(result!.message.msgId).toBe('dup_123')

    const indexes = await db.getMessageIndexes(conversation.id, { limit: 10 })
    expect(indexes.length).toBe(1)
  })

  it('should filter out type 51 (call) messages', async () => {
    const webhookPayload = {
      guid: 'test-guid-123',
      notify_type: 1,
      data: {
        msg_id: 'call_msg_123',
        msg_type: 51,
        from_username: 'wxid_caller',
        to_username: 'test-guid-123',
        content: '<msg><voipinvitemsg /></msg>',
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

    // 验证消息没有被保存到数据库
    const messageIndex = await db.findMessageIndexByMsgId('call_msg_123')
    expect(messageIndex).toBeNull()
  })

  describe('sendImageMessage', () => {
    it('should send image via adapter and return msgId', async () => {
      vi.mocked(sharp).mockReturnValue({
        metadata: vi.fn().mockResolvedValue({ width: 800, height: 600 })
      } as any)

      vi.spyOn(ossService, 'uploadImage').mockResolvedValue('https://oss.example.com/image.jpg')
      vi.spyOn(adapter, 'uploadImageToCdn').mockResolvedValue({
        fileId: 'cdn_file_123',
        aesKey: 'test_aes_key',
        fileSize: 12345,
        fileMd5: 'test_md5'
      })
      vi.spyOn(adapter, 'sendImageMessage').mockResolvedValue({ msgId: 'img_msg_123' })

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

      const imageBuffer = Buffer.from('fake-image-data')
      const result = await messageService.sendImageMessage(conversation.id, imageBuffer, 'test.jpg')

      expect(result.msgId).toBe('img_msg_123')
      expect(ossService.uploadImage).toHaveBeenCalledWith(imageBuffer, 'test.jpg')
      expect(adapter.uploadImageToCdn).toHaveBeenCalledWith('https://oss.example.com/image.jpg')

      // 不再创建 MessageIndex
      const indexes = await db.getMessageIndexes(conversation.id, { limit: 10 })
      expect(indexes.length).toBe(0)
    })
  })

  describe('sendMessage', () => {
    it('should send text message via adapter and return msgId', async () => {
      vi.spyOn(adapter, 'sendTextMessage').mockResolvedValue({ msgId: 'sent_123' })

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

      // 不再创建 MessageIndex
      const indexes = await db.getMessageIndexes(conversation.id, { limit: 10 })
      expect(indexes.length).toBe(0)
    })

    it('should throw error when conversation not found', async () => {
      await expect(messageService.sendMessage('not_exist', '你好')).rejects.toThrow('Conversation not found')
    })

    it('should send refer message when replyToMsgId is provided', async () => {
      vi.spyOn(adapter, 'sendTextMessage').mockResolvedValue({ msgId: 'text_123' })
      vi.spyOn(adapter, 'sendReferMessage').mockResolvedValue({ msgId: 'refer_456' })

      await db.createContact({ username: 'wxid_sender', nickname: 'Sender', type: 'friend' })
      const target = await db.createContact({ username: 'wxid_target', nickname: 'Target User', type: 'friend' })
      const client = await db.findClientByGuid('test-guid-123')
      const conversation = await db.createConversation({
        clientId: client!.id,
        type: 'private',
        contactId: target.id
      })

      // 先通过 webhook 创建一条原始消息
      const webhookPayload = {
        guid: 'test-guid-123',
        notify_type: 1,
        data: {
          msg_id: 'original_msg_123',
          msg_type: 1,
          from_username: 'wxid_sender',
          to_username: 'test-guid-123',
          content: '原始消息',
          create_time: Math.floor(Date.now() / 1000),
          chatroom_sender: '',
          chatroom: '',
          desc: '',
          is_chatroom_msg: 0,
          source: ''
        }
      }
      const parsed = adapter.parseWebhookPayload(webhookPayload)
      await messageService.handleIncomingMessage(parsed)

      // 发送引用消息
      const result = await messageService.sendMessage(conversation.id, '回复内容', 'original_msg_123')

      expect(result.msgId).toBe('refer_456')
      expect(adapter.sendReferMessage).toHaveBeenCalledWith(expect.objectContaining({
        toUsername: 'wxid_target',
        content: '回复内容',
        referMsg: expect.objectContaining({
          msgId: 'original_msg_123',
          msgType: 1,
          content: '原始消息',
        }),
      }))
    })
  })
})
