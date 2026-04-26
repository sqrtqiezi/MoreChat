// ABOUTME: Backfills TopicMessage rows from the digest window behind a clustered KnowledgeCard
// ABOUTME: Keeps topic message coverage idempotent and independent from clustering decisions

import type { DatabaseService } from './database.js'

export class TopicBackfillService {
  constructor(private readonly db: DatabaseService) {}

  async backfillTopicMessages(input: {
    topicIds: string[]
    knowledgeCard: { digestEntryId: string }
  }): Promise<void> {
    if (input.topicIds.length === 0) {
      return
    }

    const digest = await this.db.prisma.digestEntry.findUnique({
      where: { id: input.knowledgeCard.digestEntryId },
      select: {
        conversationId: true,
        startTime: true,
        endTime: true,
      },
    })
    if (!digest) {
      return
    }

    const indexes = await this.db.prisma.messageIndex.findMany({
      where: {
        conversationId: digest.conversationId,
        createTime: {
          gte: digest.startTime,
          lte: digest.endTime,
        },
        isRecalled: false,
      },
      select: { msgId: true },
    })

    for (const topicId of input.topicIds) {
      for (const index of indexes) {
        await this.db.prisma.topicMessage.upsert({
          where: {
            topicId_msgId: {
              topicId,
              msgId: index.msgId,
            },
          },
          create: {
            topicId,
            msgId: index.msgId,
          },
          update: {},
        })
      }
    }
  }
}
