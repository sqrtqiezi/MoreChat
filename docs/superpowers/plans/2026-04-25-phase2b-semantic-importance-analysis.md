# 阶段 2B：语义重要性分析 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为未被规则命中的文本消息添加本地语义重要性分析，识别 todo / decision / question / important 并写入 MessageTag

**Architecture:** 复用现有 EmbeddingService，不引入新的分类模型。为每类语义标签预定义一组中文原型短语，启动时生成原型向量；对每条未命中规则的文本消息生成 embedding，计算与原型向量的余弦相似度，超过阈值则写入 MessageTag。通过 KnowledgeQueue 异步处理，不阻塞消息入库。

**Tech Stack:** 现有 EmbeddingService + DuckDB/SQLite/DataLake + KnowledgeQueue + MessageTag + 本地余弦相似度分类

**Spec:** `docs/superpowers/specs/2026-04-24-morechat-knowledge-base-redesign.md` 第四章 4.2（语义重要性分析）

**Dependencies:** 阶段 1A/1B 已完成的 EmbeddingService / DuckDBService / SearchService / EmbeddingQueue；阶段 2A 已完成的 RuleEngine / MessageTag / KnowledgeQueue

---

## File Structure

```
apps/server/src/services/
  semanticImportanceService.ts        - 语义重要性分析服务（embedding + prototype similarity）
  semanticImportanceService.test.ts   - 语义重要性分析测试
  knowledgeQueue.ts                   - 修改：注册 semantic-importance 任务支持
  message.ts                          - 修改：仅在规则未命中时入队语义分析任务
  index.ts                            - 修改：初始化 SemanticImportanceService 并注册到 KnowledgeQueue
apps/server/scripts/
  migrate-semantic-tags.ts            - 历史消息语义标签迁移脚本
apps/server/package.json              - 修改：新增迁移脚本命令
```

---

## Task 1: 创建 SemanticImportanceService

**Files:**
- Create: `apps/server/src/services/semanticImportanceService.ts`
- Create: `apps/server/src/services/semanticImportanceService.test.ts`

- [ ] **Step 1: 编写 SemanticImportanceService 测试**

```typescript
// apps/server/src/services/semanticImportanceService.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SemanticImportanceService } from './semanticImportanceService.js'

describe('SemanticImportanceService', () => {
  let service: SemanticImportanceService
  let mockEmbedding: any

  beforeEach(async () => {
    mockEmbedding = {
      generateEmbedding: vi.fn()
    }

    service = new SemanticImportanceService(mockEmbedding)
  })

  it('should classify todo message', async () => {
    mockEmbedding.generateEmbedding
      .mockResolvedValueOnce([1, 0, 0]) // prototype: todo
      .mockResolvedValueOnce([0, 1, 0]) // prototype: decision
      .mockResolvedValueOnce([0, 0, 1]) // prototype: question
      .mockResolvedValueOnce([1, 0, 0]) // message similar to todo

    await service.initialize()
    const tags = await service.analyze('请今天下班前完成预算表')

    expect(tags).toContainEqual({
      tag: 'todo',
      source: 'ai:semantic'
    })
  })

  it('should classify decision message', async () => {
    mockEmbedding.generateEmbedding
      .mockResolvedValueOnce([1, 0, 0])
      .mockResolvedValueOnce([0, 1, 0])
      .mockResolvedValueOnce([0, 0, 1])
      .mockResolvedValueOnce([0, 1, 0])

    await service.initialize()
    const tags = await service.analyze('我们决定本周五上线这个功能')

    expect(tags).toContainEqual({
      tag: 'decision',
      source: 'ai:semantic'
    })
  })

  it('should classify question message', async () => {
    mockEmbedding.generateEmbedding
      .mockResolvedValueOnce([1, 0, 0])
      .mockResolvedValueOnce([0, 1, 0])
      .mockResolvedValueOnce([0, 0, 1])
      .mockResolvedValueOnce([0, 0, 1])

    await service.initialize()
    const tags = await service.analyze('这个问题你怎么看？')

    expect(tags).toContainEqual({
      tag: 'question',
      source: 'ai:semantic'
    })
  })

  it('should return empty when below threshold', async () => {
    mockEmbedding.generateEmbedding
      .mockResolvedValueOnce([1, 0, 0])
      .mockResolvedValueOnce([0, 1, 0])
      .mockResolvedValueOnce([0, 0, 1])
      .mockResolvedValueOnce([0.1, 0.1, 0.1])

    await service.initialize()
    const tags = await service.analyze('今天天气不错')

    expect(tags).toEqual([])
  })

  it('should throw if not initialized', async () => {
    await expect(service.analyze('test')).rejects.toThrow('SemanticImportanceService not initialized')
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/semanticImportanceService.test.ts
```

