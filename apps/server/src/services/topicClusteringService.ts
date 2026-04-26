// ABOUTME: Incrementally clusters KnowledgeCard records into up to three active window topics
// ABOUTME: Creates new topics when no active recent topic clears the primary similarity threshold

import type { DatabaseService } from './database.js'
import { TopicCandidateService, type KnowledgeCardLike } from './topicCandidateService.js'

export interface ClusterResult {
  topicIds: string[]
}

export interface TopicClusteringServiceOptions {
  mainThreshold?: number
  secondaryThreshold?: number
  maxAssignments?: number
  recentTopicLimit?: number
}

interface TopicLike {
  id: string
  kind: string
  status: string
  title: string
  summary: string
  keywords: string
  firstSeenAt: number
  lastSeenAt: number
}

function parseArrayField(value: string): string[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, val, index) => sum + val * b[index], 0)
  const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0))
  const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0))
  if (normA === 0 || normB === 0) {
    return 0
  }
  return dot / (normA * normB)
}

export class TopicClusteringService {
  private readonly mainThreshold: number
  private readonly secondaryThreshold: number
  private readonly maxAssignments: number
  private readonly recentTopicLimit: number

  constructor(
    private readonly db: DatabaseService,
    private readonly candidateService: TopicCandidateService,
    options: TopicClusteringServiceOptions = {}
  ) {
    this.mainThreshold = options.mainThreshold ?? 0.82
    this.secondaryThreshold = options.secondaryThreshold ?? 0.72
    this.maxAssignments = options.maxAssignments ?? 3
    this.recentTopicLimit = options.recentTopicLimit ?? 50
  }

  async clusterKnowledgeCard(card: KnowledgeCardLike & { digestEntryId: string }): Promise<ClusterResult> {
    const digest = await this.db.prisma.digestEntry.findUnique({
      where: { id: card.digestEntryId },
      select: { startTime: true, endTime: true },
    })
    const candidate = await this.candidateService.buildCandidate(card)

    const topics = await this.db.prisma.topic.findMany({
      where: { kind: 'window', status: 'active' },
      orderBy: { lastSeenAt: 'desc' },
      take: this.recentTopicLimit,
    })

    const scoredTopics = await Promise.all(
      topics.map(async (topic) => ({
        topic,
        score: cosineSimilarity(candidate.embedding, await this.buildTopicEmbedding(topic)),
      }))
    )

    const sorted = scoredTopics.sort((a, b) => b.score - a.score)
    const selected = sorted.filter((entry, index) =>
      index === 0 ? entry.score >= this.mainThreshold : entry.score >= this.secondaryThreshold
    ).slice(0, this.maxAssignments)

    if (selected.length === 0) {
      const topic = await this.createTopicFromCard(card, digest?.startTime ?? 0, digest?.endTime ?? 0)
      await this.attachCardToTopic(topic.id, card.id, 1, 1)
      return { topicIds: [topic.id] }
    }

    const topicIds: string[] = []
    for (const [index, selectedTopic] of selected.entries()) {
      await this.attachCardToTopic(selectedTopic.topic.id, card.id, selectedTopic.score, index + 1)
      await this.refreshTopicAggregation(selectedTopic.topic.id, selectedTopic.topic, digest?.startTime, digest?.endTime)
      topicIds.push(selectedTopic.topic.id)
    }

    return { topicIds }
  }

  private async buildTopicEmbedding(topic: TopicLike): Promise<number[]> {
    const text = [topic.title, topic.summary, ...parseArrayField(topic.keywords)].filter(Boolean).join('\n')
    return this.candidateService.generateEmbedding(text)
  }

  private async createTopicFromCard(card: KnowledgeCardLike, firstSeenAt: number, lastSeenAt: number) {
    return this.db.prisma.topic.create({
      data: {
        kind: 'window',
        status: 'active',
        title: card.title,
        summary: card.summary,
        description: null,
        keywords: JSON.stringify(this.buildKeywordList(card)),
        messageCount: 0,
        participantCount: 0,
        sourceCardCount: 1,
        clusterKey: null,
        firstSeenAt,
        lastSeenAt,
      },
    })
  }

  private buildKeywordList(card: KnowledgeCardLike): string[] {
    return Array.from(new Set(
      `${card.title} ${card.summary}`
        .split(/\s+/)
        .map((item) => item.trim())
        .filter((item) => item.length >= 2)
        .slice(0, 8)
    ))
  }

  private async attachCardToTopic(topicId: string, knowledgeCardId: string, score: number, rank: number): Promise<void> {
    await this.db.prisma.topicKnowledgeCard.upsert({
      where: {
        topicId_knowledgeCardId: {
          topicId,
          knowledgeCardId,
        },
      },
      create: {
        topicId,
        knowledgeCardId,
        score,
        rank,
      },
      update: {
        score,
        rank,
      },
    })
  }

  private async refreshTopicAggregation(
    topicId: string,
    topic: TopicLike,
    firstSeenAt?: number,
    lastSeenAt?: number
  ): Promise<void> {
    const sourceCardCount = await this.db.prisma.topicKnowledgeCard.count({ where: { topicId } })
    await this.db.prisma.topic.update({
      where: { id: topicId },
      data: {
        sourceCardCount,
        firstSeenAt: typeof firstSeenAt === 'number' ? Math.min(topic.firstSeenAt, firstSeenAt) : topic.firstSeenAt,
        lastSeenAt: typeof lastSeenAt === 'number' ? Math.max(topic.lastSeenAt, lastSeenAt) : topic.lastSeenAt,
      },
    })
  }
}
