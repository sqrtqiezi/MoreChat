// ABOUTME: Performs conservative maintenance over recent window topics
// ABOUTME: First version only marks clearly old active topics as stale

import type { DatabaseService } from './database.js'

export interface TopicRepairOptions {
  staleAfterSeconds?: number
  limit?: number
}

export class TopicRepairService {
  private readonly staleAfterSeconds: number
  private readonly limit: number

  constructor(
    private readonly db: DatabaseService,
    options: TopicRepairOptions = {}
  ) {
    this.staleAfterSeconds = options.staleAfterSeconds ?? 7 * 24 * 60 * 60
    this.limit = options.limit ?? 100
  }

  async repairRecentTopics(input: { now: number }): Promise<void> {
    const topics = await this.db.prisma.topic.findMany({
      where: {
        kind: 'window',
        status: 'active',
      },
      orderBy: { lastSeenAt: 'desc' },
      take: this.limit,
    })

    for (const topic of topics) {
      if (input.now - topic.lastSeenAt > this.staleAfterSeconds) {
        await this.db.prisma.topic.update({
          where: { id: topic.id },
          data: { status: 'stale' },
        })
      }
    }
  }
}
