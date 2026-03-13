# 撤回消息标识显示 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 识别被撤回的消息并在前端消息气泡上显示"已撤回"标签，保留原始内容不变。

**Architecture:** 收到 10002 撤回通知时，解析 XML 提取被撤回消息 ID，标记 MessageIndex.isRecalled 并更新 DataLake hot 层。通过 WebSocket `message:recall` 事件实时推送到前端。读取路径从 MessageIndex 透传 isRecalled 字段。

**Tech Stack:** Prisma + SQLite, Hono, fast-xml-parser, React + TanStack Query, WebSocket

**Spec:** `docs/superpowers/specs/2026-03-13-recall-message-display-design.md`

---

## Chunk 1: Schema + parseRecallXml

### Task 1: parseRecallXml 函数

**Files:**
- Modify: `apps/server/src/services/messageContentProcessor.ts`
- Test: `apps/server/src/services/messageContentProcessor.test.ts`

- [ ] **Step 1: Write failing tests for parseRecallXml**

在 `messageContentProcessor.test.ts` 中，`describe('parseImageXml')` 之前，作为顶层 `describe` 块添加：

```typescript
describe('parseRecallXml', () => {
  it('should extract newmsgid from recall XML', () => {
    const xml = '<sysmsg type="revokemsg"><revokemsg><session>user1</session><msgid>583100271</msgid><newmsgid>2024578957280591112</newmsgid><replacemsg><![CDATA["小明" 撤回了一条消息]]></replacemsg></revokemsg></sysmsg>'
    expect(parseRecallXml(xml)).toBe('2024578957280591112')
  })

  it('should return null when newmsgid is missing', () => {
    const xml = '<sysmsg type="revokemsg"><revokemsg><session>user1</session><msgid>583100271</msgid></revokemsg></sysmsg>'
    expect(parseRecallXml(xml)).toBeNull()
  })

  it('should return null for empty content', () => {
    expect(parseRecallXml('')).toBeNull()
  })

  it('should return null for invalid XML', () => {
    expect(parseRecallXml('not xml at all')).toBeNull()
  })
})
```

需要在文件顶部的 import 中加入 `parseRecallXml`：

```typescript
import { processMessageContent, parseImageXml, parseRecallXml } from './messageContentProcessor.js'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/server && npx vitest run src/services/messageContentProcessor.test.ts`
Expected: FAIL — `parseRecallXml` is not exported

- [ ] **Step 3: Implement parseRecallXml**

在 `apps/server/src/services/messageContentProcessor.ts` 中，在 `processType10002` 函数之后添加：

```typescript
export function parseRecallXml(content: string): string | null {
  if (!content) return null
  const parsed = parseXml(content)
  const newmsgid = parsed?.sysmsg?.revokemsg?.newmsgid
  return newmsgid ? String(newmsgid) : null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/server && npx vitest run src/services/messageContentProcessor.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/messageContentProcessor.ts apps/server/src/services/messageContentProcessor.test.ts
git commit -m "feat: add parseRecallXml to extract revoked message ID"
```

### Task 2: Schema 变更 — Prisma + pushSchema + updateMessageIndex

**Files:**
- Modify: `apps/server/prisma/schema.prisma`
- Modify: `apps/server/src/services/database.ts`

- [ ] **Step 1: 修改 Prisma schema**

在 `apps/server/prisma/schema.prisma` 的 `MessageIndex` model 中，在 `createdAt` 之前添加：

```prisma
  isRecalled  Boolean  @default(false)
```

- [ ] **Step 2: 运行 prisma generate**

Run: `cd apps/server && npx prisma generate`
Expected: 成功生成 Prisma Client

- [ ] **Step 3: 修改 database.ts pushSchema — CREATE TABLE**

在 `database.ts` 的 `CREATE TABLE "MessageIndex"` 语句中，`"createdAt"` 行之前添加：

```sql
        "isRecalled" BOOLEAN NOT NULL DEFAULT false,
```

- [ ] **Step 4: 修改 database.ts pushSchema — ALTER TABLE migration**

