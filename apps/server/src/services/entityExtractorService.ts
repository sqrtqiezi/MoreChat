// ABOUTME: 从中文消息中提取结构化实体（人物/项目/日期/金额/待办事项）
// ABOUTME: 使用正则表达式和联系人匹配，无需外部模型

import { logger } from '../lib/logger.js'
import type { DatabaseService } from './database.js'

export type EntityType = 'person' | 'project' | 'date' | 'amount' | 'action_item'

export interface ExtractedEntity {
  type: EntityType
  value: string
}

interface ContactEntry {
  nickname: string
  remark: string | null
}

const PROJECT_PATTERNS = [
  /「([^」]+)」/g,
  /《([^》]+)》/g,
  /【([^】]+)】/g,
]

const DATE_PATTERNS = [
  /\d{4}-\d{2}-\d{2}/g,
  /\d{1,2}月\d{1,2}日/g,
  /今天|明天|后天|昨天|前天/g,
  /下周|上周|本周|下个月|上个月|本月/g,
  /\d+月份?/g,
]

const AMOUNT_PATTERNS = [
  /¥[\d,]+(?:\.\d+)?/g,
  /\d+(?:\.\d+)?万/g,
  /\d+(?:\.\d+)?元/g,
]

const ACTION_PREFIXES = ['请', '麻烦', '记得', '需要', '帮忙', '务必', '一定要', '别忘了']

export class EntityExtractorService {
  private contacts: ContactEntry[] = []

  constructor(private readonly db: DatabaseService) {}

  async refreshContacts(): Promise<void> {
    try {
      const rows = await this.db.prisma.contact.findMany({
        select: { nickname: true, remark: true },
      })
      this.contacts = rows
      logger.debug({ count: rows.length }, 'EntityExtractorService: contacts loaded')
    } catch (err) {
      logger.error({ err }, 'EntityExtractorService: failed to load contacts')
      this.contacts = []
    }
  }

  async extract(text: string): Promise<ExtractedEntity[]> {
    const seen = new Set<string>()
    const results: ExtractedEntity[] = []

    const add = (type: EntityType, value: string) => {
      const key = `${type}:${value}`
      if (!seen.has(key)) {
        seen.add(key)
        results.push({ type, value })
      }
    }

    this.extractPersons(text, add)
    this.extractByPatterns(text, PROJECT_PATTERNS, 'project', add)
    this.extractDates(text, add)
    this.extractAmounts(text, add)
    this.extractActionItems(text, add)

    return results
  }

  private extractPersons(text: string, add: (type: EntityType, value: string) => void) {
    // @mentions
    const mentionRe = /@([一-龥a-zA-Z0-9_]+)/g
    for (const match of text.matchAll(mentionRe)) {
      add('person', match[1])
    }

    // contact nickname / remark matching
    for (const contact of this.contacts) {
      if (contact.nickname && text.includes(contact.nickname)) {
        add('person', contact.nickname)
      }
      if (contact.remark && text.includes(contact.remark)) {
        add('person', contact.remark)
      }
    }
  }

  private extractByPatterns(
    text: string,
    patterns: RegExp[],
    type: EntityType,
    add: (type: EntityType, value: string) => void,
  ) {
    for (const pattern of patterns) {
      const re = new RegExp(pattern.source, pattern.flags)
      for (const match of text.matchAll(re)) {
        add(type, match[1] ?? match[0])
      }
    }
  }

  private extractDates(text: string, add: (type: EntityType, value: string) => void) {
    for (const pattern of DATE_PATTERNS) {
      const re = new RegExp(pattern.source, pattern.flags)
      for (const match of text.matchAll(re)) {
        add('date', match[0])
      }
    }
  }

  private extractAmounts(text: string, add: (type: EntityType, value: string) => void) {
    for (const pattern of AMOUNT_PATTERNS) {
      const re = new RegExp(pattern.source, pattern.flags)
      for (const match of text.matchAll(re)) {
        add('amount', match[0])
      }
    }
  }

  private extractActionItems(text: string, add: (type: EntityType, value: string) => void) {
    const lines = text.split(/\n|。|；|;/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (ACTION_PREFIXES.some(prefix => trimmed.startsWith(prefix))) {
        add('action_item', trimmed)
      }
    }
  }
}
