# Phase 3B：重要消息 Feed、话题列表与知识侧栏增强 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Phase 3a 知识库搜索首页基础上，新增重要消息 Feed（`/feed`）、话题列表（`/topics`）、话题详情（`/topics/:topicId`）三个前端视图，后端新增 `/api/highlights` 路由并调整 topic 详情接口，侧边栏升级为真实导航 + 轻量预览。

**Architecture:** 先完成后端数据面：新增 `/api/highlights` 读取接口，并把 `/api/topics/:topicId/messages` 从“仅消息数组”调整为“topic + messages”。前端继续复用 `KnowledgeLayout` 外壳，Search / Feed / Topics 走独立路由，服务端数据统一由 React Query 管理，`knowledgeStore` 继续只承载搜索页交互状态。

**Tech Stack:** Hono + Prisma + Vitest（后端）；React 18 + React Router + TanStack Query + Zustand + Vitest（前端）

**Spec:** `docs/superpowers/specs/2026-04-28-phase3b-highlights-topics-sidebar-design.md`

---

## 文件结构

### 新增文件

```text
apps/server/src/routes/highlights.ts
apps/server/src/routes/highlights.test.ts
apps/web/src/components/knowledge/HighlightCard.tsx
apps/web/src/components/knowledge/HighlightsList.tsx
apps/web/src/components/knowledge/KnowledgeSidebarPreview.tsx
apps/web/src/components/knowledge/TopicCard.tsx
apps/web/src/components/knowledge/TopicMessageList.tsx
apps/web/src/components/knowledge/TopicTimeline.tsx
apps/web/src/hooks/useHighlights.ts
apps/web/src/hooks/useTopicMessages.ts
apps/web/src/hooks/useTopicsPreview.ts
apps/web/src/pages/FeedPage.tsx
apps/web/src/pages/FeedPage.test.tsx
apps/web/src/pages/TopicDetailPage.tsx
apps/web/src/pages/TopicDetailPage.test.tsx
apps/web/src/pages/TopicsPage.tsx
apps/web/src/pages/TopicsPage.test.tsx
```

### 修改文件

```text
apps/server/src/app.ts
apps/server/src/routes/topics.ts
apps/server/src/routes/topics.test.ts
apps/web/src/App.tsx
apps/web/src/api/knowledge.ts
apps/web/src/components/knowledge/KnowledgeSidebar.tsx
apps/web/src/types/index.ts
```

### 单元职责

- `apps/server/src/routes/highlights.ts`：按时间倒序返回 important 消息，并尽力关联 `DigestEntry` / `KnowledgeCard`
- `apps/server/src/routes/topics.ts`：返回 topic 列表与 topic 详情（topic 元信息 + messageIndex 列表）
- `apps/web/src/api/knowledge.ts`：knowledge 页面使用的 API 客户端
- `apps/web/src/hooks/*.ts`：knowledge 页面服务端数据 hooks
- `apps/web/src/components/knowledge/*.tsx`：Feed / Topics / Sidebar 的展示组件
- `apps/web/src/pages/*.tsx`：三个知识库页面路由入口
- `apps/web/src/types/index.ts`：knowledge 相关前端类型

### 范围外

- 不做 Feed 已读/未读
- 不做知识卡片详情页
- 不做话题编辑或关闭
- 不做消息上下文内联展开
- 不移除旧聊天输入或 Emoji 相关代码

---

## Chunk 1：后端 highlights 路由

### Task 1：为 `/api/highlights` 写失败测试

**Files:**
- Create: `apps/server/src/routes/highlights.test.ts`
- Reference: `apps/server/src/routes/topics.test.ts`

- [ ] **Step 1: 新建 route 测试文件，覆盖摘要优先和降级返回**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { highlightsRoutes } from './highlights.js'
import type { DatabaseService } from '../services/database.js'