在 `pushSchema` 方法末尾（现有 ALTER TABLE 语句之后）添加：

```typescript
    await this.prisma.$executeRawUnsafe(`ALTER TABLE "MessageIndex" ADD COLUMN "isRecalled" BOOLEAN NOT NULL DEFAULT false`).catch(() => {})
```

- [ ] **Step 5: 新增 updateMessageIndex 方法**

在 `database.ts` 的 `// --- MessageStateChange ---` 注释之前添加：

```typescript
  async updateMessageIndex(msgId: string, data: { isRecalled: boolean }) {
    return this.prisma.messageIndex.update({
      where: { msgId },
      data
    })
  }
```

- [ ] **Step 6: 编写 updateMessageIndex 测试**

在 `apps/server/src/services/database.test.ts` 中，找到合适位置添加测试：

```typescript
it('should update MessageIndex isRecalled', async () => {
  // 先创建一条消息索引
  await db.createMessageIndex({
    conversationId: conversation.id,
    msgId: 'recall_test_msg',
    msgType: 1,
    fromUsername: 'test_user',
    toUsername: 'test_receiver',
    createTime: 1772989439,
    dataLakeKey: 'hot/conv1/2026-03-10.jsonl:recall_test_msg'
  })

  // 标记为已撤回
  await db.updateMessageIndex('recall_test_msg', { isRecalled: true })

  // 验证
  const index = await db.findMessageIndexByMsgId('recall_test_msg')
  expect(index!.isRecalled).toBe(true)
})
```

注意：需要根据 `database.test.ts` 现有的 setup 结构（beforeEach 中创建的 conversation 变量）调整测试中的 `conversation.id` 引用。

- [ ] **Step 7: 运行测试验证通过**

Run: `cd apps/server && npx vitest run src/services/database.test.ts`
Expected: ALL PASS

- [ ] **Step 8: Commit**

```bash
git add apps/server/prisma/schema.prisma apps/server/src/services/database.ts
git commit -m "feat: add isRecalled to MessageIndex schema"
```

### Task 3: DataLake updateMessage 方法

**Files:**
- Modify: `apps/server/src/services/dataLake.ts`
- Test: 新建 `apps/server/src/services/dataLake.test.ts`

- [ ] **Step 1: 修改 ChatMessage 接口**

在 `apps/server/src/services/dataLake.ts` 的 `ChatMessage` 接口中，`source: string` 之后添加：

```typescript
  is_recalled?: boolean
```

- [ ] **Step 2: 编写 updateMessage 的失败测试**

新建 `apps/server/src/services/dataLake.test.ts`：

