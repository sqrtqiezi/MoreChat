# 文本消息发送功能实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完善文本消息发送功能，实现乐观更新和前后端去重

**Architecture:** 后端返回完整消息对象，前端乐观插入临时消息，成功后替换为真实 msgId。后端和前端都实现去重逻辑，避免 webhook 回传导致的重复。

**Tech Stack:** Hono, Prisma, React, TanStack Query, WebSocket

---

## 文件结构

### 后端改动
- **Modify**: `apps/server/src/services/database.ts` - 新增 `findMessageIndexByMsgId` 方法
- **Modify**: `apps/server/src/services/message.ts` - `sendMessage` 返回完整消息，`handleIncomingMessage` 去重
- **Modify**: `apps/server/src/routes/messages.ts` - 包装返回格式为 `{ message: ... }`
- **Modify**: `apps/server/src/services/message.test.ts` - 更新测试验证返回格式和去重逻辑
- **Modify**: `apps/server/src/routes/messages.test.ts` - 更新路由测试验证返回格式

### 前端改动
- **Create**: `apps/web/src/utils/pendingMessages.ts` - 管理待确认消息 ID 集合
- **Modify**: `apps/web/src/hooks/useSendMessage.ts` - 实现乐观更新（onMutate/onSuccess/onError）
- **Modify**: `apps/web/src/hooks/useMessages.ts` - `appendMessage` 去重逻辑
- **Test**: `apps/web/src/utils/pendingMessages.test.ts` - pendingMessages 单元测试

---

## Chunk 1: 后端数据库和服务层

### Task 1: 新增 `findMessageIndexByMsgId` 数据库方法

**Files:**
- Modify: `apps/server/src/services/database.ts:318-330`

- [ ] **Step 1: 写失败测试**

在 `apps/server/src/services/database.test.ts` 中添加测试（如果文件不存在则创建）：

```typescript
it('should find message index by msgId', async () => {
  const client = await db.createClient({ guid: 'test-guid' })
  const contact = await db.createContact({
    username: 'wxid_test',
    nickname: 'Test',
    type: 'friend'
  })
  const conversation = await db.createConversation({
    clientId: client.id,
    type: 'private',
    contactId: contact.id
  })

  await db.createMessageIndex({
    conversationId: conversation.id,
    msgId: 'msg_123',
    msgType: 1,
    fromUsername: 'wxid_test',
    toUsername: 'wxid_me',
    createTime: 1234567890,
    dataLakeKey: 'test/key'
  })

  const found = await db.findMessageIndexByMsgId('msg_123')
  expect(found).not.toBeNull()
  expect(found!.msgId).toBe('msg_123')

  const notFound = await db.findMessageIndexByMsgId('not_exist')
  expect(notFound).toBeNull()
})
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd apps/server
npx vitest run src/services/database.test.ts -t "should find message index by msgId"
```

预期：FAIL，`findMessageIndexByMsgId is not a function`

- [ ] **Step 3: 实现 `findMessageIndexByMsgId` 方法**

在 `apps/server/src/services/database.ts` 的 `createMessageIndex` 方法后添加：

```typescript
async findMessageIndexByMsgId(msgId: string) {
  return this.prisma.messageIndex.findUnique({
    where: { msgId }
  })
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
cd apps/server
npx vitest run src/services/database.test.ts -t "should find message index by msgId"
```

预期：PASS

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/services/database.ts apps/server/src/services/database.test.ts
git commit -m "feat(server): 新增 findMessageIndexByMsgId 数据库方法

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: 后端 `handleIncomingMessage` 去重

**Files:**
- Modify: `apps/server/src/services/message.ts:33-40`
- Test: `apps/server/src/services/message.test.ts`

- [ ] **Step 1: 写失败测试**

在 `apps/server/src/services/message.test.ts` 的 `describe('MessageService')` 中添加：

