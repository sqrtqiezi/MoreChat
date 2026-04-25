# 阶段 2C：实体提取 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从文本消息中本地提取结构化实体（person / project / date / amount / action_item），写入 MessageEntity，供后续搜索筛选与摘要使用。

**Architecture:** 不引入新模型，使用纯规则/正则的本地实体提取器 EntityExtractorService。person 优先与 Contact 表对齐（联系人 username/nickname/remark 命中），其余类型用中文友好的正则与短语前缀识别。通过既有 KnowledgeQueue 异步处理，与语义重要性分析（2B）并行解耦。新增 entities 查询 API，便于前端展示。

**Tech Stack:** TypeScript + Vitest + 现有 DatabaseService / DataLakeService / KnowledgeQueue / MessageEntity；不新增 npm 依赖、不下载新模型。

**Spec:** `docs/superpowers/specs/2026-04-24-morechat-knowledge-base-redesign.md` 第四章（4.2 异步处理 第 5 项实体提取）；第五章 5.1（MessageEntity 模型）。

**Dependencies:** 阶段 2A 已完成的 MessageEntity 表 / KnowledgeQueue / RuleEngine；阶段 2B 已完成的语义重要性分析（共享同一异步队列）。

---

## File Structure

```
apps/server/src/services/
  entityExtractorService.ts        - 本地实体提取（person/project/date/amount/action_item）
  entityExtractorService.test.ts   - 提取器测试
  message.ts                       - 修改：对文本消息入队 entity-extraction 任务
  index.ts                         - 修改：初始化 EntityExtractorService 并注册 entity-extraction handler
apps/server/src/routes/
  entities.ts                      - 实体查询 API
  entities.test.ts                 - API 测试
  app.ts                           - 修改：注册实体路由
apps/server/scripts/
  migrate-entities.ts              - 历史消息实体迁移脚本
apps/server/package.json           - 修改：新增 migrate:entities 命令
```

---

## Task 1: 创建 EntityExtractorService

**Files:**
- Create: `apps/server/src/services/entityExtractorService.ts`
- Create: `apps/server/src/services/entityExtractorService.test.ts`

- [ ] **Step 1: 编写 EntityExtractorService 测试**

