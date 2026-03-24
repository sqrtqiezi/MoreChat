# 发送引用消息 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 支持在聊天窗口中引用回复消息，通过 hover 回复按钮选择消息，输入框显示引用预览条，发送时调用 juhexbot `/msg/send_refer_msg`。

**Architecture:** 前端在 ChatWindow 层级管理 `replyingTo` 状态，MessageItem 提供 hover 回复按钮，MessageInput 显示引用预览条并在发送时附带 `replyToMsgId`。后端扩展 sendMessage 方法，收到 replyToMsgId 时从 DataLake 获取原始消息信息，调用 juhexbot 引用消息接口。

**Tech Stack:** React, TanStack Query, Hono, Vitest, juhexbot API

---

### Task 1: 后端 - JuhexbotAdapter 新增 sendReferMessage

**Files:**
- Modify: `apps/server/src/services/juhexbotAdapter.ts`
- Test: `apps/server/src/services/juhexbotAdapter.test.ts`

**Step 1: Write the failing test**

在 `apps/server/src/services/juhexbotAdapter.test.ts` 末尾添加测试：

```typescript
describe('sendReferMessage', () => {
  it('should call /msg/send_refer_msg with correct params', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ errcode: 0, data: { msg_id: 'refer_123' } }),
    } as any)

    const result = await adapter.sendReferMessage({
      toUsername: 'wxid_target',
      content: '回复内容',
      referMsg: {
        msgType: 1,
        msgId: 'original_123',
        fromUsername: 'wxid_sender',
        fromNickname: '发送者',
        source: '',
        content: '原始消息内容',
      },
    })

    expect(result.msgId).toBe('refer_123')
    expect(fetchMock).toHaveBeenCalledWith('http://test-api', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('/msg/send_refer_msg'),
    }))
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd apps/server && npx vitest run src/services/juhexbotAdapter.test.ts --reporter=verbose`
Expected: FAIL - `sendReferMessage` is not a function

**Step 3: Write minimal implementation**

在 `apps/server/src/services/juhexbotAdapter.ts` 的 `JuhexbotAdapter` 类中添加：

```typescript
async sendReferMessage(params: {
  toUsername: string
  content: string
  referMsg: {
    msgType: number
    msgId: string
    fromUsername: string
    fromNickname: string
    source: string
    content: string
  }
}): Promise<{ msgId: string }> {
  const result = await this.sendRequest('/msg/send_refer_msg', {
    guid: this.config.clientGuid,
    to_username: params.toUsername,
    content: params.content,
    refer_msg: {
      msg_type: params.referMsg.msgType,
      msg_id: params.referMsg.msgId,
      from_username: params.referMsg.fromUsername,
      from_nickname: params.referMsg.fromNickname,
      source: params.referMsg.source,
      content: params.referMsg.content,
    },
  })

  if (result.errcode !== 0) {
    throw new Error(result.errmsg || 'Failed to send refer message')
  }

  const msgId =
    result.data?.msg_id ??
    result.data?.msgId ??
    result.data?.newMsgId ??
    result.data?.list?.[0]?.newMsgId ??
    result.data?.list?.[0]?.msgId ??
    result.data?.list?.[0]?.msg_id

  if (!msgId) {
    throw new Error('Refer message sent but response missing msgId')
  }

  return { msgId: String(msgId) }
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/server && npx vitest run src/services/juhexbotAdapter.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/server/src/services/juhexbotAdapter.ts apps/server/src/services/juhexbotAdapter.test.ts
git commit -m "feat(server): add sendReferMessage to JuhexbotAdapter"
```

---

### Task 2: 后端 - MessageService.sendMessage 支持引用

**Files:**
- Modify: `apps/server/src/services/message.ts`
- Test: `apps/server/src/services/message.test.ts`

**Step 1: Write the failing test**

在 `apps/server/src/services/message.test.ts` 的 `describe('sendMessage')` 块中添加：

