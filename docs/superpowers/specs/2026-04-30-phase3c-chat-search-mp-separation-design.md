# 阶段 3C：Chat 搜索与公众号分离设计

**日期：** 2026-04-30
**状态：** 设计完成，待评审
**目标：** 在 Chat 页面实现聊天/公众号会话分离展示，并新增全局消息搜索功能

---

## 一、背景

Phase 3B 完成了知识库的 Feed、Topics 和侧栏导航。Chat 页面目前存在两个问题：

1. 聊天会话和公众号会话混在同一个列表中，难以区分
2. 没有搜索入口，用户只能通过知识库搜索页查找历史消息

Phase 3C 的目标是在 Chat 页面内解决这两个问题，不影响知识库功能。

---

## 二、范围

### 本阶段包含

1. 侧边栏会话列表按 Contact.type 分成"聊天"和"公众号"两个可折叠分组
2. 侧边栏顶部新增搜索框，搜索所有会话的消息
3. 搜索模式下 Chat 页面变为三栏布局（侧边栏 | 搜索结果 | 消息详情）
4. 消息详情默认显示上下文片段，可切换到完整会话
5. 后端新增消息上下文查询接口（`around` 参数）
6. 后端会话列表接口补充 `contactType` 字段

### 本阶段不包含

1. 不做公众号消息的独立页面
2. 不做搜索结果的已读/未读状态
3. 不做搜索历史记录
4. 不做搜索结果的高级过滤（时间范围、发送人等）
5. 不改动知识库搜索页（`/`）

---

## 三、数据模型

### Contact.type 枚举

| 值 | 含义 |
|----|------|
| 0 | Stranger |
| 1 | System |
| 2 | Friend |
| 3 | Mp（公众号） |
| 4 | ChatRoom |

**分组规则：**
- `contactType === 3` → 公众号分组
- 其余（含群组，`contactType === null`）→ 聊天分组

---

## 四、后端变更

### 4.1 会话列表补充 contactType

**修改文件：** `apps/server/src/routes/conversations.ts`

`GET /api/conversations` 返回的每条会话新增 `contactType` 字段：

```typescript
interface ConversationItem {
  id: string
  type: 'private' | 'group'
  contactType: number | null  // Contact.type，群组为 null
  name: string
  avatar: string | null
  lastMessageAt: number | null
  unreadCount: number
}
```

实现方式：`getConversations` 已经 `include: { contact: true }`，直接从 `conversation.contact?.type` 取值，转换为数字（Contact.type 在数据库中存为字符串）。

### 4.2 新增消息上下文查询

**新增接口：** `GET /api/conversations/:id/messages?around=msgId&limit=21`

- `around`：目标消息的 msgId
- `limit`：返回总条数，默认 21（目标消息前后各 10 条）

**返回结构：**

```typescript
{
  success: true,
  data: {
    messages: Message[],
    targetIndex: number  // 目标消息在 messages 数组中的索引
  }
}
```

**查询逻辑：**

1. 通过 `msgId` 查询目标消息的 `createTime`（`MessageIndex` 表）
2. 查询 `createTime` 之前的 `floor(limit/2)` 条消息（倒序）
3. 查询 `createTime` 之后（含）的 `ceil(limit/2)` 条消息（正序）
4. 合并后从 DataLake 加载完整内容
5. 返回合并结果和目标消息索引

**边界处理：**
- 目标消息不存在：返回 404
- 前面消息不足：返回实际数量，`targetIndex` 相应调整
- `around` 和 `before` 参数互斥，同时传入返回 400

**DatabaseService 新增方法：**

```typescript
// 根据 msgId 查询消息索引
findMessageIndexByMsgId(conversationId: string, msgId: string): Promise<MessageIndex | null>

// getMessageIndexes 新增 after 参数
getMessageIndexes(conversationId: string, options: {
  limit?: number
  before?: number
  after?: number   // 新增：查询 createTime >= after 的消息
  order?: 'asc' | 'desc'
}): Promise<MessageIndex[]>
```

---

## 五、前端变更

### 5.1 文件改动清单

**新增文件：**

```
apps/web/src/components/layout/SidebarSearchBar.tsx
apps/web/src/components/chat/ConversationGroup.tsx
apps/web/src/components/chat/ChatSearchResultsPane.tsx
apps/web/src/components/chat/ChatMessageDetailPane.tsx
apps/web/src/hooks/useChatSearch.ts
apps/web/src/hooks/useMessagesAround.ts
```

**修改文件：**

```
apps/web/src/stores/chatStore.ts
apps/web/src/components/layout/SidebarPanel.tsx
apps/web/src/components/chat/ConversationList.tsx
apps/web/src/pages/ChatPage.tsx
apps/web/src/api/chat.ts
```

### 5.2 状态管理

**URL 参数（React Router）：**
- `?q=关键词`：触发搜索模式
- `?q=关键词&msgId=xxx&conversationId=yyy`：搜索模式 + 选中某条消息

**chatStore 新增字段：**

```typescript
isChatGroupCollapsed: boolean       // 默认 false
isMpGroupCollapsed: boolean         // 默认 false
toggleChatGroupCollapsed: () => void
toggleMpGroupCollapsed: () => void
```

**React Query hooks：**