```typescript
// ABOUTME: DataLakeService 的单元测试
// ABOUTME: 测试消息的存储和更新功能

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DataLakeService } from './dataLake.js'
import fs from 'fs/promises'
import path from 'path'

describe('DataLakeService', () => {
  let dataLake: DataLakeService
  const testDir = path.join(process.cwd(), 'test-datalake')

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true })
    dataLake = new DataLakeService({ type: 'filesystem', path: testDir })
  })

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true })
  })

  describe('updateMessage', () => {
    it('should update a message in hot layer JSONL', async () => {
      const msg = {
        msg_id: 'test_msg_1',
        from_username: 'user1',
        to_username: 'user2',
        content: 'hello',
        create_time: 1772989439,
        msg_type: 1,
        chatroom_sender: '',
        desc: '',
        is_chatroom_msg: 0,
        chatroom: '',
        source: ''
      }

      const key = await dataLake.saveMessage('conv1', msg)

      await dataLake.updateMessage(key, { is_recalled: true })

      const updated = await dataLake.getMessage(key)
      expect(updated.is_recalled).toBe(true)
      expect(updated.msg_id).toBe('test_msg_1')
      expect(updated.content).toBe('hello')
    })

    it('should not affect other messages in the same JSONL file', async () => {
      const msg1 = {
        msg_id: 'msg_1',
        from_username: 'user1',
        to_username: 'user2',
        content: 'first',
        create_time: 1772989439,
        msg_type: 1,
        chatroom_sender: '',
        desc: '',
        is_chatroom_msg: 0,
        chatroom: '',
        source: ''
      }
      const msg2 = {
        msg_id: 'msg_2',
        from_username: 'user1',
        to_username: 'user2',
        content: 'second',
        create_time: 1772989440,
        msg_type: 1,
        chatroom_sender: '',
        desc: '',
        is_chatroom_msg: 0,
        chatroom: '',
        source: ''
      }

      const key1 = await dataLake.saveMessage('conv1', msg1)
      const key2 = await dataLake.saveMessage('conv1', msg2)

      await dataLake.updateMessage(key1, { is_recalled: true })

      const updated1 = await dataLake.getMessage(key1)
      const updated2 = await dataLake.getMessage(key2)
      expect(updated1.is_recalled).toBe(true)
      expect((updated2 as any).is_recalled).toBeUndefined()
    })

    it('should throw when message not found in JSONL', async () => {
      const msg = {
        msg_id: 'existing_msg',
        from_username: 'user1',
        to_username: 'user2',
        content: 'hello',
        create_time: 1772989439,
        msg_type: 1,
        chatroom_sender: '',
        desc: '',
        is_chatroom_msg: 0,
        chatroom: '',
        source: ''
      }

      const key = await dataLake.saveMessage('conv1', msg)
      const fakeKey = key.replace('existing_msg', 'nonexistent_msg')

      await expect(dataLake.updateMessage(fakeKey, { is_recalled: true })).rejects.toThrow()
    })
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/server && npx vitest run src/services/dataLake.test.ts`
Expected: FAIL — `updateMessage` is not a function

- [ ] **Step 4: Implement updateMessage**

在 `apps/server/src/services/dataLake.ts` 的 `getMessages` 方法之后添加：

```typescript
  /**
   * 更新 hot 层 JSONL 中指定消息的字段（原子写入）
   * @param key Data Lake key
   * @param updates 要合并的字段（仅支持 is_recalled）
   */
  async updateMessage(key: string, updates: { is_recalled: boolean }): Promise<void> {
    if (!key.startsWith('hot/')) {
      throw new Error(`updateMessage only supports hot layer keys: ${key}`)
    }

    const [filePart, msgId] = key.split(':')
    const filePath = path.join(this.config.path, filePart)

    const content = await fs.readFile(filePath, 'utf-8')
    const lines = content.split('\n').filter(Boolean)

    let found = false
    const updatedLines = lines.map(line => {
      try {
        const msg = JSON.parse(line)
        if (msg.msg_id === msgId) {
          found = true
          return JSON.stringify({ ...msg, ...updates })
        }
        return line
      } catch {
        return line
      }
    })

    if (!found) {
      throw new Error(`Message not found in JSONL: ${key}`)
    }

    // 原子写入：先写临时文件，再 rename
    const tmpPath = filePath + '.tmp'
    await fs.writeFile(tmpPath, updatedLines.join('\n') + '\n', 'utf-8')
    await fs.rename(tmpPath, filePath)
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/server && npx vitest run src/services/dataLake.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/services/dataLake.ts apps/server/src/services/dataLake.test.ts
git commit -m "feat: add DataLake updateMessage for hot layer JSONL"
```

## Chunk 2: handleRecall 改造 + WebSocket 广播

### Task 4: handleRecall 改造 + WebSocket 广播

Task 4 和 5 合并为一个原子任务，因为修改 `handleIncomingMessage` 返回类型后，`app.ts` 必须同步更新，否则 type-check 会失败。

**Files:**
- Modify: `apps/server/src/services/message.ts`
- Modify: `apps/server/src/services/message.test.ts`
- Modify: `tests/fixtures/messages.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/app.test.ts`

- [ ] **Step 1: 更新测试 fixture**