```typescript
// apps/server/src/services/entityExtractorService.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EntityExtractorService } from './entityExtractorService.js'

describe('EntityExtractorService', () => {
  let extractor: EntityExtractorService
  let mockDb: any

  beforeEach(() => {
    mockDb = {
      prisma: {
        contact: {
          findMany: vi.fn().mockResolvedValue([
            { username: 'wxid_alice', nickname: '爱丽丝', remark: '产品经理 Alice' },
            { username: 'wxid_bob', nickname: 'Bob', remark: null },
          ])
        }
      }
    }
    extractor = new EntityExtractorService(mockDb)
  })

  it('should extract @mention as person', async () => {
    const entities = await extractor.extract('@爱丽丝 请看一下方案')
    expect(entities).toContainEqual({ type: 'person', value: '爱丽丝' })
  })

  it('should match contact nickname as person without @', async () => {
    const entities = await extractor.extract('刚刚 Alice 同步了进度')
    expect(entities.some(e => e.type === 'person' && e.value === 'Alice')).toBe(true)
  })

  it('should extract ISO and Chinese dates', async () => {
    const entities = await extractor.extract('请在 2026-04-25 之前完成，最晚不超过4月30日')
    expect(entities).toContainEqual({ type: 'date', value: '2026-04-25' })
    expect(entities).toContainEqual({ type: 'date', value: '4月30日' })
  })

  it('should extract relative dates', async () => {
    const entities = await extractor.extract('今天加班，明天发版，下周复盘')
    const values = entities.filter(e => e.type === 'date').map(e => e.value)
    expect(values).toContain('今天')
    expect(values).toContain('明天')
    expect(values).toContain('下周')
  })

  it('should extract amounts in CNY', async () => {
    const entities = await extractor.extract('预算 1,200 元，最多不超过 1.5 万；服务费 ¥500')
    const values = entities.filter(e => e.type === 'amount').map(e => e.value)
    expect(values).toContain('1,200元')
    expect(values).toContain('1.5万')
    expect(values).toContain('¥500')
  })

  it('should extract action items by imperative prefixes', async () => {
    const entities = await extractor.extract('请确认一下排期\n麻烦上传文件\n记得发周报')
    const values = entities.filter(e => e.type === 'action_item').map(e => e.value)
    expect(values).toContain('确认一下排期')
    expect(values).toContain('上传文件')
    expect(values).toContain('发周报')
  })

  it('should extract project names from quoted phrases', async () => {
    const entities = await extractor.extract('「智慧客服」项目的进展，《数据中台》也要同步')
    const values = entities.filter(e => e.type === 'project').map(e => e.value)
    expect(values).toContain('智慧客服')
    expect(values).toContain('数据中台')
  })

  it('should deduplicate identical entities', async () => {
    const entities = await extractor.extract('明天交付；明天确认；明天上线')
    const dates = entities.filter(e => e.type === 'date' && e.value === '明天')
    expect(dates).toHaveLength(1)
  })

  it('should return empty for empty content', async () => {
    const entities = await extractor.extract('')
    expect(entities).toEqual([])
  })

  it('should refresh contact cache after refreshContacts()', async () => {
    await extractor.extract('hello')
    expect(mockDb.prisma.contact.findMany).toHaveBeenCalledTimes(1)

    await extractor.extract('hi')
    expect(mockDb.prisma.contact.findMany).toHaveBeenCalledTimes(1)

    await extractor.refreshContacts()
    await extractor.extract('hi again')
    expect(mockDb.prisma.contact.findMany).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/entityExtractorService.test.ts
```

Expected: FAIL — `EntityExtractorService not defined`

- [ ] **Step 3: 实现 EntityExtractorService**

