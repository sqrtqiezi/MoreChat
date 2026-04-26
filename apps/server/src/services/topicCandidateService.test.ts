import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TopicCandidateService } from './topicCandidateService.js'

describe('TopicCandidateService', () => {
  let mockEmbedding: any
  let service: TopicCandidateService

  beforeEach(() => {
    mockEmbedding = {
      generateEmbedding: vi.fn(),
    }
    service = new TopicCandidateService(mockEmbedding)
  })

  it('builds stable topic input text from a knowledge card', async () => {
    mockEmbedding.generateEmbedding.mockResolvedValue([0.1, 0.2, 0.3])

    const candidate = await service.buildCandidate({
      id: 'card_1',
      conversationId: 'conv_1',
      title: '预算讨论',
      summary: '讨论预算审批与周五上线',
      decisions: '["本周五上线"]',
      actionItems: '["Alice 提交预算表"]',
    })

    expect(candidate.text).toContain('预算讨论')
    expect(candidate.text).toContain('本周五上线')
    expect(candidate.embedding).toEqual([0.1, 0.2, 0.3])
  })

  it('falls back to empty arrays for malformed JSON fields', () => {
    const text = service.buildCandidateText({
      id: 'card_1',
      conversationId: 'conv_1',
      title: '预算讨论',
      summary: '摘要',
      decisions: '{bad json}',
      actionItems: '[]',
    })

    expect(text).toBe('预算讨论\n摘要')
  })

  it('propagates embedding service failures', async () => {
    mockEmbedding.generateEmbedding.mockRejectedValue(new Error('embedding down'))

    await expect(
      service.buildCandidate({
        id: 'card_1',
        conversationId: 'conv_1',
        title: '预算讨论',
        summary: '摘要',
        decisions: '[]',
        actionItems: '[]',
      })
    ).rejects.toThrow('embedding down')
  })
})
