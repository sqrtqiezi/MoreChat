# Chat 页面侧边栏导航重构 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Chat 页面增加可折叠侧边栏、会话/联系人群组模式切换、目录页搜索，以及点击目录项打开或创建会话的完整链路。

**Architecture:** 先补齐后端目录读取与会话打开 API，再扩展前端 store 和 sidebar 结构，把左栏拆成固定轨道与可切换内容面板。目录页使用单独 query 拉取本地已同步联系人/群组，并在前端完成搜索和分组折叠；右侧消息区继续仅由 `selectedConversationId` 驱动。

**Tech Stack:** Hono, Prisma + SQLite, Vitest, React 18, Zustand, TanStack Query, Vite, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-13-chat-sidebar-navigation-design.md`

---

## Chunk 1: 后端目录与打开会话 API

### Task 1: 为目录列表补齐数据库查询能力

**Files:**
- Modify: `apps/server/src/services/database.ts`
- Test: `apps/server/src/services/database.test.ts`

- [ ] **Step 1: 为联系人与群组目录写失败测试**

在 `apps/server/src/services/database.test.ts` 中新增两个测试：

```typescript
it('should list contacts with matching conversation ids', async () => {
  const client = await db.createClient({ guid: 'guid_1' })
  const contact = await db.createContact({
    username: 'friend_1',
    nickname: 'Friend 1',
    type: 'friend',
  })
  const conversation = await db.createConversation({
    clientId: client.id,
    type: 'private',
    contactId: contact.id,
  })

  const contacts = await db.getDirectoryContacts(client.id)

  expect(contacts).toEqual([
    expect.objectContaining({
      username: 'friend_1',
      conversationId: conversation.id,
    }),
  ])
})