```typescript
it('should skip duplicate message when msgId already exists', async () => {
  // 先通过 sendMessage 创建消息
  vi.spyOn(adapter, 'sendTextMessage').mockResolvedValue({ msgId: 'dup_123' })

  const contact = await db.createContact({
    username: 'wxid_target',
    nickname: 'Target',
    type: 'friend'
  })
  const client = await db.findClientByGuid('test-guid-123')
  const conversation = await db.createConversation({
    clientId: client!.id,
    type: 'private',
    contactId: contact.id
  })

  await messageService.sendMessage(conversation.id, '测试')

  // 模拟 webhook 回传相同 msgId 的消息
  const webhookPayload = {
    guid: 'test-guid-123',
    notify_type: 1,
    data: {
      msg_id: 'dup_123',
      msg_type: 1,
      from_username: 'test-guid-123',
      to_username: 'wxid_target',
      content: '测试',
      create_time: Math.floor(Date.now() / 1000),
      chatroom_sender: '',
      chatroom: '',
      desc: '',
      is_chatroom_msg: 0,
      source: ''
    }
  }

  const parsed = adapter.parseWebhookPayload(webhookPayload)
  const result = await messageService.handleIncomingMessage(parsed)

  // 应返回 null，表示跳过处理
  expect(result).toBeNull()

  // 验证 MessageIndex 仍然只有一条记录
  const indexes = await db.getMessageIndexes(conversation.id, { limit: 10 })
  expect(indexes.length).toBe(1)
})
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd apps/server
npx vitest run src/services/message.test.ts -t "should skip duplicate message"
```

预期：FAIL，返回值不是 null 或抛出 unique constraint 错误

- [ ] **Step 3: 实现去重逻辑**

在 `apps/server/src/services/message.ts` 的 `handleIncomingMessage` 方法开头（消息撤回检查之前）添加：

```typescript
async handleIncomingMessage(parsed: ParsedWebhookPayload): Promise<IncomingMessageResult | null> {
  const { message } = parsed

  // 去重：检查 msgId 是否已存在
  const existing = await this.db.findMessageIndexByMsgId(message.msgId)
  if (existing) {
    return null  // 已发送的消息被 webhook 回传，跳过
  }

  // 消息撤回特殊处理
  if (message.msgType === 10002) {
    // ... 现有代码
```

- [ ] **Step 4: 运行测试验证通过**

```bash
cd apps/server
npx vitest run src/services/message.test.ts -t "should skip duplicate message"
```

预期：PASS

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/services/message.ts apps/server/src/services/message.test.ts
git commit -m "feat(server): handleIncomingMessage 实现 msgId 去重

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: 后端 `sendMessage` 返回完整消息对象

**Files:**
- Modify: `apps/server/src/services/message.ts:200-255`
- Test: `apps/server/src/services/message.test.ts:102-133`

- [ ] **Step 1: 更新测试期望**

修改 `apps/server/src/services/message.test.ts` 中的 `sendMessage` 测试：

```typescript
it('should send text message via adapter and save to DataLake', async () => {
  // Mock adapter.sendTextMessage
  vi.spyOn(adapter, 'sendTextMessage').mockResolvedValue({ msgId: 'sent_123' })

  // 创建联系人和会话
  const contact = await db.createContact({
    username: 'wxid_target',
    nickname: 'Target User',
    type: 'friend'
  })
  const client = await db.findClientByGuid('test-guid-123')
  const conversation = await db.createConversation({
    clientId: client!.id,
    type: 'private',
    contactId: contact.id
  })

  const result = await messageService.sendMessage(conversation.id, '你好')

  // 验证返回完整消息对象
  expect(result.msgId).toBe('sent_123')
  expect(result.msgType).toBe(1)
  expect(result.fromUsername).toBe('test-guid-123')
  expect(result.toUsername).toBe('wxid_target')
  expect(result.content).toBe('你好')
  expect(result.createTime).toBeGreaterThan(0)
  expect(result.displayType).toBe('text')
  expect(result.displayContent).toBe('你好')
  expect(result.chatroomSender).toBeUndefined()  // 私聊无此字段

  expect(adapter.sendTextMessage).toHaveBeenCalledWith('wxid_target', '你好')

  // 验证消息索引已创建
  const indexes = await db.getMessageIndexes(conversation.id, { limit: 10 })
  expect(indexes.length).toBeGreaterThanOrEqual(1)
})
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd apps/server
npx vitest run src/services/message.test.ts -t "should send text message"
```

预期：FAIL，返回对象缺少字段

- [ ] **Step 3: 修改 `sendMessage` 返回值和类型签名**

在 `apps/server/src/services/message.ts` 中：

1. 修改方法签名（第 200 行），将返回类型从 `Promise<{ msgId: string }>` 改为完整消息对象类型
2. 修改返回语句（第 254 行）

