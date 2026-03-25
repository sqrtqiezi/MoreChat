import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DataLakeService } from './dataLake.js'
import fs from 'fs/promises'
import path from 'path'
import { existsSync } from 'fs'

describe('DataLakeService', () => {
  const testLakePath = './test-data-lake'
  let dataLake: DataLakeService

  beforeEach(async () => {
    dataLake = new DataLakeService({
      type: 'filesystem',
      path: testLakePath
    })
  })

  afterEach(async () => {
    await fs.rm(testLakePath, { recursive: true, force: true })
  })

  describe('JSONL 格式（新）', () => {
    it('should save message to both raw/ and hot/', async () => {
      const message = {
        msg_id: 'test_123',
        from_username: 'user1',
        to_username: 'user2',
        content: 'Hello',
        create_time: 1710115200, // 2024-03-11 00:00:00 UTC
        msg_type: 1,
        chatroom_sender: '',
        desc: '',
        is_chatroom_msg: 0,
        chatroom: '',
        source: ''
      }

      const key = await dataLake.saveMessage('conv_123', message)

      // 验证返回的 key 格式
      expect(key).toMatch(/^hot\/conv_123\/\d{4}-\d{2}-\d{2}\.jsonl:test_123$/)

      // 验证 raw/ 文件存在
      const date = new Date(message.create_time * 1000).toISOString().slice(0, 10)
      const rawFile = path.join(testLakePath, 'raw', `${date}.jsonl`)
      expect(existsSync(rawFile)).toBe(true)

      // 验证 hot/ 文件存在
      const hotFile = path.join(testLakePath, 'hot', 'conv_123', `${date}.jsonl`)
      expect(existsSync(hotFile)).toBe(true)

      // 验证文件内容
      const rawContent = await fs.readFile(rawFile, 'utf-8')
      expect(rawContent).toContain('"msg_id":"test_123"')

      const hotContent = await fs.readFile(hotFile, 'utf-8')
      expect(hotContent).toContain('"msg_id":"test_123"')
    })

    it('should use Asia/Shanghai date for hot file path', async () => {
      // 2024-03-11 17:00:00 UTC = 2024-03-12 01:00:00 CST
      // UTC 日期是 03-11，但 Asia/Shanghai 日期是 03-12
      const message = {
        msg_id: 'tz_test',
        from_username: 'user1',
        to_username: 'user2',
        content: 'Timezone test',
        create_time: 1710176400, // 2024-03-11T17:00:00Z
        msg_type: 1,
        chatroom_sender: '',
        desc: '',
        is_chatroom_msg: 0,
        chatroom: '',
        source: ''
      }

      const key = await dataLake.saveMessage('conv_tz', message)

      // key 中的日期应该是 Asia/Shanghai 的 2024-03-12
      expect(key).toBe('hot/conv_tz/2024-03-12.jsonl:tz_test')

      // hot 文件应该以 CST 日期命名
      const hotFile = path.join(testLakePath, 'hot', 'conv_tz', '2024-03-12.jsonl')
      expect(existsSync(hotFile)).toBe(true)

      // raw 文件同理
      const rawFile = path.join(testLakePath, 'raw', '2024-03-12.jsonl')
      expect(existsSync(rawFile)).toBe(true)
    })

    it('should retrieve message from JSONL', async () => {
      const message = {
        msg_id: 'test_123',
        from_username: 'user1',
        to_username: 'user2',
        content: 'Hello',
        create_time: 1710115200,
        msg_type: 1,
        chatroom_sender: '',
        desc: '',
        is_chatroom_msg: 0,
        chatroom: '',
        source: ''
      }

      const key = await dataLake.saveMessage('conv_123', message)
      const retrieved = await dataLake.getMessage(key)

      expect(retrieved).toEqual(message)
    })

    it('should append multiple messages to same JSONL file', async () => {
      const message1 = {
        msg_id: 'test_1',
        from_username: 'user1',
        to_username: 'user2',
        content: 'Hello 1',
        create_time: 1710115200,
        msg_type: 1,
        chatroom_sender: '',
        desc: '',
        is_chatroom_msg: 0,
        chatroom: '',
        source: ''
      }

      const message2 = {
        msg_id: 'test_2',
        from_username: 'user1',
        to_username: 'user2',
        content: 'Hello 2',
        create_time: 1710115201,
        msg_type: 1,
        chatroom_sender: '',
        desc: '',
        is_chatroom_msg: 0,
        chatroom: '',
        source: ''
      }

      await dataLake.saveMessage('conv_123', message1)
      await dataLake.saveMessage('conv_123', message2)

      // 验证同一天的消息在同一个文件中
      const date = new Date(message1.create_time * 1000).toISOString().slice(0, 10)
      const hotFile = path.join(testLakePath, 'hot', 'conv_123', `${date}.jsonl`)
      const content = await fs.readFile(hotFile, 'utf-8')
      const lines = content.split('\n').filter(Boolean)

      expect(lines).toHaveLength(2)
      expect(lines[0]).toContain('"msg_id":"test_1"')
      expect(lines[1]).toContain('"msg_id":"test_2"')
    })

    it('should retrieve multiple messages efficiently', async () => {
      const message1 = {
        msg_id: 'test_1',
        from_username: 'user1',
        to_username: 'user2',
        content: 'Hello 1',
        create_time: 1710115200,
        msg_type: 1,
        chatroom_sender: '',
        desc: '',
        is_chatroom_msg: 0,
        chatroom: '',
        source: ''
      }

      const message2 = {
        msg_id: 'test_2',
        from_username: 'user1',
        to_username: 'user2',
        content: 'Hello 2',
        create_time: 1710115201,
        msg_type: 1,
        chatroom_sender: '',
        desc: '',
        is_chatroom_msg: 0,
        chatroom: '',
        source: ''
      }

      const key1 = await dataLake.saveMessage('conv_123', message1)
      const key2 = await dataLake.saveMessage('conv_123', message2)

      // 批量获取（应该只读取一次文件）
      const messages = await dataLake.getMessages([key1, key2])

      expect(messages).toHaveLength(2)
      expect(messages[0]).toEqual(message1)
      expect(messages[1]).toEqual(message2)
    })

    it('should skip corrupted lines in JSONL', async () => {
      const date = '2024-03-11'
      const hotFile = path.join(testLakePath, 'hot', 'conv_123', `${date}.jsonl`)
      await fs.mkdir(path.dirname(hotFile), { recursive: true })

      // 写入一个正常消息和一个损坏的行
      const validMessage = {
        msg_id: 'test_valid',
        from_username: 'user1',
        to_username: 'user2',
        content: 'Valid',
        create_time: 1710115200,
        msg_type: 1,
        chatroom_sender: '',
        desc: '',
        is_chatroom_msg: 0,
        chatroom: '',
        source: ''
      }

      await fs.writeFile(
        hotFile,
        JSON.stringify(validMessage) + '\n' +
        '{invalid json\n' +
        JSON.stringify({ ...validMessage, msg_id: 'test_valid2' }) + '\n',
        'utf-8'
      )

      // 应该能读取有效消息，跳过损坏行
      const retrieved = await dataLake.getMessage(`hot/conv_123/${date}.jsonl:test_valid`)
      expect(retrieved.msg_id).toBe('test_valid')
    })

  })

  describe('ENOENT 容错', () => {
    it('should return undefined for messages in missing hot files', async () => {
      // 模拟 hot 文件已过期：key 指向不存在的文件
      const missingKey = 'hot/conv_expired/2024-01-01.jsonl:msg_123'

      const messages = await dataLake.getMessages([missingKey])

      expect(messages).toHaveLength(1)
      expect(messages[0]).toBeUndefined()
    })

    it('should return available messages when some hot files are missing', async () => {
      // 先保存一条正常消息
      const message = {
        msg_id: 'test_ok',
        from_username: 'user1',
        to_username: 'user2',
        content: 'Still here',
        create_time: 1710115200,
        msg_type: 1,
        chatroom_sender: '',
        desc: '',
        is_chatroom_msg: 0,
        chatroom: '',
        source: ''
      }
      const validKey = await dataLake.saveMessage('conv_123', message)
      const missingKey = 'hot/conv_expired/2024-01-01.jsonl:msg_gone'

      const messages = await dataLake.getMessages([missingKey, validKey])

      expect(messages).toHaveLength(2)
      expect(messages[0]).toBeUndefined()
      expect(messages[1]).toEqual(message)
    })
  })

  describe('旧格式兼容性', () => {
    it('should read old JSON format', async () => {
      const message = {
        msg_id: 'test_old',
        from_username: 'user1',
        to_username: 'user2',
        content: 'Old format',
        create_time: 1710115200,
        msg_type: 1,
        chatroom_sender: '',
        desc: '',
        is_chatroom_msg: 0,
        chatroom: '',
        source: ''
      }

      // 手动创建旧格式文件
      const oldKey = `conversations/conv_123/messages/${message.create_time}_${message.msg_id}.json`
      const oldPath = path.join(testLakePath, oldKey)
      await fs.mkdir(path.dirname(oldPath), { recursive: true })
      await fs.writeFile(oldPath, JSON.stringify(message, null, 2), 'utf-8')

      // 应该能读取旧格式
      const retrieved = await dataLake.getMessage(oldKey)
      expect(retrieved).toEqual(message)
    })

    it('should retrieve mixed format messages', async () => {
      // 创建旧格式消息
      const oldMessage = {
        msg_id: 'test_old',
        from_username: 'user1',
        to_username: 'user2',
        content: 'Old',
        create_time: 1710115200,
        msg_type: 1,
        chatroom_sender: '',
        desc: '',
        is_chatroom_msg: 0,
        chatroom: '',
        source: ''
      }

      const oldKey = `conversations/conv_123/messages/${oldMessage.create_time}_${oldMessage.msg_id}.json`
      const oldPath = path.join(testLakePath, oldKey)
      await fs.mkdir(path.dirname(oldPath), { recursive: true })
      await fs.writeFile(oldPath, JSON.stringify(oldMessage, null, 2), 'utf-8')

      // 创建新格式消息
      const newMessage = {
        msg_id: 'test_new',
        from_username: 'user1',
        to_username: 'user2',
        content: 'New',
        create_time: 1710115201,
        msg_type: 1,
        chatroom_sender: '',
        desc: '',
        is_chatroom_msg: 0,
        chatroom: '',
        source: ''
      }

      const newKey = await dataLake.saveMessage('conv_123', newMessage)

      // 批量获取混合格式
      const messages = await dataLake.getMessages([oldKey, newKey])

      expect(messages).toHaveLength(2)
      expect(messages[0]).toEqual(oldMessage)
      expect(messages[1]).toEqual(newMessage)
    })
  })
})
