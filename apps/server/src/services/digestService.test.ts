// ABOUTME: DigestService 单元测试，覆盖手动摘要范围生成与重要消息自动摘要
// ABOUTME: 通过 mock 数据库、DataLake 与 LlmClient 验证去重、范围校验与持久化

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DigestService, DigestRangeTooSmallError } from './digestService.js'
import type { LlmClient } from './llmClient.js'

function makeMessageIndex(msgId: string, createTime: number, msgType = 1) {
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

describe('DigestService', () => {
  let mockDb: any
  let mockDataLake: any
  let mockLlm: any
  let service: DigestService

  beforeEach(() => {
    mockDb = {
      prisma: {
        messageIndex: {
          findMany: vi.fn(),
          findUnique: vi.fn(),
        },
        digestEntry: {
          create: vi.fn(),
          findFirst: vi.fn(),
        },
      },
    }
    mockDataLake = {
      getMessage: vi.fn(),
    }
    mockLlm = {
      chat: vi.fn(),
    }

    service = new DigestService(mockDb, mockDataLake, mockLlm as LlmClient)
  })

  describe('generateForRange', () => {
    it('throws DigestRangeTooSmallError when fewer than 3 messages', async () => {
      mockDb.prisma.messageIndex.findMany.mockResolvedValue([
        makeMessageIndex('m1', 100),
        makeMessageIndex('m2', 110),
      ])
      mockDataLake.getMessage.mockImplementation(async (key: string) => {
        const msgId = key.replace('key_', '')
        return makeChatMessage(msgId, '内容', 0)
      })

      await expect(
        service.generateForRange({ conversationId: 'conv_1', startTime: 0, endTime: 200 })
      ).rejects.toBeInstanceOf(DigestRangeTooSmallError)

      expect(mockLlm.chat).not.toHaveBeenCalled()
    })

    it('summarizes messages, persists DigestEntry, and returns it', async () => {
      mockDb.prisma.messageIndex.findMany.mockResolvedValue([
        makeMessageIndex('m1', 100),
        makeMessageIndex('m2', 110),
        makeMessageIndex('m3', 120),
      ])
      mockDataLake.getMessage.mockImplementation(async (key: string) => {
        const msgId = key.replace('key_', '')
        return makeChatMessage(msgId, `${msgId}-内容`, 0)
      })
      mockLlm.chat.mockResolvedValue('讨论了项目预算。')

      const persisted = {
        id: 'digest_1',
        conversationId: 'conv_1',
        startTime: 100,
        endTime: 120,
        summary: '讨论了项目预算。',
        messageCount: 3,
        createdAt: new Date(),
      }
      mockDb.prisma.digestEntry.create.mockResolvedValue(persisted)

      const result = await service.generateForRange({
        conversationId: 'conv_1',
        startTime: 0,
        endTime: 200,
      })

      expect(mockLlm.chat).toHaveBeenCalledOnce()
      const messages = mockLlm.chat.mock.calls[0][0]
      expect(messages[0].role).toBe('system')
      expect(messages[1].role).toBe('user')
      expect(messages[1].content).toContain('m1-内容')
      expect(messages[1].content).toContain('m3-内容')

      expect(mockDb.prisma.digestEntry.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'conv_1',
          startTime: 100,
          endTime: 120,
          summary: '讨论了项目预算。',
          messageCount: 3,
        },
      })
      expect(result).toEqual(persisted)
    })

    it('renders non-text messages as placeholders', async () => {
      mockDb.prisma.messageIndex.findMany.mockResolvedValue([
        makeMessageIndex('m1', 100, 1),
        makeMessageIndex('m2', 110, 3),
        makeMessageIndex('m3', 120, 49),
      ])
      mockDataLake.getMessage.mockImplementation(async (key: string) => {
        const msgId = key.replace('key_', '')
        if (msgId === 'm1') return makeChatMessage('m1', '文本消息', 0, 1)
        if (msgId === 'm2') return makeChatMessage('m2', '<xml/>', 0, 3)
        return makeChatMessage('m3', '<xml/>', 0, 49)
      })
      mockLlm.chat.mockResolvedValue('summary')
      mockDb.prisma.digestEntry.create.mockResolvedValue({} as any)

      await service.generateForRange({ conversationId: 'conv_1', startTime: 0, endTime: 200 })

      const userContent = mockLlm.chat.mock.calls[0][0][1].content as string
      expect(userContent).toContain('文本消息')
      expect(userContent).toContain('[图片]')
      expect(userContent).toContain('[应用消息]')
    })
  })

  describe('generateForImportantMessage', () => {
    it('returns null when message not found', async () => {
      mockDb.prisma.messageIndex.findUnique.mockResolvedValue(null)

      const result = await service.generateForImportantMessage('missing')

      expect(result).toBeNull()
      expect(mockLlm.chat).not.toHaveBeenCalled()
    })

    it('skips when an existing digest covers the same window', async () => {
      mockDb.prisma.messageIndex.findUnique.mockResolvedValue(makeMessageIndex('m1', 5000))
      mockDb.prisma.digestEntry.findFirst.mockResolvedValue({ id: 'existing' })

      const result = await service.generateForImportantMessage('m1')

      expect(result).toBeNull()
      expect(mockLlm.chat).not.toHaveBeenCalled()
    })

    it('returns null silently when range is too small', async () => {
      mockDb.prisma.messageIndex.findUnique.mockResolvedValue(makeMessageIndex('m1', 5000))
      mockDb.prisma.digestEntry.findFirst.mockResolvedValue(null)
      mockDb.prisma.messageIndex.findMany.mockResolvedValue([makeMessageIndex('m1', 5000)])
      mockDataLake.getMessage.mockResolvedValue(makeChatMessage('m1', 'hi', 5000))

      const result = await service.generateForImportantMessage('m1')

      expect(result).toBeNull()
      expect(mockLlm.chat).not.toHaveBeenCalled()
    })

    it('runs full digest pipeline for an important message', async () => {
      mockDb.prisma.messageIndex.findUnique.mockResolvedValue(makeMessageIndex('m3', 5000))
      mockDb.prisma.digestEntry.findFirst.mockResolvedValue(null)
      mockDb.prisma.messageIndex.findMany.mockResolvedValue([
        makeMessageIndex('m1', 4000),
        makeMessageIndex('m2', 4500),
        makeMessageIndex('m3', 5000),
      ])
      mockDataLake.getMessage.mockImplementation(async (key: string) => {
        const id = key.replace('key_', '')
        return makeChatMessage(id, `${id}-内容`, 0)
      })
      mockLlm.chat.mockResolvedValue('自动摘要内容')
      mockDb.prisma.digestEntry.create.mockResolvedValue({ id: 'digest_auto' })

      const result = await service.generateForImportantMessage('m3')

      expect(result).toEqual({ id: 'digest_auto' })
      expect(mockDb.prisma.messageIndex.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            conversationId: 'conv_1',
            createTime: { gte: 5000 - 1800, lte: 5000 },
            isRecalled: false,
          }),
        })
      )
    })
  })
})