```typescript
async sendMessage(conversationId: string, content: string): Promise<{
  msgId: string
  msgType: number
  fromUsername: string
  toUsername: string
  content: string
  createTime: number
  chatroomSender?: string
  displayType: string
  displayContent: string
}> {
  // ... 现有代码

  // 将原来的 return { msgId } 改为：
  return {
    msgId,
    msgType: 1,
    fromUsername: this.clientUsername,
    toUsername,
    content,
    createTime,
    chatroomSender: conversation.type === 'group' ? this.clientUsername : undefined,
    displayType: 'text',
    displayContent: content,
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
cd apps/server
npx vitest run src/services/message.test.ts -t "should send text message"
```

预期：PASS

- [ ] **Step 5: 新增群聊场景测试**

在 `apps/server/src/services/message.test.ts` 的 `describe('sendMessage')` 中添加：

```typescript
it('should include chatroomSender for group messages', async () => {
  vi.spyOn(adapter, 'sendTextMessage').mockResolvedValue({ msgId: 'group_msg_123' })

  const group = await db.createGroup({
    roomUsername: '12345@chatroom',
    name: 'Test Group'
  })
  const client = await db.findClientByGuid('test-guid-123')
  const conversation = await db.createConversation({
    clientId: client!.id,
    type: 'group',
    groupId: group.id
  })

  const result = await messageService.sendMessage(conversation.id, '群消息')

  expect(result.msgId).toBe('group_msg_123')
  expect(result.chatroomSender).toBe('test-guid-123')  // 群聊包含此字段
  expect(adapter.sendTextMessage).toHaveBeenCalledWith('12345@chatroom', '群消息')
})
```

- [ ] **Step 6: 运行测试验证通过**

```bash
cd apps/server
npx vitest run src/services/message.test.ts -t "should include chatroomSender"
```

预期：PASS

- [ ] **Step 7: 提交**

```bash
git add apps/server/src/services/message.ts apps/server/src/services/message.test.ts
git commit -m "feat(server): sendMessage 返回完整消息对象

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: 后端路由包装返回格式

**Files:**
- Modify: `apps/server/src/routes/messages.ts:22-23`
- Test: `apps/server/src/routes/messages.test.ts:20-34`

- [ ] **Step 1: 更新测试期望**

修改 `apps/server/src/routes/messages.test.ts` 中的测试：

```typescript
it('should send message successfully', async () => {
  vi.mocked(mockMessageService.sendMessage).mockResolvedValue({
    msgId: 'sent_123',
    msgType: 1,
    fromUsername: 'wxid_me',
    toUsername: 'wxid_target',
    content: '你好',
    createTime: 1234567890,
    displayType: 'text',
    displayContent: '你好'
  })

  const res = await app.request('/api/messages/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId: 'conv_1', content: '你好' })
  })
  const body = await res.json()

  expect(res.status).toBe(200)
  expect(body.success).toBe(true)
  expect(body.data.message).toBeDefined()
  expect(body.data.message.msgId).toBe('sent_123')
  expect(body.data.message.msgType).toBe(1)
  expect(mockMessageService.sendMessage).toHaveBeenCalledWith('conv_1', '你好')
})
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd apps/server
npx vitest run src/routes/messages.test.ts -t "should send message successfully"
```

预期：FAIL，`body.data.message` 为 undefined

- [ ] **Step 3: 修改路由返回格式**

在 `apps/server/src/routes/messages.ts` 中，将：

```typescript
const result = await deps.messageService.sendMessage(conversationId, content)
return c.json({ success: true, data: result })
```

改为：

```typescript
const result = await deps.messageService.sendMessage(conversationId, content)
return c.json({ success: true, data: { message: result } })
```

- [ ] **Step 4: 运行测试验证通过**

```bash
cd apps/server
npx vitest run src/routes/messages.test.ts -t "should send message successfully"
```

预期：PASS

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/routes/messages.ts apps/server/src/routes/messages.test.ts
git commit -m "feat(server): 路由返回格式包装为 { message: ... }

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 2: 前端乐观更新和去重

### Task 5: pendingMessages 单元测试

**Files:**
- Create: `apps/web/src/utils/pendingMessages.test.ts`

- [ ] **Step 1: 创建测试文件**

创建 `apps/web/src/utils/pendingMessages.test.ts`：

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { addPendingMsgId, hasPendingMsgId, removePendingMsgId } from './pendingMessages'

describe('pendingMessages', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should add and check pending msgId', () => {
    addPendingMsgId('msg_123')
    expect(hasPendingMsgId('msg_123')).toBe(true)
    expect(hasPendingMsgId('msg_456')).toBe(false)
  })

  it('should remove pending msgId manually', () => {
    addPendingMsgId('msg_123')
    expect(hasPendingMsgId('msg_123')).toBe(true)

    removePendingMsgId('msg_123')
    expect(hasPendingMsgId('msg_123')).toBe(false)
  })

  it('should auto-expire pending msgId after 30 seconds', () => {
    addPendingMsgId('msg_123')
    expect(hasPendingMsgId('msg_123')).toBe(true)

    // 前进 29 秒，仍然存在
    vi.advanceTimersByTime(29000)
    expect(hasPendingMsgId('msg_123')).toBe(true)

    // 再前进 1 秒，应该被清除
    vi.advanceTimersByTime(1000)
    expect(hasPendingMsgId('msg_123')).toBe(false)
  })

  it('should handle multiple pending msgIds', () => {
    addPendingMsgId('msg_1')
    addPendingMsgId('msg_2')
    addPendingMsgId('msg_3')

    expect(hasPendingMsgId('msg_1')).toBe(true)
    expect(hasPendingMsgId('msg_2')).toBe(true)
    expect(hasPendingMsgId('msg_3')).toBe(true)

    removePendingMsgId('msg_2')
    expect(hasPendingMsgId('msg_1')).toBe(true)
    expect(hasPendingMsgId('msg_2')).toBe(false)
    expect(hasPendingMsgId('msg_3')).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试验证通过**

```bash
cd apps/web
npx vitest run src/utils/pendingMessages.test.ts
```

预期：所有测试通过

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/utils/pendingMessages.test.ts
git commit -m "test(web): 添加 pendingMessages 单元测试

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 6: 前端 `useSendMessage` 乐观更新

**Files:**
- Modify: `apps/web/src/hooks/useSendMessage.ts`

- [ ] **Step 1: 创建 pendingMsgIds 管理模块**

创建 `apps/web/src/utils/pendingMessages.ts`：

```typescript
// 管理待确认的消息 ID，用于 WebSocket 去重
const pendingMsgIds = new Set<string>()
const timeouts = new Map<string, NodeJS.Timeout>()

