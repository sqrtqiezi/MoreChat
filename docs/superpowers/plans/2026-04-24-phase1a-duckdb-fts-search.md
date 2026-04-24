# 阶段 1A：DuckDB 全文检索 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 MoreChat 添加基于 DuckDB FTS 的中文全文检索能力，实现关键词搜索 + 高级筛选 API

**Architecture:** 在现有消息入库流程中集成 DuckDB FTS 索引写入（jieba 预分词），新增 SearchService 统一搜索入口和 /api/search 路由。DuckDB 作为嵌入式数据库运行在 Node.js 进程内，索引是 DataLake 的派生数据。

**Tech Stack:** DuckDB (@duckdb/node-api, 已安装) + nodejieba (中文分词) + Hono (路由) + Vitest (测试)

**Spec:** `docs/superpowers/specs/2026-04-24-morechat-knowledge-base-redesign.md` 第三章

**Scope:** 本计划只覆盖 FTS 关键词搜索。向量搜索（VSS）将在阶段 1B 计划中实现。

---

## File Structure

```
apps/server/src/services/
  duckdbService.ts          - DuckDB 连接管理、schema 初始化、FTS 扩展加载
  duckdbService.test.ts     - DuckDB 服务测试
  tokenizer.ts              - jieba 中文分词封装
  tokenizer.test.ts         - 分词测试
  searchService.ts          - 统一搜索入口（FTS + 结构化筛选）
  searchService.test.ts     - 搜索服务测试
  message.ts                - 修改：消息入库时同步写入 DuckDB FTS
apps/server/src/routes/
  search.ts                 - 搜索 API 路由
  search.test.ts            - 搜索路由测试
apps/server/src/app.ts      - 修改：注册搜索路由
apps/server/src/index.ts    - 修改：初始化 DuckDB 服务并注入
apps/server/scripts/
  migrate-fts.ts            - 历史数据迁移脚本（DataLake → DuckDB FTS）
```

---

## Task 1: 安装依赖并配置 DuckDB

**Files:**
- Modify: `apps/server/package.json`

- [ ] **Step 1: 安装 nodejieba 依赖**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && pnpm add nodejieba
```

Expected: nodejieba 添加到 dependencies

- [ ] **Step 2: 验证 DuckDB 已安装**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && pnpm list @duckdb/node-api
```

Expected: 显示 @duckdb/node-api@1.4.4-r.3

- [ ] **Step 3: Commit**

```bash
git add apps/server/package.json apps/server/pnpm-lock.yaml
git commit -m "deps: add nodejieba for Chinese tokenization"
```

---

## Task 2: 创建 Tokenizer 服务（中文分词）

**Files:**
- Create: `apps/server/src/services/tokenizer.ts`
- Create: `apps/server/src/services/tokenizer.test.ts`

- [ ] **Step 1: 编写 tokenizer 测试**

```typescript
// apps/server/src/services/tokenizer.test.ts
import { describe, it, expect } from 'vitest'
import { Tokenizer } from './tokenizer.js'

describe('Tokenizer', () => {
  const tokenizer = new Tokenizer()

  it('should tokenize Chinese text', () => {
    const text = '我们讨论项目预算'
    const tokens = tokenizer.tokenize(text)
    
    expect(tokens).toContain('我们')
    expect(tokens).toContain('讨论')
    expect(tokens).toContain('项目')
    expect(tokens).toContain('预算')
  })

  it('should handle empty string', () => {
    const tokens = tokenizer.tokenize('')
    expect(tokens).toEqual([])
  })

  it('should handle mixed Chinese and English', () => {
    const text = '使用DuckDB进行搜索'
    const tokens = tokenizer.tokenize(text)
    
    expect(tokens.length).toBeGreaterThan(0)
    expect(tokens).toContain('使用')
    expect(tokens).toContain('DuckDB')
    expect(tokens).toContain('搜索')
  })

  it('should join tokens with space', () => {
    const text = '全文检索功能'
    const joined = tokenizer.tokenizeAndJoin(text)
    
    expect(joined).toContain(' ')
    expect(joined.split(' ').length).toBeGreaterThan(1)
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/tokenizer.test.ts
```

Expected: FAIL - Tokenizer not defined

- [ ] **Step 3: 实现 Tokenizer 服务**

