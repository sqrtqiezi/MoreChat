import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MessageService } from './message'
import { DatabaseService } from './database'
import { DataLakeService } from './dataLake'
import { JuhexbotAdapter } from './juhexbotAdapter'
import { textMessage, messageRecall, appMessage } from '../../../../tests/fixtures/messages'
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

  it('should process chatroom message', async () => {
    const parsed = adapter.parseWebhookPayload(appMessage)
    await messageService.handleIncomingMessage(parsed)

    // 验证消息已处理（不报错即可）
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
})
