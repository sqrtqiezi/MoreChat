// ABOUTME: 生成对话摘要的领域服务，统一手动范围摘要与重要消息自动摘要
// ABOUTME: 通过 MessageIndex + DataLake 拉取上下文，调用 LlmClient 生成摘要并写入 DigestEntry

import type { DatabaseService } from './database.js'
import type { DataLakeService, ChatMessage } from './dataLake.js'
import type { LlmClient, LlmChatMessage } from './llmClient.js'

export class DigestRangeTooSmallError extends Error {
  constructor(public readonly messageCount: number) {
    super(`Digest range too small: ${messageCount} messages`)
    this.name = 'DigestRangeTooSmallError'
  }
}

export interface DigestServiceOptions {
  autoWindowSeconds?: number
  maxMessages?: number
  perMessageMaxChars?: number
  duplicateWindowSeconds?: number
  minMessages?: number
}

export interface GenerateRangeInput {
  conversationId: string
  startTime: number
  endTime: number
}

export interface DigestRecord {
  id: string
  conversationId: string
  startTime: number
  endTime: number
  summary: string
  messageCount: number
  createdAt: Date
}

const SYSTEM_PROMPT =
  '你是中文对话摘要助手。请用 3-5 句中文概括给定对话片段的核心讨论、决策和待办事项。' +
  '保持中立，不臆造内容。如果信息不足，明确指出无法判断。'

const PLACEHOLDER_BY_TYPE: Record<number, string> = {
  3: '[图片]',
  34: '[语音]',
  43: '[视频]',
  47: '[表情]',
  49: '[应用消息]',
  10000: '[系统消息]',
}

export class DigestService {
  private readonly autoWindowSeconds: number
  private readonly maxMessages: number
  private readonly perMessageMaxChars: number
  private readonly duplicateWindowSeconds: number
  private readonly minMessages: number

  constructor(
    private readonly db: DatabaseService,
    private readonly dataLake: DataLakeService,
    private readonly llm: LlmClient,
    options: DigestServiceOptions = {}
  ) {
    this.autoWindowSeconds = options.autoWindowSeconds ?? 1800
    this.maxMessages = options.maxMessages ?? 50
    this.perMessageMaxChars = options.perMessageMaxChars ?? 200
    this.duplicateWindowSeconds = options.duplicateWindowSeconds ?? 300
    this.minMessages = options.minMessages ?? 3
  }

  async generateForRange(input: GenerateRangeInput): Promise<DigestRecord> {
    const indexes = await this.db.prisma.messageIndex.findMany({
      where: {
        conversationId: input.conversationId,
        createTime: { gte: input.startTime, lte: input.endTime },
        isRecalled: false,
      },
      orderBy: { createTime: 'asc' },
      take: this.maxMessages,
    })

    if (indexes.length < this.minMessages) {
      throw new DigestRangeTooSmallError(indexes.length)
    }

    const lines: string[] = []
    for (const idx of indexes) {
      const text = await this.renderMessage(idx)
      if (text) {
        lines.push(text)
      }
    }

    const startTime = indexes[0].createTime
    const endTime = indexes[indexes.length - 1].createTime

    const messages: LlmChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content:
          `对话起止：${startTime} - ${endTime}\n` +
          `消息数：${indexes.length}\n` +
          `内容：\n${lines.join('\n')}`,
      },
    ]

    const summary = await this.llm.chat(messages)

    const created = await this.db.prisma.digestEntry.create({
      data: {
        conversationId: input.conversationId,
        startTime,
        endTime,
        summary: summary.trim(),
        messageCount: indexes.length,
      },
    })

    return created as DigestRecord
  }

  async generateForImportantMessage(msgId: string): Promise<DigestRecord | null> {
    const idx = await this.db.prisma.messageIndex.findUnique({ where: { msgId } })
    if (!idx) {
      return null
    }

    const existing = await this.db.prisma.digestEntry.findFirst({
      where: {
        conversationId: idx.conversationId,
        endTime: {
          gte: idx.createTime - this.duplicateWindowSeconds,
          lte: idx.createTime + this.duplicateWindowSeconds,
        },
      },
    })
    if (existing) {
      return null
    }

    try {
      return await this.generateForRange({
        conversationId: idx.conversationId,
        startTime: idx.createTime - this.autoWindowSeconds,
        endTime: idx.createTime,
      })
    } catch (error) {
      if (error instanceof DigestRangeTooSmallError) {
        return null
      }
      throw error
    }
  }

  private async renderMessage(idx: {
    msgId: string
    msgType: number
    fromUsername: string
    chatroomSender: string | null
    dataLakeKey: string
  }): Promise<string | null> {
    const sender = idx.chatroomSender || idx.fromUsername

    if (idx.msgType !== 1) {
      const placeholder = PLACEHOLDER_BY_TYPE[idx.msgType] ?? '[非文本消息]'
      return `${sender}: ${placeholder}`
    }

    let chat: ChatMessage
    try {
      chat = await this.dataLake.getMessage(idx.dataLakeKey)
    } catch {
      return null
    }

    const content = (chat.content || '').trim()
    if (!content) {
      return null
    }

    const truncated =
      content.length > this.perMessageMaxChars
        ? content.slice(0, this.perMessageMaxChars) + '…'
        : content
    return `${sender}: ${truncated}`
  }
}
