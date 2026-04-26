// ABOUTME: Extracts structured knowledge cards from digest summaries using the configured LLM
// ABOUTME: Validates JSON output and upserts one KnowledgeCard per DigestEntry

import { z } from 'zod'
import type { DatabaseService } from './database.js'
import type { DigestRecord } from './digestService.js'
import type { LlmClient } from './llmClient.js'

export interface KnowledgeCardRecord {
  id: string
  digestEntryId: string
  conversationId: string
  title: string
  summary: string
  decisions: string
  actionItems: string
  risks: string
  participants: string
  timeAnchors: string
  createdAt: Date
  updatedAt: Date
}

const extractionSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  decisions: z.array(z.string()).default([]),
  actionItems: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  participants: z.array(z.string()).default([]),
  timeAnchors: z.array(z.string()).default([]),
})

const SYSTEM_PROMPT =
  '你是中文知识提炼助手。请严格输出 JSON，不要输出 Markdown、解释或多余文本。' +
  '字段必须包含 title、summary、decisions、actionItems、risks、participants、timeAnchors。' +
  '数组字段缺失时返回空数组。'

export class KnowledgeExtractionService {
  constructor(
    private readonly db: DatabaseService,
    private readonly llm: LlmClient
  ) {}

  async extractFromDigest(digest: DigestRecord): Promise<KnowledgeCardRecord> {
    const raw = await this.llm.chat([
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content:
          `会话ID：${digest.conversationId}\n` +
          `时间范围：${digest.startTime} - ${digest.endTime}\n` +
          `摘要：${digest.summary}`,
      },
    ])

    const parsed = extractionSchema.parse(JSON.parse(raw))
    const persisted = await this.db.prisma.knowledgeCard.upsert({
      where: { digestEntryId: digest.id },
      create: {
        digestEntryId: digest.id,
        conversationId: digest.conversationId,
        title: parsed.title,
        summary: parsed.summary,
        decisions: JSON.stringify(parsed.decisions),
        actionItems: JSON.stringify(parsed.actionItems),
        risks: JSON.stringify(parsed.risks),
        participants: JSON.stringify(parsed.participants),
        timeAnchors: JSON.stringify(parsed.timeAnchors),
      },
      update: {
        conversationId: digest.conversationId,
        title: parsed.title,
        summary: parsed.summary,
        decisions: JSON.stringify(parsed.decisions),
        actionItems: JSON.stringify(parsed.actionItems),
        risks: JSON.stringify(parsed.risks),
        participants: JSON.stringify(parsed.participants),
        timeAnchors: JSON.stringify(parsed.timeAnchors),
      },
    })

    return persisted as KnowledgeCardRecord
  }
}
