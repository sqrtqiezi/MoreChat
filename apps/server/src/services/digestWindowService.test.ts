import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DigestWindowService } from './digestWindowService.js'

function makeMessageIndex(msgId: string, createTime: number, msgType = 1, overrides: Record<string, unknown> = {}) {
  return {
    id: `idx_${msgId}`,
    msgId,
    conversationId: 'conv_1',
    msgType,
    fromUsername: 'alice',
    toUsername: 'bob',
    chatroomSender: null,
    createTime,
    dataLakeKey: `key_${msgId}`,
    isRecalled: false,
    ...overrides,
  }
}

function makeChatMessage(msgId: string, content: string, createTime: number, msgType = 1) {
  return {
    msg_id: msgId,
    from_username: 'alice',
    to_username: 'bob',
    content,
    create_time: createTime,
    msg_type: msgType,
    chatroom_sender: '',
    desc: '',
    is_chatroom_msg: 0,
    chatroom: '',
    source: '',
  }
}

describe('DigestWindowService', () => {
  let mockDb: any
  let mockDataLake: any
  let service: DigestWindowService

  beforeEach(() => {
    mockDb = {
      prisma: {
        messageIndex: {
          findMany: vi.fn(),
        },
      },
    }
    mockDataLake = {
      getMessage: vi.fn(),
    }
    service = new DigestWindowService(mockDb, mockDataLake, {
      maxMessages: 3,
      perMessageMaxChars: 10,
    })
  })

  it('builds an ordered digest window from MessageIndex and DataLake', async () => {
    mockDb.prisma.messageIndex.findMany.mockResolvedValue([
      makeMessageIndex('m1', 100, 1),
      makeMessageIndex('m2', 110, 3),
      makeMessageIndex('m3', 120, 1),
    ])
    mockDataLake.getMessage.mockImplementation(async (key: string) => {
      if (key === 'key_m1') return makeChatMessage('m1', '这是第一条很长很长的文本消息', 100, 1)
      if (key === 'key_m3') return makeChatMessage('m3', '第三条消息', 120, 1)
      return makeChatMessage('m2', '<xml/>', 110, 3)
    })

    const window = await service.buildWindow({
      conversationId: 'conv_1',
      startTime: 90,
      endTime: 130,
    })

    expect(window).toEqual({
      conversationId: 'conv_1',
      startTime: 100,
      endTime: 120,
      messageCount: 3,
      lines: ['alice: 这是第一条很长很长的…', 'alice: [图片]', 'alice: 第三条消息'],
    })
  })

  it('skips text messages missing in DataLake', async () => {
    mockDb.prisma.messageIndex.findMany.mockResolvedValue([
      makeMessageIndex('m1', 100),
      makeMessageIndex('m2', 110),
    ])
    mockDataLake.getMessage
      .mockRejectedValueOnce(new Error('missing'))
      .mockResolvedValueOnce(makeChatMessage('m2', '保留消息', 110))

    const window = await service.buildWindow({
      conversationId: 'conv_1',
      startTime: 90,
      endTime: 130,
    })

    expect(window.messageCount).toBe(2)
    expect(window.lines).toEqual(['alice: 保留消息'])
  })

  it('skips empty text messages', async () => {
    mockDb.prisma.messageIndex.findMany.mockResolvedValue([
      makeMessageIndex('m1', 100),
    ])
    mockDataLake.getMessage.mockResolvedValue(makeChatMessage('m1', '   ', 100))

    const window = await service.buildWindow({
      conversationId: 'conv_1',
      startTime: 90,
      endTime: 130,
    })

    expect(window.lines).toEqual([])
  })

  it('uses chatroomSender when present', async () => {
    mockDb.prisma.messageIndex.findMany.mockResolvedValue([
      makeMessageIndex('m1', 100, 1, { chatroomSender: 'wxid_bob' }),
    ])
    mockDataLake.getMessage.mockResolvedValue(makeChatMessage('m1', '群内消息', 100))

    const window = await service.buildWindow({
      conversationId: 'conv_1',
      startTime: 90,
      endTime: 130,
    })

    expect(window.lines).toEqual(['wxid_bob: 群内消息'])
  })

  it('returns the requested range when the window is empty', async () => {
    mockDb.prisma.messageIndex.findMany.mockResolvedValue([])

    const window = await service.buildWindow({
      conversationId: 'conv_1',
      startTime: 90,
      endTime: 130,
    })

    expect(window).toEqual({
      conversationId: 'conv_1',
      startTime: 90,
      endTime: 130,
      messageCount: 0,
      lines: [],
    })
  })
})
