# 撤回消息标识显示

## 背景

用户发送消息后可能撤回，微信通过 msgType 10002 的系统消息通知撤回事件。当前系统收到撤回通知后仅在 MessageStateChange 表记录审计日志，被撤回的原始消息仍正常显示，用户无法识别哪些消息已被撤回。

## 目标

在前端消息气泡上为被撤回的消息添加"已撤回"标签，保留原始消息内容不变。

## 改动范围

| 层 | 文件 | 变更 |
|----|------|------|
| Schema | `database.ts` | MessageIndex 加 `isRecalled` 列 |
| DataLake | `dataLake.ts` | ChatMessage 加 `is_recalled` 可选字段；新增 `updateMessage` 方法 |
| 消息处理 | `messageContentProcessor.ts` | 新增 `parseRecallXml` 函数 |
| 消息服务 | `message.ts` | 改造 `handleRecall()`：解析 XML → 标记 MessageIndex → 更新 DataLake |
| 会话服务 | `conversationService.ts` | `getMessages` 透传 `isRecalled` |
| 前端类型 | `apps/web/src/types/index.ts` | Message 加 `isRecalled` |
| 前端 API | `apps/web/src/api/chat.ts` | mapMessage 透传 `isRecalled` |
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
dataLake.updateMessage(dataLakeKey, { is_recalled: true })
    ↓
createMessageStateChange（保留审计日志，现有逻辑不变）
```

## Schema 变更

### MessageIndex

```sql
ALTER TABLE "MessageIndex" ADD COLUMN "isRecalled" BOOLEAN NOT NULL DEFAULT false
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

- `<newmsgid>` 是被撤回消息在我们 MessageIndex 中的 `msgId`
- 实现时需用真实数据验证此映射关系

新增 `parseRecallXml` 函数（放在 `messageContentProcessor.ts`）：

```typescript
export function parseRecallXml(content: string): string | null {
  const parsed = parseXml(content)
  const newmsgid = parsed?.sysmsg?.revokemsg?.newmsgid
  return newmsgid ? String(newmsgid) : null
}
```

## DataLakeService.updateMessage

新增方法，用于更新 JSONL 文件中指定消息的字段：

```typescript
async updateMessage(key: string, updates: Partial<ChatMessage>): Promise<void>
```

实现逻辑：
1. 解析 key 获取文件路径和 msgId
2. 读取整个 JSONL 文件
3. 找到目标消息行，合并 updates
4. 写回文件

仅在收到撤回通知时调用，不在读取路径上。同时更新 raw 和 hot 两个存储层。

注意：JSONL 文件的 key 格式为 `hot/{convId}/{date}.jsonl:{msgId}`，raw 文件路径为 `raw/{date}.jsonl`。更新 raw 文件需要从 hot key 中提取日期部分。

## 后端 handleRecall 改造

```typescript
private async handleRecall(parsed: ParsedWebhookPayload): Promise<void> {
  const { message } = parsed

  const revokedMsgId = parseRecallXml(message.content)

  if (revokedMsgId) {
    const originalIndex = await this.db.findMessageIndexByMsgId(revokedMsgId)
    if (originalIndex) {
      await this.db.updateMessageIndex(revokedMsgId, { isRecalled: true })
      await this.dataLake.updateMessage(originalIndex.dataLakeKey, { is_recalled: true })
    }
  }

  await this.db.createMessageStateChange({
    msgId: message.msgId,
    changeType: 'recall',
    changeTime: message.createTime,
    changeData: message.content
  })
}
```

## ConversationService.getMessages 变更

查询 MessageIndex 时带出 `isRecalled` 字段，在消息映射中透传：

```typescript
const messages = rawMessages.map((msg: any, index: number) => {
  // ... 现有逻辑
  return {
    // ... 现有字段
    isRecalled: actualIndexes[index].isRecalled ?? false,
  }
})
```

注意：`isRecalled` 来自 MessageIndex 而非 DataLake 的原始消息，因为 DataLake 的 `is_recalled` 是归档用途，读取路径以 MessageIndex 为准。

## API 响应

message 对象新增 `isRecalled: boolean` 字段。

## 前端变更

### Message 类型

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

## 测试

### 单元测试

- `parseRecallXml`：正常 XML、缺少 newmsgid、空内容、格式错误
- `handleRecall`：找到原始消息时标记、找不到时仅记录审计日志
- `DataLakeService.updateMessage`：更新 JSONL 中的指定消息

### 集成测试

- 完整撤回流程：发送消息 → 收到撤回通知 → 验证 MessageIndex.isRecalled = true → 验证 DataLake 消息含 is_recalled = true
- getMessages 返回 isRecalled 字段