Expected: FAIL - SemanticImportanceService not defined

- [ ] **Step 3: 实现 SemanticImportanceService**

```typescript
// apps/server/src/services/semanticImportanceService.ts
import { logger } from '../lib/logger.js'
import type { EmbeddingService } from './embeddingService.js'

export interface SemanticTag {
  tag: string
  source: string
}

interface Prototype {
  tag: string
  text: string
  threshold: number
  embedding?: number[]
}

export class SemanticImportanceService {
  private initialized = false
  private prototypes: Prototype[] = [
    { tag: 'todo', text: '请今天完成这项任务', threshold: 0.82 },
    { tag: 'decision', text: '我们决定采用这个方案', threshold: 0.82 },
    { tag: 'question', text: '这个问题你怎么看', threshold: 0.82 },
    { tag: 'important', text: '这个信息非常重要请注意', threshold: 0.85 },
  ]

  constructor(private embeddingService: EmbeddingService) {}

  async initialize(): Promise<void> {
    if (this.initialized) return

    for (const prototype of this.prototypes) {
      prototype.embedding = await this.embeddingService.generateEmbedding(prototype.text)
    }

    this.initialized = true
    logger.info('SemanticImportanceService initialized')
  }

  async analyze(content: string): Promise<SemanticTag[]> {
    if (!this.initialized) {
      throw new Error('SemanticImportanceService not initialized')
    }

    if (!content.trim()) return []

    const messageEmbedding = await this.embeddingService.generateEmbedding(content)
    const tags: SemanticTag[] = []

    for (const prototype of this.prototypes) {
      const similarity = this.cosineSimilarity(messageEmbedding, prototype.embedding!)
      if (similarity >= prototype.threshold) {
        tags.push({ tag: prototype.tag, source: 'ai:semantic' })
      }
    }

    return tags
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const dot = a.reduce((sum, val, i) => sum + val * b[i], 0)
    const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0))
    const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0))
    return dot / (normA * normB)
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/semanticImportanceService.test.ts
```

Expected: PASS - All tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/semanticImportanceService.ts apps/server/src/services/semanticImportanceService.test.ts
git commit -m "feat(knowledge): add SemanticImportanceService for local semantic classification"
```

---

## Task 2: 扩展 KnowledgeQueue 支持语义分析任务

**Files:**
- Modify: `apps/server/src/services/knowledgeQueue.ts`
- Modify: `apps/server/src/services/knowledgeQueue.test.ts`

- [ ] **Step 1: 在 KnowledgeQueue 测试中添加 semantic-importance 任务用例**

在现有测试文件末尾添加：

```typescript
it('should process semantic-importance task with registered handler', async () => {
  const handler = vi.fn().mockResolvedValue(undefined)
  queue.registerHandler('semantic-importance', handler)

  await queue.enqueue({
    type: 'semantic-importance',
    msgId: 'msg-semantic-1',
    data: { content: '请今天完成预算表' }
  })

  await queue.waitForIdle()

  expect(handler).toHaveBeenCalledWith({
    type: 'semantic-importance',
    msgId: 'msg-semantic-1',
    data: { content: '请今天完成预算表' }
  })
})
```

- [ ] **Step 2: 运行测试验证通过（无需改实现）**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/knowledgeQueue.test.ts
```

