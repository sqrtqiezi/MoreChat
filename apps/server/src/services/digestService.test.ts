// ABOUTME: DigestService unit tests covering digest window validation, idempotent persistence, and automatic digest flow

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DigestService, DigestRangeTooSmallError } from './digestService.js'
import type { LlmClient } from './llmClient.js'

function makeDigestRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'digest_1',
    conversationId: 'conv_1',
    startTime: 100,
    endTime: 120,
    summary: '讨论了项目预算。',
    messageCount: 3,
    sourceKind: 'manual',
    triggerMsgId: null,
    status: 'ready',
    errorMessage: null,
    createdAt: new Date('2026-04-26T00:00:00Z'),
    updatedAt: new Date('2026-04-26T00:00:00Z'),
    ...overrides,
  }
}

function makeMessageIndex(msgId: string, createTime: number) {
  return {
    id: `idx_${msgId}`,
    msgId,
    conversationId: 'conv_1',
    msgType: 1,
    fromUsername: 'alice',
    toUsername: 'bob',
    chatroomSender: null,
    createTime,
    dataLakeKey: `key_${msgId}`,
    isRecalled: false,
  }
}

describe('DigestService', () => {
  let mockDb: any
  let mockWindowService: any
  let mockLlm: any
  let service: DigestService

  beforeEach(() => {
    mockDb = {
      prisma: {
        messageIndex: {
          findUnique: vi.fn(),
        },
        digestEntry: {
          upsert: vi.fn(),
        },
      },
    }
    mockWindowService = {
      buildWindow: vi.fn(),
    }
    mockLlm = {
      chat: vi.fn(),
    }

    service = new DigestService(mockWindowService, mockDb, mockLlm as LlmClient)
  })

  describe('generateForRange', () => {
    it('throws DigestRangeTooSmallError when fewer than 3 messages', async () => {
      mockWindowService.buildWindow.mockResolvedValue({
        conversationId: 'conv_1',
        startTime: 100,
        endTime: 110,
        messageCount: 2,
        lines: ['alice: m1', 'alice: m2'],
      })

      await expect(
        service.generateForRange({ conversationId: 'conv_1', startTime: 0, endTime: 200 })
      ).rejects.toBeInstanceOf(DigestRangeTooSmallError)

      expect(mockLlm.chat).not.toHaveBeenCalled()
      expect(mockDb.prisma.digestEntry.upsert).not.toHaveBeenCalled()
    })

    it('summarizes messages, upserts DigestEntry, and returns it', async () => {
      mockWindowService.buildWindow.mockResolvedValue({
        conversationId: 'conv_1',
        startTime: 100,
        endTime: 120,
        messageCount: 3,
        lines: ['alice: m1-内容', 'alice: [图片]', 'alice: m3-内容'],
      })
      mockLlm.chat.mockResolvedValue('讨论了项目预算。')

      const persisted = makeDigestRecord()
      mockDb.prisma.digestEntry.upsert.mockResolvedValue(persisted)

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
      expect(messages[1].content).toContain('[图片]')
      expect(messages[1].content).toContain('m3-内容')

      expect(mockDb.prisma.digestEntry.upsert).toHaveBeenCalledWith({
        where: {
          conversationId_startTime_endTime_sourceKind: {
            conversationId: 'conv_1',
            startTime: 100,
            endTime: 120,
            sourceKind: 'manual',
          },
        },
        create: {
          conversationId: 'conv_1',
          startTime: 100,
          endTime: 120,
          summary: '讨论了项目预算。',
          messageCount: 3,
          sourceKind: 'manual',
          triggerMsgId: undefined,
          status: 'ready',
          errorMessage: null,
        },
        update: {
          summary: '讨论了项目预算。',
          messageCount: 3,
          triggerMsgId: undefined,
          status: 'ready',
          errorMessage: null,
        },
      })
      expect(result).toEqual(persisted)
    })

    it('supports auto sourceKind and triggerMsgId', async () => {
      mockWindowService.buildWindow.mockResolvedValue({
        conversationId: 'conv_1',
        startTime: 3200,
        endTime: 5000,
        messageCount: 3,
        lines: ['alice: a', 'alice: b', 'alice: c'],
      })
      mockLlm.chat.mockResolvedValue('自动摘要内容')
      mockDb.prisma.digestEntry.upsert.mockResolvedValue(
        makeDigestRecord({
          sourceKind: 'auto',
          triggerMsgId: 'm3',
          summary: '自动摘要内容',
          startTime: 3200,
          endTime: 5000,
        })
      )

      await service.generateForRange({
        conversationId: 'conv_1',
        startTime: 3200,
        endTime: 5000,
        sourceKind: 'auto',
        triggerMsgId: 'm3',
      })

      expect(mockDb.prisma.digestEntry.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            conversationId_startTime_endTime_sourceKind: {
              conversationId: 'conv_1',
              startTime: 3200,
              endTime: 5000,
              sourceKind: 'auto',
            },
          },
          create: expect.objectContaining({
            sourceKind: 'auto',
            triggerMsgId: 'm3',
          }),
          update: expect.objectContaining({
            triggerMsgId: 'm3',
          }),
        })
      )
    })

    it('persists failed status when LLM generation fails', async () => {
      mockWindowService.buildWindow.mockResolvedValue({
        conversationId: 'conv_1',
        startTime: 100,
        endTime: 120,
        messageCount: 3,
        lines: ['alice: m1', 'alice: m2', 'alice: m3'],
      })
      mockLlm.chat.mockRejectedValue(new Error('llm down'))

      await expect(
        service.generateForRange({ conversationId: 'conv_1', startTime: 0, endTime: 200 })
      ).rejects.toThrow('llm down')

      expect(mockDb.prisma.digestEntry.upsert).toHaveBeenCalledWith({
        where: {
          conversationId_startTime_endTime_sourceKind: {
            conversationId: 'conv_1',
            startTime: 100,
            endTime: 120,
            sourceKind: 'manual',
          },
        },
        create: {
          conversationId: 'conv_1',
          startTime: 100,
          endTime: 120,
          summary: '',
          messageCount: 3,
          sourceKind: 'manual',
          triggerMsgId: undefined,
          status: 'failed',
          errorMessage: 'llm down',
        },
        update: {
          messageCount: 3,
          triggerMsgId: undefined,
          status: 'failed',
          errorMessage: 'llm down',
        },
      })
    })
  })

  describe('generateForImportantMessage', () => {
    it('returns null when message not found', async () => {
      mockDb.prisma.messageIndex.findUnique.mockResolvedValue(null)

      const result = await service.generateForImportantMessage('missing')

      expect(result).toBeNull()
      expect(mockWindowService.buildWindow).not.toHaveBeenCalled()
    })

    it('returns null silently when range is too small', async () => {
      mockDb.prisma.messageIndex.findUnique.mockResolvedValue(makeMessageIndex('m1', 5000))
      mockWindowService.buildWindow.mockResolvedValue({
        conversationId: 'conv_1',
        startTime: 3200,
        endTime: 5000,
        messageCount: 1,
        lines: ['alice: hi'],
      })

      const result = await service.generateForImportantMessage('m1')

      expect(result).toBeNull()
      expect(mockLlm.chat).not.toHaveBeenCalled()
    })

    it('runs full digest pipeline for an important message', async () => {
      mockDb.prisma.messageIndex.findUnique.mockResolvedValue(makeMessageIndex('m3', 5000))
      mockWindowService.buildWindow.mockResolvedValue({
        conversationId: 'conv_1',
        startTime: 4000,
        endTime: 5000,
        messageCount: 3,
        lines: ['alice: m1', 'alice: m2', 'alice: m3'],
      })
      mockLlm.chat.mockResolvedValue('自动摘要内容')
      mockDb.prisma.digestEntry.upsert.mockResolvedValue(
        makeDigestRecord({
          id: 'digest_auto',
          sourceKind: 'auto',
          triggerMsgId: 'm3',
          summary: '自动摘要内容',
          startTime: 4000,
          endTime: 5000,
        })
      )

      const result = await service.generateForImportantMessage('m3')

      expect(result?.id).toBe('digest_auto')
      expect(mockWindowService.buildWindow).toHaveBeenCalledWith({
        conversationId: 'conv_1',
        startTime: 5000 - 1800,
        endTime: 5000,
        sourceKind: 'auto',
        triggerMsgId: 'm3',
      })
    })
  })
})