```typescript
// 复用 /api/search
useChatSearch(query: string)
// queryKey: ['chat-search', query]
// 只在 query.length > 0 时 enabled

// 新增
useMessagesAround(conversationId: string, msgId: string)
// queryKey: ['messages-around', conversationId, msgId]
// → GET /api/conversations/:id/messages?around=msgId&limit=21
```

### 5.3 组件设计

#### SidebarSearchBar

```typescript
// 位置：SidebarPanel 中 ClientStatus 下方
// 功能：输入后更新 URL ?q= 参数，清空时移除参数
interface SidebarSearchBarProps {
  query: string
  onChange: (q: string) => void
}
```

#### ConversationGroup

```typescript
interface ConversationGroupProps {
  title: string           // "聊天" | "公众号"
  count: number
  conversations: Conversation[]
  isCollapsed: boolean
  onToggle: () => void
  selectedId: string | null
  onSelect: (id: string) => void
}
```

标题栏显示：`{title} ({count})` + 折叠图标。

#### ChatSearchResultsPane

```typescript
// 中间栏，宽度 400px
// 调用 useChatSearch(query)
// 渲染搜索结果卡片列表
// 点击卡片：更新 URL ?msgId=xxx&conversationId=yyy
```

搜索结果卡片复用 `SearchResultCard` 的样式语言，但不依赖 knowledgeStore。

#### ChatMessageDetailPane

```typescript
// 右侧栏，flex-1
// 两种模式：
//   context（默认）：调用 useMessagesAround，显示前后各 10 条
//   full：调用 useMessages，显示完整会话历史
// 顶部按钮：[查看完整会话] / [返回上下文]
// 目标消息高亮显示
```

### 5.4 ChatPage 布局切换

```typescript
export function ChatPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const isSearchMode = query.length > 0

  return (
    <div className="h-screen flex">
      <Sidebar />
      {isSearchMode ? (
        <>
          <ChatSearchResultsPane query={query} />
          <ChatMessageDetailPane />
        </>
      ) : (
        <ChatWindow selectedConversationId={effectiveConversationId} />
      )}
    </div>
  )
}
```

---

## 六、数据流

### 搜索流程

```
用户在 SidebarSearchBar 输入关键词
  ↓
URL 更新为 ?q=关键词
  ↓
ChatPage 检测到 q 参数，切换到搜索模式
  ↓
ChatSearchResultsPane 调用 useChatSearch(q)
  → GET /api/search?q=关键词
  → 渲染结果列表
  ↓
用户点击某条结果
  ↓
URL 更新为 ?q=关键词&msgId=xxx&conversationId=yyy
  ↓
ChatMessageDetailPane 调用 useMessagesAround(conversationId, msgId)
  → GET /api/conversations/:id/messages?around=msgId&limit=21
  → 渲染上下文，高亮目标消息
  ↓
用户点击"查看完整会话"
  ↓
ChatMessageDetailPane 切换到 full 模式
  → GET /api/conversations/:id/messages
  → 渲染完整历史，滚动到目标消息
```

### 会话分组流程

```
useConversations()
  → GET /api/conversations（含 contactType 字段）
  ↓
ConversationList 按 contactType === 3 分组
  ↓
ConversationGroup("聊天") + ConversationGroup("公众号")
  ↓
各组内按 lastMessageAt 倒序渲染 ConversationItem
```

---

## 七、测试策略

### 后端测试

**`conversations.test.ts` 新增：**
- `GET /api/conversations` 返回的会话包含 `contactType` 字段
- 群组会话的 `contactType` 为 `null`
- 公众号会话的 `contactType` 为 `3`

**`conversations.test.ts` 新增（around 接口）：**
- 正常情况：返回目标消息前后各 N 条，`targetIndex` 正确
- 目标消息在最前：前面消息不足，`targetIndex` 为 0
- 目标消息在最后：后面消息不足，`targetIndex` 为实际前置消息数
- `msgId` 不存在：返回 404
- `around` 和 `before` 同时传入：返回 400

### 前端测试

**`ConversationGroup.test.tsx`：**
- 渲染标题和会话数量
- 点击标题折叠/展开
- 折叠时不渲染会话列表

**`ChatSearchResultsPane.test.tsx`：**
- 有结果时渲染结果列表
- 无结果时显示空状态
- 点击结果更新 URL 参数

**`ChatMessageDetailPane.test.tsx`：**
- 默认显示上下文模式
- 目标消息有高亮样式
- 点击"查看完整会话"切换到 full 模式

**`ChatPage.test.tsx`：**
- 无 `q` 参数时渲染 ChatWindow
- 有 `q` 参数时渲染三栏布局

### 回归验证

- 现有 ChatPage 功能（选择会话、接收消息）不受影响
- 知识库搜索页（`/`）不受影响
- WebSocket 消息推送不受影响

---

## 八、设计决策总结

1. 搜索状态由 URL 参数驱动，不写入 store，支持刷新和浏览器返回
2. 公众号分组判断在前端完成，后端只需补充 `contactType` 字段
3. 消息上下文查询新增独立接口，不复用现有的 `before` 分页接口
4. 搜索结果复用 `/api/search`，不新增 Chat 专用搜索接口
5. `ChatMessageDetailPane` 的 full 模式复用现有 `useMessages` hook

---

**设计完成日期：** 2026-04-30
**下一步：** 基于本 spec 编写 Phase 3C 实施计划