Expected: PASS - 现有实现已支持泛型任务类型

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/services/knowledgeQueue.test.ts
git commit -m "test(knowledge): cover semantic-importance tasks in KnowledgeQueue"
```

---

## Task 3: 集成语义重要性分析到消息处理流程

**Files:**
- Modify: `apps/server/src/services/message.ts`
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: 在 index.ts 中初始化 SemanticImportanceService 并注册队列处理器**

在现有服务初始化后添加：

```typescript
// apps/server/src/index.ts
import { SemanticImportanceService } from './services/semanticImportanceService.js'

const semanticImportanceService = new SemanticImportanceService(embeddingService)
await semanticImportanceService.initialize()

knowledgeQueue.registerHandler('semantic-importance', async (task) => {
  const tags = await semanticImportanceService.analyze(task.data.content)
  if (tags.length > 0) {
    await databaseService.prisma.messageTag.createMany({
      data: tags.map((tag) => ({
        msgId: task.msgId,
        tag: tag.tag,
        source: tag.source,
      })),
      skipDuplicates: true,
    })
  }
})
```

- [ ] **Step 2: 修改 MessageService 构造函数接受 KnowledgeQueue**

如果尚未接收，则在 `apps/server/src/services/message.ts` 构造函数中添加：

```typescript
import type { KnowledgeQueue } from './knowledgeQueue.js'

constructor(
  private db: DatabaseService,
  private dataLake: DataLakeService,
  private adapter: JuhexbotAdapter,
  private imageService: ImageService,
  private fileService: FileService,
  private duckdb?: DuckDBService,
  private tokenizer?: Tokenizer,
  private embeddingQueue?: EmbeddingQueue,
  private ruleEngine?: RuleEngine,
  private knowledgeQueue?: KnowledgeQueue,
) {}
```

- [ ] **Step 3: 在 handleIncomingMessage 中仅对未命中规则的文本消息入队语义分析**

在规则引擎处理之后添加：

```typescript
let ruleTagsCount = 0

if (this.ruleEngine && message.msgType === 1) {
  try {
    const tags = await this.ruleEngine.evaluateMessage({
      msgId: message.msgId,
      fromUsername: message.fromUsername,
      toUsername: message.toUsername,
      content: message.content,
      msgType: message.msgType,
      currentUsername: this.adapter.getCurrentUsername(),
    })

    ruleTagsCount = tags.length

    if (tags.length > 0) {
      await this.ruleEngine.applyTags(tags)
      logger.debug({ msgId: message.msgId, tags }, 'Applied rule tags')
    }
  } catch (error) {
    logger.warn({ msgId: message.msgId, err: error }, 'Failed to apply rule tags')
  }
}

if (this.knowledgeQueue && message.msgType === 1 && message.content && ruleTagsCount === 0) {
  try {
    await this.knowledgeQueue.enqueue({
      type: 'semantic-importance',
      msgId: message.msgId,
      data: { content: message.content },
    })
  } catch (error) {
    logger.warn({ msgId: message.msgId, err: error }, 'Failed to enqueue semantic importance analysis')
  }
}
```

- [ ] **Step 4: 运行现有 message 测试验证没有破坏**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/message.test.ts
```

Expected: PASS - 现有测试仍然通过

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/message.ts apps/server/src/index.ts
git commit -m "feat(knowledge): enqueue semantic importance analysis for untagged messages"
```

---

## Task 4: 编写历史语义标签迁移脚本

**Files:**
- Create: `apps/server/scripts/migrate-semantic-tags.ts`
- Modify: `apps/server/package.json`

- [ ] **Step 1: 创建迁移脚本**

```typescript
// apps/server/scripts/migrate-semantic-tags.ts
import path from 'node:path'
import { logger } from '../src/lib/logger.js'
import { DatabaseService } from '../src/services/database.js'
import { DataLakeService } from '../src/services/dataLake.js'
import { EmbeddingService } from '../src/services/embeddingService.js'
import { SemanticImportanceService } from '../src/services/semanticImportanceService.js'