当前 `tests/fixtures/messages.ts` 中的 `messageRecall` 的 `newmsgid` 是 `2024578957280591112`，但 `textMessage` 的 `msg_id` 是 `2265241832514211437`。为了测试撤回能找到原始消息，需要让 `messageRecall` 的 `newmsgid` 匹配 `textMessage` 的 `msg_id`。

修改 `tests/fixtures/messages.ts` 中 `messageRecall.data.content`，将 `<newmsgid>2024578957280591112</newmsgid>` 替换为 `<newmsgid>2265241832514211437</newmsgid>`：

```typescript
    content: "<sysmsg type=\"revokemsg\"><revokemsg><session>test_user</session><msgid>583100271</msgid><newmsgid>2265241832514211437</newmsgid><replacemsg><![CDATA[\"Test User\" 撤回了一条消息]]></replacemsg></revokemsg></sysmsg>"
```

已确认无其他测试依赖原始的 `newmsgid` 值（仅 `message.test.ts` 使用 `messageRecall`）。

- [ ] **Step 2: 编写 handleRecall 改造的测试**

修改 `apps/server/src/services/message.test.ts`，删除第 86-101 行的 `should handle message recall` 测试，替换为：

```typescript
  it('should handle message recall and mark original message', async () => {
    // 先发送一条消息
    const textParsed = adapter.parseWebhookPayload(textMessage)
    const textResult = await messageService.handleIncomingMessage(textParsed)
    expect(textResult).not.toBeNull()

    // 然后撤回
    const recallParsed = adapter.parseWebhookPayload(messageRecall)
    const recallResult = await messageService.handleIncomingMessage(recallParsed)

    // 验证返回撤回结果（非 null）
    expect(recallResult).not.toBeNull()
    expect(recallResult).toHaveProperty('type', 'recall')
    expect(recallResult).toHaveProperty('revokedMsgId', textMessage.data.msg_id)
    expect(recallResult).toHaveProperty('conversationId')

    // 验证 MessageIndex 已标记
    const index = await db.findMessageIndexByMsgId(textMessage.data.msg_id)
    expect(index).not.toBeNull()
    expect(index!.isRecalled).toBe(true)

    // 验证审计日志
    const changes = await db.getMessageStateChanges(messageRecall.data.msg_id)
    expect(changes).toHaveLength(1)
    expect(changes[0].changeType).toBe('recall')
  })

  it('should return null when recalled message not found', async () => {
    // 直接撤回一条不存在的消息
    const recallParsed = adapter.parseWebhookPayload(messageRecall)
    const result = await messageService.handleIncomingMessage(recallParsed)

    // 找不到原始消息时返回 null
    expect(result).toBeNull()

    // 但审计日志仍然记录
    const changes = await db.getMessageStateChanges(messageRecall.data.msg_id)
    expect(changes).toHaveLength(1)
  })
```

需要在文件顶部 import 中确保 `messageRecall` 已导入（已有）。

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/server && npx vitest run src/services/message.test.ts`
Expected: FAIL — 测试期望 recallResult 非 null 但当前返回 null

- [ ] **Step 4: 改造 handleRecall 和 handleIncomingMessage**

修改 `apps/server/src/services/message.ts`：

1. 在文件顶部 import 中添加 `parseRecallXml`：

```typescript
import { processMessageContent, parseRecallXml } from './messageContentProcessor.js'
```

2. 定义返回类型（在 `IncomingMessageResult` 接口之后添加）：

```typescript
export interface RecallResult {
  type: 'recall'
  conversationId: string
  revokedMsgId: string
}
```

3. 修改 `handleIncomingMessage` 的返回类型为 `Promise<IncomingMessageResult | RecallResult | null>`

4. 修改 10002 处理分支：

```typescript
    // 消息撤回特殊处理
    if (message.msgType === 10002) {
      return this.handleRecall(parsed)
    }
