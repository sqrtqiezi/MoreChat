// ABOUTME: Generates digest summaries and persists DigestEntry records with idempotent window semantics
// ABOUTME: Delegates message-window assembly to DigestWindowService and isolates automatic digest helpers

import type { DatabaseService } from './database.js'
import { DigestWindowService } from './digestWindowService.js'
import type { LlmClient, LlmChatMessage } from './llmClient.js'

export class DigestRangeTooSmallError extends Error {
  constructor(public readonly messageCount: number) {
    super(`Digest range too small: ${messageCount} messages`)
    this.name = 'DigestRangeTooSmallError'
  }
}

export interface DigestServiceOptions {
  autoWindowSeconds?: number
  minMessages?: number
}

export interface GenerateRangeInput {
  conversationId: string
  startTime: number
  endTime: number
  sourceKind?: 'auto' | 'manual'
  triggerMsgId?: string
}

export interface DigestRecord {
  id: string
  conversationId: string
  startTime: number
  endTime: number
  summary: string
  messageCount: number
  sourceKind: string
  triggerMsgId: string | null
  status: string
  errorMessage: string | null
  createdAt: Date
  updatedAt: Date
}

const SYSTEM_PROMPT =
  '你是中文对话摘要助手。请用 3-5 句中文概括给定对话片段的核心讨论、决策和待办事项。' +
  '保持中立，不臆造内容。如果信息不足，明确指出无法判断。'

export class DigestService {
  private readonly autoWindowSeconds: number
  private readonly minMessages: number

  constructor(
    private readonly digestWindowService: DigestWindowService,
    private readonly db: DatabaseService,
    private readonly llm: LlmClient,
    options: DigestServiceOptions = {}
  ) {
    this.autoWindowSeconds = options.autoWindowSeconds ?? 1800
    this.minMessages = options.minMessages ?? 3
  }

  async generateForRange(input: GenerateRangeInput): Promise<DigestRecord> {
    const sourceKind = input.sourceKind ?? 'manual'
    const window = await this.digestWindowService.buildWindow(input)

    if (window.messageCount < this.minMessages) {
      throw new DigestRangeTooSmallError(window.messageCount)
    }

    const messages: LlmChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content:
          `对话起止：${window.startTime} - ${window.endTime}\n` +
          `消息数：${window.messageCount}\n` +
          `内容：\n${window.lines.join('\n')}`,
      },
    ]

    try {
      const summary = await this.llm.chat(messages)
      const persisted = await this.db.prisma.digestEntry.upsert({
        where: {
          conversationId_startTime_endTime_sourceKind: {
            conversationId: window.conversationId,
            startTime: window.startTime,
            endTime: window.endTime,
            sourceKind,
          },
        },
        create: {
          conversationId: window.conversationId,
          startTime: window.startTime,
          endTime: window.endTime,
          summary: summary.trim(),
          messageCount: window.messageCount,
          sourceKind,
          triggerMsgId: input.triggerMsgId,
          status: 'ready',
          errorMessage: null,
        },
        update: {
          summary: summary.trim(),
          messageCount: window.messageCount,
          triggerMsgId: input.triggerMsgId,
          status: 'ready',
          errorMessage: null,
        },
      })

      return persisted as DigestRecord
    } catch (error) {
      await this.db.prisma.digestEntry.upsert({
        where: {
          conversationId_startTime_endTime_sourceKind: {
            conversationId: window.conversationId,
            startTime: window.startTime,
            endTime: window.endTime,
            sourceKind,
          },
        },
        create: {
          conversationId: window.conversationId,
          startTime: window.startTime,
          endTime: window.endTime,
          summary: '',
          messageCount: window.messageCount,
          sourceKind,
          triggerMsgId: input.triggerMsgId,
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Unknown digest error',
        },
        update: {
          messageCount: window.messageCount,
          triggerMsgId: input.triggerMsgId,
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Unknown digest error',
        },
      })
      throw error
    }
  }

  async generateForImportantMessage(msgId: string): Promise<DigestRecord | null> {
    const idx = await this.db.prisma.messageIndex.findUnique({ where: { msgId } })
    if (!idx) {
      return null
    }

    try {
      return await this.generateForRange({
        conversationId: idx.conversationId,
        startTime: idx.createTime - this.autoWindowSeconds,
        endTime: idx.createTime,
        sourceKind: 'auto',
        triggerMsgId: msgId,
      })
    } catch (error) {
      if (error instanceof DigestRangeTooSmallError) {
        return null
      }
      throw error
    }
  }
}
