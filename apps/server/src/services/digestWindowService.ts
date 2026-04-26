// ABOUTME: Assembles digest windows from MessageIndex and DataLake for downstream summarization
// ABOUTME: Keeps rendering, placeholder handling, and truncation logic separate from DigestService

import type { DatabaseService } from './database.js'
import type { DataLakeService, ChatMessage } from './dataLake.js'

export interface DigestWindowServiceOptions {
  maxMessages?: number
  perMessageMaxChars?: number
}

export interface DigestWindowInput {
  conversationId: string
  startTime: number
  endTime: number
}

export interface DigestWindow {
  conversationId: string
  startTime: number
  endTime: number
  messageCount: number
  lines: string[]
}

const PLACEHOLDER_BY_TYPE: Record<number, string> = {
  3: '[图片]',
  34: '[语音]',
  43: '[视频]',
  47: '[表情]',
  49: '[应用消息]',
  10000: '[系统消息]',
}

export class DigestWindowService {
  private readonly maxMessages: number
  private readonly perMessageMaxChars: number

  constructor(
    private readonly db: DatabaseService,
    private readonly dataLake: DataLakeService,
    options: DigestWindowServiceOptions = {}
  ) {
    this.maxMessages = options.maxMessages ?? 50
    this.perMessageMaxChars = options.perMessageMaxChars ?? 200
  }

  async buildWindow(input: DigestWindowInput): Promise<DigestWindow> {
    const indexes = await this.db.prisma.messageIndex.findMany({
      where: {
        conversationId: input.conversationId,
        createTime: { gte: input.startTime, lte: input.endTime },
        isRecalled: false,
      },
      orderBy: { createTime: 'asc' },
      take: this.maxMessages,
    })

    const lines: string[] = []
    for (const idx of indexes) {
      const line = await this.renderMessage(idx)
      if (line) {
        lines.push(line)
      }
    }

    const startTime = indexes[0]?.createTime ?? input.startTime
    const endTime = indexes[indexes.length - 1]?.createTime ?? input.endTime

    return {
      conversationId: input.conversationId,
      startTime,
      endTime,
      messageCount: indexes.length,
      lines,
    }
  }

  private async renderMessage(idx: {
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
