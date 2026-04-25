// ABOUTME: Classifies messages using prototype-based semantic similarity
// ABOUTME: Uses cosine similarity between message embeddings and predefined prototypes

import { logger } from '../lib/logger.js'
import type { EmbeddingService } from './embeddingService.js'

export interface SemanticTag {
  tag: string
  source: string
}

interface PrototypeDefinition {
  tag: string
  phrase: string
  threshold: number
}

const PROTOTYPES: PrototypeDefinition[] = [
  { tag: 'todo', phrase: '请今天完成这项任务', threshold: 0.82 },
  { tag: 'decision', phrase: '我们决定采用这个方案', threshold: 0.82 },
  { tag: 'question', phrase: '这个问题你怎么看', threshold: 0.82 },
  { tag: 'important', phrase: '这个信息非常重要请注意', threshold: 0.85 },
]

export class SemanticImportanceService {
  private prototypeEmbeddings: Map<string, number[]> | null = null

  constructor(private embeddingService: EmbeddingService) {}

  async initialize(): Promise<void> {
    if (this.prototypeEmbeddings) {
      return
    }

    try {
      logger.info('Initializing SemanticImportanceService prototypes')

      const phrases = PROTOTYPES.map((p) => p.phrase)
      const embeddings = await this.embeddingService.generateBatchEmbeddings(phrases)

      this.prototypeEmbeddings = new Map()
      PROTOTYPES.forEach((prototype, index) => {
        this.prototypeEmbeddings!.set(prototype.tag, embeddings[index])
      })

      logger.info('SemanticImportanceService initialized successfully')
    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize SemanticImportanceService')
      throw error
    }
  }

  async analyze(content: string): Promise<SemanticTag[]> {
    if (!this.prototypeEmbeddings) {
      throw new Error('SemanticImportanceService not initialized')
    }

    try {
      const messageEmbedding = await this.embeddingService.generateEmbedding(content)
      const tags: SemanticTag[] = []

      for (const prototype of PROTOTYPES) {
        const prototypeEmbedding = this.prototypeEmbeddings.get(prototype.tag)!
        const similarity = cosineSimilarity(messageEmbedding, prototypeEmbedding)

        if (similarity >= prototype.threshold) {
          tags.push({ tag: prototype.tag, source: 'ai:semantic' })
        }
      }

      return tags
    } catch (error) {
      logger.error({ err: error, content }, 'Failed to analyze message')
      throw error
    }
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  if (denom === 0) {
    return 0
  }

  return dot / denom
}
