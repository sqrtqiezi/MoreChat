# 实时消息同步设计

## 背景

当前 WebSocket 基础设施前后端均已就绪，但 webhook 收到新消息后未通过 WebSocket 广播给前端。消息只在手动切换会话或刷新时才会更新。

## 目标

打开聊天窗口时及时同步最新消息，并在窗口激活期间保持实时更新。

## 核心行为

| 场景 | 行为 |
|------|------|
| 打开/切换到聊天窗口 | 拉取最新 20 条消息 |
| 窗口激活中收到新消息 | WebSocket 推送完整消息，前端追加到底部 |
| 向上滚动 | 按时间戳加载更早的 20 条（无限滚动） |
| 向下滚动到底部 | 已加载 > 100 条时，裁剪到最新 20 条 |

## 数据流

```
┌─ 打开/切换窗口 ─────────────────────────────────┐
│  GET /api/conversations/:id/messages?limit=20   │
│  → 返回最新 20 条 → 渲染列表，滚动到底部         │
└─────────────────────────────────────────────────┘

┌─ 实时新消息 ────────────────────────────────────┐
│  webhook → handleIncomingMessage                │
│         → broadcast('message:new', {            │
│             conversationId, message })           │
│  前端收到 →                                      │
│    当前会话 → setQueryData 追加到缓存末尾         │
│    其他会话 → 仅 invalidate conversations        │
└─────────────────────────────────────────────────┘

┌─ 向上滚动加载 ──────────────────────────────────┐
│  滚动到顶部 → 取当前最早消息的 createTime         │
│  GET ...?limit=20&before={createTime}           │
│  → 拼接到缓存头部                                │
└─────────────────────────────────────────────────┘

┌─ 向下滚动裁剪 ──────────────────────────────────┐
│  滚动到底部 → messages.length > 100?            │
│    是 → setQueryData 只保留最新 20 条            │
│    否 → 不操作                                   │
└─────────────────────────────────────────────────┘
```

## 后端改动

### 1. MessageService.handleIncomingMessage()

返回 `{ conversationId, message }` 而不是 `void`。message 是经过 `processMessageContent` 处理后的完整 camelCase 消息数据。

### 2. app.ts webhook handler

在 `handleIncomingMessage()` 之后，调用 `wsService.broadcast('message:new', { conversationId, message })` 推送给所有前端客户端。

### 3. ConversationService.getMessages()

默认 limit 从 50 改为 20。

## 前端改动

### 1. useMessages hook

重构为管理消息滑动窗口：
- 初始加载 20 条
- 提供 `loadMore()` 方法用于向上滚动加载更早消息
- 提供 `trimToLatest()` 方法用于滚动到底部时裁剪

### 2. ChatPage WebSocket handler

收到 `message:new` 后：
- 如果是当前会话：`setQueryData` 函数式更新追加消息到缓存末尾
- 如果不是当前会话：仅 `invalidateQueries(['conversations'])` 更新侧边栏

### 3. MessageList

- 向上滚动到顶部时触发 `loadMore()`
- 向下滚动到底部时触发 `trimToLatest()`
- 用户不在底部时收到新消息，显示"有新消息"提示条

### 4. chatApi.getMessages()

默认 limit 改为 20。

## Corner Case 处理

| Corner case | 方案 |
|-------------|------|
| 消息去重 | 追加时按 `msgId` 去重 |
| 翻看历史时收到新消息 | 不在底部时显示"新消息"提示条，点击跳到底部 |
| 裁剪策略 | 超过 100 条时裁剪到最新 20 条 |
| 消息撤回实时同步 | 本次不处理，后续优化 |
| hasMore 边界 | 正确使用 `hasMore` 停止加载 |
| 快速连续消息 | `setQueryData` 函数式更新 `old => [...old, newMsg]` 避免竞态 |
| WebSocket 断连恢复 | 重连后 invalidateQueries 重新拉取最新 20 条 |

## 测试策略

- 后端：`MessageService.handleIncomingMessage` 单元测试验证返回值包含 conversationId 和处理后的 message
- 后端：webhook handler 集成测试验证 broadcast 被调用
- 前端：`useMessages` hook 测试验证追加、加载更多、裁剪逻辑

## 不在本次范围

- 消息撤回实时同步
- 已读状态实时同步
- 输入中状态提示