```typescript
// apps/server/src/services/tokenizer.ts
import nodejieba from 'nodejieba'

export class Tokenizer {
  constructor() {
    // nodejieba 会自动加载默认词典
  }

  /**
   * 对文本进行中文分词
   * @param text 待分词的文本
   * @returns 分词结果数组
   */
  tokenize(text: string): string[] {
    if (!text || text.trim() === '') {
      return []
    }
    
    return nodejieba.cut(text)
  }

  /**
   * 对文本进行分词并用空格连接
   * @param text 待分词的文本
   * @returns 空格分隔的分词结果
   */
  tokenizeAndJoin(text: string): string {
    const tokens = this.tokenize(text)
    return tokens.join(' ')
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/tokenizer.test.ts
```

Expected: PASS - All tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/tokenizer.ts apps/server/src/services/tokenizer.test.ts
git commit -m "feat(search): add Tokenizer service for Chinese text segmentation"
```

---

## Task 3: 创建 DuckDB 服务（连接管理 + FTS schema）

**Files:**
- Create: `apps/server/src/services/duckdbService.ts`
- Create: `apps/server/src/services/duckdbService.test.ts`

- [ ] **Step 1: 编写 DuckDB 服务测试**

```typescript
// apps/server/src/services/duckdbService.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DuckDBService } from './duckdbService.js'
import fs from 'node:fs/promises'
import path from 'node:path'

