# 阶段 3A：知识库外壳与搜索首页实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Web 端默认入口从聊天客户端切换为知识库搜索首页，并接入现有 `/api/search` 能力，保留聊天页作为次级“查看原始对话”入口。

**Architecture:** 本阶段只做前端重构，不重复实现后端搜索/摘要/聚类能力。新增一个独立的 `knowledgeStore`、一组 knowledge API/query hooks，以及一套知识库布局组件；路由层把 `/` 变为搜索首页，`/chat` 保留为原始会话浏览页，搜索结果点击后跳转到该页查看上下文。

**Tech Stack:** React 18 + React Router + TanStack Query + Zustand + Vitest + 现有 Hono API (`/api/search`, `/api/topics`, `/api/digest`, `/api/entities`)

**Spec:** `docs/superpowers/specs/2026-04-24-morechat-knowledge-base-redesign.md` 第六章、 第十一章阶段三

**依赖现状：**
- 后端 `searchRoutes`、`topicsRoutes`、`digestRoutes`、`entitiesRoutes` 已存在
- 现有前端仍以 [`apps/web/src/pages/ChatPage.tsx`](/Users/niujin/develop/MoreChat/apps/web/src/pages/ChatPage.tsx) 为默认主页
- 当前 Zustand 只有 [`apps/web/src/stores/chatStore.ts`](/Users/niujin/develop/MoreChat/apps/web/src/stores/chatStore.ts)，状态模型仍是聊天客户端思维

---

## 文件结构

### 新增文件

```text
apps/web/src/api/knowledge.ts
apps/web/src/components/knowledge/KnowledgeLayout.tsx
apps/web/src/components/knowledge/KnowledgeSidebar.tsx
apps/web/src/components/knowledge/SearchBar.tsx
apps/web/src/components/knowledge/SearchFilters.tsx
apps/web/src/components/knowledge/SearchResultCard.tsx
apps/web/src/components/knowledge/SearchResultsPane.tsx
apps/web/src/components/knowledge/KnowledgeEmptyState.tsx
apps/web/src/hooks/useSearch.ts
apps/web/src/hooks/useTopics.ts
apps/web/src/pages/KnowledgePage.tsx
apps/web/src/pages/KnowledgePage.test.tsx
apps/web/src/stores/knowledgeStore.ts
apps/web/src/stores/knowledgeStore.test.ts
```

### 修改文件

```text
apps/web/src/App.tsx
apps/web/src/pages/ChatPage.tsx
apps/web/src/types/index.ts
apps/web/src/api/chat.ts
```

### 范围外

- 本计划**不**实现重要消息 Feed 页面
- 本计划**不**实现话题详情页
- 本计划**不**删除 `MessageInput` / `ImageInput` / Emoji 代码
- 这些减法留给阶段 3B / 4

## Chunk 1: 数据模型、API 和路由骨架

### Task 1: 建立知识库类型与 API 客户端

**Files:**
- Create: `apps/web/src/api/knowledge.ts`
- Modify: `apps/web/src/types/index.ts`
- Test: `apps/web/src/stores/knowledgeStore.test.ts`

- [ ] **Step 1: 在 `types/index.ts` 添加知识库类型**

```ts
export type SearchMode = 'keyword' | 'semantic' | 'hybrid'

export interface SearchFilters {
  from?: string
  group?: string
  after?: number
  before?: number
  important?: boolean
}

export interface SearchResultItem {
  msgId: string
  content: string
  createTime: number
  fromUsername: string
  toUsername?: string
  conversationId?: string
}

export interface TopicSummary {
  id: string
  title: string
  summary: string
  messageCount: number
  participantCount: number
  lastSeenAt: number
  status: string
}
```

- [ ] **Step 2: 新建 `knowledge.ts`，封装搜索与话题读取 API**

```ts
export const knowledgeApi = {
  async search(params: {
    q: string
    type: SearchMode
    limit?: number
    offset?: number
  } & SearchFilters): Promise<{ results: SearchResultItem[]; total: number; query: string }> {
    const response = await client.get('/search', { params })
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to search')
    }
    return response.data.data
  },

  async listTopics(limit = 8): Promise<TopicSummary[]> {
    const response = await client.get('/topics', { params: { limit, offset: 0 } })
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to load topics')
    }
    return response.data.data
  },
}
```

