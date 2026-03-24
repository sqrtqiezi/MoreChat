# 修复引用消息刷新后显示异常

Issue: #10

## 问题

本人发送的引用消息，刷新页面后显示异常。

根因：`sendMessage` 保存到 DataLake 时，`content` 是用户输入的纯文本，`msg_type` 却是 49。刷新后 `processMessageContent(49, 纯文本)` XML 解析失败，返回 `displayType: 'unknown'`。

## 设计

将 juhexbot webhook 作为唯一数据源。`sendMessage` 不再写 DataLake / MessageIndex，数据持久化完全由 webhook 回调完成。

### 后端改动

**`MessageService.sendMessage`**
- 移除 DataLake 保存（第 350-366 行）
- 移除 MessageIndex 创建（第 369-377 行）
- 移除会话时间更新（第 380 行）
- 只调用 juhexbot API，返回 `msgId` 给前端

**`MessageService.sendImageMessage`** 同理移除持久化逻辑。

**`sendMessage` 返回值简化为：**
```typescript
{ msgId: string }
```

### 前端改动

**乐观 UI 流程：**
1. 用户点击发送 → 立即在消息列表追加临时消息（`status: 'sending'`，临时 ID）
2. API 返回 → 用 `msgId` 更新临时消息（`status: 'sent'`）
3. WebSocket `message:new` → 用 `msgId` 匹配乐观消息，替换为完整真实数据
4. API 失败 → 标记 `status: 'failed'`

**需要改动的文件：**
- `apps/web/src/hooks/useSendMessage.ts` — 乐观追加 + API 调用
- `apps/web/src/pages/ChatPage.tsx` — WebSocket 消息匹配逻辑
- `apps/web/src/api/chat.ts` — `sendMessage` / `sendImage` 返回类型调整
- `apps/web/src/types/index.ts` — Message 类型可能需要调整

### Webhook 无需改动

`handleIncomingMessage` 已能正确处理自己发送的引用消息（juhexbot 推送完整 XML），去重检查因 MessageIndex 不再提前创建而自然通过。
