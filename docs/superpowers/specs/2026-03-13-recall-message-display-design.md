# 撤回消息标识显示

## 背景

用户发送消息后可能撤回，微信通过 msgType 10002 的系统消息通知撤回事件。当前系统收到撤回通知后仅在 MessageStateChange 表记录审计日志，被撤回的原始消息仍正常显示，用户无法识别哪些消息已被撤回。

## 目标

在前端消息气泡上为被撤回的消息添加"已撤回"标签，保留原始消息内容不变。

## 前置条件

实施前必须通过真实 webhook payload 验证：撤回通知 XML 中的 `<newmsgid>` 是否对应我们 MessageIndex 中存储的 `msgId`。如果映射关系不符，需要调整 `parseRecallXml` 的提取逻辑。可通过服务器日志获取真实撤回通知 payload 进行验证。

## 改动范围

| 层 | 文件 | 变更 |
|----|------|------|
| Prisma Schema | `prisma/schema.prisma` | MessageIndex model 加 `isRecalled` 字段 |
| DB Schema | `database.ts` pushSchema | MessageIndex 表加 `isRecalled` 列；新增 `updateMessageIndex` 方法 |
| DataLake | `dataLake.ts` | ChatMessage 加 `is_recalled` 可选字段；新增 `updateMessage` 方法（仅 hot 层） |
| 消息处理 | `messageContentProcessor.ts` | 新增 `parseRecallXml` 函数 |
| 消息服务 | `message.ts` | 改造 `handleRecall()`：返回撤回结果用于 WebSocket 广播 |
| WebSocket | `app.ts` | webhook handler 处理 `handleRecall` 返回值，广播 `message:recall` 事件 |
| 会话服务 | `conversationService.ts` | `getMessages` 透传 `isRecalled` |
| 前端类型 | `apps/web/src/types/index.ts` | Message 加 `isRecalled` |
| 前端 API | `apps/web/src/api/chat.ts` | ApiMessage 和 mapMessage 加 `isRecalled` |
| 前端页面 | `ChatPage.tsx` | 处理 `message:recall` WebSocket 事件，更新缓存中消息的 `isRecalled` |
| 前端组件 | `MessageItem.tsx` | 显示"已撤回"标签 |

## 数据流

```
收到 msgType 10002 撤回通知
    ↓
parseRecallXml(content) → 提取 <newmsgid>（被撤回消息 ID）
    ↓
findMessageIndexByMsgId(newmsgid)
    ↓ (找到)
updateMessageIndex(msgId, { isRecalled: true })
    ↓
dataLake.updateMessage(dataLakeKey, { is_recalled: true })  ← 仅 hot 层
    ↓
createMessageStateChange（保留审计日志，现有逻辑不变）
```

## Schema 变更

### Prisma Schema

```prisma
model MessageIndex {
  // ... 现有字段
  isRecalled  Boolean  @default(false)
}
```

### database.ts pushSchema

`CREATE TABLE "MessageIndex"` 语句中加入 `isRecalled` 列：

```sql
"isRecalled" BOOLEAN NOT NULL DEFAULT false
```

同时添加 migration 语句（兼容已有数据库）：

```sql
ALTER TABLE "MessageIndex" ADD COLUMN "isRecalled" BOOLEAN NOT NULL DEFAULT false
```

### DatabaseService 新增方法

```typescript
async updateMessageIndex(msgId: string, data: { isRecalled: boolean }) {
  return this.prisma.messageIndex.update({
    where: { msgId },
    data
  })
}
```

### ChatMessage（DataLake）

```typescript
export interface ChatMessage {
  // ... 现有字段
  is_recalled?: boolean
}
```

## 撤回通知 XML 解析

撤回通知的 content 字段格式：

```xml
<sysmsg type="revokemsg">
  <revokemsg>
    <session>wxid_xxx</session>
    <msgid>583100271</msgid>
    <newmsgid>2024578957280591112</newmsgid>
    <replacemsg><![CDATA["Super Mario" 撤回了一条消息]]></replacemsg>
  </revokemsg>
</sysmsg>
```

- `<newmsgid>` 是被撤回消息在我们 MessageIndex 中的 `msgId`（需通过真实数据验证，见前置条件）

新增 `parseRecallXml` 函数（放在 `messageContentProcessor.ts`）：

```typescript
export function parseRecallXml(content: string): string | null {
  const parsed = parseXml(content)
  const newmsgid = parsed?.sysmsg?.revokemsg?.newmsgid
  return newmsgid ? String(newmsgid) : null
}
```

## DataLakeService.updateMessage

新增方法，仅更新 hot 层 JSONL 文件中指定消息的字段。raw 层保持不可变（作为原始归档）。

```typescript
async updateMessage(key: string, updates: Partial<ChatMessage>): Promise<void>
```

实现逻辑：
1. 解析 key 获取 hot 文件路径和 msgId
2. 读取整个 JSONL 文件
3. 找到目标消息行，合并 updates
4. 写入临时文件，然后 `rename` 替换原文件（原子写入，防止进程崩溃导致文件损坏）

仅在收到撤回通知时调用，不在读取路径上。

