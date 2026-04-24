// ABOUTME: 统一搜索服务，协调 FTS 搜索、结构化过滤和 DataLake 消息检索
// ABOUTME: 支持关键词搜索，结合 DuckDB FTS 和 SQLite MessageIndex 过滤

import { logger } from '../lib/logger.js'
import type { DuckDBService } from './duckdbService.js'
import type { Tokenizer } from './tokenizer.js'
import type { DatabaseService } from './database.js'
import type { DataLakeService } from './dataLake.js'
import type { EmbeddingService } from './embeddingService.js'

export interface SearchQuery {
  q: string
  type: 'keyword' | 'semantic' | 'hybrid'
  from?: string
  group?: string
  after?: number
  before?: number
  important?: boolean
  tags?: string[]
  limit?: number
  offset?: number
}

export interface SearchResult {
  msgId: string
  content: string
  createTime: number
  fromUsername: string
  toUsername?: string
  conversationId?: string
}

export class SearchService {
  constructor(
    private duckdb: DuckDBService,
    private tokenizer: Tokenizer,
    private db: DatabaseService,
    private dataLake: DataLakeService,
    private embedding?: EmbeddingService
  ) {}

  async search(query: SearchQuery): Promise<SearchResult[]> {
    let msgIds: string[] = []

    // Step 1: 根据搜索类型获取候选消息 ID
    if (query.type === 'keyword') {
      const tokens = this.tokenizer.tokenizeAndJoin(query.q)
      const ftsResults = await this.duckdb.searchFTS(tokens)
      if (ftsResults.length === 0) {
        return []
      }
      msgIds = ftsResults.map((r) => r.msgId)
    } else if (query.type === 'semantic') {
      if (!this.embedding) {
        throw new Error('EmbeddingService is required for semantic search')
      }
      const embedding = await this.embedding.generateEmbedding(query.q)
      const vectorResults = await this.duckdb.searchVector(embedding, query.limit ?? 20)
      if (vectorResults.length === 0) {
        return []
      }
      msgIds = vectorResults.map((r) => r.msgId)
    } else if (query.type === 'hybrid') {
      if (!this.embedding) {
        throw new Error('EmbeddingService is required for hybrid search')
      }
      const tokens = this.tokenizer.tokenizeAndJoin(query.q)
      const ftsResults = await this.duckdb.searchFTS(tokens)
      const embedding = await this.embedding.generateEmbedding(query.q)
      const vectorResults = await this.duckdb.searchVector(embedding, query.limit ?? 20)

      const msgIdSet = new Set<string>()
      ftsResults.forEach((r) => msgIdSet.add(r.msgId))
      vectorResults.forEach((r) => msgIdSet.add(r.msgId))
      msgIds = Array.from(msgIdSet)

      if (msgIds.length === 0) {
        return []
      }
    }

    // Step 2: 构建结构化过滤条件
    const where: Record<string, unknown> = {
      msgId: { in: msgIds },
    }
    if (query.from) {
      where.fromUsername = query.from
    }
    if (query.group) {
      where.conversationId = query.group
    }
    if (query.after !== undefined || query.before !== undefined) {
      const timeFilter: Record<string, number> = {}
      if (query.after !== undefined) timeFilter.gte = query.after
      if (query.before !== undefined) timeFilter.lte = query.before
      where.createTime = timeFilter
    }

    // Step 3: 从 SQLite MessageIndex 过滤
    const indexRecords = await this.db.prisma.messageIndex.findMany({
      where,
      take: query.limit ?? 20,
      skip: query.offset ?? 0,
      orderBy: { createTime: 'desc' },
    })

    if (indexRecords.length === 0) {
      return []
    }

    // Step 4: 从 DataLake 获取完整消息内容
    const results: SearchResult[] = []
    for (const record of indexRecords) {
      try {
        const msg = await this.dataLake.getMessage(record.dataLakeKey)
        results.push({
          msgId: record.msgId,
          content: msg.content,
          createTime: record.createTime,
          fromUsername: record.fromUsername,
          toUsername: record.toUsername,
          conversationId: record.conversationId,
        })
      } catch (err) {
        logger.warn(`无法从 DataLake 获取消息 ${record.msgId}: ${err}`)
      }
    }

    return results
  }
}