```typescript
it('should send refer message when replyToMsgId is provided', async () => {
  vi.spyOn(adapter, 'sendTextMessage').mockResolvedValue({ msgId: 'text_123' })
  vi.spyOn(adapter, 'sendReferMessage').mockResolvedValue({ msgId: 'refer_456' })

  // 创建联系人和会话
  const sender = await db.createContact({
    username: 'wxid_sender',
    nickname: 'Sender',
    type: 'friend',
  })
  const target = await db.createContact({
    username: 'wxid_target',
    nickname: 'Target User',
    type: 'friend',
  })
  const client = await db.findClientByGuid('test-guid-123')
  const conversation = await db.createConversation({
    clientId: client!.id,
    type: 'private',
    contactId: target.id,
  })

  // 先发送一条原始消息（模拟被引用的消息）
  const originalResult = await messageService.sendMessage(conversation.id, '原始消息')

  // 发送引用消息
  const result = await messageService.sendMessage(conversation.id, '回复内容', originalResult.msgId)

  expect(result.msgId).toBe('refer_456')
  expect(result.displayType).toBe('quote')
  expect(result.referMsg).toBeDefined()
  expect(result.referMsg!.msgId).toBe(originalResult.msgId)
  expect(result.referMsg!.content).toBe('原始消息')
  expect(adapter.sendReferMessage).toHaveBeenCalledWith(expect.objectContaining({
    toUsername: 'wxid_target',
    content: '回复内容',
    referMsg: expect.objectContaining({
      msgId: originalResult.msgId,
      msgType: 1,
      content: '原始消息',
    }),
  }))
})
```

**Step 2: Run test to verify it fails**

Run: `cd apps/server && npx vitest run src/services/message.test.ts --reporter=verbose`
Expected: FAIL - `sendMessage` doesn't accept third argument / doesn't call sendReferMessage

**Step 3: Write minimal implementation**

修改 `apps/server/src/services/message.ts` 中的 `sendMessage` 方法签名和实现：

1. 方法签名添加可选参数 `replyToMsgId?: string`
2. 返回类型添加可选字段 `referMsg`
3. 当 `replyToMsgId` 存在时：
   - 从 `db.findMessageIndexByMsgId` 获取被引用消息的 index
   - 从 `dataLake.getMessage` 获取原始消息
   - 从 `db.findContactByUsername` 获取发送者昵称
   - 调用 `adapter.sendReferMessage` 代替 `adapter.sendTextMessage`
   - 返回 `displayType: 'quote'` 和 `referMsg` 信息

