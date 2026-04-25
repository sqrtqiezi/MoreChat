// ABOUTME: 根据重要性规则评估消息并生成重要标签
// ABOUTME: 支持规则缓存与批量写入 MessageTag

import { logger } from '../lib/logger.js'
import type { DatabaseService } from './database.js'

type RuleType = 'watchlist' | 'keyword' | 'mention'

interface ImportanceRuleRecord {
  type: string
  value: string
}

export interface MessageContext {
  msgId: string
  fromUsername: string
  toUsername: string
  content: string
  msgType: number
  currentUsername?: string
}

export interface MessageTagData {
  msgId: string
  tag: string
  source: string
}

const RULE_CACHE_TTL_MS = 60_000

function buildTagKey(tag: MessageTagData): string {
  return `${tag.msgId}:${tag.tag}:${tag.source}`
}

export class RuleEngine {
  private rulesCache: ImportanceRuleRecord[] | null = null
  private cacheExpiresAt = 0

  constructor(private db: DatabaseService) {}

  clearCache(): void {
    this.rulesCache = null
    this.cacheExpiresAt = 0
  }

  async evaluateMessage(context: MessageContext): Promise<MessageTagData[]> {
    if (context.msgType !== 1) {
      return []
    }

    const rules = await this.getActiveRules()
    if (rules.length === 0) {
      return []
    }

    const matchedSources = new Set<string>()

    for (const rule of rules) {
      if (this.isRuleMatched(rule, context)) {
        matchedSources.add(`rule:${rule.type}`)
      }
    }

    return Array.from(matchedSources).map((source) => ({
      msgId: context.msgId,
      tag: 'important',
      source,
    }))
  }

  async applyTags(tags: MessageTagData[]): Promise<number> {
    if (tags.length === 0) {
      return 0
    }

    try {
      const uniqueTags = Array.from(new Map(tags.map((tag) => [buildTagKey(tag), tag])).values())
      const existingTags = await this.db.prisma.messageTag.findMany({
        where: {
          OR: uniqueTags.map((tag) => ({
            msgId: tag.msgId,
            tag: tag.tag,
            source: tag.source,
          })),
        },
        select: {
          msgId: true,
          tag: true,
          source: true,
        },
      })
      const existingKeys = new Set(existingTags.map(buildTagKey))
      const newTags = uniqueTags.filter((tag) => !existingKeys.has(buildTagKey(tag)))

      if (newTags.length === 0) {
        return 0
      }

      const result = await this.db.prisma.messageTag.createMany({
        data: newTags,
      })

      return result.count
    } catch (error) {
      logger.error({ err: error, msgIds: tags.map((tag) => tag.msgId) }, '写入消息标签失败')
      throw error
    }
  }

  private async getActiveRules(): Promise<ImportanceRuleRecord[]> {
    const now = Date.now()
    if (this.rulesCache && now < this.cacheExpiresAt) {
      return this.rulesCache
    }

    try {
      const rules = await this.db.prisma.importanceRule.findMany({
        where: { isActive: true },
        select: {
          type: true,
          value: true,
        },
        orderBy: {
          priority: 'desc',
        },
      })

      this.rulesCache = rules
      this.cacheExpiresAt = now + RULE_CACHE_TTL_MS
      return rules
    } catch (error) {
      logger.error({ err: error }, '加载重要性规则失败')
      throw error
    }
  }

  private isRuleMatched(rule: ImportanceRuleRecord, context: MessageContext): boolean {
    const ruleType = rule.type as RuleType

    if (ruleType === 'watchlist') {
      return context.fromUsername === rule.value
    }

    if (ruleType === 'keyword') {
      const keyword = rule.value.trim()
      if (keyword === '') {
        return false
      }
      return context.content.includes(keyword)
    }

    if (ruleType === 'mention') {
      if (!context.currentUsername) {
        return false
      }
      return context.content.includes(`@${context.currentUsername}`)
    }

    return false
  }
}
