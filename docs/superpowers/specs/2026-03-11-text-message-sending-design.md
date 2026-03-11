# 文本消息发送功能设计

## 概述

完善现有的消息发送功能，使文本消息能够正常发送、即时显示、并处理 webhook 回显去重。

## 现状

发送链路的代码框架已存在，但存在以下问题：

1. **前后端数据不匹配**：后端 `sendMessage` 返回 `{ msgId }` ，前端期望 `{ message: ApiMessage }`
2. **无乐观更新**：发送后需等待 refetch 才能看到消息
3. **无去重逻辑**：juhexbot 会回传自己发送的消息，WebSocket 推送后会导致消息重复显示

## 改动点

### 1. 后端：`MessageService.sendMessage` 返回完整消息

**文件**: `apps/server/src/services/message.ts`

当前返回：
```typescript
return { msgId }
```

改为返回完整消息数据：
```typescript
return {
  msgId,
  msgType: 1,
  fromUsername: this.clientUsername,
  toUsername,
  content,
  createTime,
  displayType: 'text',
  displayContent: content,
}
```

### 2. 后端：路由包装返回格式

**文件**: `apps/server/src/routes/messages.ts`

当前返回 `{ success: true, data: result }` 其中 result 为 `{ msgId }`。

改为 `{ success: true, data: { message: result } }`，与前端 `chatApi.sendMessage` 期望的 `response.data.data.message` 对齐。

### 3. 前端：`useSendMessage` 乐观更新

**文件**: `apps/web/src/hooks/useSendMessage.ts`

在 `useMutation` 中添加：

- **`onMutate`**：构造临时 `Message` 对象（`status: 'sending'`，`id` 用临时前缀如 `temp-{timestamp}`），直接写入 `useMessages` 的 TanStack Query 缓存
- **`onSuccess`**：用服务器返回的真实 `msgId` 替换临时消息的 `id`，更新 `status` 为 `'sent'`
- **`onError`**：将临时消息的 `status` 改为 `'failed'`（保留在列表中，让用户知道发送失败）
- 保留现有的 `invalidateQueries(['conversations'])` 以更新会话列表排序

### 4. 前端：WebSocket 消息去重

**文件**: `apps/web/src/hooks/useMessages.ts`（或 WebSocket 消息处理处）

在 `appendMessage` 中，插入新消息前检查当前缓存中是否已存在相同 `msgId` 的消息。如果存在，跳过插入。

同时需要处理乐观更新的临时消息：当 WebSocket 推送的消息 `msgId` 与已有消息匹配时（临时消息此时已被 `onSuccess` 替换为真实 `msgId`），直接跳过。

### 5. 测试更新

- **`apps/server/src/services/message.test.ts`**：更新 `sendMessage` 测试，验证返回完整消息对象
- **`apps/server/src/routes/messages.test.ts`**：更新路由测试，验证返回格式为 `{ message: ... }`

## 数据流

```
用户点击发送
  → useSendMessage.onMutate
    → 构造临时消息 (id=temp-xxx, status=sending)
    → 写入 TanStack Query 缓存 → 界面立即显示
  → POST /api/messages/send
    → MessageService.sendMessage
      → JuhexbotAdapter.sendTextMessage (调用 juhexbot API)
      → DataLake 存储 + MessageIndex 创建
      → 返回完整消息对象
    → 路由返回 { message: {...} }
  → useSendMessage.onSuccess
    → 用真实 msgId 替换临时 id, status → sent
    → invalidateQueries(['conversations'])

稍后 juhexbot webhook 回传同一消息
  → WebSocket broadcast message:new
  → 前端 appendMessage
    → 检查 msgId 已存在 → 跳过插入
```

## 不在范围内

- 消息重发（失败后重试）
- 图片/文件等非文本消息
- 发送状态的持久化（刷新后 sending 状态消失是可接受的）