async function migrate() {
  logger.info('开始语义标签迁移...')

  const db = new DatabaseService()
  const dataLake = new DataLakeService({
    path: path.join(process.cwd(), 'data', 'datalake'),
  })
  const embeddingService = new EmbeddingService()
  await embeddingService.initialize()
  const semanticService = new SemanticImportanceService(embeddingService)
  await semanticService.initialize()

  let processed = 0
  let tagged = 0
  let skipped = 0
  let failed = 0
  const batchSize = 50

  try {
    const totalCount = await db.prisma.messageIndex.count({
      where: { msgType: 1, isRecalled: false },
    })
    logger.info({ totalCount }, '待迁移消息总数')

    let offset = 0
    while (offset < totalCount) {
      const batch = await db.prisma.messageIndex.findMany({
        where: { msgType: 1, isRecalled: false },
        take: batchSize,
        skip: offset,
        orderBy: { createTime: 'asc' },
      })

      for (const msgIndex of batch) {
        try {
          const existingTags = await db.prisma.messageTag.findMany({
            where: { msgId: msgIndex.msgId, source: 'ai:semantic' },
          })
          if (existingTags.length > 0) {
            skipped++
            continue
          }

          const message = await dataLake.getMessage(msgIndex.dataLakeKey)
          if (!message.content) {
            skipped++
            continue
          }

          const tags = await semanticService.analyze(message.content)
          if (tags.length > 0) {
            await db.prisma.messageTag.createMany({
              data: tags.map((tag) => ({
                msgId: msgIndex.msgId,
                tag: tag.tag,
                source: tag.source,
              })),
              skipDuplicates: true,
            })
            tagged++
          }

          processed++
          if (processed % 50 === 0) {
            logger.info({ processed, tagged, skipped, failed, total: totalCount }, '迁移进度')
          }
        } catch (error: any) {
          if (error.code === 'ENOENT') {
            skipped++
          } else {
            failed++
            logger.warn({ msgId: msgIndex.msgId, err: error }, '语义标签迁移失败')
          }
        }
      }

      offset += batchSize
    }

    logger.info({ processed, tagged, skipped, failed }, '语义标签迁移完成')
  } finally {
    // cleanup if needed
  }
}

migrate().catch((error) => {
  logger.error({ err: error }, '语义标签迁移失败')
  process.exit(1)
})
```

- [ ] **Step 2: 添加 npm script**

```json
"migrate:semantic-tags": "tsx scripts/migrate-semantic-tags.ts"
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/scripts/migrate-semantic-tags.ts apps/server/package.json
git commit -m "feat(knowledge): add historical semantic tags migration script"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** 阶段 2B 的需求已覆盖
  - ✅ 本地语义重要性分析（todo / decision / question / important）
  - ✅ 仅对未被规则命中的消息分析
  - ✅ 异步处理，不阻塞消息入库
  - ✅ 结果写入 MessageTag（source = ai:semantic）
  - ✅ 历史消息语义标签迁移脚本

- [x] **No placeholders:** 所有代码均完整，没有 TBD/TODO

- [x] **Type consistency:**
  - SemanticTag 在 SemanticImportanceService 中定义
  - SemanticImportanceService 依赖现有 EmbeddingService
  - KnowledgeQueue 使用既有泛型任务结构

- [x] **File paths:** 所有路径都明确

---

## 执行选项

计划已完成并保存到 `docs/superpowers/plans/2026-04-25-phase2b-semantic-importance-analysis.md`。

**Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