export const addPendingMsgId = (msgId: string) => {
  pendingMsgIds.add(msgId)

  // 30 秒后自动清除
  const timeout = setTimeout(() => {
    pendingMsgIds.delete(msgId)
    timeouts.delete(msgId)
  }, 30000)

  timeouts.set(msgId, timeout)
}

export const hasPendingMsgId = (msgId: string): boolean => {
  return pendingMsgIds.has(msgId)
}

export const removePendingMsgId = (msgId: string) => {
  pendingMsgIds.delete(msgId)
  const timeout = timeouts.get(msgId)
  if (timeout) {
    clearTimeout(timeout)
    timeouts.delete(msgId)
  }
}
```

- [ ] **Step 2: 修改 `useSendMessage` 实现乐观更新**

注意：
- `getCurrentUser()` 有内部缓存，正常流程中页面加载时已调用过，此处调用不会发起网络请求
- 必须删除原有的 `invalidateQueries({ queryKey: ['messages', ...] })`，否则会覆盖乐观更新

完整替换 `apps/web/src/hooks/useSendMessage.ts`：

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { chatApi, getCurrentUser } from '../api/chat';
import { addPendingMsgId } from '../utils/pendingMessages';
import type { Message } from '../types';

interface SendMessageData {
  conversationId: string;
  content: string;
}

interface MessageQueryData {
  messages: Message[];
  hasMore: boolean;
  highlightedIds: string[];
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SendMessageData) => chatApi.sendMessage(data),

    onMutate: async (variables) => {
      // 取消正在进行的查询，避免覆盖乐观更新
      await queryClient.cancelQueries({ queryKey: ['messages', variables.conversationId] });

      // 获取当前用户信息
      const currentUser = await getCurrentUser();

      // 构造临时消息
      const tempMessage: Message = {
        id: `temp-${Date.now()}`,
        conversationId: variables.conversationId,
        senderId: currentUser.username,
        senderName: '我',
        content: variables.content,
        timestamp: new Date().toISOString(),
        status: 'sending',
        isMine: true,
        msgType: 1,
        displayType: 'text',
      };

      // 乐观插入到缓存
      queryClient.setQueryData<MessageQueryData>(
        ['messages', variables.conversationId],
        (old) => {
          if (!old) {
            return { messages: [tempMessage], hasMore: false, highlightedIds: [] };
          }
          return {
            ...old,
            messages: [...old.messages, tempMessage],
          };
        }
      );

      // 返回上下文，用于回滚
      return { tempMessage };
    },

    onSuccess: (data, variables, context) => {
      if (!context) return;

      // 用真实 msgId 替换临时消息
      queryClient.setQueryData<MessageQueryData>(
        ['messages', variables.conversationId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            messages: old.messages.map((msg) =>
              msg.id === context.tempMessage.id
                ? { ...data, status: 'sent' as const }
                : msg
            ),
          };
        }
      );

      // 将真实 msgId 加入 pending 集合
      addPendingMsgId(data.id);

      // 刷新会话列表
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },

    onError: (error, variables, context) => {
      if (!context) return;

      // 标记消息为失败
      queryClient.setQueryData<MessageQueryData>(
        ['messages', variables.conversationId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            messages: old.messages.map((msg) =>
              msg.id === context.tempMessage.id
                ? { ...msg, status: 'failed' as const }
                : msg
            ),
          };
        }
      );
    },
  });
}
```

