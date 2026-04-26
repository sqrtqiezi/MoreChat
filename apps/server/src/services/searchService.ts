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

export interface SearchResponse {
  results: SearchResult[]
  appliedType: SearchQuery['type']
  downgradedFrom?: Extract<SearchQuery['type'], 'semantic' | 'hybrid'>
}

export class SearchService {
  constructor(
    private duckdb: DuckDBService,
    private tokenizer: Tokenizer,
    private db: DatabaseService,
    private dataLake: DataLakeService,
    private embedding?: EmbeddingService
  ) {}

  async search(query: SearchQuery): Promise<SearchResponse> {
    const limit = query.limit ?? 20
    const offset = query.offset ?? 0
    const rankedCandidateCount = Math.max(limit + offset, 1)
    let msgIds: string[] = []
    let preserveCandidateOrder = false
    let appliedType: SearchQuery['type'] = query.type
    let downgradedFrom: SearchResponse['downgradedFrom']
    const keywordSearch = async (): Promise<string[]> => {
      const tokens = this.tokenizer.tokenizeAndJoin(query.q)
      const ftsResults = await this.duckdb.searchFTS(tokens)
      return ftsResults.map((result) => result.msgId)
    }
    const structuredFiltersPresent =
      query.important === true ||
      query.from !== undefined ||
      query.group !== undefined ||
      query.after !== undefined ||
      query.before !== undefined

    // Step 1: 根据搜索类型获取候选消息 ID
    if (query.type === 'keyword') {
      msgIds = await keywordSearch()
    } else if (query.type === 'semantic') {
      if (!this.embedding) {
        logger.warn('EmbeddingService unavailable for semantic search, falling back to keyword search')
        appliedType = 'keyword'
        downgradedFrom = 'semantic'
        msgIds = await keywordSearch()
      } else {
        const embedding = await this.embedding.generateEmbedding(query.q)
        msgIds = await this.collectRankedCandidates({
          initialCount: rankedCandidateCount,
          overfetch: structuredFiltersPresent,
          loadCandidates: async (count) => {
            const vectorResults = await this.duckdb.searchVector(embedding, count)
            return vectorResults.map((r) => r.msgId)
          },
          query,
        })
        preserveCandidateOrder = true
      }
    } else if (query.type === 'hybrid') {
      if (!this.embedding) {
        logger.warn('EmbeddingService unavailable for hybrid search, falling back to keyword search')
        appliedType = 'keyword'
        downgradedFrom = 'hybrid'
        msgIds = await keywordSearch()
      } else {
        const tokens = this.tokenizer.tokenizeAndJoin(query.q)
        const ftsResults = await this.duckdb.searchFTS(tokens)
        const embedding = await this.embedding.generateEmbedding(query.q)
        const ftsMsgIds = ftsResults.map((r) => r.msgId)
        msgIds = await this.collectRankedCandidates({
          initialCount: rankedCandidateCount,
          overfetch: structuredFiltersPresent,
          loadCandidates: async (count) => {
            const vectorResults = await this.duckdb.searchVector(embedding, count)
            const msgIdSet = new Set<string>()
            ftsMsgIds.forEach((msgId) => msgIdSet.add(msgId))
            vectorResults.forEach((result) => msgIdSet.add(result.msgId))
            return Array.from(msgIdSet)
          },
          query,
        })
        preserveCandidateOrder = true
      }
    }

    if (msgIds.length === 0) {
      return {
        results: [],
        appliedType,
        downgradedFrom,
      }
    }

    // Step 3: 从 SQLite MessageIndex 过滤
    const indexRecords = await this.filterRankedIndexRecords(msgIds, query)

    if (indexRecords.length === 0) {
      return {
        results: [],
        appliedType,
        downgradedFrom,
      }
    }

    const orderedIndexRecords = preserveCandidateOrder
      ? indexRecords.slice(offset, offset + limit)
      : indexRecords.slice(0, limit)

    // Step 4: 从 DataLake 获取完整消息内容
    const results: SearchResult[] = []
    for (const record of orderedIndexRecords) {
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

    if (orderedIndexRecords.length > 0 && results.length === 0) {
      throw new Error('Failed to retrieve search results from DataLake')
    }

    return {
      results,
      appliedType,
      downgradedFrom,
    }
  }

  private async collectRankedCandidates({
    initialCount,
    overfetch,
    loadCandidates,
    query,
  }: {
    initialCount: number
    overfetch: boolean
    loadCandidates: (count: number) => Promise<string[]>
    query: SearchQuery
  }): Promise<string[]> {
    let candidateCount = initialCount

    while (true) {
      const candidates = await loadCandidates(candidateCount)
      if (!overfetch || candidates.length === 0) {
        return candidates
      }

      const filteredRecords = await this.filterRankedIndexRecords(candidates, query)
      if (filteredRecords.length >= initialCount || candidates.length < candidateCount) {
        return candidates
      }

      candidateCount += initialCount
    }
  }

  private async filterRankedIndexRecords(msgIds: string[], query: SearchQuery) {
    const filteredMsgIds = query.important
      ? await this.filterImportantMessageIds(msgIds)
      : msgIds

    if (filteredMsgIds.length === 0) {
      return []
    }

    const where = this.buildIndexWhereClause(filteredMsgIds, query)
    const indexRecords = await this.db.prisma.messageIndex.findMany({
      where,
      ...(query.type === 'keyword'
        ? {
            take: query.limit ?? 20,
            skip: query.offset ?? 0,
            orderBy: { createTime: 'desc' },
          }
        : {}),
    })

    if (query.type === 'keyword') {
      return indexRecords
    }

    const recordsByMsgId = new Map(indexRecords.map((record) => [record.msgId, record]))
    return filteredMsgIds
      .map((msgId) => recordsByMsgId.get(msgId))
      .filter((record): record is (typeof indexRecords)[number] => record !== undefined)
  }

  private async filterImportantMessageIds(msgIds: string[]): Promise<string[]> {
    const importantTags = await this.db.prisma.messageTag.findMany({
      where: {
        msgId: { in: msgIds },
        tag: 'important',
      },
      select: { msgId: true },
    })
    const importantMsgIdSet = new Set(
      importantTags.map((tag: { msgId: string }) => tag.msgId)
    )
    return msgIds.filter((msgId) => importantMsgIdSet.has(msgId))
  }

  private buildIndexWhereClause(msgIds: string[], query: SearchQuery) {
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

    return where
  }
}
