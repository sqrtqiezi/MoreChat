import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DigestWorkflowService } from './digestWorkflowService.js'

const digestRecord = {
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
}

const knowledgeCard = {
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
  createdAt: new Date('2026-04-26T00:00:00Z'),
  updatedAt: new Date('2026-04-26T00:00:00Z'),
}

describe('DigestWorkflowService', () => {
  let mockDigestService: any
  let mockKnowledgeExtractionService: any
  let service: DigestWorkflowService

  beforeEach(() => {
    mockDigestService = {
      generateForRange: vi.fn(),
      generateForImportantMessage: vi.fn(),
    }
    mockKnowledgeExtractionService = {
      extractFromDigest: vi.fn(),
    }
    service = new DigestWorkflowService(mockDigestService, mockKnowledgeExtractionService)
  })

  it('runs digest generation and knowledge extraction for manual ranges', async () => {
    mockDigestService.generateForRange.mockResolvedValue(digestRecord)
    mockKnowledgeExtractionService.extractFromDigest.mockResolvedValue(knowledgeCard)

    const result = await service.generateManualDigest({
      conversationId: 'conv_1',
      startTime: 100,
      endTime: 200,
    })

    expect(mockDigestService.generateForRange).toHaveBeenCalledWith({
      conversationId: 'conv_1',
      startTime: 100,
      endTime: 200,
      sourceKind: 'manual',
    })
    expect(mockKnowledgeExtractionService.extractFromDigest).toHaveBeenCalledWith(digestRecord)
    expect(result.digest).toEqual(digestRecord)
    expect(result.knowledgeCard).toEqual(knowledgeCard)
  })

  it('keeps digest success when extraction fails', async () => {
    mockDigestService.generateForRange.mockResolvedValue(digestRecord)
    mockKnowledgeExtractionService.extractFromDigest.mockRejectedValue(new Error('bad json'))

    const result = await service.generateManualDigest({
      conversationId: 'conv_1',
      startTime: 100,
      endTime: 200,
    })

    expect(result.digest).toEqual(digestRecord)
    expect(result.knowledgeCard).toBeNull()
  })

  it('runs automatic flow for important messages', async () => {
    mockDigestService.generateForImportantMessage.mockResolvedValue({
      ...digestRecord,
      sourceKind: 'auto',
      triggerMsgId: 'm3',
    })
    mockKnowledgeExtractionService.extractFromDigest.mockResolvedValue(knowledgeCard)

    const result = await service.generateAutomaticDigest('m3')

    expect(mockDigestService.generateForImportantMessage).toHaveBeenCalledWith('m3')
    expect(result.digest?.sourceKind).toBe('auto')
    expect(result.knowledgeCard).toEqual(knowledgeCard)
  })

  it('returns nulls when automatic digest is skipped', async () => {
    mockDigestService.generateForImportantMessage.mockResolvedValue(null)

    const result = await service.generateAutomaticDigest('m3')

    expect(result).toEqual({ digest: null, knowledgeCard: null })
    expect(mockKnowledgeExtractionService.extractFromDigest).not.toHaveBeenCalled()
  })
})