```

注意：去重检查（`findMessageIndexByMsgId(message.msgId)`）在 10002 分支之前执行，但撤回通知的 `msgId` 是撤回通知自身的 ID，不会与已有消息冲突，所以不会被拦截。

5. 改造 `handleRecall` 方法：

```typescript
  private async handleRecall(parsed: ParsedWebhookPayload): Promise<RecallResult | null> {
    const { message } = parsed

    const revokedMsgId = parseRecallXml(message.content)

    let result: RecallResult | null = null

    if (revokedMsgId) {
      const originalIndex = await this.db.findMessageIndexByMsgId(revokedMsgId)
      if (originalIndex) {
        await this.db.updateMessageIndex(revokedMsgId, { isRecalled: true })
        await this.dataLake.updateMessage(originalIndex.dataLakeKey, { is_recalled: true })
        result = { type: 'recall', conversationId: originalIndex.conversationId, revokedMsgId }
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

- [ ] **Step 5: 同步修改 app.ts webhook handler**

在 `apps/server/src/app.ts` 的 webhook handler 中，修改 `if (result)` 分支：

```typescript
      if (result) {
        if ('type' in result && result.type === 'recall') {
          deps.wsService.broadcast('message:recall', {
            conversationId: result.conversationId,
            msgId: result.revokedMsgId,
          })
          logger.debug({ conversationId: result.conversationId, revokedMsgId: result.revokedMsgId }, 'Recall broadcasted via WebSocket')
        } else {
          deps.wsService.broadcast('message:new', {
            conversationId: result.conversationId,
            message: result.message,
          })
          logger.debug({ conversationId: result.conversationId, msgId: result.message.msgId }, 'Message broadcasted via WebSocket')

          // 异步同步联系人信息（不阻塞 webhook 响应）
          const msg = parsed.message
          if (msg.isChatroomMsg && msg.chatroom) {
            deps.contactSyncService.syncGroup(msg.chatroom).catch(() => {})
            if (msg.chatroomSender) {
              deps.contactSyncService.syncContact(msg.chatroomSender).catch(() => {})
            }
          } else {
            deps.contactSyncService.syncContact(msg.fromUsername).catch(() => {})
          }
        }
      }
```

- [ ] **Step 6: 添加 app.test.ts 撤回广播测试**

在 `apps/server/src/app.test.ts` 中添加测试：

```typescript
  it('should broadcast message:recall via WebSocket for recall result', async () => {
    vi.mocked(deps.juhexbotAdapter.parseWebhookPayload).mockReturnValue({
      message: { msgType: 10002 },
    } as any)
    vi.mocked(deps.messageService.handleIncomingMessage).mockResolvedValue({
      type: 'recall',
      conversationId: 'conv_1',
      revokedMsgId: 'msg_1',
    } as any)

    const app = createApp(deps)
    const res = await app.request('/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'message', data: {} })
    })

    expect(res.status).toBe(200)
    expect(deps.wsService.broadcast).toHaveBeenCalledWith('message:recall', {
      conversationId: 'conv_1',
      msgId: 'msg_1',
    })
  })
```

- [ ] **Step 7: Run all backend tests**

Run: `cd apps/server && npx vitest run`
Expected: ALL PASS

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/services/message.ts apps/server/src/services/message.test.ts tests/fixtures/messages.ts apps/server/src/app.ts apps/server/src/app.test.ts
git commit -m "feat: handleRecall marks original message, broadcasts via WebSocket"
```

## Chunk 3: ConversationService 透传 + 前端

### Task 5: ConversationService.getMessages 透传 isRecalled

**Files:**
- Modify: `apps/server/src/services/conversationService.ts`
- Modify: `apps/server/src/services/conversationService.test.ts`

- [ ] **Step 1: 更新现有测试的 expectedMessages、mockIndexes 和 mockDb**

现有测试使用 mock 模式。修改后 `getMessages` 会返回 `isRecalled` 字段，现有的 `toEqual` 断言会因多出字段而失败。需要同步更新。

首先，在 `beforeEach` 的 `mockDb` 定义中添加 `findContactsByUsernames` mock（`getMessages` 内部会调用此方法查询群聊发送者昵称）：

```typescript
    mockDb = {
      getConversations: vi.fn(),
      findConversationById: vi.fn(),
      updateConversation: vi.fn(),
      getMessageIndexes: vi.fn(),
      findContactsByUsernames: vi.fn().mockResolvedValue([])
    } as any
```

然后在 `should return paginated messages from DataLake` 测试中：

1. 给 `mockIndexes` 加上 `isRecalled` 字段：

```typescript
      const mockIndexes = [
        { dataLakeKey: 'key1', createTime: 1000, isRecalled: false },
        { dataLakeKey: 'key2', createTime: 900, isRecalled: false }
      ]
```

2. 给 `expectedMessages` 每个对象加上 `isRecalled: false`：

```typescript
      const expectedMessages = [
        { msgId: 'msg2', msgType: 1, fromUsername: 'user2', toUsername: 'user1', content: 'world', createTime: 900, chatroomSender: undefined, desc: undefined, isChatroomMsg: undefined, chatroom: undefined, source: undefined, displayType: 'text', displayContent: 'world', isRecalled: false },
        { msgId: 'msg1', msgType: 1, fromUsername: 'user1', toUsername: 'user2', content: 'hello', createTime: 1000, chatroomSender: undefined, desc: undefined, isChatroomMsg: undefined, chatroom: undefined, source: undefined, displayType: 'text', displayContent: 'hello', isRecalled: false }
      ]
```

3. 在 `should process non-text messages` 测试中，给 `mockIndexes` 加上 `isRecalled: false`：

```typescript
      const mockIndexes = [
        { dataLakeKey: 'key1', createTime: 1000, isRecalled: false }
      ]
```

- [ ] **Step 2: 添加 isRecalled 透传测试**

在 `describe('getMessages')` 中添加新测试：

```typescript
    it('should include isRecalled in getMessages response', async () => {
      const mockIndexes = [
        { dataLakeKey: 'key1', createTime: 1000, isRecalled: true },
        { dataLakeKey: 'key2', createTime: 900, isRecalled: false }
      ]
      const mockRawMessages = [
        { msg_id: 'msg1', msg_type: 1, from_username: 'user1', to_username: 'user2', content: 'recalled', create_time: 1000 },
        { msg_id: 'msg2', msg_type: 1, from_username: 'user2', to_username: 'user1', content: 'normal', create_time: 900 }
      ]

      vi.mocked(mockDb.getMessageIndexes).mockResolvedValue(mockIndexes)
      vi.mocked(mockDataLake.getMessages).mockResolvedValue(mockRawMessages)
      vi.mocked(mockDb.findContactsByUsernames).mockResolvedValue([])

      const result = await service.getMessages('conv_1', { limit: 20 })
      // 注意：getMessages 内部会 reverse，所以 msg2 在前
      expect(result.messages[1].isRecalled).toBe(true)
      expect(result.messages[0].isRecalled).toBe(false)
    })
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/server && npx vitest run src/services/conversationService.test.ts`
Expected: FAIL — isRecalled 未定义

- [ ] **Step 4: 修改 conversationService.ts**

在 `apps/server/src/services/conversationService.ts` 的 `getMessages` 方法中，修改 `rawMessages.map` 回调，加入 `index` 参数并透传 `isRecalled`：

```typescript
    const messages = rawMessages.map((msg: any, index: number) => {
      const { displayType, displayContent, referMsg } = processMessageContent(msg.msg_type, msg.content)
      return {
        msgId: msg.msg_id,
        msgType: msg.msg_type,
        fromUsername: msg.from_username,
        toUsername: msg.to_username,
        content: msg.content,
        createTime: msg.create_time,
        chatroomSender: msg.chatroom_sender,
        senderNickname: msg.chatroom_sender
          ? senderNicknameMap.get(msg.chatroom_sender)
          : undefined,
        desc: msg.desc,
        isChatroomMsg: msg.is_chatroom_msg,
        chatroom: msg.chatroom,
        source: msg.source,
        displayType,
        displayContent,
        referMsg,
        isRecalled: actualIndexes[index].isRecalled ?? false,
      }
    })
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/server && npx vitest run src/services/conversationService.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/services/conversationService.ts apps/server/src/services/conversationService.test.ts
git commit -m "feat: pass isRecalled through getMessages"
```

### Task 6: 前端类型 + API 层

**Files:**
- Modify: `apps/web/src/types/index.ts`
- Modify: `apps/web/src/api/chat.ts`

- [ ] **Step 1: 修改 Message 类型**

在 `apps/web/src/types/index.ts` 的 `Message` 接口中，`referMsg?` 之后添加：

```typescript
  isRecalled?: boolean;
```

- [ ] **Step 2: 修改 ApiMessage 类型**

在 `apps/web/src/api/chat.ts` 的 `ApiMessage` 接口中，`referMsg?` 之后添加：

```typescript
  isRecalled?: boolean;
```

- [ ] **Step 3: 修改 mapMessage 函数**

在 `apps/web/src/api/chat.ts` 的 `mapMessage` 函数返回对象中，`referMsg` 之后添加：

```typescript
    isRecalled: raw.isRecalled,
```

- [ ] **Step 4: 运行 type-check 确认无类型错误**

Run: `pnpm type-check`
Expected: 无错误

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/types/index.ts apps/web/src/api/chat.ts
git commit -m "feat: add isRecalled to frontend types and API mapping"
```

### Task 7: MessageItem 显示撤回标签

**Files:**
- Modify: `apps/web/src/components/chat/MessageItem.tsx`

- [ ] **Step 1: 在 MessageItem 中添加撤回标签**

在 `apps/web/src/components/chat/MessageItem.tsx` 中，有两处时间戳显示位置需要添加撤回标签。

对于他人消息（左对齐，约第 283-286 行），在时间戳 `<span>` 之后、`</div>` 之前添加：

```tsx
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-gray-900">{senderName}</span>
          <span className="text-xs text-gray-500">{formattedTime}</span>
          {message.isRecalled && (
            <span className="text-xs text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded">已撤回</span>
          )}
        </div>
```

对于自己的消息（右对齐，约第 253-256 行），同样在时间戳 `<span>` 之后、`</div>` 之前添加：

```tsx
        <div className="flex items-center gap-2 mb-1 justify-end">
          <span className="text-xs text-gray-500">{formattedTime}</span>
          {message.isRecalled && (
            <span className="text-xs text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded">已撤回</span>
          )}
        </div>
```

- [ ] **Step 2: 运行 type-check**

Run: `pnpm type-check`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/chat/MessageItem.tsx
git commit -m "feat: show recalled badge on MessageItem"
```

### Task 8: ChatPage WebSocket 处理 message:recall

**Files:**
- Modify: `apps/web/src/pages/ChatPage.tsx`

- [ ] **Step 1: 在 handleWebSocketMessage 中添加 recall 处理**

在 `apps/web/src/pages/ChatPage.tsx` 的 `handleWebSocketMessage` 中，在 `if (data.event === 'message:new')` 块之后添加：

```typescript
      if (data.event === 'message:recall') {
        const { conversationId, msgId } = data.data || {};
        if (!conversationId || !msgId) return;

        queryClient.setQueryData(
          ['messages', conversationId],
          (old: any) => {
            if (!old) return old;
            return {
              ...old,
              messages: old.messages.map((msg: any) =>
                msg.id === msgId ? { ...msg, isRecalled: true } : msg
              ),
            };
          }
        );
      }
```

- [ ] **Step 2: 运行 type-check**

Run: `pnpm type-check`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/ChatPage.tsx
git commit -m "feat: handle message:recall WebSocket event in ChatPage"
```

### Task 9: 全量验证

- [ ] **Step 1: 运行全部后端测试**

Run: `cd apps/server && npx vitest run`
Expected: ALL PASS

- [ ] **Step 2: 运行 lint 和 type-check**

Run: `pnpm lint && pnpm type-check`
Expected: 无错误

- [ ] **Step 3: 最终 commit（如有遗漏）**

```bash
git status
# 如有未提交的变更，提交
```