- [ ] **Step 3: 运行 store 测试占位，确认类型导入路径正确**

Run: `cd /Users/niujin/develop/MoreChat/apps/web && npx vitest run src/stores/knowledgeStore.test.ts`

Expected: FAIL，提示 `knowledgeStore.ts` 或新增类型尚不存在

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/api/knowledge.ts apps/web/src/types/index.ts apps/web/src/stores/knowledgeStore.test.ts
git commit -m "test(web): scaffold knowledge api types"
```

### Task 2: 新建 `knowledgeStore` 和查询 hooks

**Files:**
- Create: `apps/web/src/stores/knowledgeStore.ts`
- Create: `apps/web/src/stores/knowledgeStore.test.ts`
- Create: `apps/web/src/hooks/useSearch.ts`
- Create: `apps/web/src/hooks/useTopics.ts`

- [ ] **Step 1: 先写 `knowledgeStore` 测试**

```ts
import { useKnowledgeStore } from './knowledgeStore'

describe('knowledgeStore', () => {
  it('stores query, mode and filters', () => {
    useKnowledgeStore.setState({
      query: '',
      mode: 'keyword',
      filters: {},
      selectedResultId: null,
    })

    useKnowledgeStore.getState().setQuery('预算')
    useKnowledgeStore.getState().setMode('hybrid')
    useKnowledgeStore.getState().setFilters({ important: true })

    expect(useKnowledgeStore.getState().query).toBe('预算')
    expect(useKnowledgeStore.getState().mode).toBe('hybrid')
    expect(useKnowledgeStore.getState().filters.important).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd /Users/niujin/develop/MoreChat/apps/web && npx vitest run src/stores/knowledgeStore.test.ts`

Expected: FAIL，提示 `useKnowledgeStore` 未定义

- [ ] **Step 3: 写最小实现**

```ts
interface KnowledgeState {
  query: string
  mode: SearchMode
  filters: SearchFilters
  selectedResultId: string | null
  setQuery: (query: string) => void
  setMode: (mode: SearchMode) => void
  setFilters: (filters: SearchFilters) => void
  selectResult: (msgId: string | null) => void
  reset: () => void
}
```

实现要求：
- 默认 `mode` 为 `'hybrid'`
- `setFilters` 做浅合并，不覆盖未传字段
- `reset` 仅重置知识库页状态，不触碰 `chatStore`

- [ ] **Step 4: 新建 query hooks**

`useSearch.ts`：

```ts
export function useSearch() {
  const { query, mode, filters } = useKnowledgeStore()
  return useQuery({
    queryKey: ['knowledge-search', query, mode, filters],
    queryFn: () => knowledgeApi.search({ q: query, type: mode, ...filters, limit: 30, offset: 0 }),
    enabled: query.trim().length > 0,
  })
}
```

`useTopics.ts`：

```ts
export function useTopics() {
  return useQuery({
    queryKey: ['knowledge-topics'],
    queryFn: () => knowledgeApi.listTopics(),
    staleTime: 60_000,
  })
}
```

- [ ] **Step 5: 重新运行测试**

Run: `cd /Users/niujin/develop/MoreChat/apps/web && npx vitest run src/stores/knowledgeStore.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/stores/knowledgeStore.ts apps/web/src/stores/knowledgeStore.test.ts apps/web/src/hooks/useSearch.ts apps/web/src/hooks/useTopics.ts
git commit -m "feat(web): add knowledge store and query hooks"
```

### Task 3: 调整路由，把知识库搜索页变为默认入口

**Files:**
- Create: `apps/web/src/pages/KnowledgePage.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/pages/ChatPage.tsx`
- Test: `apps/web/src/pages/KnowledgePage.test.tsx`

- [ ] **Step 1: 先写路由测试**

```tsx
it('renders knowledge page on root route', async () => {
  render(<App />, { wrapper: makeRouterAt('/') })
  expect(await screen.findByRole('textbox', { name: /搜索/i })).toBeInTheDocument()
})
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd /Users/niujin/develop/MoreChat/apps/web && npx vitest run src/pages/KnowledgePage.test.tsx`

Expected: FAIL，`KnowledgePage` 尚未实现，或根路由仍跳转到 `/chat`

- [ ] **Step 3: 新建 `KnowledgePage.tsx` 最小骨架**

```tsx
export function KnowledgePage() {
  return (
    <KnowledgeLayout>
      <section className="flex h-full flex-1 items-center justify-center">
        <SearchBar />
      </section>
    </KnowledgeLayout>
  )
}
```

- [ ] **Step 4: 修改 `App.tsx` 路由**

目标路由：

```tsx
<Route path="/" element={<ProtectedRoute><KnowledgePage /></ProtectedRoute>} />
<Route path="/chat" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
<Route path="/login" element={<LoginPage />} />
```

要求：
- 取消根路由跳转 `/chat`
- 保留 `/chat` 现有行为，作为“查看原始对话”入口

- [ ] **Step 5: 修改 `ChatPage.tsx` 支持查询参数选中会话**

实现要求：
- 读取 `conversationId` 查询参数
- 若存在则调用 `chatStore.selectConversation(conversationId)`
- 这样知识库搜索结果卡片可以跳转到 `/chat?conversationId=...`

- [ ] **Step 6: 重新运行测试**

Run: `cd /Users/niujin/develop/MoreChat/apps/web && npx vitest run src/pages/KnowledgePage.test.tsx`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/pages/KnowledgePage.tsx apps/web/src/pages/KnowledgePage.test.tsx apps/web/src/pages/ChatPage.tsx
git commit -m "feat(web): route default entry to knowledge page"
```

## Chunk 2: 知识库布局与搜索结果体验

### Task 4: 实现知识库外壳布局和搜索表单

**Files:**
- Create: `apps/web/src/components/knowledge/KnowledgeLayout.tsx`
- Create: `apps/web/src/components/knowledge/KnowledgeSidebar.tsx`
- Create: `apps/web/src/components/knowledge/SearchBar.tsx`
- Create: `apps/web/src/components/knowledge/SearchFilters.tsx`
- Create: `apps/web/src/components/knowledge/KnowledgeEmptyState.tsx`
- Modify: `apps/web/src/pages/KnowledgePage.tsx`

- [ ] **Step 1: 先实现布局骨架**

布局要求：
- 左侧固定 sidebar：`Search / Topics / Chat`
- 顶部搜索区：搜索词、搜索模式切换、重要消息过滤
- 主区默认空状态展示“搜索微信历史消息”
- 保持移动端单列，桌面端双栏

- [ ] **Step 2: 写最小组件结构**

`KnowledgeLayout.tsx`：

```tsx
export function KnowledgeLayout({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen bg-stone-100 text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <KnowledgeSidebar />
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  )
}
```

`SearchBar.tsx`：

```tsx
<form onSubmit={handleSubmit} className="flex flex-col gap-3 border-b border-stone-200 bg-white px-6 py-5">
  <input aria-label="搜索消息" ... />
  <div className="flex gap-2">
    <button type="button">关键词</button>
    <button type="button">语义</button>
    <button type="button">混合</button>
  </div>
</form>
```

- [ ] **Step 3: 将表单状态接到 `knowledgeStore`**

实现要求：
- 输入框本地态 + 提交时写入 `knowledgeStore.query`
- 模式按钮直接写入 `knowledgeStore.mode`
- “仅重要消息” checkbox 写入 `filters.important`
- 不做防抖；只有 submit 才触发新搜索

- [ ] **Step 4: 运行页面测试**

Run: `cd /Users/niujin/develop/MoreChat/apps/web && npx vitest run src/pages/KnowledgePage.test.tsx`

Expected: PASS，至少能渲染搜索输入框和基础导航

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/knowledge apps/web/src/pages/KnowledgePage.tsx
git commit -m "feat(web): add knowledge layout and search controls"
```

### Task 5: 实现搜索结果列表，并连到聊天页查看原始上下文

**Files:**
- Create: `apps/web/src/components/knowledge/SearchResultCard.tsx`
- Create: `apps/web/src/components/knowledge/SearchResultsPane.tsx`
- Modify: `apps/web/src/pages/KnowledgePage.tsx`
- Test: `apps/web/src/pages/KnowledgePage.test.tsx`

- [ ] **Step 1: 先写结果渲染测试**

```tsx
it('renders search results after query resolves', async () => {
  mockUseSearch.mockReturnValue({
    data: {
      results: [{ msgId: 'm1', content: '预算今晚确认', createTime: 1710000000, fromUsername: 'alice', conversationId: 'c1' }],
      total: 1,
      query: '预算',
    },
    isLoading: false,
  })

  render(<KnowledgePage />)
  expect(await screen.findByText('预算今晚确认')).toBeInTheDocument()
})
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd /Users/niujin/develop/MoreChat/apps/web && npx vitest run src/pages/KnowledgePage.test.tsx`

Expected: FAIL，结果面板尚未实现

- [ ] **Step 3: 实现 `SearchResultsPane`**

行为要求：
- `query` 为空时显示空状态
- `isLoading` 时显示 skeleton
- `results.length === 0` 时显示“未找到结果”
- 成功时逐条渲染 `SearchResultCard`

- [ ] **Step 4: 实现 `SearchResultCard`**

卡片内容至少包括：
- 消息正文（截断到 4 行）
- 发送人
- 时间
- `conversationId`
- “打开原始对话”按钮

跳转逻辑：

```ts
navigate(`/chat?conversationId=${result.conversationId}`)
```

约束：
- 不在本阶段内联展开消息上下文
- 点击卡片本身只做 `selectResult(msgId)`，按钮才跳聊天页

- [ ] **Step 5: 在 `KnowledgePage.tsx` 接入 `useSearch`**

页面结构：

```tsx
const search = useSearch()

return (
  <KnowledgeLayout>
    <SearchBar />
    <div className="flex min-h-0 flex-1">
      <SearchResultsPane search={search} />
    </div>
  </KnowledgeLayout>
)
```

- [ ] **Step 6: 重新运行测试**

Run: `cd /Users/niujin/develop/MoreChat/apps/web && npx vitest run src/pages/KnowledgePage.test.tsx`

Expected: PASS

- [ ] **Step 7: 执行前端回归验证**

Run: `cd /Users/niujin/develop/MoreChat/apps/web && npx vitest run src/pages/KnowledgePage.test.tsx src/stores/knowledgeStore.test.ts src/components/layout/Sidebar.test.tsx src/components/chat/DirectoryPanel.test.tsx`

Expected: PASS，知识库新增测试通过，原有 sidebar / directory 基础测试不回归

- [ ] **Step 8: 运行类型检查**

Run: `cd /Users/niujin/develop/MoreChat/apps/web && pnpm type-check`

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/components/knowledge apps/web/src/pages/KnowledgePage.tsx apps/web/src/pages/KnowledgePage.test.tsx
git commit -m "feat(web): render knowledge search results"
```

## 收尾检查

- [ ] 根路由 `/` 进入知识库页，而不是聊天页
- [ ] 提交搜索后会调用 `/api/search`
- [ ] 搜索结果可跳转到 `/chat?conversationId=...`
- [ ] 原有聊天页仍可正常加载会话和消息
- [ ] 本阶段没有删除旧聊天组件，避免与阶段四减法混在一起

## 后续衔接

完成本计划后，下一份计划应为：

1. `phase3b`：重要消息 Feed、话题列表与知识侧栏增强
2. `phase3c`：对话浏览降级、搜索结果上下文联动、手动摘要触发
3. `phase4a`：移除 Emoji / ImageInput / 发送乐观更新等减法清理

计划已完成并保存到 `docs/superpowers/plans/2026-04-26-phase3a-knowledge-base-shell-search.md`。

Ready to execute.