describe('highlights routes', () => {
  let app: Hono
  let mockDb: DatabaseService

  beforeEach(() => {
    mockDb = {
      prisma: {
        messageTag: {
          findMany: vi.fn(),
          count: vi.fn(),
        },
        messageIndex: {
          findMany: vi.fn(),
        },
        digestEntry: {
          findFirst: vi.fn(),
        },
        knowledgeCard: {
          findUnique: vi.fn(),
        },
      },
    } as any

    app = new Hono()
    app.route('/api/highlights', highlightsRoutes({ db: mockDb }))
  })

  it('returns important messages with digest and knowledge card when available', async () => {
    vi.mocked(mockDb.prisma.messageTag.findMany).mockResolvedValue([
      { msgId: 'm1', tag: 'important', source: 'rule:keyword', createdAt: new Date('2026-04-28T10:00:00Z') },
    ] as any)
    vi.mocked(mockDb.prisma.messageTag.count).mockResolvedValue(1)
    vi.mocked(mockDb.prisma.messageIndex.findMany).mockResolvedValue([
      {
        msgId: 'm1',
        content: '预算今晚确认',
        createTime: 1714298400,
        fromUsername: 'alice',
        toUsername: 'room-1',
        conversationId: 'conversation-1',
      },
    ] as any)
    vi.mocked(mockDb.prisma.digestEntry.findFirst).mockResolvedValue({
      id: 'd1',
      summary: '今天确认预算安排',
      messageCount: 6,
      startTime: 1714298300,
      endTime: 1714298500,
    } as any)
    vi.mocked(mockDb.prisma.knowledgeCard.findUnique).mockResolvedValue({
      id: 'k1',
      title: '预算确认',
      summary: '预算将在今晚定稿',
      decisions: '今晚确认预算版本',
      actionItems: '财务同步表格',
    } as any)

    const res = await app.request('/api/highlights?limit=20&offset=0')
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.total).toBe(1)
    expect(body.data.items[0]).toMatchObject({
      msgId: 'm1',
      digest: {
        id: 'd1',
        summary: '今天确认预算安排',
      },
      knowledgeCard: {
        id: 'k1',
        title: '预算确认',
      },
    })
  })

  it('returns the raw message when no digest is available', async () => {
    vi.mocked(mockDb.prisma.messageTag.findMany).mockResolvedValue([
      { msgId: 'm2', tag: 'important', source: 'rule:mention', createdAt: new Date('2026-04-28T11:00:00Z') },
    ] as any)
    vi.mocked(mockDb.prisma.messageTag.count).mockResolvedValue(1)
    vi.mocked(mockDb.prisma.messageIndex.findMany).mockResolvedValue([
      {
        msgId: 'm2',
        content: '@你 明早带合同',
        createTime: 1714302000,
        fromUsername: 'bob',
        toUsername: 'room-2',
        conversationId: 'conversation-2',
      },
    ] as any)
    vi.mocked(mockDb.prisma.digestEntry.findFirst).mockResolvedValue(null)

    const res = await app.request('/api/highlights')
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.items[0]).toMatchObject({
      msgId: 'm2',
      content: '@你 明早带合同',
      digest: undefined,
      knowledgeCard: undefined,
    })
  })

  it('returns 400 for invalid pagination', async () => {
    const res = await app.request('/api/highlights?limit=0&offset=-1')
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error.message).toBe('Invalid query parameters')
  })

  it('returns 500 when highlight query fails', async () => {
    vi.mocked(mockDb.prisma.messageTag.findMany).mockRejectedValue(new Error('db down'))

    const res = await app.request('/api/highlights')
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.success).toBe(false)
    expect(body.error.message).toBe('Failed to list highlights')
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/routes/highlights.test.ts`
Expected: FAIL，提示 `Cannot find module './highlights.js'` 或 `highlightsRoutes` 未定义

### Task 2：实现 `/api/highlights` 路由

**Files:**
- Create: `apps/server/src/routes/highlights.ts`
- Test: `apps/server/src/routes/highlights.test.ts`

- [ ] **Step 1: 写最小实现，使测试通过**

```ts
// ABOUTME: 重要消息读取 API，按时间倒序返回 important 消息
// ABOUTME: 为 Feed 页面尽力补齐摘要和知识卡片信息

import { Hono } from 'hono'
import { z } from 'zod'
import type { DatabaseService } from '../services/database.js'
import { logger } from '../lib/logger.js'

interface HighlightsRouteDeps {
  db: DatabaseService
}

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

export function highlightsRoutes(deps: HighlightsRouteDeps) {
  const router = new Hono()

  router.get('/', async (c) => {
    try {
      const parsed = listQuerySchema.safeParse(c.req.query())
      if (!parsed.success) {
        return c.json({
          success: false,
          error: { message: 'Invalid query parameters', details: parsed.error.errors },
        }, 400)
      }

      const tags = await deps.db.prisma.messageTag.findMany({
        where: { tag: 'important' },
        orderBy: { createdAt: 'desc' },
        take: parsed.data.limit,
        skip: parsed.data.offset,
      })
      const total = await deps.db.prisma.messageTag.count({ where: { tag: 'important' } })

      if (tags.length === 0) {
        return c.json({
          success: true,
          data: { items: [], total, limit: parsed.data.limit, offset: parsed.data.offset },
        })
      }

      const indexes = await deps.db.prisma.messageIndex.findMany({
        where: { msgId: { in: tags.map((tag: { msgId: string }) => tag.msgId) } },
      })
      const indexById = new Map(indexes.map((index: any) => [index.msgId, index]))

      const items = await Promise.all(tags.map(async (tag: any) => {
        const index = indexById.get(tag.msgId)
        if (!index) {
          return null
        }

        const digest = await deps.db.prisma.digestEntry.findFirst({
          where: {
            conversationId: index.conversationId,
            status: 'ready',
            startTime: { lte: index.createTime },
            endTime: { gte: index.createTime },
          },
          orderBy: { endTime: 'desc' },
        })

        const knowledgeCard = digest
          ? await deps.db.prisma.knowledgeCard.findUnique({ where: { digestEntryId: digest.id } })
          : null

        return {
          msgId: index.msgId,
          content: index.content,
          createTime: index.createTime,
          fromUsername: index.fromUsername,
          toUsername: index.toUsername,
          conversationId: index.conversationId,
          tags: [{ tag: tag.tag, source: tag.source }],
          digest: digest
            ? {
                id: digest.id,
                summary: digest.summary,
                messageCount: digest.messageCount,
                startTime: digest.startTime,
                endTime: digest.endTime,
              }
            : undefined,
          knowledgeCard: knowledgeCard
            ? {
                id: knowledgeCard.id,
                title: knowledgeCard.title,
                summary: knowledgeCard.summary,
                decisions: knowledgeCard.decisions,
                actionItems: knowledgeCard.actionItems,
              }
            : undefined,
        }
      }))

      return c.json({
        success: true,
        data: {
          items: items.filter(Boolean),
          total,
          limit: parsed.data.limit,
          offset: parsed.data.offset,
        },
      })
    } catch (error) {
      logger.error({ err: error }, 'Failed to list highlights')
      return c.json({ success: false, error: { message: 'Failed to list highlights' } }, 500)
    }
  })

  return router
}
```

- [ ] **Step 2: 运行测试，确认通过**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/routes/highlights.test.ts`
Expected: PASS

### Task 3：注册 `/api/highlights` 路由

**Files:**
- Modify: `apps/server/src/app.ts`
- Test: `apps/server/src/routes/highlights.test.ts`

- [ ] **Step 1: 在 `app.ts` 引入并挂载 highlightsRoutes**

```ts
import { highlightsRoutes } from './routes/highlights.js'
```

在 `if (deps.db) { ... }` 中加入：

```ts
app.route('/api/highlights', highlightsRoutes({ db: deps.db }))
```

使其与：

```ts
app.route('/api/entities', entitiesRoutes({ db: deps.db }))
app.route('/api/topics', topicsRoutes({ db: deps.db }))
```

并列。

- [ ] **Step 2: 运行路由测试与类型检查**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/routes/highlights.test.ts src/routes/topics.test.ts && pnpm type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/routes/highlights.ts apps/server/src/routes/highlights.test.ts apps/server/src/app.ts
git commit -m "feat(server): add highlights feed route"
```

---

## Chunk 2：topic 详情接口调整

### Task 4：先写 topic 详情返回结构的失败测试

**Files:**
- Modify: `apps/server/src/routes/topics.test.ts`
- Reference: `apps/server/src/routes/topics.ts`

- [ ] **Step 1: 把详情接口断言改为 `topic + messages` 结构**

把现有 `returns topic messages by joining TopicMessage to MessageIndex` 测试替换为：

```ts
it('returns topic metadata with ordered messages', async () => {
  vi.mocked(mockDb.prisma.topic.findUnique).mockResolvedValue({
    id: 'topic_1',
    title: '预算主题',
    summary: '近期预算讨论',
    messageCount: 2,
    participantCount: 3,
    lastSeenAt: 200,
    status: 'active',
    kind: 'window',
  } as any)
  vi.mocked(mockDb.prisma.topicMessage.findMany).mockResolvedValue([
    { msgId: 'm1', topicId: 'topic_1' },
    { msgId: 'm2', topicId: 'topic_1' },
  ] as any)
  vi.mocked(mockDb.prisma.messageIndex.findMany).mockResolvedValue([
    { msgId: 'm1', createTime: 100 },
    { msgId: 'm2', createTime: 200 },
  ] as any)

  const res = await app.request('/api/topics/topic_1/messages')
  const body = await res.json()

  expect(res.status).toBe(200)
  expect(body.success).toBe(true)
  expect(body.data).toEqual({
    topic: expect.objectContaining({ id: 'topic_1', title: '预算主题' }),
    messages: [
      expect.objectContaining({ msgId: 'm1', createTime: 100 }),
      expect.objectContaining({ msgId: 'm2', createTime: 200 }),
    ],
  })
})
```

并在 `beforeEach` mock 中补上：

```ts
topic: {
  findMany: vi.fn(),
  findUnique: vi.fn(),
},
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/routes/topics.test.ts`
Expected: FAIL，当前接口仍返回消息数组

### Task 5：实现 topic 详情接口新结构

**Files:**
- Modify: `apps/server/src/routes/topics.ts`
- Test: `apps/server/src/routes/topics.test.ts`

- [ ] **Step 1: 在 `topics.ts` 先查 topic，再返回 topic + messages**

把 `router.get('/:topicId/messages', ...)` 改成：

```ts
router.get('/:topicId/messages', async (c) => {
  try {
    const topicId = c.req.param('topicId')
    const topic = await deps.db.prisma.topic.findUnique({ where: { id: topicId } })

    if (!topic) {
      return c.json({ success: false, error: { message: 'Topic not found' } }, 404)
    }

    const rows = await deps.db.prisma.topicMessage.findMany({
      where: { topicId },
      orderBy: { msgId: 'asc' },
    })

    if (rows.length === 0) {
      return c.json({ success: true, data: { topic, messages: [] } })
    }

    const messages = await deps.db.prisma.messageIndex.findMany({
      where: {
        msgId: { in: rows.map((row: { msgId: string }) => row.msgId) },
      },
      orderBy: { createTime: 'asc' },
    })

    return c.json({ success: true, data: { topic, messages } })
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch topic messages')
    return c.json({ success: false, error: { message: 'Failed to fetch topic messages' } }, 500)
  }
})
```

- [ ] **Step 2: 为 404 情况补一个测试**

```ts
it('returns 404 when the topic does not exist', async () => {
  vi.mocked(mockDb.prisma.topic.findUnique).mockResolvedValue(null)

  const res = await app.request('/api/topics/missing/messages')
  const body = await res.json()

  expect(res.status).toBe(404)
  expect(body.success).toBe(false)
  expect(body.error.message).toBe('Topic not found')
})
```

- [ ] **Step 3: 运行测试，确认通过**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/routes/topics.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/routes/topics.ts apps/server/src/routes/topics.test.ts
git commit -m "feat(server): return topic detail payload"
```

---

## Chunk 3：前端类型与 API 客户端

### Task 6：先写前端类型失败用例

**Files:**
- Modify: `apps/web/src/pages/KnowledgePage.test.tsx`
- Modify: `apps/web/src/types/index.ts`

- [ ] **Step 1: 在测试里先引用还不存在的 highlights API 返回类型**

在 `KnowledgePage.test.tsx` 顶部附近加入一个类型检查用的 mock 片段：

```ts
const highlightFixture = {
  msgId: 'm1',
  content: '预算今晚确认',
  createTime: 1710000000,
  fromUsername: 'alice',
  toUsername: 'room-1',
  conversationId: 'conversation-1',
  tags: [{ tag: 'important', source: 'rule:keyword' }],
}
```

然后在新测试文件会真正使用它。当前步骤只为了让后续类型缺失能暴露出来。

- [ ] **Step 2: 运行前端类型检查，确认后续类型尚不存在**

Run: `cd /Users/niujin/develop/MoreChat/apps/web && pnpm type-check`
Expected: FAIL（在真正接入新页面测试前，也可能 PASS；若 PASS，继续下一步，不阻塞）

### Task 7：补齐 knowledge 相关类型与 API 方法

**Files:**
- Modify: `apps/web/src/types/index.ts`
- Modify: `apps/web/src/api/knowledge.ts`

- [ ] **Step 1: 在 `types/index.ts` 新增 highlights 与 topic detail 类型**

```ts
export interface HighlightTag {
  tag: string;
  source: string;
}

export interface HighlightDigest {
  id: string;
  summary: string;
  messageCount: number;
  startTime: number;
  endTime: number;
}

export interface HighlightKnowledgeCard {
  id: string;
  title: string;
  summary: string;
  decisions: string;
  actionItems: string;
}

export interface HighlightItem {
  msgId: string;
  content: string;
  createTime: number;
  fromUsername: string;
  toUsername: string;
  conversationId: string;
  tags: HighlightTag[];
  digest?: HighlightDigest;
  knowledgeCard?: HighlightKnowledgeCard;
}

export interface HighlightsResponse {
  items: HighlightItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface TopicDetailResponse {
  topic: TopicSummary;
  messages: SearchResultItem[];
}
```

- [ ] **Step 2: 在 `knowledge.ts` 扩展 API 方法**

```ts
import type {
  HighlightItem,
  HighlightsResponse,
  SearchFilters,
  SearchMode,
  SearchResponse,
  TopicDetailResponse,
  TopicSummary,
} from '../types';
```

给 `knowledgeApi` 增加：

```ts
  async listHighlights(limit = 20, offset = 0): Promise<HighlightsResponse> {
    const response = await client.get<ApiResponse<HighlightsResponse>>('/highlights', {
      params: { limit, offset },
    });

    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error?.message || 'Failed to load highlights');
    }

    return response.data.data;
  },

  async getTopicMessages(topicId: string): Promise<TopicDetailResponse> {
    const response = await client.get<ApiResponse<TopicDetailResponse>>(`/topics/${topicId}/messages`);

    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error?.message || 'Failed to load topic detail');
    }

    return response.data.data;
  },
```

保留现有 `search` / `listTopics` 不动。

- [ ] **Step 3: 运行前端类型检查**

Run: `cd /Users/niujin/develop/MoreChat/apps/web && pnpm type-check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/types/index.ts apps/web/src/api/knowledge.ts
git commit -m "feat(web): add highlights and topic detail types"
```

---

## Chunk 4：前端数据 hooks

### Task 8：先写 hooks 的失败测试占位

**Files:**
- Create: `apps/web/src/pages/FeedPage.test.tsx`
- Create: `apps/web/src/pages/TopicsPage.test.tsx`
- Create: `apps/web/src/pages/TopicDetailPage.test.tsx`

- [ ] **Step 1: 为后续 hooks 准备最小页面测试壳子**

`FeedPage.test.tsx` 初始内容：

```ts
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { FeedPage } from './FeedPage'

vi.mock('../hooks/useHighlights', () => ({
  useHighlights: () => ({ data: { items: [], total: 0, limit: 20, offset: 0 }, isLoading: false }),
}))

describe('FeedPage', () => {
  it('renders the highlights heading', () => {
    render(
      <MemoryRouter>
        <FeedPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: '重要消息' })).toBeInTheDocument()
  })
})
```

当前它会因为 `FeedPage` 和 `useHighlights` 不存在而失败。

- [ ] **Step 2: 运行单测，确认失败**

Run: `cd /Users/niujin/develop/MoreChat/apps/web && npx vitest run src/pages/FeedPage.test.tsx`
Expected: FAIL，提示 `Cannot find module '../hooks/useHighlights'` 或 `./FeedPage`

### Task 9：实现 `useHighlights`、`useTopicMessages`、`useTopicsPreview`

**Files:**
- Create: `apps/web/src/hooks/useHighlights.ts`
- Create: `apps/web/src/hooks/useTopicMessages.ts`
- Create: `apps/web/src/hooks/useTopicsPreview.ts`
- Reference: `apps/web/src/hooks/useTopics.ts`

- [ ] **Step 1: 新建 `useHighlights.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import { knowledgeApi } from '../api/knowledge';

export function useHighlights(limit = 20, offset = 0) {
  return useQuery({
    queryKey: ['highlights', limit, offset],
    queryFn: () => knowledgeApi.listHighlights(limit, offset),
  });
}
```

- [ ] **Step 2: 新建 `useTopicMessages.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import { knowledgeApi } from '../api/knowledge';

export function useTopicMessages(topicId: string) {
  return useQuery({
    queryKey: ['topic-messages', topicId],
    queryFn: () => knowledgeApi.getTopicMessages(topicId),
    enabled: Boolean(topicId),
  });
}
```

- [ ] **Step 3: 新建 `useTopicsPreview.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import { knowledgeApi } from '../api/knowledge';

export function useTopicsPreview() {
  return useQuery({
    queryKey: ['topics-preview'],
    queryFn: () => knowledgeApi.listTopics(3),
    staleTime: 60_000,
  });
}
```

- [ ] **Step 4: 运行类型检查**

Run: `cd /Users/niujin/develop/MoreChat/apps/web && pnpm type-check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/useHighlights.ts apps/web/src/hooks/useTopicMessages.ts apps/web/src/hooks/useTopicsPreview.ts
git commit -m "feat(web): add highlights and topic hooks"
```

---

## Chunk 5：Feed 页面

### Task 10：先写 Feed 页面的失败测试

**Files:**
- Create: `apps/web/src/pages/FeedPage.test.tsx`
- Create: `apps/web/src/components/knowledge/HighlightCard.tsx`
- Create: `apps/web/src/components/knowledge/HighlightsList.tsx`

- [ ] **Step 1: 扩展 `FeedPage.test.tsx`，覆盖摘要优先和跳转行为**

```ts
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FeedPage } from './FeedPage'

const mockNavigate = vi.fn()
const mockUseHighlights = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('../hooks/useHighlights', () => ({
  useHighlights: () => mockUseHighlights(),
}))

describe('FeedPage', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    mockUseHighlights.mockReset()
  })

  it('renders knowledge-card summary before the raw message', async () => {
    mockUseHighlights.mockReturnValue({
      data: {
        items: [
          {
            msgId: 'm1',
            content: '预算今晚确认',
            createTime: 1710000000,
            fromUsername: 'alice',
            toUsername: 'room-1',
            conversationId: 'conversation-1',
            tags: [{ tag: 'important', source: 'rule:keyword' }],
            knowledgeCard: {
              id: 'k1',
              title: '预算确认',
              summary: '预算将在今晚定稿',
              decisions: '今晚确认预算版本',
              actionItems: '财务同步表格',
            },
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      },
      isLoading: false,
    })

    render(
      <MemoryRouter>
        <FeedPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('预算确认')).toBeInTheDocument()
    expect(screen.getByText('预算将在今晚定稿')).toBeInTheDocument()
    expect(screen.getByText('预算今晚确认')).toBeInTheDocument()
  })

  it('navigates to the original conversation', async () => {
    const user = userEvent.setup()
    mockUseHighlights.mockReturnValue({
      data: {
        items: [
          {
            msgId: 'm2',
            content: '@你 明早带合同',
            createTime: 1710000300,
            fromUsername: 'bob',
            toUsername: 'room-2',
            conversationId: 'conversation-2',
            tags: [{ tag: 'important', source: 'rule:mention' }],
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      },
      isLoading: false,
    })

    render(
      <MemoryRouter>
        <FeedPage />
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('button', { name: '打开原始对话' }))
    expect(mockNavigate).toHaveBeenCalledWith('/chat?conversationId=conversation-2')
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd /Users/niujin/develop/MoreChat/apps/web && npx vitest run src/pages/FeedPage.test.tsx`
Expected: FAIL，`FeedPage` / `HighlightCard` / `HighlightsList` 尚未实现

### Task 11：实现 Feed 组件与页面

**Files:**
- Create: `apps/web/src/components/knowledge/HighlightCard.tsx`
- Create: `apps/web/src/components/knowledge/HighlightsList.tsx`
- Create: `apps/web/src/pages/FeedPage.tsx`
- Reference: `apps/web/src/components/knowledge/SearchResultCard.tsx`
- Reference: `apps/web/src/components/knowledge/SearchResultsPane.tsx`

- [ ] **Step 1: 新建 `HighlightCard.tsx`**

```ts
// ABOUTME: 重要消息卡片，优先展示知识卡片或摘要，再展示锚点消息
// ABOUTME: 为 Feed 页面提供跳转原始对话的稳定交互

import { useNavigate } from 'react-router-dom'
import type { HighlightItem } from '../../types'

interface HighlightCardProps {
  item: HighlightItem
}

function formatCreateTime(createTime: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(createTime * 1000))
}

export function HighlightCard({ item }: HighlightCardProps) {
  const navigate = useNavigate()
  const title = item.knowledgeCard?.title ?? '重要消息'
  const summary = item.knowledgeCard?.summary ?? item.digest?.summary ?? item.content

  return (
    <article className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Highlight</p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">{title}</h3>
          <p className="mt-3 text-sm leading-6 text-stone-700">{summary}</p>
          <div className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 p-4">
            <p className="line-clamp-3 text-sm leading-6 text-slate-900">{item.content}</p>
            <dl className="mt-3 grid gap-3 text-sm text-stone-600 sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-[0.2em] text-stone-400">发送人</dt>
                <dd className="mt-1 text-stone-700">{item.fromUsername}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.2em] text-stone-400">时间</dt>
                <dd className="mt-1 text-stone-700">{formatCreateTime(item.createTime)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.2em] text-stone-400">来源</dt>
                <dd className="mt-1 text-stone-700">{item.tags.map((tag) => tag.source).join(' / ')}</dd>
              </div>
            </dl>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate(`/chat?conversationId=${item.conversationId}`)}
          className="shrink-0 rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
        >
          打开原始对话
        </button>
      </div>
    </article>
  )
}
```

- [ ] **Step 2: 新建 `HighlightsList.tsx`**

```ts
import type { UseQueryResult } from '@tanstack/react-query'
import type { HighlightsResponse } from '../../types'
import { HighlightCard } from './HighlightCard'

interface HighlightsListProps {
  highlights: UseQueryResult<HighlightsResponse, Error>
}

function EmptyPanel({ title, description }: { title: string; description: string }) {
  return (
    <section className="flex flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-3xl rounded-[2rem] border border-stone-200 bg-white p-8 shadow-sm sm:p-10">
        <h2 className="text-3xl font-semibold tracking-tight text-slate-900">{title}</h2>
        <p className="mt-4 text-sm leading-6 text-stone-600 sm:text-base">{description}</p>
      </div>
    </section>
  )
}

export function HighlightsList({ highlights }: HighlightsListProps) {
  const items = highlights.data?.items ?? []

  if (highlights.isLoading) {
    return <EmptyPanel title="重要消息" description="正在加载重要消息流。" />
  }

  if (highlights.error) {
    return <EmptyPanel title="加载失败" description="重要消息暂时不可用，请稍后重试。" />
  }

  if (items.length === 0) {
    return <EmptyPanel title="暂无重要消息" description="当规则或摘要命中后，这里会显示重要消息流。" />
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col px-5 py-5 sm:px-6">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Feed</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">重要消息</h2>
        </div>
        <p className="text-sm text-stone-500">{highlights.data?.total ?? items.length} 条消息</p>
      </div>
      <div className="space-y-4 overflow-y-auto pb-6">
        {items.map((item) => (
          <HighlightCard key={item.msgId} item={item} />
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 3: 新建 `FeedPage.tsx`**

```ts
import { KnowledgeLayout } from '../components/knowledge/KnowledgeLayout'
import { HighlightsList } from '../components/knowledge/HighlightsList'
import { useHighlights } from '../hooks/useHighlights'

export function FeedPage() {
  const highlights = useHighlights()

  return (
    <KnowledgeLayout>
      <HighlightsList highlights={highlights} />
    </KnowledgeLayout>
  )
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd /Users/niujin/develop/MoreChat/apps/web && npx vitest run src/pages/FeedPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/knowledge/HighlightCard.tsx apps/web/src/components/knowledge/HighlightsList.tsx apps/web/src/pages/FeedPage.tsx apps/web/src/pages/FeedPage.test.tsx
git commit -m "feat(web): add highlights feed page"
```

---

## Chunk 6：Topics 列表与详情页

### Task 12：先写 Topics 页和详情页测试

**Files:**
- Create: `apps/web/src/pages/TopicsPage.test.tsx`
- Create: `apps/web/src/pages/TopicDetailPage.test.tsx`

- [ ] **Step 1: 新建 `TopicsPage.test.tsx`**

```ts
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TopicsPage } from './TopicsPage'

const mockNavigate = vi.fn()
const mockUseTopics = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('../hooks/useTopics', () => ({
  useTopics: () => mockUseTopics(),
}))

describe('TopicsPage', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    mockUseTopics.mockReset()
  })

  it('renders the topic timeline and navigates on click', async () => {
    const user = userEvent.setup()
    mockUseTopics.mockReturnValue({
      data: [
        {
          id: 'topic_1',
          title: '预算主题',
          summary: '近期预算讨论',
          messageCount: 8,
          participantCount: 3,
          lastSeenAt: 1710000000,
          status: 'active',
        },
      ],
      isLoading: false,
    })

    render(
      <MemoryRouter>
        <TopicsPage />
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('button', { name: '打开话题：预算主题' }))
    expect(mockNavigate).toHaveBeenCalledWith('/topics/topic_1')
  })
})
```

- [ ] **Step 2: 新建 `TopicDetailPage.test.tsx`**

```ts
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TopicDetailPage } from './TopicDetailPage'

