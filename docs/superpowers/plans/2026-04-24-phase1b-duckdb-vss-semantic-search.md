# 阶段 1B：DuckDB VSS 向量语义搜索 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 MoreChat 添加基于 DuckDB VSS 的向量语义搜索能力，用户可以用自然语言查询历史消息

**Architecture:** 使用 Transformers.js 在 Node.js 进程内加载 bge-small-zh-v1.5 ONNX 模型生成 512 维向量，存入 DuckDB message_vectors 表并建立 HNSW 索引。扩展现有 SearchService 支持 semantic 和 hybrid 搜索类型。向量生成通过异步队列处理，不阻塞消息入库。

**Tech Stack:** DuckDB VSS 扩展 + Transformers.js (@huggingface/transformers) + bge-small-zh-v1.5 (512 维) + 现有 DuckDBService/SearchService

**Spec:** `docs/superpowers/specs/2026-04-24-morechat-knowledge-base-redesign.md` 第三章 3.1-3.3

**依赖阶段 1A：** DuckDBService、Tokenizer、SearchService、搜索路由均已就绪

---

## File Structure

```
apps/server/src/services/
  embeddingService.ts       - 向量嵌入生成（Transformers.js + bge-small-zh）
  embeddingService.test.ts  - 嵌入服务测试
  duckdbService.ts          - 修改：新增 message_vectors 表、VSS 扩展、向量搜索方法
  duckdbService.test.ts     - 修改：新增向量搜索测试
  searchService.ts          - 修改：支持 semantic/hybrid 搜索类型
  searchService.test.ts     - 修改：新增语义搜索测试
  embeddingQueue.ts         - 异步向量生成队列
  embeddingQueue.test.ts    - 队列测试
  message.ts                - 修改：消息入库时入队向量生成
  index.ts                  - 修改：初始化 EmbeddingService 和队列
apps/server/scripts/
  migrate-vectors.ts        - 历史消息向量迁移脚本
```

---

## Task 1: 安装依赖并验证 DuckDB VSS 扩展

**Files:**
- Modify: `apps/server/package.json`

- [ ] **Step 1: 安装 Transformers.js**

```bash
pnpm add @huggingface/transformers
```

Expected: @huggingface/transformers 添加到 dependencies

- [ ] **Step 2: 验证 DuckDB 版本支持 VSS**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && pnpm list @duckdb/node-api
```

Expected: 显示 @duckdb/node-api@1.4.4-r.3 (支持 VSS 扩展)

- [ ] **Step 3: Commit**

```bash
git add apps/server/package.json apps/server/pnpm-lock.yaml
git commit -m "deps: add @huggingface/transformers for embedding generation"
```

---

## Task 2: 创建 EmbeddingService（向量嵌入生成）

**Files:**
- Create: `apps/server/src/services/embeddingService.ts`
- Create: `apps/server/src/services/embeddingService.test.ts`

- [ ] **Step 1: 编写 EmbeddingService 测试**

```typescript
// apps/server/src/services/embeddingService.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { EmbeddingService } from './embeddingService.js'