```typescript
async sendMessage(conversationId: string, content: string, replyToMsgId?: string): Promise<{
  msgId: string
  msgType: number
  fromUsername: string
  toUsername: string
  content: string
  createTime: number
  chatroomSender?: string
  displayType: string
  displayContent: string
  referMsg?: {
    type: number
    senderName: string
    content: string
    msgId: string
  }
}> {
  // 1. 获取会话信息
  const conversation = await this.db.findConversationById(conversationId)
  if (!conversation) {
    throw new Error('Conversation not found')
  }

  // 2. 确定接收者
  let toUsername: string
  if (conversation.type === 'group') {
    const group = await this.db.findGroupById(conversation.groupId!)
    if (!group) throw new Error('Group not found')
    toUsername = group.roomUsername
  } else {
    const contact = await this.db.findContactById(conversation.contactId!)
    if (!contact) throw new Error('Contact not found')
    toUsername = contact.username
  }

  // 3. 发送消息（普通文本 or 引用）
  let msgId: string
  let displayType = 'text'
  let referMsgResult: { type: number; senderName: string; content: string; msgId: string } | undefined

  if (replyToMsgId) {
    // 获取被引用消息信息
    const refIndex = await this.db.findMessageIndexByMsgId(replyToMsgId)
    if (!refIndex) {
      throw new Error('Referenced message not found')
    }
    const refMessage = await this.dataLake.getMessage(refIndex.dataLakeKey)
    const refSender = refIndex.chatroomSender || refIndex.fromUsername
    const refContact = await this.db.findContactByUsername(refSender)
    const refNickname = refContact?.remark || refContact?.nickname || refSender

    const result = await this.adapter.sendReferMessage({
      toUsername,
      content,
      referMsg: {
        msgType: refMessage.msg_type,
        msgId: replyToMsgId,
        fromUsername: refSender,
        fromNickname: refNickname,
        source: refMessage.source || '',
        content: refMessage.content,
      },
    })
    msgId = result.msgId
    displayType = 'quote'
    referMsgResult = {
      type: refMessage.msg_type,
      senderName: refNickname,
      content: refMessage.content,
      msgId: replyToMsgId,
    }
  } else {
    const result = await this.adapter.sendTextMessage(toUsername, content)
    msgId = result.msgId
  }

  // 4. 保存到 DataLake
  const createTime = Math.floor(Date.now() / 1000)
  const chatMessage: ChatMessage = {
    msg_id: msgId,
    from_username: this.clientUsername,
    to_username: toUsername,
    content,
    create_time: createTime,
    msg_type: replyToMsgId ? 49 : 1,
    chatroom_sender: conversation.type === 'group' ? this.clientUsername : '',
    desc: '',
    is_chatroom_msg: conversation.type === 'group' ? 1 : 0,
    chatroom: conversation.type === 'group' ? toUsername : '',
    source: '',
  }

  const dataLakeKey = await this.dataLake.saveMessage(conversationId, chatMessage)

  // 5. 创建消息索引
  await this.db.createMessageIndex({
    conversationId,
    msgId,
    msgType: replyToMsgId ? 49 : 1,
    fromUsername: this.clientUsername,
    toUsername,
    createTime,
    dataLakeKey,
  })

  // 6. 更新会话最后消息时间
  await this.db.updateConversationLastMessage(conversationId, new Date(createTime * 1000))

  return {
    msgId,
    msgType: replyToMsgId ? 49 : 1,
    fromUsername: this.clientUsername,
    toUsername,
    content,
    createTime,
    chatroomSender: conversation.type === 'group' ? this.clientUsername : undefined,
    displayType,
    displayContent: content,
    referMsg: referMsgResult,
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/server && npx vitest run src/services/message.test.ts --reporter=verbose`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add apps/server/src/services/message.ts apps/server/src/services/message.test.ts
git commit -m "feat(server): support replyToMsgId in MessageService.sendMessage"
```

---

### Task 3: 后端 - 路由接收 replyToMsgId

**Files:**
- Modify: `apps/server/src/routes/messages.ts`
- Test: `apps/server/src/routes/messages.test.ts`

**Step 1: Write the failing test**

在 `apps/server/src/routes/messages.test.ts` 中添加测试（参考现有 send 测试的 mock 模式）：

```typescript
it('should pass replyToMsgId to messageService.sendMessage', async () => {
  const mockResult = {
    msgId: 'refer_789',
    msgType: 49,
    fromUsername: 'me',
    toUsername: 'target',
    content: '回复',
    createTime: 1234567890,
    displayType: 'quote',
    displayContent: '回复',
    referMsg: { type: 1, senderName: 'Sender', content: '原始', msgId: 'orig_123' },
  }
  mockMessageService.sendMessage.mockResolvedValue(mockResult)

  const res = await app.request('/api/messages/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: 'session=valid' },
    body: JSON.stringify({ conversationId: 'conv_1', content: '回复', replyToMsgId: 'orig_123' }),
  })

  expect(res.status).toBe(200)
  expect(mockMessageService.sendMessage).toHaveBeenCalledWith('conv_1', '回复', 'orig_123')
})
```

**Step 2: Run test to verify it fails**

Run: `cd apps/server && npx vitest run src/routes/messages.test.ts --reporter=verbose`
Expected: FAIL - sendMessage called without third argument

**Step 3: Write minimal implementation**

修改 `apps/server/src/routes/messages.ts` 中的 `/send` 路由：

```typescript
router.post('/send', async (c) => {
  try {
    const body = await c.req.json()
    const { conversationId, content, replyToMsgId } = body

    if (!conversationId || !content) {
      return c.json({ success: false, error: { message: 'conversationId and content are required' } }, 400)
    }

    const result = await deps.messageService.sendMessage(conversationId, content, replyToMsgId)
    return c.json({ success: true, data: { message: result } })
  } catch (error) {
    logger.error({ err: error }, 'Failed to send message')
    return c.json({ success: false, error: { message: 'Failed to send message' } }, 500)
  }
})
```

**Step 4: Run test to verify it passes**

Run: `cd apps/server && npx vitest run src/routes/messages.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/server/src/routes/messages.ts apps/server/src/routes/messages.test.ts
git commit -m "feat(server): accept replyToMsgId in send message route"
```

---

### Task 4: 前端 - chatApi.sendMessage 支持 replyToMsgId

**Files:**
- Modify: `apps/web/src/api/chat.ts`

**Step 1: 修改 SendMessageData 和 sendMessage**

在 `apps/web/src/api/chat.ts` 中：

1. 修改 `SendMessageData` 接口：
```typescript
interface SendMessageData {
  conversationId: string;
  content: string;
  replyToMsgId?: string;
}
```

2. `sendMessage` 方法无需改动，已经直接传 `data` 对象到后端。

**Step 2: Commit**

```bash
git add apps/web/src/api/chat.ts
git commit -m "feat(web): add replyToMsgId to SendMessageData"
```

---

### Task 5: 前端 - useSendMessage 支持引用消息乐观更新

**Files:**
- Modify: `apps/web/src/hooks/useSendMessage.ts`

**Step 1: 修改 SendMessageData 和乐观更新逻辑**

```typescript
interface SendMessageData {
  conversationId: string;
  content: string;
  replyToMsgId?: string;
  // 用于乐观更新的引用消息信息（不发送到后端）
  replyingTo?: Message;
}
```

修改 `onMutate` 中的临时消息构造：

```typescript
onMutate: async (variables) => {
  await queryClient.cancelQueries({ queryKey: ['messages', variables.conversationId] });
  const currentUser = await getCurrentUser();

  const isQuote = !!variables.replyingTo;
  const tempMessage: Message = {
    id: `temp-${Date.now()}`,
    conversationId: variables.conversationId,
    senderId: currentUser.username,
    senderName: '我',
    content: variables.content,
    timestamp: new Date().toISOString(),
    status: 'sending',
    isMine: true,
    msgType: isQuote ? 49 : 1,
    displayType: isQuote ? 'quote' : 'text',
    referMsg: variables.replyingTo ? {
      type: variables.replyingTo.msgType || 1,
      senderName: variables.replyingTo.senderName,
      content: variables.replyingTo.content,
      msgId: variables.replyingTo.id,
    } : undefined,
  };

  // ... rest unchanged
```

修改 `mutationFn` 只传后端需要的字段：

```typescript
mutationFn: (data: SendMessageData) => chatApi.sendMessage({
  conversationId: data.conversationId,
  content: data.content,
  replyToMsgId: data.replyToMsgId,
}),
```

**Step 2: Commit**

```bash
git add apps/web/src/hooks/useSendMessage.ts
git commit -m "feat(web): support quote message optimistic update in useSendMessage"
```

---

### Task 6: 前端 - ChatWindow 状态管理 + MessageInput 引用预览条

**Files:**
- Modify: `apps/web/src/components/chat/ChatWindow.tsx`
- Modify: `apps/web/src/components/chat/MessageInput.tsx`
- Modify: `apps/web/src/components/chat/MessageList.tsx`

**Step 1: ChatWindow 新增 replyingTo 状态**

```typescript
import { useState } from 'react';
import type { Message } from '../../types';

export function ChatWindow({ selectedConversationId }: ChatWindowProps) {
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const { data: conversations } = useConversations();

  // 切换会话时清除引用状态
  useEffect(() => {
    setReplyingTo(null);
  }, [selectedConversationId]);

  // ... empty state unchanged ...

  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden">
      <ChatHeader ... />
      <MessageList
        conversationId={selectedConversationId}
        onReply={(message) => setReplyingTo(message)}
      />
      <MessageInput
        conversationId={selectedConversationId}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
      />
    </div>
  );
}
```

**Step 2: MessageInput 显示引用预览条**

在 `MessageInput` 组件中：

1. 接收新 props：`replyingTo: Message | null` 和 `onCancelReply: () => void`
2. 在输入框上方渲染引用预览条（当 `replyingTo` 不为 null 时）
3. 发送时附带 `replyToMsgId` 和 `replyingTo`，成功后调用 `onCancelReply`

引用预览条 UI：
```tsx
{replyingTo && (
  <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-l-2 border-blue-500 rounded">
    <div className="flex-1 min-w-0">
      <span className="text-xs text-blue-600 font-medium">{replyingTo.senderName}</span>
      <p className="text-sm text-gray-500 truncate">{replyingTo.content}</p>
    </div>
    <button
      onClick={onCancelReply}
      className="text-gray-400 hover:text-gray-600 flex-shrink-0"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </div>
)}
```

修改 `handleSend`：
```typescript
const handleSend = () => {
  const trimmedContent = content.trim();
  if (trimmedContent && !disabled && !isPending && conversationId) {
    sendMessage(
      {
        conversationId,
        content: trimmedContent,
        replyToMsgId: replyingTo?.id,
        replyingTo: replyingTo || undefined,
      },
      {
        onSuccess: () => {
          setContent('');
          onCancelReply();
          if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
          }
        },
      }
    );
  }
};
```

**Step 3: Commit**

```bash
git add apps/web/src/components/chat/ChatWindow.tsx apps/web/src/components/chat/MessageInput.tsx apps/web/src/components/chat/MessageList.tsx
git commit -m "feat(web): add reply state management and quote preview bar"
```

---

### Task 7: 前端 - MessageItem hover 回复按钮

**Files:**
- Modify: `apps/web/src/components/chat/MessageItem.tsx`
- Modify: `apps/web/src/components/chat/MessageList.tsx`

**Step 1: MessageItem 添加回复按钮**

1. `MessageItem` 接收新 prop：`onReply?: () => void`
2. 在消息气泡外层 div 添加 `group` class（Tailwind group hover）
3. 在气泡旁边添加回复按钮，仅 hover 时显示

回复按钮（放在气泡和头像之间的 flex 容器中）：
```tsx
{onReply && (
  <button
    onClick={onReply}
    className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100 flex-shrink-0"
    title="回复"
  >
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
    </svg>
  </button>
)}
```

对于自己的消息（右对齐），回复按钮放在气泡左侧；对于他人消息（左对齐），回复按钮放在气泡右侧。

2. 外层 div 添加 `group` class：
```tsx
<div className={`group flex justify-end items-start gap-3 px-6 py-3 ...`}>
```

**Step 2: MessageList 传递 onReply**

修改 `MessageList` 接收 `onReply` prop 并传递给每个 `MessageItem`：

```typescript
interface MessageListProps {
  conversationId: string;
  onReply?: (message: Message) => void;
}
```

在渲染 `MessageItem` 时：
```tsx
<MessageItem
  message={message}
  isHighlighted={...}
  onReply={onReply ? () => onReply(message) : undefined}
/>
```

**Step 3: Commit**

```bash
git add apps/web/src/components/chat/MessageItem.tsx apps/web/src/components/chat/MessageList.tsx
git commit -m "feat(web): add hover reply button to MessageItem"
```

---

### Task 8: 全量测试 + 最终提交

**Step 1: 运行后端全部测试**

Run: `cd apps/server && npx vitest run --reporter=verbose`
Expected: ALL PASS

**Step 2: 运行类型检查**

Run: `pnpm type-check`
Expected: No errors

**Step 3: 运行 lint**

Run: `pnpm lint`
Expected: No errors

**Step 4: 修复任何失败**

如有失败，修复后重新运行。

**Step 5: 最终提交（如有修复）**

```bash
git add -A
git commit -m "fix: address test/lint issues for quote message sending"
```
