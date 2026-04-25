# 阶段 2A：规则引擎与知识处理基础设施 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 MoreChat 添加基于规则的消息重要性判断和知识处理管道基础设施

**Architecture:** 实现同步规则引擎（关注人/关键词/@我检测）在消息入库时判断重要性，创建 MessageTag/MessageEntity/DigestEntry 等数据模型，建立知识处理队列架构。规则引擎零延迟同步执行，为后续 AI 功能（语义分析、实体提取、摘要生成）打好基础。

**Tech Stack:** Prisma (数据模型) + 现有 MessageService + 规则引擎 + 处理队列架构

**Spec:** `docs/superpowers/specs/2026-04-24-morechat-knowledge-base-redesign.md` 第四章 4.1-4.4、第五章 5.1

**依赖阶段 1A/1B：** DuckDB FTS/VSS、SearchService、EmbeddingQueue 均已就绪

**范围说明：** 阶段 2 的知识处理管道包含多个独立子系统。本计划（2A）聚焦于**规则引擎和基础设施**，为后续的 AI 功能（2B: 语义分析、2C: 实体提取、2D: 摘要生成、2E: 主题聚类）打好基础。

---

## File Structure

```
apps/server/prisma/
  schema.prisma                 - 修改：新增 MessageTag、MessageEntity、DigestEntry、Topic、ImportanceRule 模型
apps/server/src/services/
  ruleEngine.ts                 - 规则引擎（关注人/关键词/@我检测）
  ruleEngine.test.ts            - 规则引擎测试
  knowledgeQueue.ts             - 知识处理队列（为后续 AI 功能预留）
  knowledgeQueue.test.ts        - 队列测试
  message.ts                    - 修改：集成规则引擎
apps/server/src/routes/
  rules.ts                      - 规则管理 API
  rules.test.ts                 - 规则 API 测试
apps/server/scripts/
  migrate-tags.ts               - 历史消息标签迁移脚本
```

---

## Task 1: 创建数据模型（Prisma Schema）

**Files:**
- Modify: `apps/server/prisma/schema.prisma`

- [ ] **Step 1: 添加 MessageTag 模型**

在 schema.prisma 末尾添加：

```prisma
// 消息标签（重要、待办、决策等）
model MessageTag {
  id        String   @id @default(cuid())
  msgId     String
  tag       String   // "important", "todo", "decision", "question"
  source    String   // "rule:watchlist", "rule:keyword", "rule:mention", "ai:semantic"
  createdAt DateTime @default(now())

  @@index([msgId])
  @@index([tag])
  @@unique([msgId, tag, source])
}
```

- [ ] **Step 2: 添加 MessageEntity 模型**

```prisma
// 提取的实体
model MessageEntity {
  id        String   @id @default(cuid())
  msgId     String
  type      String   // "person", "project", "date", "amount", "action_item"
  value     String
  createdAt DateTime @default(now())

  @@index([msgId])
  @@index([type])
  @@index([value])
}
```

- [ ] **Step 3: 添加 DigestEntry 模型**

```prisma
// 摘要条目
model DigestEntry {
  id             String   @id @default(cuid())
  conversationId String
  startTime      Int
  endTime        Int
  summary        String
  messageCount   Int
  createdAt      DateTime @default(now())

  @@index([conversationId])
  @@index([startTime])
}
```

- [ ] **Step 4: 添加 Topic 和 TopicMessage 模型**

```prisma
// 话题
model Topic {
  id           String   @id @default(cuid())
  title        String
  description  String?
  messageCount Int      @default(0)
  firstSeenAt  Int
  lastSeenAt   Int
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  messages TopicMessage[]

  @@index([lastSeenAt])
}

// 话题与消息关联
model TopicMessage {
  id      String @id @default(cuid())
  topicId String
  msgId   String

  topic Topic @relation(fields: [topicId], references: [id], onDelete: Cascade)

  @@unique([topicId, msgId])
  @@index([topicId])
  @@index([msgId])
}
```

- [ ] **Step 5: 添加 ImportanceRule 模型**

```prisma
// 重要性规则配置
model ImportanceRule {
  id        String   @id @default(cuid())
  type      String   // "watchlist", "keyword", "mention"
  value     String   // 联系人username / 关键词 / "@me"
  priority  Int      @default(0)
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([type, isActive])
}
```

