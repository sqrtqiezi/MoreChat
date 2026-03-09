import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DataLakeService } from './dataLake.js'
import fs from 'fs/promises'

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

  it('should save and retrieve message', async () => {
    const message = {
      msg_id: 'test_123',
      from_username: 'user1',
      to_username: 'user2',
      content: 'Hello',
      create_time: 1234567890,
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

  it('should retrieve multiple messages', async () => {
    const message1 = {
      msg_id: 'test_1',
      from_username: 'user1',
      to_username: 'user2',
      content: 'Hello 1',
      create_time: 1234567890,
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
      create_time: 1234567891,
      msg_type: 1,
      chatroom_sender: '',
      desc: '',
      is_chatroom_msg: 0,
      chatroom: '',
      source: ''
    }

    const key1 = await dataLake.saveMessage('conv_123', message1)
    const key2 = await dataLake.saveMessage('conv_123', message2)

    const messages = await dataLake.getMessages([key1, key2])

    expect(messages).toHaveLength(2)
    expect(messages[0]).toEqual(message1)
    expect(messages[1]).toEqual(message2)
  })
})