describe('EmbeddingService', () => {
  let service: EmbeddingService

  beforeAll(async () => {
    service = new EmbeddingService()
    await service.initialize()
  }, 60000) // 模型加载可能需要时间

  it('should generate 512-dimensional embeddings', async () => {
    const text = '这是一个测试文本'
    const embedding = await service.generateEmbedding(text)
    
    expect(embedding).toHaveLength(512)
    expect(embedding.every(n => typeof n === 'number')).toBe(true)
  })

  it('should generate consistent embeddings for same text', async () => {
    const text = '测试一致性'
    const embedding1 = await service.generateEmbedding(text)
    const embedding2 = await service.generateEmbedding(text)
    
    expect(embedding1).toEqual(embedding2)
  })

  it('should handle empty text', async () => {
    const embedding = await service.generateEmbedding('')
    expect(embedding).toHaveLength(512)
  })

  it('should generate different embeddings for different texts', async () => {
    const embedding1 = await service.generateEmbedding('苹果')
    const embedding2 = await service.generateEmbedding('香蕉')
    
    expect(embedding1).not.toEqual(embedding2)
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/embeddingService.test.ts
```

Expected: FAIL - EmbeddingService not defined

- [ ] **Step 3: 实现 EmbeddingService**

```typescript
// apps/server/src/services/embeddingService.ts
import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers'
import { logger } from '../lib/logger.js'

export class EmbeddingService {
  private extractor: FeatureExtractionPipeline | null = null
  private readonly modelId = 'Xenova/bge-small-zh-v1.5'

  async initialize(): Promise<void> {
    try {
      logger.info(`加载嵌入模型: ${this.modelId}`)
      this.extractor = await pipeline('feature-extraction', this.modelId)
      logger.info('嵌入模型加载完成')
    } catch (error) {
      logger.error('嵌入模型加载失败', error)
      throw error
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.extractor) {
      throw new Error('EmbeddingService not initialized')
    }

    try {
      const output = await this.extractor(text, {
        pooling: 'mean',
        normalize: true
      })
      
      // output 是一个 Tensor，需要转换为普通数组
      const embedding = Array.from(output.data as Float32Array)
      
      return embedding
    } catch (error) {
      logger.error(`生成嵌入向量失败: ${text.substring(0, 50)}`, error)
      throw error
    }
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(text => this.generateEmbedding(text)))
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/embeddingService.test.ts
```

Expected: PASS - All tests pass (注意：首次运行会下载模型，需要时间)

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/embeddingService.ts apps/server/src/services/embeddingService.test.ts
git commit -m "feat(search): add EmbeddingService for vector generation"
```

---

## Task 3: 扩展 DuckDBService 支持向量存储和搜索

**Files:**
- Modify: `apps/server/src/services/duckdbService.ts`
- Modify: `apps/server/src/services/duckdbService.test.ts`

- [ ] **Step 1: 在 duckdbService.test.ts 中添加向量搜索测试**

在现有测试文件末尾添加新的 describe 块：

```typescript
// apps/server/src/services/duckdbService.test.ts
// 在文件末尾添加

describe('DuckDBService - Vector Search', () => {
  const testDbPath = path.join(process.cwd(), 'test-search-vss.duckdb')
  let service: DuckDBService

  beforeEach(async () => {
    service = new DuckDBService({ dbPath: testDbPath })
    await service.initialize()
  })

  afterEach(async () => {
    await service.close()
    await fs.unlink(testDbPath).catch(() => {})
    await fs.unlink(`${testDbPath}.wal`).catch(() => {})
  })

  it('should create message_vectors table', async () => {
    const result = await service.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'message_vectors'"
    )
    expect(result).toHaveLength(1)
  })

  it('should insert and query vector data', async () => {
    const embedding = new Array(512).fill(0).map((_, i) => i / 512)
    
    await service.insertVector({
      msgId: 'vec-msg-1',
      embedding,
      createTime: 1714000000
    })

    const results = await service.searchVector(embedding, 5)
    expect(results).toHaveLength(1)
    expect(results[0].msgId).toBe('vec-msg-1')
  })

  it('should handle duplicate msgId in vectors', async () => {
    const embedding = new Array(512).fill(0.5)
    const record = {
      msgId: 'dup-vec-1',
      embedding,
      createTime: 1714000000
    }
    
    await service.insertVector(record)
    await service.insertVector(record)
    
    const results = await service.searchVector(embedding, 5)
    expect(results).toHaveLength(1)
  })

  it('should return top-k similar vectors', async () => {
    await service.insertVector({
      msgId: 'vec-1',
      embedding: new Array(512).fill(1.0),
      createTime: 1714000000
    })
    await service.insertVector({
      msgId: 'vec-2',
      embedding: new Array(512).fill(0.5),
      createTime: 1714000100
    })
    await service.insertVector({
      msgId: 'vec-3',
      embedding: new Array(512).fill(0.0),
      createTime: 1714000200
    })

    const queryVec = new Array(512).fill(1.0)
    const results = await service.searchVector(queryVec, 2)
    
    expect(results).toHaveLength(2)
    expect(results[0].msgId).toBe('vec-1')
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/duckdbService.test.ts
```

Expected: FAIL - insertVector/searchVector methods not defined

- [ ] **Step 3: 扩展 DuckDBService 实现向量功能**

在 `apps/server/src/services/duckdbService.ts` 中添加接口和方法。

首先在文件顶部添加新接口：

```typescript
export interface VectorRecord {
  msgId: string
  embedding: number[]
  createTime: number
}

export interface VectorSearchResult {
  msgId: string
  distance: number
  createTime: number
}
```

然后修改 `createSchema` 方法，在创建 FTS 表后添加向量表和索引：

```typescript
private async createSchema(): Promise<void> {
  // 创建 FTS 表（已有代码保持不变）
  await this.connection!.run(`
    CREATE TABLE IF NOT EXISTS message_fts (
      msg_id VARCHAR PRIMARY KEY,
      content_tokens VARCHAR,
      create_time BIGINT,
      from_username VARCHAR,
      to_username VARCHAR
    )
  `)

  // 加载 VSS 扩展
  try {
    await this.connection!.run(`INSTALL vss`)
    await this.connection!.run(`LOAD vss`)
    logger.info('DuckDB VSS 扩展已加载')
  } catch (error) {
    logger.warn('VSS 扩展加载失败，向量搜索将不可用', error)
  }

  // 创建向量表
  await this.connection!.run(`
    CREATE TABLE IF NOT EXISTS message_vectors (
      msg_id VARCHAR PRIMARY KEY,
      embedding FLOAT[512],
      create_time BIGINT
    )
  `)

  // 创建 HNSW 索引
  try {
    await this.connection!.run(`
      CREATE INDEX IF NOT EXISTS idx_vector 
      ON message_vectors 
      USING HNSW (embedding)
      WITH (metric = 'cosine')
    `)
    logger.info('DuckDB 向量索引已创建')
  } catch (error) {
    logger.warn('HNSW 索引创建失败', error)
  }
}
```

最后在类的末尾添加新方法：

```typescript
async insertVector(record: VectorRecord): Promise<void> {
  const embeddingStr = `[${record.embedding.join(',')}]::FLOAT[512]`
  
  await this.connection!.run(
    `INSERT INTO message_vectors (msg_id, embedding, create_time)
     VALUES ($1, ${embeddingStr}, $2)
     ON CONFLICT (msg_id) DO NOTHING`,
    [record.msgId, BigInt(record.createTime)]
  )
}

async searchVector(queryVector: number[], topK: number = 10): Promise<VectorSearchResult[]> {
  const queryStr = `[${queryVector.join(',')}]::FLOAT[512]`
  
  const reader = await this.connection!.runAndReadAll(
    `SELECT msg_id, 
            array_cosine_distance(embedding, ${queryStr}) as distance,
            create_time
     FROM message_vectors
     ORDER BY distance ASC
     LIMIT $1`,
    [topK]
  )

  const rows = reader.getRowObjectsJS()
  return rows.map((row) => ({
    msgId: String(row.msg_id),
    distance: Number(row.distance),
    createTime: Number(row.create_time)
  }))
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
git commit -m "feat(search): add vector storage and search to DuckDBService"
```

---

## Task 4: 扩展 SearchService 支持语义搜索

**Files:**
- Modify: `apps/server/src/services/searchService.ts`
- Modify: `apps/server/src/services/searchService.test.ts`

- [ ] **Step 1: 在 searchService.test.ts 中添加语义搜索测试**

在现有测试后添加新的 describe 块：

```typescript
// apps/server/src/services/searchService.test.ts
// 在文件末尾添加

describe('SearchService - Semantic Search', () => {
  let searchService: SearchService
  let mockDuckDB: any
  let mockEmbedding: any
  let mockDatabase: any
  let mockDataLake: any

  beforeEach(() => {
    mockDuckDB = {
      searchFTS: vi.fn(),
      searchVector: vi.fn()
    }
    mockEmbedding = {
      generateEmbedding: vi.fn()
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
      null as any,
      mockDatabase as any,
      mockDataLake as any,
      mockEmbedding as any
    )
  })

  it('should perform semantic search', async () => {
    const queryEmbedding = new Array(512).fill(0.5)
    mockEmbedding.generateEmbedding.mockResolvedValue(queryEmbedding)
    mockDuckDB.searchVector.mockResolvedValue([
      { msgId: 'msg1', distance: 0.1, createTime: 1714000000 }
    ])
    mockDatabase.prisma.messageIndex.findMany.mockResolvedValue([
      { msgId: 'msg1', dataLakeKey: 'key1', createTime: 1714000000, fromUsername: 'user1', toUsername: 'user2', conversationId: 'conv1' }
    ])
    mockDataLake.getMessage.mockResolvedValue({
      content: '相关内容',
      msg_id: 'msg1'
    })

    const results = await searchService.search({ q: '查询文本', type: 'semantic' })

    expect(mockEmbedding.generateEmbedding).toHaveBeenCalledWith('查询文本')
    expect(mockDuckDB.searchVector).toHaveBeenCalledWith(queryEmbedding, 100)
    expect(results).toHaveLength(1)
    expect(results[0].msgId).toBe('msg1')
  })

  it('should perform hybrid search', async () => {
    const queryEmbedding = new Array(512).fill(0.5)
    mockEmbedding.generateEmbedding.mockResolvedValue(queryEmbedding)
    mockDuckDB.searchFTS.mockResolvedValue([
      { msgId: 'msg1', createTime: 1714000000 }
    ])
    mockDuckDB.searchVector.mockResolvedValue([
      { msgId: 'msg2', distance: 0.1, createTime: 1714000100 }
    ])
    mockDatabase.prisma.messageIndex.findMany.mockResolvedValue([
      { msgId: 'msg1', dataLakeKey: 'key1', createTime: 1714000000, fromUsername: 'user1', toUsername: 'user2', conversationId: 'conv1' }
    ])
    mockDataLake.getMessage.mockResolvedValue({
      content: '内容',
      msg_id: 'msg1'
    })

    const results = await searchService.search({ q: '查询', type: 'hybrid' })

    expect(results).toHaveLength(1)
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/searchService.test.ts
```

Expected: FAIL - EmbeddingService parameter not accepted

- [ ] **Step 3: 修改 SearchService 支持语义搜索**

修改 `apps/server/src/services/searchService.ts`：

首先在文件顶部添加 import：

```typescript
import type { EmbeddingService } from './embeddingService.js'
```

然后修改构造函数：

```typescript
export class SearchService {
  constructor(
    private duckdb: DuckDBService,
    private tokenizer: Tokenizer,
    private db: DatabaseService,
    private dataLake: DataLakeService,
    private embedding?: EmbeddingService
  ) {}
```

最后修改 `search` 方法，在开头添加搜索类型判断：

```typescript
async search(query: SearchQuery): Promise<SearchResult[]> {
  let msgIds: string[] = []

  if (query.type === 'keyword') {
    // 关键词搜索（已有逻辑）
    const tokens = this.tokenizer.tokenizeAndJoin(query.q)
    const ftsResults = await this.duckdb.searchFTS(tokens)
    if (ftsResults.length === 0) return []
    msgIds = ftsResults.map((r) => r.msgId)
  } else if (query.type === 'semantic') {
    // 语义搜索
    if (!this.embedding) {
      throw new Error('EmbeddingService not available for semantic search')
    }
    const queryEmbedding = await this.embedding.generateEmbedding(query.q)
    const vectorResults = await this.duckdb.searchVector(queryEmbedding, 100)
    if (vectorResults.length === 0) return []
    msgIds = vectorResults.map((r) => r.msgId)
  } else if (query.type === 'hybrid') {
    // 混合搜索：FTS + 向量
    const tokens = this.tokenizer.tokenizeAndJoin(query.q)
    const ftsResults = await this.duckdb.searchFTS(tokens)
    const ftsIds = new Set(ftsResults.map((r) => r.msgId))

    if (this.embedding) {
      const queryEmbedding = await this.embedding.generateEmbedding(query.q)
      const vectorResults = await this.duckdb.searchVector(queryEmbedding, 100)
      vectorResults.forEach((r) => ftsIds.add(r.msgId))
    }

    msgIds = Array.from(ftsIds)
    if (msgIds.length === 0) return []
  }

  // 结构化过滤和 DataLake 获取（已有逻辑保持不变）
  const where: Record<string, unknown> = {
    msgId: { in: msgIds },
  }
  if (query.from) where.fromUsername = query.from
  if (query.group) where.conversationId = query.group
  if (query.after !== undefined || query.before !== undefined) {
    const timeFilter: Record<string, number> = {}
    if (query.after !== undefined) timeFilter.gte = query.after
    if (query.before !== undefined) timeFilter.lte = query.before
    where.createTime = timeFilter
  }

  const indexRecords = await this.db.prisma.messageIndex.findMany({
    where,
    take: query.limit ?? 20,
    skip: query.offset ?? 0,
    orderBy: { createTime: 'desc' },
  })

  if (indexRecords.length === 0) return []

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
```

- [ ] **Step 4: 运行测试验证通过**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/searchService.test.ts
```

Expected: PASS - All tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/searchService.ts apps/server/src/services/searchService.test.ts
git commit -m "feat(search): add semantic and hybrid search support"
```

---

## Task 5: 创建异步向量生成队列

**Files:**
- Create: `apps/server/src/services/embeddingQueue.ts`
- Create: `apps/server/src/services/embeddingQueue.test.ts`

- [ ] **Step 1: 编写 EmbeddingQueue 测试**

```typescript
// apps/server/src/services/embeddingQueue.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EmbeddingQueue } from './embeddingQueue.js'

describe('EmbeddingQueue', () => {
  let queue: EmbeddingQueue
  let mockEmbedding: any
  let mockDuckDB: any

  beforeEach(() => {
    mockEmbedding = {
      generateEmbedding: vi.fn()
    }
    mockDuckDB = {
      insertVector: vi.fn()
    }

    queue = new EmbeddingQueue(mockEmbedding as any, mockDuckDB as any)
  })

  it('should enqueue and process messages', async () => {
    mockEmbedding.generateEmbedding.mockResolvedValue(new Array(512).fill(0.5))
    mockDuckDB.insertVector.mockResolvedValue(undefined)

    await queue.enqueue({
      msgId: 'msg1',
      content: '测试内容',
      createTime: 1714000000
    })

    await queue.waitForIdle()

    expect(mockEmbedding.generateEmbedding).toHaveBeenCalledWith('测试内容')
    expect(mockDuckDB.insertVector).toHaveBeenCalled()
  })

  it('should handle empty content', async () => {
    mockEmbedding.generateEmbedding.mockResolvedValue(new Array(512).fill(0))
    mockDuckDB.insertVector.mockResolvedValue(undefined)

    await queue.enqueue({
      msgId: 'msg2',
      content: '',
      createTime: 1714000000
    })

    await queue.waitForIdle()

    expect(mockEmbedding.generateEmbedding).toHaveBeenCalledWith('')
  })

  it('should handle errors gracefully', async () => {
    mockEmbedding.generateEmbedding.mockRejectedValue(new Error('Model error'))

    await queue.enqueue({
      msgId: 'msg3',
      content: '测试',
      createTime: 1714000000
    })

    await queue.waitForIdle()

    expect(mockDuckDB.insertVector).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/embeddingQueue.test.ts
```

Expected: FAIL - EmbeddingQueue not defined

- [ ] **Step 3: 实现 EmbeddingQueue**

```typescript
// apps/server/src/services/embeddingQueue.ts
import PQueue from 'p-queue'
import { logger } from '../lib/logger.js'
import type { EmbeddingService } from './embeddingService.js'
import type { DuckDBService } from './duckdbService.js'

export interface EmbeddingTask {
  msgId: string
  content: string
  createTime: number
}

export class EmbeddingQueue {
  private queue: PQueue

  constructor(
    private embedding: EmbeddingService,
    private duckdb: DuckDBService,
    concurrency: number = 1
  ) {
    this.queue = new PQueue({ concurrency })
  }

  async enqueue(task: EmbeddingTask): Promise<void> {
    this.queue.add(async () => {
      try {
        const embedding = await this.embedding.generateEmbedding(task.content)
        await this.duckdb.insertVector({
          msgId: task.msgId,
          embedding,
          createTime: task.createTime
        })
        logger.debug(`向量生成完成: ${task.msgId}`)
      } catch (error) {
        logger.error(`向量生成失败: ${task.msgId}`, error)
      }
    })
  }

  async waitForIdle(): Promise<void> {
    await this.queue.onIdle()
  }

  getQueueSize(): number {
    return this.queue.size + this.queue.pending
  }
}
```

- [ ] **Step 4: 安装 p-queue 依赖**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && pnpm add p-queue
```

Expected: p-queue 添加到 dependencies

- [ ] **Step 5: 运行测试验证通过**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/embeddingQueue.test.ts
```

Expected: PASS - All tests pass

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/services/embeddingQueue.ts apps/server/src/services/embeddingQueue.test.ts apps/server/package.json apps/server/pnpm-lock.yaml
git commit -m "feat(search): add async embedding generation queue"
```

---

## Task 6: 集成向量生成到消息入库流程

**Files:**
- Modify: `apps/server/src/services/message.ts`
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: 在 index.ts 中初始化 EmbeddingService 和队列**

在现有服务初始化后添加：

```typescript
// apps/server/src/index.ts
// 在 DuckDBService 初始化后添加

import { EmbeddingService } from './services/embeddingService.js'
import { EmbeddingQueue } from './services/embeddingQueue.js'

// 初始化 EmbeddingService
const embeddingService = new EmbeddingService()
await embeddingService.initialize()

// 初始化 EmbeddingQueue
const embeddingQueue = new EmbeddingQueue(embeddingService, duckdbService)

// 更新 SearchService 实例化，传入 embeddingService
const searchService = new SearchService(
  duckdbService,
  tokenizer,
  databaseService,
  dataLakeService,
  embeddingService
)

// 将 embeddingQueue 添加到 deps
const deps = {
  // ... 现有依赖
  embeddingQueue
}
```

- [ ] **Step 2: 修改 MessageService 接受 embeddingQueue**

在 `apps/server/src/services/message.ts` 中：

```typescript
// 添加 import
import type { EmbeddingQueue } from './embeddingQueue.js'

// 修改构造函数
export class MessageService {
  constructor(
    private db: DatabaseService,
    private dataLake: DataLakeService,
    private adapter: JuhexbotAdapter,
    private imageService: ImageService,
    private fileService: FileService,
    private duckdb?: DuckDBService,
    private tokenizer?: Tokenizer,
    private embeddingQueue?: EmbeddingQueue
  ) {}
```

- [ ] **Step 3: 在 handleIncomingMessage 中入队向量生成**

在 DuckDB FTS 索引写入后添加：

```typescript
// 在 handleIncomingMessage 方法中，DuckDB FTS 索引写入后添加

// 入队向量生成（异步，不阻塞）
if (this.embeddingQueue && message.msgType === 1 && message.content) {
  try {
    await this.embeddingQueue.enqueue({
      msgId: message.msgId,
      content: message.content,
      createTime: message.createTime
    })
  } catch (error) {
    logger.warn({ msgId: message.msgId, err: error }, 'Failed to enqueue embedding generation')
  }
}
```

- [ ] **Step 4: 更新 index.ts 中的 MessageService 实例化**

```typescript
// apps/server/src/index.ts
// 修改 MessageService 的实例化

const messageService = new MessageService(
  databaseService,
  dataLakeService,
  juhexbotAdapter,
  imageService,
  fileService,
  duckdbService,
  tokenizer,
  embeddingQueue
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
git commit -m "feat(search): integrate async vector generation into message ingestion"
```

---

## Task 7: 编写历史消息向量迁移脚本

**Files:**
- Create: `apps/server/scripts/migrate-vectors.ts`
- Modify: `apps/server/package.json`

- [ ] **Step 1: 创建向量迁移脚本**

```typescript
// apps/server/scripts/migrate-vectors.ts
import { DuckDBService } from '../src/services/duckdbService.js'
import { EmbeddingService } from '../src/services/embeddingService.js'
import { DataLakeService } from '../src/services/dataLake.js'
import { DatabaseService } from '../src/services/database.js'
import path from 'node:path'
import { logger } from '../src/lib/logger.js'

async function migrate() {
  logger.info('开始向量迁移...')

  const duckdb = new DuckDBService({
    dbPath: path.join(process.cwd(), 'data', 'search.duckdb')
  })
  await duckdb.initialize()

  const embedding = new EmbeddingService()
  await embedding.initialize()

  const db = new DatabaseService()
  const dataLake = new DataLakeService({ 
    path: path.join(process.cwd(), 'data', 'datalake') 
  })

  let processed = 0
  let skipped = 0
  let failed = 0
  const batchSize = 50

  try {
    // 只迁移文本消息
    const totalCount = await db.prisma.messageIndex.count({
      where: { msgType: 1, isRecalled: false }
    })
    logger.info({ totalCount }, '待迁移消息总数')

    let offset = 0
    while (offset < totalCount) {
      const batch = await db.prisma.messageIndex.findMany({
        where: { msgType: 1, isRecalled: false },
        take: batchSize,
        skip: offset,
        orderBy: { createTime: 'asc' }
      })

      for (const msgIndex of batch) {
        try {
          // 检查是否已存在向量
          const existing = await duckdb.query(
            'SELECT msg_id FROM message_vectors WHERE msg_id = $1',
            [msgIndex.msgId]
          )
          if (existing.length > 0) {
            skipped++
            continue
          }

          // 从 DataLake 获取消息内容
          const message = await dataLake.getMessage(msgIndex.dataLakeKey)
          if (!message.content) {
            skipped++
            continue
          }

          // 生成向量
          const vector = await embedding.generateEmbedding(message.content)

          // 插入 DuckDB
          await duckdb.insertVector({
            msgId: msgIndex.msgId,
            embedding: vector,
            createTime: msgIndex.createTime
          })

          processed++
          if (processed % 50 === 0) {
            logger.info({ processed, skipped, failed, total: totalCount }, '迁移进度')
          }
        } catch (error: any) {
          if (error.code === 'ENOENT') {
            skipped++
          } else {
            failed++
            logger.warn({ msgId: msgIndex.msgId, err: error }, '消息迁移失败')
          }
        }
      }

      offset += batchSize
    }

    logger.info({ processed, skipped, failed }, '向量迁移完成')
  } finally {
    await duckdb.close()
  }
}

migrate().catch((error) => {
  logger.error({ err: error }, '向量迁移失败')
  process.exit(1)
})
```

- [ ] **Step 2: 添加 npm script**

在 `apps/server/package.json` 的 scripts 中添加：

```json
"migrate:vectors": "tsx scripts/migrate-vectors.ts"
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/scripts/migrate-vectors.ts apps/server/package.json
git commit -m "feat(search): add historical vector migration script"
```

---

## Self-Review Checklist

- [x] **Spec coverage**: 所有阶段 1B 的需求都已覆盖
  - ✅ DuckDB VSS 扩展集成
  - ✅ EmbeddingService（Transformers.js + bge-small-zh-v1.5）
  - ✅ 向量存储和搜索（message_vectors 表 + HNSW 索引）
  - ✅ SearchService 支持 semantic/hybrid 搜索
  - ✅ 异步向量生成队列
  - ✅ 消息入库时自动入队向量生成
  - ✅ 历史消息向量迁移脚本

- [x] **No placeholders**: 所有代码都是完整的，没有 TBD/TODO

- [x] **Type consistency**: 
  - VectorRecord 和 VectorSearchResult 接口在 DuckDBService 中定义
  - EmbeddingTask 接口在 EmbeddingQueue 中定义
  - SearchService 接受可选的 EmbeddingService 参数
  - 所有方法签名一致

- [x] **File paths**: 所有文件路径都是绝对路径或明确的相对路径

---

## 执行选项

计划已完成并保存到 `docs/superpowers/plans/2026-04-24-phase1b-duckdb-vss-semantic-search.md`。

**两种执行方式：**

**1. Subagent-Driven（推荐）** - 每个任务派发新的 subagent，任务间审查，快速迭代

**2. Inline Execution** - 在当前会话中使用 executing-plans 执行，批量执行带检查点

选择哪种方式？
