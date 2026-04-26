// ABOUTME: Builds topic-clustering input text from KnowledgeCard records and generates embeddings
// ABOUTME: Keeps topic text composition deterministic and independent from clustering decisions

import type { EmbeddingService } from './embeddingService.js'

export interface TopicCandidate {
  knowledgeCardId: string
  conversationId: string
  text: string
  embedding: number[]
}

export interface KnowledgeCardLike {
  id: string
  conversationId: string
  title: string
  summary: string
  decisions: string
  actionItems: string
}

function parseArrayField(value: string): string[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export class TopicCandidateService {
  constructor(private readonly embeddingService: EmbeddingService) {}

  async generateEmbedding(text: string): Promise<number[]> {
    return this.embeddingService.generateEmbedding(text)
  }

  buildCandidateText(card: KnowledgeCardLike): string {
    const parts = [
      card.title.trim(),
      card.summary.trim(),
      ...parseArrayField(card.decisions),
      ...parseArrayField(card.actionItems),
    ].filter((part) => part.length > 0)

    return parts.join('\n')
  }

  async buildCandidate(card: KnowledgeCardLike): Promise<TopicCandidate> {
    const text = this.buildCandidateText(card)
    const embedding = await this.generateEmbedding(text)

    return {
      knowledgeCardId: card.id,
      conversationId: card.conversationId,
      text,
      embedding,
    }
  }
}