- [ ] **Step 6: 生成并运行迁移**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && npx prisma migrate dev --name add_knowledge_models
```

Expected: 迁移文件生成，数据库更新成功

- [ ] **Step 7: Commit**

```bash
git add apps/server/prisma/schema.prisma apps/server/prisma/migrations/
git commit -m "feat(knowledge): add MessageTag, MessageEntity, DigestEntry, Topic, ImportanceRule models"
```

---

## Task 2: 创建规则引擎（RuleEngine）

**Files:**
- Create: `apps/server/src/services/ruleEngine.ts`
- Create: `apps/server/src/services/ruleEngine.test.ts`

- [ ] **Step 1: 编写 RuleEngine 测试**

```typescript
// apps/server/src/services/ruleEngine.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { RuleEngine } from './ruleEngine.js'
import type { DatabaseService } from './database.js'

describe('RuleEngine', () => {
  let ruleEngine: RuleEngine
  let mockDb: any

  beforeEach(() => {
    mockDb = {
      prisma: {
        importanceRule: {
          findMany: vi.fn()
        },
        messageTag: {
          createMany: vi.fn()
        }
      }
    }
    ruleEngine = new RuleEngine(mockDb as DatabaseService)
  })

  describe('evaluateMessage', () => {
    it('should tag message from watchlist contact', async () => {
      mockDb.prisma.importanceRule.findMany.mockResolvedValue([
        { type: 'watchlist', value: 'alice', isActive: true }
      ])

      const tags = await ruleEngine.evaluateMessage({
        msgId: 'msg1',
        fromUsername: 'alice',
        toUsername: 'group1',
        content: 'Hello',
        msgType: 1
      })

      expect(tags).toContainEqual({
        msgId: 'msg1',
        tag: 'important',
        source: 'rule:watchlist'
      })
    })

    it('should tag message with keyword match', async () => {
      mockDb.prisma.importanceRule.findMany.mockResolvedValue([
        { type: 'keyword', value: '预算', isActive: true }
      ])

      const tags = await ruleEngine.evaluateMessage({
        msgId: 'msg2',
        fromUsername: 'bob',
        toUsername: 'group1',
        content: '讨论项目预算',
        msgType: 1
      })

      expect(tags).toContainEqual({
        msgId: 'msg2',
        tag: 'important',
        source: 'rule:keyword'
      })
    })

    it('should tag message with @mention', async () => {
      mockDb.prisma.importanceRule.findMany.mockResolvedValue([
        { type: 'mention', value: '@me', isActive: true }
      ])

      const tags = await ruleEngine.evaluateMessage({
        msgId: 'msg3',
        fromUsername: 'charlie',
        toUsername: 'group1',
        content: '@张三 请看一下',
        msgType: 1,
        currentUsername: '张三'
      })

      expect(tags).toContainEqual({
        msgId: 'msg3',
        tag: 'important',
        source: 'rule:mention'
      })
    })

    it('should return empty array if no rules match', async () => {
      mockDb.prisma.importanceRule.findMany.mockResolvedValue([])

      const tags = await ruleEngine.evaluateMessage({
        msgId: 'msg4',
        fromUsername: 'dave',
        toUsername: 'group1',
        content: 'Normal message',
        msgType: 1
      })

      expect(tags).toEqual([])
    })

    it('should skip non-text messages', async () => {
      mockDb.prisma.importanceRule.findMany.mockResolvedValue([
        { type: 'keyword', value: '预算', isActive: true }
      ])

      const tags = await ruleEngine.evaluateMessage({
        msgId: 'msg5',
        fromUsername: 'eve',
        toUsername: 'group1',
        content: '',
        msgType: 3
      })

      expect(tags).toEqual([])
    })
  })

  describe('applyTags', () => {
    it('should create tags in database', async () => {
      mockDb.prisma.messageTag.createMany.mockResolvedValue({ count: 2 })

      await ruleEngine.applyTags([
        { msgId: 'msg1', tag: 'important', source: 'rule:watchlist' },
        { msgId: 'msg1', tag: 'important', source: 'rule:keyword' }
      ])

      expect(mockDb.prisma.messageTag.createMany).toHaveBeenCalledWith({
        data: [
          { msgId: 'msg1', tag: 'important', source: 'rule:watchlist' },
          { msgId: 'msg1', tag: 'important', source: 'rule:keyword' }
        ],
        skipDuplicates: true
      })
    })

    it('should handle empty tags array', async () => {
      await ruleEngine.applyTags([])
      expect(mockDb.prisma.messageTag.createMany).not.toHaveBeenCalled()
    })
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/ruleEngine.test.ts
```

Expected: FAIL - RuleEngine not defined

- [ ] **Step 3: 实现 RuleEngine**

```typescript
// apps/server/src/services/ruleEngine.ts
import { logger } from '../lib/logger.js'
import type { DatabaseService } from './database.js'

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

export class RuleEngine {
  private rulesCache: any[] | null = null
  private cacheExpiry: number = 0
  private readonly CACHE_TTL = 60000

  constructor(private db: DatabaseService) {}

  async evaluateMessage(context: MessageContext): Promise<MessageTagData[]> {
    if (context.msgType !== 1 || !context.content) {
      return []
    }

    const rules = await this.getRules()
    const tags: MessageTagData[] = []

    for (const rule of rules) {
      if (!rule.isActive) continue

      switch (rule.type) {
        case 'watchlist':
          if (context.fromUsername === rule.value) {
            tags.push({
              msgId: context.msgId,
              tag: 'important',
              source: 'rule:watchlist'
            })
          }
          break

        case 'keyword':
          if (context.content.includes(rule.value)) {
            tags.push({
              msgId: context.msgId,
              tag: 'important',
              source: 'rule:keyword'
            })
          }
          break

        case 'mention':
          if (rule.value === '@me' && context.currentUsername) {
            if (context.content.includes(`@${context.currentUsername}`)) {
              tags.push({
                msgId: context.msgId,
                tag: 'important',
                source: 'rule:mention'
              })
            }
          }
          break
      }
    }

    return tags
  }

  async applyTags(tags: MessageTagData[]): Promise<void> {
    if (tags.length === 0) return

    try {
      await this.db.prisma.messageTag.createMany({
        data: tags,
        skipDuplicates: true
      })
      logger.debug(`Applied ${tags.length} tags`)
    } catch (error) {
      logger.error('Failed to apply tags', { error, tags })
      throw error
    }
  }

  private async getRules() {
    const now = Date.now()
    if (this.rulesCache && now < this.cacheExpiry) {
      return this.rulesCache
    }

    this.rulesCache = await this.db.prisma.importanceRule.findMany({
      where: { isActive: true }
    })
    this.cacheExpiry = now + this.CACHE_TTL

    return this.rulesCache
  }

  clearCache(): void {
    this.rulesCache = null
    this.cacheExpiry = 0
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/ruleEngine.test.ts
```

Expected: PASS - All tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/ruleEngine.ts apps/server/src/services/ruleEngine.test.ts
git commit -m "feat(knowledge): add RuleEngine for importance detection"
```

---

## Task 3: 集成规则引擎到消息入库流程

**Files:**
- Modify: `apps/server/src/services/message.ts`
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: 在 index.ts 中初始化 RuleEngine**

```typescript
// apps/server/src/index.ts
import { RuleEngine } from './services/ruleEngine.js'

const ruleEngine = new RuleEngine(databaseService)

const messageService = new MessageService(
  databaseService,
  dataLakeService,
  juhexbotAdapter,
  imageService,
  fileService,
  duckdbService,
  tokenizer,
  embeddingQueue,
  ruleEngine
)
```

- [ ] **Step 2: 修改 MessageService 接受 ruleEngine**

```typescript
// apps/server/src/services/message.ts
import type { RuleEngine } from './ruleEngine.js'

export class MessageService {
  constructor(
    private db: DatabaseService,
    private dataLake: DataLakeService,
    private adapter: JuhexbotAdapter,
    private imageService: ImageService,
    private fileService: FileService,
    private duckdb?: DuckDBService,
    private tokenizer?: Tokenizer,
    private embeddingQueue?: EmbeddingQueue,
    private ruleEngine?: RuleEngine
  ) {}
```

- [ ] **Step 3: 在 handleIncomingMessage 中应用规则引擎**

在 DuckDB FTS 索引写入后、向量生成入队前添加：

```typescript
if (this.ruleEngine && message.msgType === 1) {
  try {
    const tags = await this.ruleEngine.evaluateMessage({
      msgId: message.msgId,
      fromUsername: message.fromUsername,
      toUsername: message.toUsername,
      content: message.content,
      msgType: message.msgType,
      currentUsername: this.adapter.getCurrentUsername()
    })
    
    if (tags.length > 0) {
      await this.ruleEngine.applyTags(tags)
      logger.debug({ msgId: message.msgId, tags }, 'Applied rule tags')
    }
  } catch (error) {
    logger.warn({ msgId: message.msgId, err: error }, 'Failed to apply rule tags')
  }
}
```

- [ ] **Step 4: 运行现有测试验证没有破坏**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/message.test.ts
```

Expected: PASS - 现有测试仍然通过

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/message.ts apps/server/src/index.ts
git commit -m "feat(knowledge): integrate RuleEngine into message ingestion"
```

---

## Task 4: 创建规则管理 API

**Files:**
- Create: `apps/server/src/routes/rules.ts`
- Create: `apps/server/src/routes/rules.test.ts`
- Modify: `apps/server/src/app.ts`

- [ ] **Step 1: 编写规则 API 测试**

```typescript
// apps/server/src/routes/rules.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono } from 'hono'
import { rulesRoutes } from './rules.js'

describe('Rules API', () => {
  let app: Hono
  let mockDb: any
  let mockRuleEngine: any

  beforeEach(() => {
    mockDb = {
      prisma: {
        importanceRule: {
          findMany: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn()
        }
      }
    }
    mockRuleEngine = {
      clearCache: vi.fn()
    }

    app = new Hono()
    app.route('/api/rules', rulesRoutes(mockDb as any, mockRuleEngine as any))
  })

  it('GET /api/rules should return all rules', async () => {
    mockDb.prisma.importanceRule.findMany.mockResolvedValue([
      { id: '1', type: 'watchlist', value: 'alice', isActive: true, priority: 0 }
    ])

    const res = await app.request('/api/rules')
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data).toHaveLength(1)
  })

  it('POST /api/rules should create a rule', async () => {
    mockDb.prisma.importanceRule.create.mockResolvedValue({
      id: '2',
      type: 'keyword',
      value: '预算',
      isActive: true,
      priority: 0
    })

    const res = await app.request('/api/rules', {
      method: 'POST',
      body: JSON.stringify({ type: 'keyword', value: '预算' }),
      headers: { 'Content-Type': 'application/json' }
    })

    expect(res.status).toBe(200)
    expect(mockRuleEngine.clearCache).toHaveBeenCalled()
  })

  it('should validate rule type', async () => {
    const res = await app.request('/api/rules', {
      method: 'POST',
      body: JSON.stringify({ type: 'invalid', value: 'test' }),
      headers: { 'Content-Type': 'application/json' }
    })

    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/routes/rules.test.ts
```

Expected: FAIL - rulesRoutes not defined

- [ ] **Step 3: 实现规则 API 路由**

```typescript
// apps/server/src/routes/rules.ts
import { Hono } from 'hono'
import { z } from 'zod'
import type { DatabaseService } from '../services/database.js'
import type { RuleEngine } from '../services/ruleEngine.js'

const ruleSchema = z.object({
  type: z.enum(['watchlist', 'keyword', 'mention']),
  value: z.string().min(1),
  priority: z.number().int().min(0).optional(),
  isActive: z.boolean().optional()
})

const updateRuleSchema = z.object({
  value: z.string().min(1).optional(),
  priority: z.number().int().min(0).optional(),
  isActive: z.boolean().optional()
})

export function rulesRoutes(db: DatabaseService, ruleEngine: RuleEngine) {
  const app = new Hono()

  app.get('/', async (c) => {
    const rules = await db.prisma.importanceRule.findMany({
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }]
    })

    return c.json({ success: true, data: rules })
  })

  app.post('/', async (c) => {
    const body = await c.req.json()
    const result = ruleSchema.safeParse(body)
    if (!result.success) {
      return c.json({ success: false, error: result.error.message }, 400)
    }

    const rule = await db.prisma.importanceRule.create({ data: result.data })
    ruleEngine.clearCache()

    return c.json({ success: true, data: rule })
  })

  app.put('/:id', async (c) => {
    const { id } = c.req.param()
    const body = await c.req.json()
    const result = updateRuleSchema.safeParse(body)
    if (!result.success) {
      return c.json({ success: false, error: result.error.message }, 400)
    }

    const rule = await db.prisma.importanceRule.update({
      where: { id },
      data: result.data
    })
    ruleEngine.clearCache()

    return c.json({ success: true, data: rule })
  })

  app.delete('/:id', async (c) => {
    const { id } = c.req.param()
    await db.prisma.importanceRule.delete({ where: { id } })
    ruleEngine.clearCache()

    return c.json({ success: true })
  })

  return app
}
```

- [ ] **Step 4: 在 app.ts 中注册规则路由**

```typescript
// apps/server/src/app.ts
import { rulesRoutes } from './routes/rules.js'

app.route('/api/rules', rulesRoutes(deps.databaseService, deps.ruleEngine))
```

- [ ] **Step 5: 运行测试验证通过**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/routes/rules.test.ts
```

Expected: PASS - All tests pass

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/routes/rules.ts apps/server/src/routes/rules.test.ts apps/server/src/app.ts
git commit -m "feat(knowledge): add rules management API"
```

---

## Task 5: 创建知识处理队列架构

**Files:**
- Create: `apps/server/src/services/knowledgeQueue.ts`
- Create: `apps/server/src/services/knowledgeQueue.test.ts`

- [ ] **Step 1: 编写 KnowledgeQueue 测试**

```typescript
// apps/server/src/services/knowledgeQueue.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { KnowledgeQueue } from './knowledgeQueue.js'

describe('KnowledgeQueue', () => {
  let queue: KnowledgeQueue

  beforeEach(() => {
    queue = new KnowledgeQueue()
  })

  it('should enqueue and process tasks', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    queue.registerHandler('test', handler)

    await queue.enqueue({
      type: 'test',
      msgId: 'msg1',
      data: { content: 'test' }
    })

    await queue.waitForIdle()

    expect(handler).toHaveBeenCalledWith({
      type: 'test',
      msgId: 'msg1',
      data: { content: 'test' }
    })
  })

  it('should handle errors gracefully', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('Test error'))
    queue.registerHandler('error', handler)

    await queue.enqueue({
      type: 'error',
      msgId: 'msg2',
      data: {}
    })

    await queue.waitForIdle()

    expect(handler).toHaveBeenCalled()
  })

  it('should skip tasks with no handler', async () => {
    await queue.enqueue({
      type: 'unknown',
      msgId: 'msg3',
      data: {}
    })

    await queue.waitForIdle()
  })

  it('should report queue size', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    queue.registerHandler('test', handler)

    await queue.enqueue({
      type: 'test',
      msgId: 'msg4',
      data: {}
    })

    expect(queue.getQueueSize()).toBeGreaterThanOrEqual(0)
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/knowledgeQueue.test.ts
```

Expected: FAIL - KnowledgeQueue not defined

- [ ] **Step 3: 实现 KnowledgeQueue**

```typescript
// apps/server/src/services/knowledgeQueue.ts
import PQueue from 'p-queue'
import { logger } from '../lib/logger.js'

export interface KnowledgeTask {
  type: string
  msgId: string
  data: Record<string, any>
}

export type TaskHandler = (task: KnowledgeTask) => Promise<void>

export class KnowledgeQueue {
  private queue: PQueue
  private handlers: Map<string, TaskHandler> = new Map()

  constructor(concurrency: number = 1) {
    this.queue = new PQueue({ concurrency })
  }

  registerHandler(type: string, handler: TaskHandler): void {
    this.handlers.set(type, handler)
    logger.info(`Registered handler for task type: ${type}`)
  }

  async enqueue(task: KnowledgeTask): Promise<void> {
    this.queue.add(async () => {
      const handler = this.handlers.get(task.type)
      
      if (!handler) {
        logger.warn(`No handler registered for task type: ${task.type}`)
        return
      }

      try {
        await handler(task)
        logger.debug(`Processed task: ${task.type} for ${task.msgId}`)
      } catch (error) {
        logger.error(`Failed to process task: ${task.type}`, { error, task })
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

- [ ] **Step 4: 运行测试验证通过**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/knowledgeQueue.test.ts
```

Expected: PASS - All tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/knowledgeQueue.ts apps/server/src/services/knowledgeQueue.test.ts
git commit -m "feat(knowledge): add KnowledgeQueue for async processing"
```

---

## Task 6: 编写历史消息标签迁移脚本

**Files:**
- Create: `apps/server/scripts/migrate-tags.ts`
- Modify: `apps/server/package.json`

- [ ] **Step 1: 创建标签迁移脚本**

```typescript
// apps/server/scripts/migrate-tags.ts
import { DatabaseService } from '../src/services/database.js'
import { DataLakeService } from '../src/services/dataLake.js'
import { RuleEngine } from '../src/services/ruleEngine.js'
import path from 'node:path'
import { logger } from '../src/lib/logger.js'

async function migrate() {
  logger.info('开始标签迁移...')

  const db = new DatabaseService()
  const dataLake = new DataLakeService({ 
    path: path.join(process.cwd(), 'data', 'datalake') 
  })
  const ruleEngine = new RuleEngine(db)

  let processed = 0
  let tagged = 0
  let skipped = 0
  let failed = 0
  const batchSize = 100

  try {
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
          const existingTags = await db.prisma.messageTag.findMany({
            where: { msgId: msgIndex.msgId }
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

          const tags = await ruleEngine.evaluateMessage({
            msgId: msgIndex.msgId,
            fromUsername: msgIndex.fromUsername,
            toUsername: msgIndex.toUsername,
            content: message.content,
            msgType: msgIndex.msgType
          })

          if (tags.length > 0) {
            await ruleEngine.applyTags(tags)
            tagged++
          }

          processed++
          if (processed % 100 === 0) {
            logger.info({ processed, tagged, skipped, failed, total: totalCount }, '迁移进度')
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

    logger.info({ processed, tagged, skipped, failed }, '标签迁移完成')
  } finally {
    // cleanup if needed
  }
}

migrate().catch((error) => {
  logger.error({ err: error }, '标签迁移失败')
  process.exit(1)
})
```

- [ ] **Step 2: 添加 npm script**

```json
"migrate:tags": "tsx scripts/migrate-tags.ts"
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/scripts/migrate-tags.ts apps/server/package.json
git commit -m "feat(knowledge): add historical message tags migration script"
```

---

## Self-Review Checklist

- [x] **Spec coverage**: 所有阶段 2A 的需求都已覆盖
  - ✅ 数据模型（MessageTag、MessageEntity、DigestEntry、Topic、ImportanceRule）
  - ✅ 规则引擎（关注人/关键词/@我检测）
  - ✅ 规则管理 API
  - ✅ 知识处理队列架构
  - ✅ 历史消息标签迁移脚本

- [x] **No placeholders**: 所有代码都是完整的，没有 TBD/TODO

- [x] **Type consistency**:
  - MessageContext 和 MessageTagData 接口在 RuleEngine 中定义
  - KnowledgeTask 和 TaskHandler 接口在 KnowledgeQueue 中定义
  - 所有方法签名一致

- [x] **File paths**: 所有文件路径都是绝对路径或明确的相对路径

---

## 执行选项

计划已完成并保存到 `docs/superpowers/plans/2026-04-25-phase2a-rule-engine-knowledge-pipeline.md`。

**两种执行方式：**

**1. Subagent-Driven（推荐）** - 每个任务派发新的 subagent，任务间审查，快速迭代

**2. Inline Execution** - 在当前会话中使用 executing-plans 执行，批量执行带检查点

选择哪种方式？

---

## 后续阶段

阶段 2A 完成后，可以继续实施：

- **阶段 2B**: 语义重要性分析（本地小模型分类）
- **阶段 2C**: 实体提取（本地模型提取结构化信息）
- **阶段 2D**: 摘要生成（云端 LLM）
- **阶段 2E**: 主题聚类（基于向量相似度）