```typescript
// apps/server/src/services/entityExtractorService.ts
import { logger } from '../lib/logger.js'
import type { DatabaseService } from './database.js'

export interface ExtractedEntity {
  type: 'person' | 'project' | 'date' | 'amount' | 'action_item'
  value: string
}

interface ContactAlias {
  username: string
  aliases: string[]
}

const ACTION_PREFIXES = ['请', '麻烦', '记得', '需要', '务必', '帮我', '帮忙']

const DATE_REGEXES = [
  /\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/g,
  /\d{1,2}月\d{1,2}日/g,
  /(今天|明天|后天|昨天|前天|本周|下周|上周|本月|下月|这个月)/g,
]

const AMOUNT_REGEXES = [
  /¥\s?\d+(?:[,.]\d+)*/g,
  /\$\s?\d+(?:[,.]\d+)*/g,
  /\d+(?:[,.]\d+)*\s*(?:元|块|万|亿|RMB|CNY)/g,
]

const PROJECT_REGEXES = [
  /「([^」]{1,30})」/g,
  /《([^》]{1,30})》/g,
  /【([^】]{1,30})】/g,
]

const MENTION_REGEX = /@([^\s@:：,，。.!！?？]{1,30})/g

export class EntityExtractorService {
  private contactsLoaded = false
  private aliases: ContactAlias[] = []

  constructor(private db: DatabaseService) {}

  async refreshContacts(): Promise<void> {
    this.contactsLoaded = false
    await this.loadContacts()
  }

  private async loadContacts(): Promise<void> {
    if (this.contactsLoaded) return
    const contacts = await this.db.prisma.contact.findMany({
      select: { username: true, nickname: true, remark: true },
    })
    this.aliases = contacts
      .map((c) => {
        const aliases = [c.nickname, c.remark]
          .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
          .map((v) => v.trim())
          .flatMap((v) => v.split(/\s+/))
          .filter((v) => v.length >= 2)
        return { username: c.username, aliases: Array.from(new Set(aliases)) }
      })
      .filter((c) => c.aliases.length > 0)
    this.contactsLoaded = true
  }

  async extract(content: string): Promise<ExtractedEntity[]> {
    if (!content || !content.trim()) return []

    try {
      await this.loadContacts()
    } catch (error) {
      logger.warn('Failed to load contacts for entity extraction', error)
    }

    const results: ExtractedEntity[] = []

    for (const m of content.matchAll(MENTION_REGEX)) {
      const value = m[1].trim()
      if (value) results.push({ type: 'person', value })
    }

    for (const alias of this.aliases.flatMap((a) => a.aliases)) {
      if (content.includes(alias)) {
        results.push({ type: 'person', value: alias })
      }
    }

    for (const regex of DATE_REGEXES) {
      for (const m of content.matchAll(regex)) {
        results.push({ type: 'date', value: m[0] })
      }
    }

    for (const regex of AMOUNT_REGEXES) {
      for (const m of content.matchAll(regex)) {
        results.push({ type: 'amount', value: m[0].replace(/\s+/g, '') })
      }
    }

    for (const regex of PROJECT_REGEXES) {
      for (const m of content.matchAll(regex)) {
        const value = m[1].trim()
        if (value) results.push({ type: 'project', value })
      }
    }

    const lines = content.split(/[\n。！？!?]/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const matchedPrefix = ACTION_PREFIXES.find((p) => trimmed.startsWith(p))
      if (matchedPrefix) {
        const value = trimmed.slice(matchedPrefix.length).trim()
        if (value) results.push({ type: 'action_item', value })
      }
    }

    return this.dedupe(results)
  }

  private dedupe(entities: ExtractedEntity[]): ExtractedEntity[] {
    const seen = new Set<string>()
    const out: ExtractedEntity[] = []
    for (const e of entities) {
      const key = `${e.type}::${e.value}`
      if (!seen.has(key)) {
        seen.add(key)
        out.push(e)
      }
    }
    return out
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/entityExtractorService.test.ts
```

Expected: PASS — All tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/entityExtractorService.ts apps/server/src/services/entityExtractorService.test.ts
git commit -m "feat(knowledge): add local EntityExtractorService"
```

---

## Task 2: 集成实体提取到消息处理流程

**Files:**
- Modify: `apps/server/src/services/message.ts`
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: 在 index.ts 中初始化 EntityExtractorService 并注册 entity-extraction handler**

在已有 SemanticImportanceService 注册之后追加：

```typescript
// apps/server/src/index.ts
import { EntityExtractorService } from './services/entityExtractorService.js'

const entityExtractorService = new EntityExtractorService(databaseService)

knowledgeQueue.registerHandler('entity-extraction', async (task) => {
  const entities = await entityExtractorService.extract(task.data.content)
  if (entities.length > 0) {
    await databaseService.prisma.messageEntity.createMany({
      data: entities.map((e) => ({
        msgId: task.msgId,
        type: e.type,
        value: e.value,
      })),
      skipDuplicates: true,
    })
  }
})
```

- [ ] **Step 2: 在 MessageService.handleIncomingMessage 中入队 entity-extraction**

在已有 `semantic-importance` 入队之后追加（无论规则是否命中都执行实体提取，因为实体与重要性是两件事）：

```typescript
// apps/server/src/services/message.ts
if (this.knowledgeQueue && message.msgType === 1 && message.content) {
  try {
    await this.knowledgeQueue.enqueue({
      type: 'entity-extraction',
      msgId: message.msgId,
      data: { content: message.content },
    })
  } catch (error) {
    logger.warn({ msgId: message.msgId, err: error }, 'Failed to enqueue entity extraction')
  }
}
```

- [ ] **Step 3: 运行现有 message 测试验证未破坏**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/message.test.ts
```

