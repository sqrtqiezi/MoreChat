import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TopicRepairService } from './topicRepairService.js'

describe('TopicRepairService', () => {
  let mockDb: any
  let service: TopicRepairService

  beforeEach(() => {
    mockDb = {
      prisma: {
        topic: {
          findMany: vi.fn(),
          update: vi.fn(),
        },
      },
    }
    service = new TopicRepairService(mockDb, {
      staleAfterSeconds: 100,
      limit: 10,
    })
  })

  it('marks old active window topics as stale during repair', async () => {
    mockDb.prisma.topic.findMany.mockResolvedValue([
      { id: 'topic_1', status: 'active', kind: 'window', lastSeenAt: 100 },
    ])

    await service.repairRecentTopics({ now: 1000 })

    expect(mockDb.prisma.topic.update).toHaveBeenCalledWith({
      where: { id: 'topic_1' },
      data: { status: 'stale' },
    })
  })

  it('keeps recent topics active', async () => {
    mockDb.prisma.topic.findMany.mockResolvedValue([
      { id: 'topic_1', status: 'active', kind: 'window', lastSeenAt: 950 },
    ])

    await service.repairRecentTopics({ now: 1000 })

    expect(mockDb.prisma.topic.update).not.toHaveBeenCalled()
  })

  it('no-ops when there are no recent active topics', async () => {
    mockDb.prisma.topic.findMany.mockResolvedValue([])

    await service.repairRecentTopics({ now: 1000 })

    expect(mockDb.prisma.topic.update).not.toHaveBeenCalled()
  })
})
