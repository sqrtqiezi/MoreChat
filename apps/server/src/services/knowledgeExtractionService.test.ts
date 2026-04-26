import { describe, it, expect, beforeEach, vi } from 'vitest'
import { KnowledgeExtractionService } from './knowledgeExtractionService.js'
import type { LlmClient } from './llmClient.js'

function makeDigestRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'digest_1',
    conversationId: 'conv_1',
    startTime: 100,
    endTime: 200,
    summary: '讨论预算审批与上线安排',
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

describe('KnowledgeExtractionService', () => {
  let mockDb: any
  let mockLlm: any
  let service: KnowledgeExtractionService

  beforeEach(() => {
    mockDb = {
      prisma: {
        knowledgeCard: {
          upsert: vi.fn(),
        },
      },
    }
    mockLlm = {
      chat: vi.fn(),
    }
    service = new KnowledgeExtractionService(mockDb, mockLlm as LlmClient)
  })

  it('extracts structured fields from a digest and upserts a knowledge card', async () => {
    mockLlm.chat.mockResolvedValue(
      JSON.stringify({
        title: '预算与上线讨论',
        summary: '讨论预算审批与周五上线',
        decisions: ['本周五上线'],
        actionItems: ['Alice 提交预算表'],
        risks: ['预算未审批'],
        participants: ['Alice', 'Bob'],
        timeAnchors: ['本周五'],
      })
    )
    mockDb.prisma.knowledgeCard.upsert.mockResolvedValue({
      id: 'card_1',
      digestEntryId: 'digest_1',
      conversationId: 'conv_1',
      title: '预算与上线讨论',
      summary: '讨论预算审批与周五上线',
      decisions: '["本周五上线"]',
      actionItems: '["Alice 提交预算表"]',
      risks: '["预算未审批"]',
      participants: '["Alice","Bob"]',
      timeAnchors: '["本周五"]',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const result = await service.extractFromDigest(makeDigestRecord())

    expect(mockDb.prisma.knowledgeCard.upsert).toHaveBeenCalledWith({
      where: { digestEntryId: 'digest_1' },
      create: {
        digestEntryId: 'digest_1',
        conversationId: 'conv_1',
        title: '预算与上线讨论',
        summary: '讨论预算审批与周五上线',
        decisions: '["本周五上线"]',
        actionItems: '["Alice 提交预算表"]',
        risks: '["预算未审批"]',
        participants: '["Alice","Bob"]',
        timeAnchors: '["本周五"]',
      },
      update: {
        conversationId: 'conv_1',
        title: '预算与上线讨论',
        summary: '讨论预算审批与周五上线',
        decisions: '["本周五上线"]',
        actionItems: '["Alice 提交预算表"]',
        risks: '["预算未审批"]',
        participants: '["Alice","Bob"]',
        timeAnchors: '["本周五"]',
      },
    })
    expect(result.title).toBe('预算与上线讨论')
  })

  it('defaults missing arrays to empty arrays', async () => {
    mockLlm.chat.mockResolvedValue(
      JSON.stringify({
        title: '预算讨论',
        summary: '仅形成了结论',
      })
    )
    mockDb.prisma.knowledgeCard.upsert.mockResolvedValue({
      id: 'card_1',
      digestEntryId: 'digest_1',
      conversationId: 'conv_1',
      title: '预算讨论',
      summary: '仅形成了结论',
      decisions: '[]',
      actionItems: '[]',
      risks: '[]',
      participants: '[]',
      timeAnchors: '[]',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const result = await service.extractFromDigest(makeDigestRecord())

    expect(result.decisions).toBe('[]')
    expect(result.actionItems).toBe('[]')
  })

  it('throws on malformed JSON', async () => {
    mockLlm.chat.mockResolvedValue('{not json}')

    await expect(service.extractFromDigest(makeDigestRecord())).rejects.toThrow()
    expect(mockDb.prisma.knowledgeCard.upsert).not.toHaveBeenCalled()
  })
})