Expected: PASS — 现有测试仍然通过

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/services/message.ts apps/server/src/index.ts
git commit -m "feat(knowledge): enqueue entity extraction for text messages"
```

---

## Task 3: 实体查询 API

**Files:**
- Create: `apps/server/src/routes/entities.ts`
- Create: `apps/server/src/routes/entities.test.ts`
- Modify: `apps/server/src/app.ts`

- [ ] **Step 1: 编写 API 测试**

```typescript
// apps/server/src/routes/entities.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono } from 'hono'
import { entitiesRoutes } from './entities.js'

describe('Entities API', () => {
  let app: Hono
  let mockDb: any

  beforeEach(() => {
    mockDb = {
      prisma: {
        messageEntity: {
          findMany: vi.fn(),
          groupBy: vi.fn(),
        },
      },
    }
    app = new Hono()
    app.route('/api/entities', entitiesRoutes(mockDb as any))
  })

  it('GET /api/entities/by-message/:msgId should return entities for that message', async () => {
    mockDb.prisma.messageEntity.findMany.mockResolvedValue([
      { id: '1', msgId: 'm1', type: 'person', value: 'Alice', createdAt: new Date() },
      { id: '2', msgId: 'm1', type: 'date', value: '明天', createdAt: new Date() },
    ])

    const res = await app.request('/api/entities/by-message/m1')
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data).toHaveLength(2)
    expect(mockDb.prisma.messageEntity.findMany).toHaveBeenCalledWith({
      where: { msgId: 'm1' },
      orderBy: { createdAt: 'asc' },
    })
  })

  it('GET /api/entities/top should return top values grouped by type', async () => {
    mockDb.prisma.messageEntity.groupBy.mockResolvedValue([
      { type: 'person', value: 'Alice', _count: { _all: 5 } },
      { type: 'date', value: '明天', _count: { _all: 3 } },
    ])

    const res = await app.request('/api/entities/top?limit=10')
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data).toHaveLength(2)
    expect(mockDb.prisma.messageEntity.groupBy).toHaveBeenCalled()
  })

  it('GET /api/entities/top should support type filter', async () => {
    mockDb.prisma.messageEntity.groupBy.mockResolvedValue([])

    await app.request('/api/entities/top?type=person')

    const callArg = mockDb.prisma.messageEntity.groupBy.mock.calls[0][0]
    expect(callArg.where).toEqual({ type: 'person' })
  })

  it('should reject invalid type filter', async () => {
    const res = await app.request('/api/entities/top?type=bogus')
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/routes/entities.test.ts
```

Expected: FAIL — `entitiesRoutes` not defined

- [ ] **Step 3: 实现实体路由**

```typescript
// apps/server/src/routes/entities.ts
import { Hono } from 'hono'
import { z } from 'zod'
import type { DatabaseService } from '../services/database.js'

const TYPE_VALUES = ['person', 'project', 'date', 'amount', 'action_item'] as const

const topQuerySchema = z.object({
  type: z.enum(TYPE_VALUES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export function entitiesRoutes(db: DatabaseService) {
  const app = new Hono()

  app.get('/by-message/:msgId', async (c) => {
    const msgId = c.req.param('msgId')
    const entities = await db.prisma.messageEntity.findMany({
      where: { msgId },
      orderBy: { createdAt: 'asc' },
    })
    return c.json({ success: true, data: entities })
  })

  app.get('/top', async (c) => {
    const parsed = topQuerySchema.safeParse(c.req.query())
    if (!parsed.success) {
      return c.json({ success: false, error: parsed.error.message }, 400)
    }

    const { type, limit } = parsed.data
    const grouped = await db.prisma.messageEntity.groupBy({
      by: ['type', 'value'],
      where: type ? { type } : {},
      _count: { _all: true },
      orderBy: { _count: { value: 'desc' } },
      take: limit,
    })

    return c.json({
      success: true,
      data: grouped.map((g: any) => ({
        type: g.type,
        value: g.value,
        count: g._count._all,
      })),
    })
  })

  return app
}
```

- [ ] **Step 4: 在 app.ts 中注册实体路由**

按现有 search/rules 路由模式注册：

```typescript
// apps/server/src/app.ts
import { entitiesRoutes } from './routes/entities.js'

if (deps.databaseService) {
  app.route('/api/entities', entitiesRoutes(deps.databaseService))
}
```

- [ ] **Step 5: 运行测试验证通过**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/routes/entities.test.ts
```

Expected: PASS — All tests pass

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/routes/entities.ts apps/server/src/routes/entities.test.ts apps/server/src/app.ts
git commit -m "feat(knowledge): add entities query API"
```

---

## Task 4: 历史消息实体迁移脚本

**Files:**
- Create: `apps/server/scripts/migrate-entities.ts`
- Modify: `apps/server/package.json`

- [ ] **Step 1: 创建迁移脚本**

```typescript
// apps/server/scripts/migrate-entities.ts
import path from 'node:path'
import { logger } from '../src/lib/logger.js'
import { DatabaseService } from '../src/services/database.js'
import { DataLakeService } from '../src/services/dataLake.js'
import { EntityExtractorService } from '../src/services/entityExtractorService.js'

async function migrate() {
  logger.info('开始实体迁移...')

  const db = new DatabaseService()
  const dataLake = new DataLakeService({
    path: path.join(process.cwd(), 'data', 'datalake'),
  })
  const extractor = new EntityExtractorService(db)

  let processed = 0
  let extracted = 0
  let skipped = 0
  let failed = 0
  const batchSize = 100

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
          const existing = await db.prisma.messageEntity.findFirst({
            where: { msgId: msgIndex.msgId },
          })
          if (existing) {
            skipped++
            continue
          }

          const message = await dataLake.getMessage(msgIndex.dataLakeKey)
          if (!message.content) {
            skipped++
            continue
          }

          const entities = await extractor.extract(message.content)
          if (entities.length > 0) {
            await db.prisma.messageEntity.createMany({
              data: entities.map((e) => ({
                msgId: msgIndex.msgId,
                type: e.type,
                value: e.value,
              })),
              skipDuplicates: true,
            })
            extracted++
          }

          processed++
          if (processed % 100 === 0) {
            logger.info({ processed, extracted, skipped, failed, total: totalCount }, '迁移进度')
          }
        } catch (error: any) {
          if (error?.code === 'ENOENT') {
            skipped++
          } else {
            failed++
            logger.warn({ msgId: msgIndex.msgId, err: error }, '消息实体提取失败')
          }
        }
      }

      offset += batchSize
    }

    logger.info({ processed, extracted, skipped, failed }, '实体迁移完成')
  } finally {
    // cleanup if needed
  }
}

migrate().catch((error) => {
  logger.error({ err: error }, '实体迁移失败')
  process.exit(1)
})
```

- [ ] **Step 2: 添加 npm script**

在 `apps/server/package.json` 的 scripts 中追加：

```json
"migrate:entities": "tsx scripts/migrate-entities.ts"
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/scripts/migrate-entities.ts apps/server/package.json
git commit -m "feat(knowledge): add historical entity migration script"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** 实体提取覆盖 person / project / date / amount / action_item 五类，写入 MessageEntity；与既有 KnowledgeQueue 集成；提供历史迁移脚本与查询 API。
- [x] **No placeholders:** 全部代码为可执行内容，没有 TBD/TODO。
- [x] **Type consistency:** ExtractedEntity 类型在 EntityExtractorService 定义；KnowledgeQueue handler 使用既有 KnowledgeTask 结构；entities API 严格 Zod 校验 type 枚举。
- [x] **File paths:** 所有路径明确。

---

## 执行选项

Plan complete and saved to `docs/superpowers/plans/2026-04-25-phase2c-entity-extraction.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
