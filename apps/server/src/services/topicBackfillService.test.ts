import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TopicBackfillService } from './topicBackfillService.js'

describe('TopicBackfillService', () => {
  let mockDb: any
  let service: TopicBackfillService

  beforeEach(() => {
    mockDb = {
      prisma: {
        digestEntry: {
          findUnique: vi.fn(),
        },
        messageIndex: {
          findMany: vi.fn(),
        },
        topicMessage: {
          upsert: vi.fn(),
        },
      },
    }
    service = new TopicBackfillService(mockDb)
  })

  it('backfills TopicMessage rows from the digest window behind a knowledge card', async () => {
    mockDb.prisma.digestEntry.findUnique.mockResolvedValue({
      conversationId: 'conv_1',
      startTime: 100,
      endTime: 200,
    })
    mockDb.prisma.messageIndex.findMany.mockResolvedValue([{ msgId: 'm1' }, { msgId: 'm2' }])

    await service.backfillTopicMessages({
      topicIds: ['topic_1'],
      knowledgeCard: { digestEntryId: 'digest_1' },
    })

    expect(mockDb.prisma.topicMessage.upsert).toHaveBeenCalledTimes(2)
  })

  it('no-ops when the digest entry is missing', async () => {
    mockDb.prisma.digestEntry.findUnique.mockResolvedValue(null)

    await service.backfillTopicMessages({
      topicIds: ['topic_1'],
      knowledgeCard: { digestEntryId: 'missing' },
    })

    expect(mockDb.prisma.messageIndex.findMany).not.toHaveBeenCalled()
  })

  it('supports repeated backfill idempotently via upsert', async () => {
    mockDb.prisma.digestEntry.findUnique.mockResolvedValue({
      conversationId: 'conv_1',
      startTime: 100,
      endTime: 200,
    })
    mockDb.prisma.messageIndex.findMany.mockResolvedValue([{ msgId: 'm1' }])

    await service.backfillTopicMessages({
      topicIds: ['topic_1', 'topic_2'],
      knowledgeCard: { digestEntryId: 'digest_1' },
    })

    expect(mockDb.prisma.topicMessage.upsert).toHaveBeenNthCalledWith(1, {
      where: {
        topicId_msgId: {
          topicId: 'topic_1',
          msgId: 'm1',
        },
      },
      create: {
        topicId: 'topic_1',
        msgId: 'm1',
      },
      update: {},
    })
  })
})
