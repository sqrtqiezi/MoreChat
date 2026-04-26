import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TopicClusteringService } from './topicClusteringService.js'

function makeCard(overrides: Record<string, unknown> = {}) {
  return {
    id: 'card_1',
    digestEntryId: 'digest_1',
    conversationId: 'conv_1',
    title: '预算讨论',
    summary: '讨论预算审批与周五上线',
    decisions: '["本周五上线"]',
    actionItems: '["Alice 提交预算表"]',
    ...overrides,
  }
}

function makeTopic(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    kind: 'window',
    status: 'active',
    title: `主题-${id}`,
    summary: '近期预算',
    keywords: '[]',
    firstSeenAt: 90,
    lastSeenAt: 100,
    ...overrides,
  }
}

describe('TopicClusteringService', () => {
  let mockDb: any
  let mockCandidateService: any
  let service: TopicClusteringService

  beforeEach(() => {
    mockDb = {
      prisma: {
        digestEntry: {
          findUnique: vi.fn(),
        },
        topic: {
          findMany: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
        },
        topicKnowledgeCard: {
          upsert: vi.fn(),
          count: vi.fn(),
        },
      },
    }
    mockCandidateService = {
      buildCandidate: vi.fn(),
      generateEmbedding: vi.fn(),
    }

    service = new TopicClusteringService(mockDb, mockCandidateService, {
      mainThreshold: 0.8,
      secondaryThreshold: 0.6,
      maxAssignments: 3,
    })
  })

  it('assigns a card to the best matching active topic', async () => {
    mockDb.prisma.digestEntry.findUnique.mockResolvedValue({ startTime: 100, endTime: 200 })
    mockCandidateService.buildCandidate.mockResolvedValue({
      knowledgeCardId: 'card_1',
      conversationId: 'conv_1',
      text: '预算讨论 周五上线',
      embedding: [1, 0, 0],
    })
    mockDb.prisma.topic.findMany.mockResolvedValue([makeTopic('topic_1')])
    mockCandidateService.generateEmbedding.mockResolvedValue([1, 0, 0])
    mockDb.prisma.topicKnowledgeCard.count.mockResolvedValue(2)

    const result = await service.clusterKnowledgeCard(makeCard())

    expect(mockDb.prisma.topicKnowledgeCard.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          topicId_knowledgeCardId: {
            topicId: 'topic_1',
            knowledgeCardId: 'card_1',
          },
        },
      })
    )
    expect(result).toEqual({ topicIds: ['topic_1'] })
  })

  it('creates a new topic when nothing matches', async () => {
    mockDb.prisma.digestEntry.findUnique.mockResolvedValue({ startTime: 100, endTime: 200 })
    mockCandidateService.buildCandidate.mockResolvedValue({
      knowledgeCardId: 'card_1',
      conversationId: 'conv_1',
      text: '预算讨论 周五上线',
      embedding: [1, 0, 0],
    })
    mockDb.prisma.topic.findMany.mockResolvedValue([makeTopic('topic_1')])
    mockCandidateService.generateEmbedding.mockResolvedValue([0, 1, 0])
    mockDb.prisma.topic.create.mockResolvedValue({ id: 'topic_new' })

    const result = await service.clusterKnowledgeCard(makeCard())

    expect(mockDb.prisma.topic.create).toHaveBeenCalled()
    expect(result).toEqual({ topicIds: ['topic_new'] })
  })

  it('never assigns more than three topics', async () => {
    mockDb.prisma.digestEntry.findUnique.mockResolvedValue({ startTime: 100, endTime: 200 })
    mockCandidateService.buildCandidate.mockResolvedValue({
      knowledgeCardId: 'card_1',
      conversationId: 'conv_1',
      text: '预算讨论 周五上线',
      embedding: [1, 0, 0],
    })
    mockDb.prisma.topic.findMany.mockResolvedValue([
      makeTopic('topic_1'),
      makeTopic('topic_2'),
      makeTopic('topic_3'),
      makeTopic('topic_4'),
    ])
    mockCandidateService.generateEmbedding
      .mockResolvedValueOnce([1, 0, 0])
      .mockResolvedValueOnce([0.9, 0.1, 0])
      .mockResolvedValueOnce([0.8, 0.2, 0])
      .mockResolvedValueOnce([0.7, 0.3, 0])
    mockDb.prisma.topicKnowledgeCard.count.mockResolvedValue(2)

    const result = await service.clusterKnowledgeCard(makeCard())

    expect(mockDb.prisma.topicKnowledgeCard.upsert).toHaveBeenCalledTimes(3)
    expect(result.topicIds).toHaveLength(3)
  })
})