const mockUseTopicMessages = vi.fn()

vi.mock('../hooks/useTopicMessages', () => ({
  useTopicMessages: (topicId: string) => mockUseTopicMessages(topicId),
}))

describe('TopicDetailPage', () => {
  beforeEach(() => {
    mockUseTopicMessages.mockReset()
  })

  it('renders topic metadata and messages', async () => {
    mockUseTopicMessages.mockReturnValue({
      data: {
        topic: {
          id: 'topic_1',
          title: '预算主题',
          summary: '近期预算讨论',
          messageCount: 2,
          participantCount: 3,
          lastSeenAt: 1710000000,
          status: 'active',
        },
        messages: [
          {
            msgId: 'm1',
            content: '预算今晚确认',
            createTime: 1710000000,
            fromUsername: 'alice',
            toUsername: 'room-1',
            conversationId: 'conversation-1',
          },
        ],
      },
      isLoading: false,
    })

    render(
      <MemoryRouter initialEntries={['/topics/topic_1']}>
        <Routes>
          <Route path="/topics/:topicId" element={<TopicDetailPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: '预算主题' })).toBeInTheDocument()
    expect(screen.getByText('近期预算讨论')).toBeInTheDocument()
    expect(screen.getByText('预算今晚确认')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: 运行测试，确认失败**

Run: `cd /Users/niujin/develop/MoreChat/apps/web && npx vitest run src/pages/TopicsPage.test.tsx src/pages/TopicDetailPage.test.tsx`
Expected: FAIL，相关页面和组件尚不存在

### Task 13：实现 Topics 列表页

**Files:**
- Create: `apps/web/src/components/knowledge/TopicCard.tsx`
- Create: `apps/web/src/components/knowledge/TopicTimeline.tsx`
- Create: `apps/web/src/pages/TopicsPage.tsx`
- Test: `apps/web/src/pages/TopicsPage.test.tsx`

- [ ] **Step 1: 新建 `TopicCard.tsx`**

```ts
// ABOUTME: 话题时间线卡片，展示话题摘要和统计信息
// ABOUTME: 为 Topics 页面提供进入详情页的稳定交互

import { useNavigate } from 'react-router-dom'
import type { TopicSummary } from '../../types'

interface TopicCardProps {
  topic: TopicSummary
}

function formatCreateTime(createTime: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(createTime * 1000))
}

export function TopicCard({ topic }: TopicCardProps) {
  const navigate = useNavigate()

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`打开话题：${topic.title}`}
      onClick={() => navigate(`/topics/${topic.id}`)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        navigate(`/topics/${topic.id}`)
      }}
      className="rounded-3xl border border-stone-200 bg-white p-5 text-left transition hover:border-stone-300 hover:shadow-sm"
    >
      <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Topic</p>
      <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">{topic.title}</h3>
      <p className="mt-3 text-sm leading-6 text-stone-700">{topic.summary}</p>
      <dl className="mt-4 grid gap-3 text-sm text-stone-600 sm:grid-cols-3">
        <div>
          <dt className="text-xs uppercase tracking-[0.2em] text-stone-400">消息数</dt>
          <dd className="mt-1 text-stone-700">{topic.messageCount}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.2em] text-stone-400">参与人数</dt>
          <dd className="mt-1 text-stone-700">{topic.participantCount}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.2em] text-stone-400">最后活跃</dt>
          <dd className="mt-1 text-stone-700">{formatCreateTime(topic.lastSeenAt)}</dd>
        </div>
      </dl>
    </article>
  )
}
```

- [ ] **Step 2: 新建 `TopicTimeline.tsx`**

```ts
import type { UseQueryResult } from '@tanstack/react-query'
import type { TopicSummary } from '../../types'
import { TopicCard } from './TopicCard'

interface TopicTimelineProps {
  topics: UseQueryResult<TopicSummary[], Error>
}

function EmptyPanel({ title, description }: { title: string; description: string }) {
  return (
    <section className="flex flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-3xl rounded-[2rem] border border-stone-200 bg-white p-8 shadow-sm sm:p-10">
        <h2 className="text-3xl font-semibold tracking-tight text-slate-900">{title}</h2>
        <p className="mt-4 text-sm leading-6 text-stone-600 sm:text-base">{description}</p>
      </div>
    </section>
  )
}

export function TopicTimeline({ topics }: TopicTimelineProps) {
  const items = topics.data ?? []

  if (topics.isLoading) {
    return <EmptyPanel title="话题" description="正在加载话题时间线。" />
  }

  if (topics.error) {
    return <EmptyPanel title="加载失败" description="话题列表暂时不可用，请稍后重试。" />
  }

  if (items.length === 0) {
    return <EmptyPanel title="暂无话题" description="摘要与聚类产物会在这里汇总。" />
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col px-5 py-5 sm:px-6">
      <div className="mb-4">
        <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Topics</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">话题</h2>
      </div>
      <div className="space-y-4 overflow-y-auto pb-6">
        {items.map((topic) => (
          <TopicCard key={topic.id} topic={topic} />
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 3: 新建 `TopicsPage.tsx`**

```ts
import { KnowledgeLayout } from '../components/knowledge/KnowledgeLayout'
import { TopicTimeline } from '../components/knowledge/TopicTimeline'
import { useTopics } from '../hooks/useTopics'

export function TopicsPage() {
  const topics = useTopics()

  return (
    <KnowledgeLayout>
      <TopicTimeline topics={topics} />
    </KnowledgeLayout>
  )
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd /Users/niujin/develop/MoreChat/apps/web && npx vitest run src/pages/TopicsPage.test.tsx`
Expected: PASS

### Task 14：实现 Topic 详情页

**Files:**
- Create: `apps/web/src/components/knowledge/TopicMessageList.tsx`
- Create: `apps/web/src/pages/TopicDetailPage.tsx`
- Test: `apps/web/src/pages/TopicDetailPage.test.tsx`

- [ ] **Step 1: 新建 `TopicMessageList.tsx`**

```ts
// ABOUTME: 话题详情消息列表，展示 topic 关联的 messageIndex 结果
// ABOUTME: 保持知识库卡片风格，不嵌入完整聊天窗口

import { useNavigate } from 'react-router-dom'
import type { SearchResultItem } from '../../types'

interface TopicMessageListProps {
  messages: SearchResultItem[]
}

function formatCreateTime(createTime: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(createTime * 1000))
}

export function TopicMessageList({ messages }: TopicMessageListProps) {
  const navigate = useNavigate()

  if (messages.length === 0) {
    return <p className="rounded-3xl border border-stone-200 bg-white p-5 text-sm text-stone-600">这个话题下还没有消息。</p>
  }

  return (
    <div className="space-y-4">
      {messages.map((message) => (
        <article key={message.msgId} className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
          <p className="line-clamp-4 text-sm leading-6 text-slate-900">{message.content}</p>
          <dl className="mt-4 grid gap-3 text-sm text-stone-600 sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-[0.2em] text-stone-400">发送人</dt>
              <dd className="mt-1 text-stone-700">{message.fromUsername}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.2em] text-stone-400">时间</dt>
              <dd className="mt-1 text-stone-700">{formatCreateTime(message.createTime)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.2em] text-stone-400">对话</dt>
              <dd className="mt-1 text-stone-700">{message.conversationId ?? '未关联对话'}</dd>
            </div>
          </dl>
          <button
            type="button"
            disabled={!message.conversationId}
            onClick={() => message.conversationId && navigate(`/chat?conversationId=${message.conversationId}`)}
            className="mt-4 rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            打开原始对话
          </button>
        </article>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: 新建 `TopicDetailPage.tsx`**

```ts
import { useParams } from 'react-router-dom'
import { KnowledgeLayout } from '../components/knowledge/KnowledgeLayout'
import { TopicMessageList } from '../components/knowledge/TopicMessageList'
import { useTopicMessages } from '../hooks/useTopicMessages'

export function TopicDetailPage() {
  const { topicId = '' } = useParams()
  const topicDetail = useTopicMessages(topicId)

  if (topicDetail.isLoading) {
    return (
      <KnowledgeLayout>
        <section className="flex flex-1 items-center justify-center px-6 py-12">
          <div className="w-full max-w-3xl rounded-[2rem] border border-stone-200 bg-white p-8 shadow-sm sm:p-10">
            <h2 className="text-3xl font-semibold tracking-tight text-slate-900">正在加载话题</h2>
          </div>
        </section>
      </KnowledgeLayout>
    )
  }

  if (topicDetail.error || !topicDetail.data) {
    return (
      <KnowledgeLayout>
        <section className="flex flex-1 items-center justify-center px-6 py-12">
          <div className="w-full max-w-3xl rounded-[2rem] border border-stone-200 bg-white p-8 shadow-sm sm:p-10">
            <h2 className="text-3xl font-semibold tracking-tight text-slate-900">话题加载失败</h2>
            <p className="mt-4 text-sm leading-6 text-stone-600">请稍后重试。</p>
          </div>
        </section>
      </KnowledgeLayout>
    )
  }

  const { topic, messages } = topicDetail.data

  return (
    <KnowledgeLayout>
      <section className="flex min-h-0 flex-1 flex-col px-5 py-5 sm:px-6">
        <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
          <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Topic Detail</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{topic.title}</h2>
          <p className="mt-3 text-sm leading-6 text-stone-700">{topic.summary}</p>
          <dl className="mt-4 grid gap-3 text-sm text-stone-600 sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-[0.2em] text-stone-400">消息数</dt>
              <dd className="mt-1 text-stone-700">{topic.messageCount}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.2em] text-stone-400">参与人数</dt>
              <dd className="mt-1 text-stone-700">{topic.participantCount}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.2em] text-stone-400">状态</dt>
              <dd className="mt-1 text-stone-700">{topic.status}</dd>
            </div>
          </dl>
        </div>
        <div className="mt-5">
          <TopicMessageList messages={messages} />
        </div>
      </section>
    </KnowledgeLayout>
  )
}
```

- [ ] **Step 3: 运行测试，确认通过**

Run: `cd /Users/niujin/develop/MoreChat/apps/web && npx vitest run src/pages/TopicsPage.test.tsx src/pages/TopicDetailPage.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/knowledge/TopicCard.tsx apps/web/src/components/knowledge/TopicTimeline.tsx apps/web/src/components/knowledge/TopicMessageList.tsx apps/web/src/pages/TopicsPage.tsx apps/web/src/pages/TopicDetailPage.tsx apps/web/src/pages/TopicsPage.test.tsx apps/web/src/pages/TopicDetailPage.test.tsx
git commit -m "feat(web): add topics list and detail pages"
```

---

## Chunk 7：侧边栏升级与路由接线

### Task 15：先写侧边栏与路由失败测试

**Files:**
- Modify: `apps/web/src/pages/KnowledgePage.test.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/components/knowledge/KnowledgeSidebar.tsx`

- [ ] **Step 1: 在 `KnowledgePage.test.tsx` 增加导航存在与路由高亮断言**

新增测试：

```ts
it('renders feed and topics navigation entries', async () => {
  render(<App />)

  expect(await screen.findByRole('link', { name: 'Search' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Feed' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Topics' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Chat' })).toBeInTheDocument()
})
```

新增 root route 测试的补充断言：

```ts
expect(screen.getByRole('link', { name: 'Search' })).toHaveAttribute('aria-current', 'page')
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd /Users/niujin/develop/MoreChat/apps/web && npx vitest run src/pages/KnowledgePage.test.tsx`
Expected: FAIL，当前侧边栏是 button，不是 link，且没有 Feed 导航

### Task 16：实现侧边栏预览与 App 路由

**Files:**
- Create: `apps/web/src/components/knowledge/KnowledgeSidebarPreview.tsx`
- Modify: `apps/web/src/components/knowledge/KnowledgeSidebar.tsx`
- Modify: `apps/web/src/App.tsx`
- Reference: `apps/web/src/components/knowledge/KnowledgeLayout.tsx`

- [ ] **Step 1: 新建 `KnowledgeSidebarPreview.tsx`**

```ts
import { Link } from 'react-router-dom'
import { useHighlights } from '../../hooks/useHighlights'
import { useTopicsPreview } from '../../hooks/useTopicsPreview'

export function KnowledgeSidebarPreview() {
  const topics = useTopicsPreview()
  const highlights = useHighlights(1, 0)

  return (
    <div className="mt-5 space-y-4">
      <div className="rounded-3xl border border-stone-800 bg-stone-900/60 p-4 text-sm text-stone-400">
        <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Preview</p>
        <p className="mt-2 text-stone-200">重要消息 {highlights.data?.total ?? 0} 条</p>
      </div>
      <div className="rounded-3xl border border-stone-800 bg-stone-900/60 p-4 text-sm text-stone-400">
        <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Recent Topics</p>
        <div className="mt-3 space-y-2">
          {(topics.data ?? []).map((topic) => (
            <Link key={topic.id} to={`/topics/${topic.id}`} className="block rounded-2xl border border-stone-800 px-3 py-2 text-stone-200 transition hover:border-stone-700 hover:bg-stone-900">
              {topic.title}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 把 `KnowledgeSidebar.tsx` 改成基于 `NavLink` 的导航**

```ts
import { NavLink } from 'react-router-dom'
import { KnowledgeSidebarPreview } from './KnowledgeSidebarPreview'

const sections = [
  { label: 'Search', to: '/' },
  { label: 'Feed', to: '/feed' },
  { label: 'Topics', to: '/topics' },
  { label: 'Chat', to: '/chat' },
] as const

export function KnowledgeSidebar() {
  return (
    <aside className="w-full border-b border-stone-200 bg-stone-950 text-stone-100 lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:flex-none lg:self-start lg:border-b-0 lg:border-r">
      <div className="flex h-full flex-col px-4 py-5 sm:px-6 lg:px-5">
        <div className="mb-5">
          <p className="text-xs uppercase tracking-[0.3em] text-stone-400">Knowledge</p>
          <h1 className="mt-2 text-xl font-semibold text-stone-50">微信知识库</h1>
        </div>

        <nav aria-label="知识库导航" className="flex gap-3 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
          {sections.map((section) => (
            <NavLink
              key={section.label}
              to={section.to}
              end={section.to === '/'}
              className={({ isActive }) => `rounded-2xl border px-4 py-3 text-left text-sm transition ${
                isActive
                  ? 'border-stone-200 bg-stone-100 text-stone-950 shadow-sm'
                  : 'border-stone-800 bg-stone-900/60 text-stone-300'
              }`}
            >
              {section.label}
            </NavLink>
          ))}
        </nav>

        <KnowledgeSidebarPreview />
      </div>
    </aside>
  )
}
```

- [ ] **Step 3: 在 `App.tsx` 接入新页面路由**

```ts
import { FeedPage } from './pages/FeedPage';
import { TopicsPage } from './pages/TopicsPage';
import { TopicDetailPage } from './pages/TopicDetailPage';
```

在路由中新增：

```tsx
        <Route
          path="/feed"
          element={
            <ProtectedRoute>
              <FeedPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/topics"
          element={
            <ProtectedRoute>
              <TopicsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/topics/:topicId"
          element={
            <ProtectedRoute>
              <TopicDetailPage />
            </ProtectedRoute>
          }
        />
```

- [ ] **Step 4: 运行页面测试**

Run: `cd /Users/niujin/develop/MoreChat/apps/web && npx vitest run src/pages/KnowledgePage.test.tsx src/pages/FeedPage.test.tsx src/pages/TopicsPage.test.tsx src/pages/TopicDetailPage.test.tsx`
Expected: PASS

### Task 17：全量回归验证

**Files:**
- Verify only

- [ ] **Step 1: 运行前端相关回归测试**

Run: `cd /Users/niujin/develop/MoreChat/apps/web && npx vitest run src/pages/KnowledgePage.test.tsx src/pages/FeedPage.test.tsx src/pages/TopicsPage.test.tsx src/pages/TopicDetailPage.test.tsx src/stores/knowledgeStore.test.ts`
Expected: PASS

- [ ] **Step 2: 运行后端相关测试**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/routes/highlights.test.ts src/routes/topics.test.ts`
Expected: PASS

- [ ] **Step 3: 运行全仓类型检查**

Run: `cd /Users/niujin/develop/MoreChat && pnpm type-check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/knowledge/KnowledgeSidebarPreview.tsx apps/web/src/components/knowledge/KnowledgeSidebar.tsx apps/web/src/App.tsx apps/web/src/pages/KnowledgePage.test.tsx
git commit -m "feat(web): wire knowledge routes and sidebar"
```

---

## 收尾检查

- [ ] `/` 继续进入搜索页
- [ ] `/feed` 渲染 highlights 流，并优先显示知识卡片 / 摘要
- [ ] `/topics` 渲染 topic 时间线
- [ ] `/topics/:topicId` 渲染 topic 元信息和消息列表
- [ ] 点击 Feed / Topic 详情里的“打开原始对话”能跳转 `/chat?conversationId=...`
- [ ] 侧边栏显示 Search / Feed / Topics / Chat 四个入口，并高亮当前路由
- [ ] 侧边栏显示最近 topics 预览和重要消息计数
- [ ] `/api/highlights` 返回 `items + total + limit + offset`
- [ ] `/api/topics/:topicId/messages` 返回 `topic + messages`
- [ ] `pnpm type-check` 通过

---

## Spec 覆盖自查

- Feed 页面：Task 1-3、Task 10-11 覆盖
- Topics 列表：Task 12-13 覆盖
- Topic 详情：Task 4-5、Task 12、Task 14 覆盖
- Sidebar 导航 + 轻量预览：Task 15-17 覆盖
- `/api/highlights`：Task 1-3 覆盖
- `/api/topics/:topicId/messages` 新结构：Task 4-5 覆盖
- 不做已读/未读：全计划未引入相应字段或交互

无 spec 漏项；无 `TODO` / `TBD` / “稍后实现” 占位项；后续任务引用的类型与函数均在前序任务中已定义。