it('should list groups with null conversationId when no session exists', async () => {
  await db.createGroup({
    roomUsername: 'room_1@chatroom',
    name: 'Room 1',
  })

  const groups = await db.getDirectoryGroups('missing_client_id')

  expect(groups).toEqual([
    expect.objectContaining({
      roomUsername: 'room_1@chatroom',
      conversationId: null,
    }),
  ])
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/server && npx vitest run src/services/database.test.ts`
Expected: FAIL，提示 `getDirectoryContacts` / `getDirectoryGroups` 不存在

- [ ] **Step 3: 在 DatabaseService 中实现目录查询方法**

在 `apps/server/src/services/database.ts` 中新增两个方法，使用 Prisma 直接关联会话：

```typescript
async getDirectoryContacts(clientId: string) {
  const contacts = await this.prisma.contact.findMany({
    orderBy: [{ remark: 'asc' }, { nickname: 'asc' }, { username: 'asc' }],
  })

  return Promise.all(
    contacts.map(async (contact) => {
      const conversation = await this.prisma.conversation.findFirst({
        where: { clientId, contactId: contact.id },
        select: { id: true },
      })

      return { ...contact, conversationId: conversation?.id ?? null }
    })
  )
}

async getDirectoryGroups(clientId: string) {
  const groups = await this.prisma.group.findMany({
    orderBy: { name: 'asc' },
  })

  return Promise.all(
    groups.map(async (group) => {
      const conversation = await this.prisma.conversation.findFirst({
        where: { clientId, groupId: group.id },
        select: { id: true },
      })

      return { ...group, conversationId: conversation?.id ?? null }
    })
  )
}
```

如果实现时发现 `orderBy` 对 nullable 字段不稳，改为先取数据再在 service 层排序，但不要把联系人与群组聚合逻辑塞进 route。

- [ ] **Step 4: 重新运行数据库测试**

Run: `cd apps/server && npx vitest run src/services/database.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/services/database.ts apps/server/src/services/database.test.ts
git commit -m "feat: add database queries for chat directory"
```

### Task 2: 新增 DirectoryService 并提供聚合输出

**Files:**
- Create: `apps/server/src/services/directoryService.ts`
- Test: `apps/server/src/services/directoryService.test.ts`

- [ ] **Step 1: 写 DirectoryService 的失败测试**

新建 `apps/server/src/services/directoryService.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DirectoryService } from './directoryService.js'

describe('DirectoryService', () => {
  let db: any
  let service: DirectoryService

  beforeEach(() => {
    db = {
      findClientByGuid: vi.fn(),
      getDirectoryContacts: vi.fn(),
      getDirectoryGroups: vi.fn(),
    }
    service = new DirectoryService(db)
  })

  it('should return contacts and groups for the client guid', async () => {
    db.findClientByGuid.mockResolvedValue({ id: 'client_1' })
    db.getDirectoryContacts.mockResolvedValue([{ username: 'friend_1', conversationId: 'conv_1' }])
    db.getDirectoryGroups.mockResolvedValue([{ roomUsername: 'room_1@chatroom', conversationId: null }])

    await expect(service.list('guid_1')).resolves.toEqual({
      contacts: [{ username: 'friend_1', conversationId: 'conv_1' }],
      groups: [{ roomUsername: 'room_1@chatroom', conversationId: null }],
    })
  })

  it('should throw when client guid is unknown', async () => {
    db.findClientByGuid.mockResolvedValue(null)
    await expect(service.list('bad_guid')).rejects.toThrow('Client not found')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/server && npx vitest run src/services/directoryService.test.ts`
Expected: FAIL，文件或类不存在

- [ ] **Step 3: 实现 DirectoryService**

创建 `apps/server/src/services/directoryService.ts`：

```typescript
import type { DatabaseService } from './database.js'

export class DirectoryService {
  constructor(private db: DatabaseService) {}

  async list(clientGuid: string) {
    const client = await this.db.findClientByGuid(clientGuid)
    if (!client) {
      throw new Error('Client not found')
    }

    const [contacts, groups] = await Promise.all([
      this.db.getDirectoryContacts(client.id),
      this.db.getDirectoryGroups(client.id),
    ])

    return { contacts, groups }
  }
}
```

- [ ] **Step 4: 重新运行服务测试**

Run: `cd apps/server && npx vitest run src/services/directoryService.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/services/directoryService.ts apps/server/src/services/directoryService.test.ts
git commit -m "feat: add directory service for sidebar navigation"
```

### Task 3: 为 ConversationService 增加 openConversation 能力

**Files:**
- Modify: `apps/server/src/services/conversationService.ts`
- Test: `apps/server/src/services/conversationService.test.ts`

- [ ] **Step 1: 为 openConversation 写失败测试**

在 `apps/server/src/services/conversationService.test.ts` 中新增：

```typescript
describe('openConversation', () => {
  it('should return existing private conversation id', async () => {
    db.findClientByGuid.mockResolvedValue({ id: 'client_1' })
    db.findContactByUsername.mockResolvedValue({ id: 'contact_1' })
    db.findConversation.mockResolvedValue({ id: 'conv_1' })

    await expect(
      service.openConversation('guid_1', { type: 'private', username: 'friend_1' })
    ).resolves.toEqual({ conversationId: 'conv_1' })
  })

  it('should create a group conversation when missing', async () => {
    db.findClientByGuid.mockResolvedValue({ id: 'client_1' })
    db.findGroupByRoomUsername.mockResolvedValue({ id: 'group_1' })
    db.findConversation.mockResolvedValue(null)
    db.createConversation.mockResolvedValue({ id: 'conv_new' })

    await expect(
      service.openConversation('guid_1', { type: 'group', roomUsername: 'room_1@chatroom' })
    ).resolves.toEqual({ conversationId: 'conv_new' })
  })

  it('should reject unknown contacts', async () => {
    db.findClientByGuid.mockResolvedValue({ id: 'client_1' })
    db.findContactByUsername.mockResolvedValue(null)

    await expect(
      service.openConversation('guid_1', { type: 'private', username: 'missing' })
    ).rejects.toThrow('Contact not found')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/server && npx vitest run src/services/conversationService.test.ts`
Expected: FAIL，`openConversation` 未定义

- [ ] **Step 3: 在 ConversationService 中实现 openConversation**

在 `apps/server/src/services/conversationService.ts` 中新增：

```typescript
type OpenConversationInput =
  | { type: 'private'; username: string }
  | { type: 'group'; roomUsername: string }

async openConversation(clientGuid: string, input: OpenConversationInput) {
  const client = await this.db.findClientByGuid(clientGuid)
  if (!client) throw new Error('Client not found')

  const peerId = input.type === 'private' ? input.username : input.roomUsername
  const existing = await this.db.findConversation(client.id, peerId)
  if (existing) {
    return { conversationId: existing.id }
  }

  if (input.type === 'private') {
    const contact = await this.db.findContactByUsername(input.username)
    if (!contact) throw new Error('Contact not found')
    const created = await this.db.createConversation({
      clientId: client.id,
      type: 'private',
      contactId: contact.id,
    })
    return { conversationId: created.id }
  }

  const group = await this.db.findGroupByRoomUsername(input.roomUsername)
  if (!group) throw new Error('Group not found')
  const created = await this.db.createConversation({
    clientId: client.id,
    type: 'group',
    groupId: group.id,
  })
  return { conversationId: created.id }
}
```

- [ ] **Step 4: 重新运行服务测试**

Run: `cd apps/server && npx vitest run src/services/conversationService.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/services/conversationService.ts apps/server/src/services/conversationService.test.ts
git commit -m "feat: add conversation open service for directory navigation"
```

### Task 4: 暴露 `/api/directory` 与 `/api/conversations/open` 路由

**Files:**
- Create: `apps/server/src/routes/directory.ts`
- Create: `apps/server/src/routes/directory.test.ts`
- Modify: `apps/server/src/routes/conversations.ts`
- Modify: `apps/server/src/routes/conversations.test.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/app.test.ts`
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: 为目录路由写失败测试**

新建 `apps/server/src/routes/directory.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { directoryRoutes } from './directory.js'

describe('directory routes', () => {
  let app: Hono
  let directoryService: any

  beforeEach(() => {
    directoryService = { list: vi.fn() }
    app = new Hono()
    app.route('/api/directory', directoryRoutes({
      directoryService,
      clientGuid: 'guid_1',
    }))
  })

  it('should return contacts and groups', async () => {
    directoryService.list.mockResolvedValue({
      contacts: [{ username: 'friend_1' }],
      groups: [{ roomUsername: 'room_1@chatroom' }],
    })

    const res = await app.request('/api/directory')
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.contacts).toHaveLength(1)
    expect(body.data.groups).toHaveLength(1)
  })
})
```

- [ ] **Step 2: 为 open route 扩展失败测试**

在 `apps/server/src/routes/conversations.test.ts` 中新增：

```typescript
describe('POST /api/conversations/open', () => {
  it('should open a private conversation', async () => {
    vi.mocked(mockConvService.openConversation).mockResolvedValue({ conversationId: 'conv_1' })

    const res = await app.request('/api/conversations/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'private', username: 'friend_1' }),
    })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.conversationId).toBe('conv_1')
  })
})
```

同时把 `mockConvService` 补齐 `openConversation: vi.fn()`。

- [ ] **Step 3: 运行路由测试确认失败**

Run: `cd apps/server && npx vitest run src/routes/directory.test.ts src/routes/conversations.test.ts src/app.test.ts`
Expected: FAIL，缺少 route / service 注入

- [ ] **Step 4: 实现路由并挂载到 app**

创建 `apps/server/src/routes/directory.ts`：

```typescript
import { Hono } from 'hono'
import { logger } from '../lib/logger.js'

export function directoryRoutes(deps: { directoryService: any; clientGuid: string }) {
  const router = new Hono()

  router.get('/', async (c) => {
    try {
      const result = await deps.directoryService.list(deps.clientGuid)
      return c.json({ success: true, data: result })
    } catch (error) {
      logger.error({ err: error }, 'Failed to get directory')
      return c.json({ success: false, error: { message: 'Failed to get directory' } }, 500)
    }
  })

  return router
}
```

在 `apps/server/src/routes/conversations.ts` 中新增 `POST /open`，调用 `conversationService.openConversation(...)`；对 `Contact not found` / `Group not found` 返回 404，对非法 body 返回 400。

在 `apps/server/src/app.ts` 和 `apps/server/src/index.ts` 中注入并挂载 `directoryRoutes`。

同步更新 `apps/server/src/app.test.ts` 的 `createApp` 依赖 mock，加入 `directoryService`。

- [ ] **Step 5: 重新运行路由与 app 测试**

Run: `cd apps/server && npx vitest run src/routes/directory.test.ts src/routes/conversations.test.ts src/app.test.ts`
Expected: PASS

- [ ] **Step 6: 运行后端相关回归测试**

Run: `cd apps/server && npx vitest run src/services/database.test.ts src/services/directoryService.test.ts src/services/conversationService.test.ts src/routes/directory.test.ts src/routes/conversations.test.ts src/app.test.ts`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add apps/server/src/routes/directory.ts apps/server/src/routes/directory.test.ts apps/server/src/routes/conversations.ts apps/server/src/routes/conversations.test.ts apps/server/src/app.ts apps/server/src/app.test.ts apps/server/src/index.ts
git commit -m "feat: add sidebar directory and open conversation APIs"
```

## Chunk 1 Review

Self-review this chunk against `writing-plans/plan-document-reviewer-prompt.md` before implementation:

- Confirm no TODO/TBD placeholders remain
- Confirm every new API has route test + service or database test
- Confirm `openConversation` handles private/group/not-found/invalid-body cases
- Confirm file responsibilities stay separated between database, service, and route layers

---

## Chunk 2: 前端 sidebar 结构、目录页与搜索

### Task 5: 为目录 API 与前端类型补齐客户端映射

**Files:**
- Modify: `apps/web/src/api/chat.ts`
- Modify: `apps/web/src/types/index.ts`
- Create: `apps/web/src/hooks/useDirectory.ts`

- [ ] **Step 1: 扩展前端类型**

在 `apps/web/src/types/index.ts` 中新增：

```typescript
export interface DirectoryContact {
  id: string
  username: string
  nickname: string
  remark: string | null
  avatar?: string
  conversationId: string | null
}

export interface DirectoryGroup {
  id: string
  roomUsername: string
  name: string
  avatar?: string
  memberCount?: number
  conversationId: string | null
}
```

- [ ] **Step 2: 在 chatApi 中新增目录与 openConversation 方法**

在 `apps/web/src/api/chat.ts` 中新增 raw response 类型和两个方法：

```typescript
async getDirectory(): Promise<{ contacts: DirectoryContact[]; groups: DirectoryGroup[] }> {
  const response = await client.get<ApiResponse<{ contacts: ApiDirectoryContact[]; groups: ApiDirectoryGroup[] }>>('/directory')
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error?.message || 'Failed to get directory')
  }

  return {
    contacts: response.data.data.contacts.map((raw) => ({
      id: raw.id,
      username: raw.username,
      nickname: raw.nickname,
      remark: raw.remark,
      avatar: raw.avatar || undefined,
      conversationId: raw.conversationId,
    })),
    groups: response.data.data.groups.map((raw) => ({
      id: raw.id,
      roomUsername: raw.roomUsername,
      name: raw.name,
      avatar: raw.avatar || undefined,
      memberCount: raw.memberCount ?? undefined,
      conversationId: raw.conversationId,
    })),
  }
},

async openConversation(data: { type: 'private'; username: string } | { type: 'group'; roomUsername: string }) {
  const response = await client.post<ApiResponse<{ conversationId: string }>>('/conversations/open', data)
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error?.message || 'Failed to open conversation')
  }
  return response.data.data
},
```

- [ ] **Step 3: 新增 useDirectory hook**

创建 `apps/web/src/hooks/useDirectory.ts`：

```typescript
import { useQuery } from '@tanstack/react-query'
import { chatApi } from '../api/chat'

export function useDirectory(enabled: boolean) {
  return useQuery({
    queryKey: ['directory'],
    queryFn: () => chatApi.getDirectory(),
    enabled,
  })
}
```

- [ ] **Step 4: 做前端类型检查**

Run: `cd apps/web && pnpm type-check`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/api/chat.ts apps/web/src/types/index.ts apps/web/src/hooks/useDirectory.ts
git commit -m "feat: add web directory API client"
```

### Task 6: 扩展 chat store，承载 sidebar 导航状态

**Files:**
- Modify: `apps/web/src/stores/chatStore.ts`

- [ ] **Step 1: 扩展 store 状态与 actions**

将 `apps/web/src/stores/chatStore.ts` 改为：

```typescript
interface ChatState {
  selectedConversationId: string | null
  isSidebarCollapsed: boolean
  sidebarMode: 'conversations' | 'directory'
  selectConversation: (id: string | null) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebarCollapsed: () => void
  setSidebarMode: (mode: 'conversations' | 'directory') => void
  clearSelection: () => void
}

export const useChatStore = create<ChatState>((set) => ({
  selectedConversationId: null,
  isSidebarCollapsed: false,
  sidebarMode: 'conversations',
  selectConversation: (id) => set({ selectedConversationId: id }),
  setSidebarCollapsed: (collapsed) => set({ isSidebarCollapsed: collapsed }),
  toggleSidebarCollapsed: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
  setSidebarMode: (mode) => set({ sidebarMode: mode }),
  clearSelection: () => set({ selectedConversationId: null }),
}))
```

- [ ] **Step 2: 做前端类型检查**

Run: `cd apps/web && pnpm type-check`
Expected: PASS；如果其他组件报错，先不要顺手修 UI，留到后续任务统一处理

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/stores/chatStore.ts
git commit -m "feat: add sidebar state to chat store"
```

### Task 7: 拆分 Sidebar 为轨道与内容面板

**Files:**
- Modify: `apps/web/src/components/layout/Sidebar.tsx`
- Create: `apps/web/src/components/layout/SidebarRail.tsx`
- Create: `apps/web/src/components/layout/SidebarPanel.tsx`
- Modify: `apps/web/src/pages/ChatPage.tsx`

- [ ] **Step 1: 创建 SidebarRail**

创建 `apps/web/src/components/layout/SidebarRail.tsx`，只负责 3 个按钮：

```tsx
import { useChatStore } from '../../stores/chatStore'

export function SidebarRail() {
  const sidebarMode = useChatStore((state) => state.sidebarMode)
  const toggleSidebarCollapsed = useChatStore((state) => state.toggleSidebarCollapsed)
  const setSidebarMode = useChatStore((state) => state.setSidebarMode)

  return (
    <div className="w-14 bg-gray-200 border-r border-gray-300 flex flex-col justify-between py-3">
      <button type="button" onClick={toggleSidebarCollapsed}>≡</button>
      <div className="flex flex-col gap-3">
        <button type="button" data-active={sidebarMode === 'conversations'} onClick={() => setSidebarMode('conversations')}>会话</button>
        <button type="button" data-active={sidebarMode === 'directory'} onClick={() => setSidebarMode('directory')}>联系人</button>
      </div>
    </div>
  )
}
```

图标可以在实现时替换成现有 SVG，但不要把 panel 内容写进 rail。

- [ ] **Step 2: 创建 SidebarPanel**

创建 `apps/web/src/components/layout/SidebarPanel.tsx`：

```tsx
import { ConversationList } from '../chat/ConversationList'
import { DirectoryPanel } from '../chat/DirectoryPanel'
import { ClientStatus } from './ClientStatus'
import { useChatStore } from '../../stores/chatStore'

export function SidebarPanel() {
  const sidebarMode = useChatStore((state) => state.sidebarMode)

  return (
    <div className="w-56 bg-gray-100 flex flex-col min-w-0">
      <ClientStatus isOnline={true} />
      {sidebarMode === 'conversations' ? <ConversationList /> : <DirectoryPanel />}
    </div>
  )
}
```

- [ ] **Step 3: 改造 Sidebar 组合结构**

修改 `apps/web/src/components/layout/Sidebar.tsx`：

```tsx
import { SidebarRail } from './SidebarRail'
import { SidebarPanel } from './SidebarPanel'
import { useChatStore } from '../../stores/chatStore'

export function Sidebar() {
  const isSidebarCollapsed = useChatStore((state) => state.isSidebarCollapsed)

  return (
    <div className="bg-gray-100 border-r border-gray-200 flex h-full overflow-hidden">
      <SidebarRail />
      {!isSidebarCollapsed ? <SidebarPanel /> : null}
    </div>
  )
}
```

- [ ] **Step 4: 在 ChatPage 保持右侧布局自适应**

确认 `apps/web/src/pages/ChatPage.tsx` 保持：

```tsx
<div className="h-screen flex">
  <Sidebar />
  <ChatWindow selectedConversationId={selectedConversationId} />
</div>
```

如果折叠后出现消息区不扩展，只修改 container class，不改 `ChatWindow` 业务逻辑。

- [ ] **Step 5: 做前端类型检查**

Run: `cd apps/web && pnpm type-check`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add apps/web/src/components/layout/Sidebar.tsx apps/web/src/components/layout/SidebarRail.tsx apps/web/src/components/layout/SidebarPanel.tsx apps/web/src/pages/ChatPage.tsx
git commit -m "feat: split chat sidebar into rail and panel"
```

### Task 8: 实现目录页、搜索、分组折叠和点击打开会话

**Files:**
- Create: `apps/web/src/components/chat/DirectoryPanel.tsx`
- Create: `apps/web/src/components/chat/DirectorySection.tsx`
- Create: `apps/web/src/components/chat/DirectoryItem.tsx`
- Modify: `apps/web/src/components/layout/SidebarPanel.tsx`
- Modify: `apps/web/src/components/chat/ConversationList.tsx`

- [ ] **Step 1: 创建可复用的目录分组组件**

创建 `apps/web/src/components/chat/DirectorySection.tsx`：

```tsx
interface DirectorySectionProps {
  title: string
  expanded: boolean
  count: number
  onToggle: () => void
  children: React.ReactNode
}

export function DirectorySection({ title, expanded, count, onToggle, children }: DirectorySectionProps) {
  return (
    <section className="border-b border-gray-200">
      <button type="button" onClick={onToggle} className="w-full px-4 py-3 flex items-center justify-between">
        <span>{title}</span>
        <span>{expanded ? '−' : '+'} {count}</span>
      </button>
      {expanded ? <div>{children}</div> : null}
    </section>
  )
}
```

- [ ] **Step 2: 创建目录项组件**

创建 `apps/web/src/components/chat/DirectoryItem.tsx`：

```tsx
interface DirectoryItemProps {
  name: string
  avatar?: string
  subtitle?: string
  onClick: () => void
}

export function DirectoryItem({ name, avatar, subtitle, onClick }: DirectoryItemProps) {
  return (
    <button type="button" onClick={onClick} className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50">
      <div className="w-10 h-10 rounded-full bg-gray-300 overflow-hidden">
        {avatar ? <img src={avatar} alt={name} className="w-full h-full object-cover" /> : null}
      </div>
      <div className="min-w-0 text-left">
        <div className="truncate text-sm font-medium text-gray-900">{name}</div>
        {subtitle ? <div className="truncate text-xs text-gray-500">{subtitle}</div> : null}
      </div>
    </button>
  )
}
```

- [ ] **Step 3: 实现 DirectoryPanel 主逻辑**

创建 `apps/web/src/components/chat/DirectoryPanel.tsx`，只处理：

- `useDirectory(sidebarMode === 'directory')`
- 本地 `query`
- 本地 `expanded` 状态
- 过滤联系人/群组
- 点击时优先 `conversationId`，否则调用 `chatApi.openConversation`
- 成功后 `selectConversation(conversationId)` 并 `invalidateQueries(['conversations'])`

核心逻辑骨架：

```tsx
const { data, isLoading, error } = useDirectory(true)
const [query, setQuery] = useState('')
const [expanded, setExpanded] = useState({ contacts: true, groups: true })
const selectConversation = useChatStore((state) => state.selectConversation)
const queryClient = useQueryClient()

const openItem = async (item: { conversationId: string | null } & ({ type: 'private'; username: string } | { type: 'group'; roomUsername: string })) => {
  const conversationId = item.conversationId
    ?? (await chatApi.openConversation(item.type === 'private'
      ? { type: 'private', username: item.username }
      : { type: 'group', roomUsername: item.roomUsername })).conversationId

  selectConversation(conversationId)
  queryClient.invalidateQueries({ queryKey: ['conversations'] })
}
```

错误和空状态使用现有 `EmptyState` 风格，不要把 `ConversationList` 的加载骨架直接复制进来。

- [ ] **Step 4: 在 SidebarPanel 中接入 DirectoryPanel**

确认 `apps/web/src/components/layout/SidebarPanel.tsx` 只做模式分发，不包含搜索过滤逻辑。

- [ ] **Step 5: 运行前端类型检查与构建**

Run: `cd apps/web && pnpm type-check && pnpm build`
Expected: PASS

- [ ] **Step 6: 手动验证目录交互**

Run: `pnpm dev`
Expected:

- 左栏默认展开，默认显示会话列表
- 点击底部模式按钮可切换到联系人/群组页
- 搜索框可实时过滤联系人和群组
- 两个分组可独立折叠/展开
- 点击已有会话目录项直接切换到对应聊天
- 点击无会话目录项后创建并进入新会话
- 切回会话模式后新会话出现在列表中

- [ ] **Step 7: 提交**

```bash
git add apps/web/src/components/chat/DirectoryPanel.tsx apps/web/src/components/chat/DirectorySection.tsx apps/web/src/components/chat/DirectoryItem.tsx apps/web/src/components/layout/SidebarPanel.tsx apps/web/src/components/chat/ConversationList.tsx
git commit -m "feat: add directory panel to chat sidebar"
```

### Task 9: 补齐前端交互测试基础设施并覆盖核心 sidebar 行为

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/src/test/setup.ts`
- Create: `apps/web/src/components/layout/Sidebar.test.tsx`
- Create: `apps/web/src/components/chat/DirectoryPanel.test.tsx`

- [ ] **Step 1: 安装前端测试依赖**

Run:

```bash
cd apps/web
pnpm add -D vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

Expected: 安装成功

- [ ] **Step 2: 配置 Vitest + jsdom**

在 `apps/web/package.json` 中新增：

```json
{
  "scripts": {
    "test": "vitest run"
  }
}
```

创建 `apps/web/vitest.config.ts`：

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
```

创建 `apps/web/src/test/setup.ts`：

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 3: 为 Sidebar 写测试**

新建 `apps/web/src/components/layout/Sidebar.test.tsx`，覆盖：

```tsx
it('shows rail only when sidebar is collapsed')
it('switches between conversations and directory modes from rail buttons')
```

测试中直接操作 `useChatStore.setState(...)`，不要为了测试改生产组件接口。

- [ ] **Step 4: 为 DirectoryPanel 写测试**

新建 `apps/web/src/components/chat/DirectoryPanel.test.tsx`，mock `useDirectory`、`chatApi.openConversation`、`useQueryClient`，覆盖：

```tsx
it('filters contacts and groups by search query')
it('opens existing conversation without calling openConversation api')
it('creates conversation when directory item has no conversationId')
it('toggles contacts and groups sections')
```

- [ ] **Step 5: 运行前端测试**

Run: `cd apps/web && pnpm test`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add apps/web/package.json apps/web/vitest.config.ts apps/web/src/test/setup.ts apps/web/src/components/layout/Sidebar.test.tsx apps/web/src/components/chat/DirectoryPanel.test.tsx
git commit -m "test: cover chat sidebar navigation interactions"
```

## Chunk 2 Review

Self-review this chunk against `writing-plans/plan-document-reviewer-prompt.md` before implementation:

- Confirm sidebar state remains centralized while directory query stays local
- Confirm `SidebarRail`, `SidebarPanel`, `DirectoryPanel`, `DirectorySection`, `DirectoryItem` each keep one responsibility
- Confirm frontend tests cover collapse, mode switch, filter, toggle, existing conversation, and create-on-click paths
- Confirm no right-side chat window behavior was pulled into sidebar tasks

---

## Chunk 3: 集成验证与 cleanup

### Task 10: 端到端回归验证并同步文档

**Files:**
- Modify: `README.md` (only if developer setup/test command section needs update)
- Modify: `docs/development-setup.md` (only if frontend test command needs documenting)

- [ ] **Step 1: 运行完整相关检查**

Run:

```bash
cd apps/server && npx vitest run src/services/database.test.ts src/services/directoryService.test.ts src/services/conversationService.test.ts src/routes/directory.test.ts src/routes/conversations.test.ts src/app.test.ts
cd /Users/niujin/develop/MoreChat/apps/web && pnpm test && pnpm type-check && pnpm build
cd /Users/niujin/develop/MoreChat && pnpm build
```

Expected:

- server tests PASS
- web tests PASS
- web type-check PASS
- monorepo build PASS

- [ ] **Step 2: 手动回归聊天页**

Run: `pnpm dev`
Expected:

- 初次进入聊天页仍可正常显示空态或当前会话
- WebSocket 新消息与撤回逻辑不因 sidebar 结构调整而报错
- 折叠与展开不会清空当前选中的会话
- 折叠状态下仍能切换模式，重新展开时显示最后选择的模式
- 目录页错误态与空结果态文案正确

- [ ] **Step 3: 如新增测试命令，补充开发文档**

仅在 `apps/web/package.json` 新增了 `test` script 时，更新：

```md
## 前端测试

```bash
cd apps/web
pnpm test
```
```

如果现有文档已足够，不做额外修改。

- [ ] **Step 4: 提交**

```bash
git add README.md docs/development-setup.md
git commit -m "docs: document frontend tests for chat sidebar navigation"
```

若此任务没有文档改动，则跳过提交，不为“空提交”制造噪音。

## Chunk 3 Review

Self-review this chunk against `writing-plans/plan-document-reviewer-prompt.md` before implementation:

- Confirm verification commands cover both server and web
- Confirm manual checks include collapsed-mode persistence and create-on-click flow
- Confirm doc updates remain conditional and do not create scope creep