- [ ] **Step 3: 手动测试乐观更新**

启动开发服务器：

```bash
pnpm dev
```

在浏览器中：
1. 打开聊天界面
2. 发送一条消息
3. 观察消息立即出现且状态为 "发送中"
4. 成功后状态变为 "已发送"

预期：消息立即显示，无需等待服务器响应

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/hooks/useSendMessage.ts apps/web/src/utils/pendingMessages.ts
git commit -m "feat(web): useSendMessage 实现乐观更新

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7: 前端 `appendMessage` 去重

**Files:**
- Modify: `apps/web/src/hooks/useMessages.ts:1-4,82`

- [ ] **Step 1: 增量修改 `appendMessage` 添加去重逻辑**

在 `apps/web/src/hooks/useMessages.ts` 中做两处修改：

1. 在文件顶部添加 import：
```typescript
import { hasPendingMsgId } from '../utils/pendingMessages';
```

2. 将第 82 行的去重条件：
```typescript
if (old.messages.some((m) => m.id === message.id)) return old;
```
改为：
```typescript
if (old.messages.some((m) => m.id === message.id) || hasPendingMsgId(message.id)) return old;
```

- [ ] **Step 2: 手动测试去重**

启动开发服务器：

```bash
pnpm dev
```

在浏览器中：
1. 打开聊天界面
2. 发送一条消息
3. 观察消息只出现一次（不会因 webhook 回传而重复）

预期：消息不重复显示

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/hooks/useMessages.ts
git commit -m "feat(web): appendMessage 实现去重逻辑

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 8: 集成测试

**Files:**
- Test: 手动端到端测试

- [ ] **Step 1: 端到端测试**

启动完整服务：

```bash
pnpm dev
```

测试场景：
1. **私聊发送**：选择私聊会话，发送文本消息，验证立即显示且不重复
2. **群聊发送**：选择群聊会话，发送文本消息，验证立即显示且不重复
3. **发送失败**：断开网络，发送消息，验证显示失败状态
4. **多设备同步**：在另一设备发送消息，验证当前设备通过 WebSocket 接收且不重复

预期：所有场景通过

- [ ] **Step 2: 运行所有后端测试**

```bash
cd apps/server
npx vitest run
```

预期：所有测试通过

- [ ] **Step 3: 类型检查**

```bash
pnpm type-check
```

预期：无类型错误

- [ ] **Step 4: 如有改动则提交**

```bash
git status
# 如果有需要提交的改动：
git add apps/server apps/web
git commit -m "fix: 集成测试修复

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## 验收标准

- [ ] 发送消息后立即在界面显示（状态为 "发送中"）
- [ ] 发送成功后状态更新为 "已发送"
- [ ] 发送失败后状态更新为 "失败"
- [ ] webhook 回传的消息不会重复显示
- [ ] 私聊和群聊场景都正常工作
- [ ] 所有后端测试通过
- [ ] 类型检查通过