describe('DuckDBService', () => {
  const testDbPath = path.join(process.cwd(), 'test-search.duckdb')
  let service: DuckDBService

  beforeEach(async () => {
    service = new DuckDBService({ dbPath: testDbPath })
    await service.connect()
  })

  afterEach(async () => {
    await service.close()
    await fs.unlink(testDbPath).catch(() => {})
    await fs.unlink(`${testDbPath}.wal`).catch(() => {})
  })

  it('should connect and initialize schema', async () => {
    const result = await service.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'message_fts'"
    )
    expect(result).toHaveLength(1)
  })

  it('should insert and query FTS data', async () => {
    await service.insertFTS({
      msgId: 'test-msg-1',
      contentTokens: '我们 讨论 项目 预算',
      createTime: 1714000000,
      fromUsername: 'user1',
      toUsername: 'user2'
    })

    const results = await service.searchFTS('预算')
    expect(results).toHaveLength(1)
    expect(results[0].msgId).toBe('test-msg-1')
  })

  it('should handle duplicate msgId gracefully', async () => {
    const record = {
      msgId: 'dup-1',
      contentTokens: '测试 消息',
      createTime: 1714000000,
      fromUsername: 'user1',
      toUsername: 'user2'
    }
    await service.insertFTS(record)
    await service.insertFTS(record) // should not throw
    
    const results = await service.searchFTS('测试')
    expect(results).toHaveLength(1)
  })

  it('should return empty for no matches', async () => {
    const results = await service.searchFTS('不存在')
    expect(results).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/duckdbService.test.ts
```

Expected: FAIL - DuckDBService not defined

- [ ] **Step 3: 实现 DuckDB 服务**

```typescript
// apps/server/src/services/duckdbService.ts
import Database from '@duckdb/node-api'
import { logger } from '../lib/logger.js'

export interface DuckDBConfig {
  dbPath: string
}

export interface FTSRecord {
  msgId: string
  contentTokens: string
  createTime: number
  fromUsername: string
  toUsername: string
}

export interface FTSSearchResult {
  msgId: string
  contentTokens: string
  createTime: number
  fromUsername: string
  toUsername: string
}

export class DuckDBService {
  private db: Database | null = null
  private config: DuckDBConfig

  constructor(config: DuckDBConfig) {
    this.config = config
  }

  async connect(): Promise<void> {
    try {
      this.db = await Database.create(this.config.dbPath)
      logger.info({ dbPath: this.config.dbPath }, 'DuckDB connected')

      await this.loadExtensions()
      await this.initSchema()
    } catch (error) {
      logger.error({ err: error }, 'Failed to connect to DuckDB')
      throw error
    }
  }

  private async loadExtensions(): Promise<void> {
    if (!this.db) throw new Error('Database not connected')

    const conn = await this.db.connect()
    try {
      await conn.run('INSTALL fts')
      await conn.run('LOAD fts')
      logger.info('DuckDB FTS extension loaded')
    } finally {
      await conn.close()
    }
  }

  private async initSchema(): Promise<void> {
    if (!this.db) throw new Error('Database not connected')

    const conn = await this.db.connect()
    try {
      await conn.run(`
        CREATE TABLE IF NOT EXISTS message_fts (
          msg_id VARCHAR PRIMARY KEY,
          content_tokens VARCHAR,
          create_time BIGINT,
          from_username VARCHAR,
          to_username VARCHAR
        )
      `)

      await conn.run(`
        CREATE INDEX IF NOT EXISTS idx_fts 
        ON message_fts 
        USING FTS(content_tokens)
      `)

      logger.info('DuckDB schema initialized')
    } finally {
      await conn.close()
    }
  }

  async query(sql: string, params?: any[]): Promise<any[]> {
    if (!this.db) throw new Error('Database not connected')

    const conn = await this.db.connect()
    try {
      const stmt = await conn.prepare(sql)
      if (params && params.length > 0) {
        const result = await stmt.run(...params)
        return result.toArray().map(row => row.toJSON())
      } else {
        const result = await stmt.run()
        return result.toArray().map(row => row.toJSON())
      }
    } finally {
      await conn.close()
    }
  }

  async insertFTS(record: FTSRecord): Promise<void> {
    const sql = `
      INSERT INTO message_fts (msg_id, content_tokens, create_time, from_username, to_username)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (msg_id) DO NOTHING
    `
    await this.query(sql, [
      record.msgId,
      record.contentTokens,
      record.createTime,
      record.fromUsername,
      record.toUsername
    ])
  }

  async searchFTS(keyword: string): Promise<FTSSearchResult[]> {
    const sql = `
      SELECT msg_id, content_tokens, create_time, from_username, to_username
      FROM message_fts
      WHERE content_tokens LIKE ?
      ORDER BY create_time DESC
      LIMIT 100
    `
    const results = await this.query(sql, [`%${keyword}%`])
    
    return results.map((row: any) => ({
      msgId: row.msg_id,
      contentTokens: row.content_tokens,
      createTime: row.create_time,
      fromUsername: row.from_username,
      toUsername: row.to_username
    }))
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close()
      this.db = null
      logger.info('DuckDB connection closed')
    }
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/duckdbService.test.ts
```

Expected: PASS - All tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/duckdbService.ts apps/server/src/services/duckdbService.test.ts
git commit -m "feat(search): add DuckDB service with FTS support"
```

---

## Task 4: 创建 SearchService（统一搜索入口）

**Files:**
- Create: `apps/server/src/services/searchService.ts`
- Create: `apps/server/src/services/searchService.test.ts`

- [ ] **Step 1: 编写 SearchService 测试**

```typescript
// apps/server/src/services/searchService.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SearchService } from './searchService.js'
import { DuckDBService } from './duckdbService.js'
import { Tokenizer } from './tokenizer.js'
import type { DatabaseService } from './database.js'
import type { DataLakeService } from './dataLake.js'

describe('SearchService', () => {
  let searchService: SearchService
  let mockDuckDB: any
  let mockTokenizer: any
  let mockDatabase: any
  let mockDataLake: any

  beforeEach(() => {
    mockDuckDB = {
      searchFTS: vi.fn()
    }
    mockTokenizer = {
      tokenizeAndJoin: vi.fn()
    }
    mockDatabase = {
      prisma: {
        messageIndex: {
          findMany: vi.fn()
        }
      }
    }
    mockDataLake = {
      getMessage: vi.fn()
    }

    searchService = new SearchService(
      mockDuckDB as any,
      mockTokenizer as any,
      mockDatabase as any,
      mockDataLake as any
    )
  })

  it('should search with keyword only', async () => {
    mockTokenizer.tokenizeAndJoin.mockReturnValue('项目 预算')
    mockDuckDB.searchFTS.mockResolvedValue([
      { msgId: 'msg1', createTime: 1714000000 }
    ])
    mockDataLake.getMessage.mockResolvedValue({
      msg_id: 'msg1',
      content: '讨论项目预算'
    })

    const results = await searchService.search({ q: '项目预算', type: 'keyword' })

    expect(mockTokenizer.tokenizeAndJoin).toHaveBeenCalledWith('项目预算')
    expect(mockDuckDB.searchFTS).toHaveBeenCalledWith('项目 预算')
    expect(results).toHaveLength(1)
    expect(results[0].msgId).toBe('msg1')
  })

  it('should combine keyword search with filters', async () => {
    mockTokenizer.tokenizeAndJoin.mockReturnValue('预算')
    mockDuckDB.searchFTS.mockResolvedValue([
      { msgId: 'msg1', createTime: 1714000000 },
      { msgId: 'msg2', createTime: 1714000100 }
    ])
    mockDatabase.prisma.messageIndex.findMany.mockResolvedValue([
      { msgId: 'msg1' }
    ])
    mockDataLake.getMessage.mockResolvedValue({
      msg_id: 'msg1',
      content: '预算讨论'
    })

    const results = await searchService.search({
      q: '预算',
      type: 'keyword',
      from: 'user1'
    })

    expect(results).toHaveLength(1)
    expect(results[0].msgId).toBe('msg1')
  })

  it('should handle empty results', async () => {
    mockTokenizer.tokenizeAndJoin.mockReturnValue('不存在')
    mockDuckDB.searchFTS.mockResolvedValue([])

    const results = await searchService.search({ q: '不存在', type: 'keyword' })

    expect(results).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/searchService.test.ts
```

Expected: FAIL - SearchService not defined

- [ ] **Step 3: 实现 SearchService**

```typescript
// apps/server/src/services/searchService.ts
import type { DuckDBService } from './duckdbService.js'
import type { Tokenizer } from './tokenizer.js'
import type { DatabaseService } from './database.js'
import type { DataLakeService } from './dataLake.js'
import { logger } from '../lib/logger.js'

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
    private dataLake: DataLakeService
  ) {}

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const { q, type, from, group, after, before, limit = 20, offset = 0 } = query

    // Step 1: 关键词搜索（DuckDB FTS）
    const tokens = this.tokenizer.tokenizeAndJoin(q)
    const ftsResults = await this.duckdb.searchFTS(tokens)
    
    if (ftsResults.length === 0) {
      return []
    }

    // Step 2: 结构化筛选（SQLite MessageIndex）
    let msgIds = ftsResults.map(r => r.msgId)
    
    if (from || group || after || before) {
      const filtered = await this.db.prisma.messageIndex.findMany({
        where: {
          msgId: { in: msgIds },
          ...(from && { fromUsername: from }),
          ...(group && { toUsername: group }),
          ...(after && { createTime: { gte: after } }),
          ...(before && { createTime: { lte: before } })
        },
        select: { msgId: true }
      })
      msgIds = filtered.map(m => m.msgId)
    }

    // Step 3: 从 DataLake 获取完整消息
    const messages = await Promise.all(
      msgIds.slice(offset, offset + limit).map(async (msgId) => {
        try {
          const msg = await this.dataLake.getMessage(msgId)
          return {
            msgId: msg.msg_id,
            content: msg.content || '',
            createTime: msg.create_time,
            fromUsername: msg.from_username,
            toUsername: msg.to_username,
            conversationId: msg.conversation_id
          }
        } catch (error) {
          logger.warn({ msgId, err: error }, 'Failed to fetch message from DataLake')
          return null
        }
      })
    )

    return messages.filter((m): m is SearchResult => m !== null)
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/searchService.test.ts
```

Expected: PASS - All tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/searchService.ts apps/server/src/services/searchService.test.ts
git commit -m "feat(search): add SearchService for unified search"
```

---

## Task 5: 集成 DuckDB 索引到消息入库流程

**Files:**
- Modify: `apps/server/src/services/message.ts:56-170`
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: 在 index.ts 中初始化 DuckDB 和 Tokenizer**

```typescript
// apps/server/src/index.ts
// 在现有的服务初始化代码后添加

import { DuckDBService } from './services/duckdbService.js'
import { Tokenizer } from './services/tokenizer.js'
import path from 'node:path'

// 初始化 DuckDB
const duckdbService = new DuckDBService({
  dbPath: path.join(process.cwd(), 'data', 'search.duckdb')
})
await duckdbService.connect()

// 初始化 Tokenizer
const tokenizer = new Tokenizer()

// 将 duckdbService 和 tokenizer 添加到 deps 对象
const deps = {
  // ... 现有的依赖
  duckdbService,
  tokenizer
}
```

- [ ] **Step 2: 修改 MessageService 构造函数接受新依赖**

```typescript
// apps/server/src/services/message.ts
// 在构造函数中添加新参数

import type { DuckDBService } from './duckdbService.js'
import type { Tokenizer } from './tokenizer.js'

export class MessageService {
  constructor(
    private db: DatabaseService,
    private dataLake: DataLakeService,
    private adapter: JuhexbotAdapter,
    private imageService: ImageService,
    private fileService: FileService,
    private duckdb: DuckDBService,
    private tokenizer: Tokenizer
  ) {}
  
  // ... 其余代码
}
```

- [ ] **Step 3: 在 handleIncomingMessage 中添加 DuckDB 索引写入**

在 `apps/server/src/services/message.ts` 的 `handleIncomingMessage` 方法中，在创建 MessageIndex 之后添加：

```typescript
// 在第 121 行之后（createMessageIndex 之后）添加

// 写入 DuckDB FTS 索引
try {
  const contentTokens = this.tokenizer.tokenizeAndJoin(message.content || '')
  await this.duckdb.insertFTS({
    msgId: message.msgId,
    contentTokens,
    createTime: message.createTime,
    fromUsername: message.fromUsername,
    toUsername: message.toUsername || ''
  })
} catch (error) {
  logger.warn({ msgId: message.msgId, err: error }, 'Failed to index message in DuckDB')
}
```

- [ ] **Step 4: 更新 index.ts 中的 MessageService 实例化**

```typescript
// apps/server/src/index.ts
// 修改 MessageService 的实例化，添加新参数

const messageService = new MessageService(
  databaseService,
  dataLakeService,
  juhexbotAdapter,
  imageService,
  fileService,
  duckdbService,
  tokenizer
)
```

- [ ] **Step 5: 运行现有测试验证没有破坏**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/message.test.ts
```

Expected: PASS - 现有测试仍然通过

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/services/message.ts apps/server/src/index.ts
git commit -m "feat(search): integrate DuckDB FTS indexing into message ingestion"
```

---

## Task 6: 创建搜索 API 路由

**Files:**
- Create: `apps/server/src/routes/search.ts`
- Create: `apps/server/src/routes/search.test.ts`
- Modify: `apps/server/src/app.ts`

- [ ] **Step 1: 编写搜索路由测试**

```typescript
// apps/server/src/routes/search.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono } from 'hono'
import { searchRoutes } from './search.js'

describe('Search Routes', () => {
  let app: Hono
  let mockSearchService: any

  beforeEach(() => {
    mockSearchService = {
      search: vi.fn()
    }

    app = new Hono()
    app.route('/api', searchRoutes({ searchService: mockSearchService }))
  })

  it('GET /api/search should return search results', async () => {
    mockSearchService.search.mockResolvedValue([
      {
        msgId: 'msg1',
        content: '讨论项目预算',
        createTime: 1714000000,
        fromUsername: 'user1'
      }
    ])

    const res = await app.request('/api/search?q=预算&type=keyword')
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.results).toHaveLength(1)
    expect(json.results[0].msgId).toBe('msg1')
  })

  it('should handle missing query parameter', async () => {
    const res = await app.request('/api/search?type=keyword')
    expect(res.status).toBe(400)
  })

  it('should support pagination', async () => {
    mockSearchService.search.mockResolvedValue([])

    const res = await app.request('/api/search?q=test&type=keyword&limit=10&offset=20')
    
    expect(mockSearchService.search).toHaveBeenCalledWith(
      expect.objectContaining({
        q: 'test',
        limit: 10,
        offset: 20
      })
    )
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/routes/search.test.ts
```

Expected: FAIL - searchRoutes not defined

- [ ] **Step 3: 实现搜索路由**

```typescript
// apps/server/src/routes/search.ts
import { Hono } from 'hono'
import type { SearchService } from '../services/searchService.js'
import { z } from 'zod'

const searchQuerySchema = z.object({
  q: z.string().min(1),
  type: z.enum(['keyword', 'semantic', 'hybrid']).default('keyword'),
  from: z.string().optional(),
  group: z.string().optional(),
  after: z.coerce.number().optional(),
  before: z.coerce.number().optional(),
  important: z.coerce.boolean().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0)
})

interface SearchDeps {
  searchService: SearchService
}

export function searchRoutes(deps: SearchDeps) {
  const app = new Hono()

  app.get('/search', async (c) => {
    const rawQuery = c.req.query()
    
    const parsed = searchQuerySchema.safeParse(rawQuery)
    if (!parsed.success) {
      return c.json({ error: 'Invalid query parameters', details: parsed.error }, 400)
    }

    const results = await deps.searchService.search(parsed.data)
    
    return c.json({
      results,
      total: results.length,
      query: parsed.data
    })
  })

  return app
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/routes/search.test.ts
```

Expected: PASS - All tests pass

- [ ] **Step 5: 在 app.ts 中注册搜索路由**

```typescript
// apps/server/src/app.ts
// 在现有路由注册后添加

import { searchRoutes } from './routes/search.js'

// 在 createApp 函数中
app.route('/api', searchRoutes({ searchService: deps.searchService }))
```

- [ ] **Step 6: 在 index.ts 中初始化 SearchService**

```typescript
// apps/server/src/index.ts
// 在初始化其他服务后添加

import { SearchService } from './services/searchService.js'

const searchService = new SearchService(
  duckdbService,
  tokenizer,
  databaseService,
  dataLakeService
)

// 添加到 deps 对象
const deps = {
  // ... 现有依赖
  searchService
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/routes/search.ts apps/server/src/routes/search.test.ts apps/server/src/app.ts apps/server/src/index.ts
git commit -m "feat(search): add search API routes"
```

---

## Task 7: 编写历史数据迁移脚本

**Files:**
- Create: `apps/server/scripts/migrate-fts.ts`

- [ ] **Step 1: 创建迁移脚本**

```typescript
// apps/server/scripts/migrate-fts.ts
import { DuckDBService } from '../src/services/duckdbService.js'
import { Tokenizer } from '../src/services/tokenizer.js'
import { DataLakeService } from '../src/services/dataLake.js'
import { DatabaseService } from '../src/services/database.js'
import path from 'node:path'
import { logger } from '../src/lib/logger.js'

async function migrate() {
  logger.info('Starting FTS migration...')

  const duckdb = new DuckDBService({
    dbPath: path.join(process.cwd(), 'data', 'search.duckdb')
  })
  await duckdb.connect()

  const tokenizer = new Tokenizer()
  const db = new DatabaseService()
  const dataLake = new DataLakeService({ path: path.join(process.cwd(), 'data', 'datalake') })

  let processed = 0
  let failed = 0
  const batchSize = 100

  try {
    const totalCount = await db.prisma.messageIndex.count()
    logger.info({ totalCount }, 'Total messages to migrate')

    let offset = 0
    while (offset < totalCount) {
      const batch = await db.prisma.messageIndex.findMany({
        take: batchSize,
        skip: offset,
        orderBy: { createTime: 'asc' }
      })

      for (const msgIndex of batch) {
        try {
          const message = await dataLake.getMessage(msgIndex.msgId)
          const contentTokens = tokenizer.tokenizeAndJoin(message.content || '')

          await duckdb.insertFTS({
            msgId: msgIndex.msgId,
            contentTokens,
            createTime: msgIndex.createTime,
            fromUsername: msgIndex.fromUsername,
            toUsername: msgIndex.toUsername
          })

          processed++
          if (processed % 100 === 0) {
            logger.info({ processed, total: totalCount }, 'Migration progress')
          }
        } catch (error) {
          failed++
          logger.warn({ msgId: msgIndex.msgId, err: error }, 'Failed to migrate message')
        }
      }

      offset += batchSize
    }

    logger.info({ processed, failed }, 'Migration completed')
  } finally {
    await duckdb.close()
  }
}

migrate().catch((error) => {
  logger.error({ err: error }, 'Migration failed')
  process.exit(1)
})
```

- [ ] **Step 2: 添加 npm script**

在 `apps/server/package.json` 的 scripts 中添加：

```json
"migrate:fts": "tsx scripts/migrate-fts.ts"
```

- [ ] **Step 3: 测试迁移脚本（dry run）**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && pnpm migrate:fts
```

Expected: 脚本运行成功，输出迁移进度

- [ ] **Step 4: Commit**

```bash
git add apps/server/scripts/migrate-fts.ts apps/server/package.json
git commit -m "feat(search): add historical data migration script for FTS"
```

---

## Self-Review Checklist

- [x] **Spec coverage**: 所有阶段 1A 的需求都已覆盖
  - ✅ DuckDB + FTS 扩展集成
  - ✅ 中文分词管道（jieba）
  - ✅ 消息入库时同步写入 FTS 索引
  - ✅ SearchService 统一搜索入口
  - ✅ 关键词搜索 + 高级筛选 API
  - ✅ 历史数据迁移脚本

- [x] **No placeholders**: 所有代码都是完整的，没有 TBD/TODO

- [x] **Type consistency**: 
  - FTSRecord 和 FTSSearchResult 接口在 DuckDBService 中定义
  - SearchQuery 和 SearchResult 接口在 SearchService 中定义
  - 所有方法签名一致

- [x] **File paths**: 所有文件路径都是绝对路径或明确的相对路径

---

## 执行选项

计划已完成并保存到 `docs/superpowers/plans/2026-04-24-phase1a-duckdb-fts-search.md`。

**两种执行方式：**

**1. Subagent-Driven（推荐）** - 每个任务派发新的 subagent，任务间审查，快速迭代

**2. Inline Execution** - 在当前会话中使用 executing-plans 执行，批量执行带检查点

选择哪种方式？
