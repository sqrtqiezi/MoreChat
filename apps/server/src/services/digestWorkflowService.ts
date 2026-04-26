// ABOUTME: Shared orchestration for manual and automatic digest generation plus structured extraction
// ABOUTME: Keeps extraction failures isolated so a successful DigestEntry can still be returned

import { logger } from '../lib/logger.js'
import type { DigestRecord, DigestService, GenerateRangeInput } from './digestService.js'
import type { KnowledgeCardRecord, KnowledgeExtractionService } from './knowledgeExtractionService.js'

export interface DigestWorkflowResult {
  digest: DigestRecord
  knowledgeCard: KnowledgeCardRecord | null
}

export interface AutomaticDigestWorkflowResult {
  digest: DigestRecord | null
  knowledgeCard: KnowledgeCardRecord | null
}

export class DigestWorkflowService {
  constructor(
    private readonly digestService: DigestService,
    private readonly knowledgeExtractionService: KnowledgeExtractionService,
    private readonly onKnowledgeCardCreated?: (knowledgeCard: KnowledgeCardRecord) => Promise<void>
  ) {}

  async generateManualDigest(input: GenerateRangeInput): Promise<DigestWorkflowResult> {
    const digest = await this.digestService.generateForRange({
      ...input,
      sourceKind: 'manual',
    })

    return {
      digest,
      knowledgeCard: await this.tryExtract(digest),
    }
  }

  async generateAutomaticDigest(msgId: string): Promise<AutomaticDigestWorkflowResult> {
    const digest = await this.digestService.generateForImportantMessage(msgId)
    if (!digest) {
      return { digest: null, knowledgeCard: null }
    }

    return {
      digest,
      knowledgeCard: await this.tryExtract(digest),
    }
  }

  private async tryExtract(digest: DigestRecord): Promise<KnowledgeCardRecord | null> {
    try {
      const knowledgeCard = await this.knowledgeExtractionService.extractFromDigest(digest)
      if (this.onKnowledgeCardCreated) {
        try {
          await this.onKnowledgeCardCreated(knowledgeCard)
        } catch (error) {
          logger.warn({ err: error, knowledgeCardId: knowledgeCard.id }, 'Failed to enqueue topic clustering')
        }
      }
      return knowledgeCard
    } catch (error) {
      logger.warn({ err: error, digestId: digest.id }, 'Failed to extract structured knowledge from digest')
      return null
    }
  }
}