并发安全：当前 webhook 消息处理是串行的（单进程顺序处理），不存在并发写入同一 JSONL 文件的风险。如果未来改为并发处理，需要加文件锁。

## 后端 handleRecall 改造

```typescript
private async handleRecall(parsed: ParsedWebhookPayload): Promise<{ conversationId: string; revokedMsgId: string } | null> {
  const { message } = parsed

  const revokedMsgId = parseRecallXml(message.content)

  let result: { conversationId: string; revokedMsgId: string } | null = null

  if (revokedMsgId) {
    const originalIndex = await this.db.findMessageIndexByMsgId(revokedMsgId)
    if (originalIndex) {
      await this.db.updateMessageIndex(revokedMsgId, { isRecalled: true })
      await this.dataLake.updateMessage(originalIndex.dataLakeKey, { is_recalled: true })
      result = { conversationId: originalIndex.conversationId, revokedMsgId }
    }
  }

  await this.db.createMessageStateChange({
    msgId: message.msgId,
    changeType: 'recall',
    changeTime: message.createTime,
    changeData: message.content
  })

  return result
}
```

`handleIncomingMessage` 中对 10002 的处理也需要调整，将 `handleRecall` 的返回值传递出去：

```typescript
if (message.msgType === 10002) {
  const recallResult = await this.handleRecall(parsed)
  if (recallResult) {
    return { type: 'recall' as const, ...recallResult }
  }
  return null
}
```

`handleIncomingMessage` 的返回类型需要扩展为联合类型，区分普通消息和撤回事件。

## WebSocket 广播

`app.ts` 的 webhook handler 中，根据返回结果类型广播不同事件：

```typescript
const result = await deps.messageService.handleIncomingMessage(parsed)
if (result) {
  if ('type' in result && result.type === 'recall') {
    deps.wsService.broadcast('message:recall', {
      conversationId: result.conversationId,
      msgId: result.revokedMsgId,
    })
  } else {
    deps.wsService.broadcast('message:new', {
      conversationId: result.conversationId,
      message: result.message,
    })
    // ... 现有的联系人同步逻辑
  }
}
```

幂等性：重复收到同一撤回通知时，`updateMessageIndex` 和 `updateMessage` 是幂等的（重复设置 true 无害）。`createMessageStateChange` 会创建重复审计记录，可接受。

## ConversationService.getMessages 变更

查询 MessageIndex 时带出 `isRecalled` 字段，在消息映射中透传。需要在 map 回调中加入 index 参数以关联 MessageIndex：

```typescript
const messages = rawMessages.map((msg: any, index: number) => {
  const { displayType, displayContent, referMsg } = processMessageContent(msg.msg_type, msg.content)
  return {
    msgId: msg.msg_id,
    // ... 现有字段映射
    displayType,
    displayContent,
    referMsg,
    isRecalled: actualIndexes[index].isRecalled ?? false,
  }
})
```

`isRecalled` 来自 MessageIndex 而非 DataLake 的原始消息，因为 DataLake 的 `is_recalled` 是归档用途，读取路径以 MessageIndex 为准。

## API 响应

message 对象新增 `isRecalled: boolean` 字段。

## 前端变更

### ApiMessage 类型（chat.ts）

```typescript
export interface ApiMessage {
  // ... 现有字段
  isRecalled?: boolean
}
```

### Message 类型（types/index.ts）

```typescript
export interface Message {
  // ... 现有字段
  isRecalled?: boolean
}
```

### chatApi.ts mapMessage

透传 `isRecalled` 字段。

### MessageItem 组件

在时间戳旁边显示撤回标签：

```tsx
<span className="text-xs text-gray-500">{formattedTime}</span>
{message.isRecalled && (
  <span className="text-xs text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded">已撤回</span>
)}
```

消息内容保持原样，不做遮挡或淡化。

### ChatPage.tsx WebSocket 处理

在 `handleWebSocketMessage` 中新增 `message:recall` 事件处理：

```typescript
if (data.event === 'message:recall') {
  const { conversationId, msgId } = data.data || {};
  if (!conversationId || !msgId) return;

  // 更新 TanStack Query 缓存中对应消息的 isRecalled 状态
  queryClient.setQueriesData(
    { queryKey: ['messages', conversationId] },
    (oldData: any) => {
      if (!oldData?.pages) return oldData;
      return {
        ...oldData,
        pages: oldData.pages.map((page: any) => ({
          ...page,
          messages: page.messages.map((msg: any) =>
            msg.id === msgId ? { ...msg, isRecalled: true } : msg
          ),
        })),
      };
    }
  );
}
```

## 测试

### 单元测试

- `parseRecallXml`：正常 XML、缺少 newmsgid、空内容、格式错误
- `handleRecall`：找到原始消息时标记并返回结果、找不到时仅记录审计日志并返回 null、重复撤回通知幂等
- `DataLakeService.updateMessage`：更新 hot 层 JSONL 中的指定消息（原子写入）

### 集成测试

- 完整撤回流程：发送消息 → 收到撤回通知 → 验证 MessageIndex.isRecalled = true → 验证 DataLake hot 层消息含 is_recalled = true
- getMessages 返回 isRecalled 字段
