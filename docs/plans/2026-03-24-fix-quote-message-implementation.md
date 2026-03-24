# Fix Quote Message Display Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 sendMessage 不再写 DataLake/MessageIndex，改由 webhook 回调作为唯一数据源，修复引用消息刷新后显示异常。

**Architecture:** 后端 sendMessage/sendImageMessage 只调用 juhexbot API 返回 msgId；前端乐观 UI 展示临时消息，WebSocket 收到 webhook 推送后用 msgId 匹配并替换为完整真实数据。

**Tech Stack:** Hono, Vitest, React, TanStack Query, WebSocket

---

### Task 1: 后端 - 简化 sendMessage 返回值并移除持久化

**Files:**
- Modify: `apps/server/src/services/message.ts:274-394`
- Modify: `apps/server/src/routes/messages.ts:19-34`

**Step 1: 修改 sendMessage 方法**

移除 DataLake 保存、MessageIndex 创建、会话时间更新。简化返回值为 `{ msgId: string }`。

```typescript
// message.ts sendMessage 方法改为：
async sendMessage(conversationId: string, content: string, replyToMsgId?: string): Promise<{
  msgId: string
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

  if (replyToMsgId) {
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
  } else {
    const result = await this.adapter.sendTextMessage(toUsername, content)
    msgId = result.msgId
  }

  return { msgId }
}
```

**Step 2: 修改路由返回格式**

```typescript
// routes/messages.ts POST /send 改为：
const result = await deps.messageService.sendMessage(conversationId, content, replyToMsgId)
return c.json({ success: true, data: { msgId: result.msgId } })
```

**Step 3: 运行现有测试确认哪些需要更新**

Run: `cd apps/server && npx vitest run src/services/message.test.ts`
Expected: 部分测试失败（sendMessage 相关的断言需要更新）

**Step 4: 更新 sendMessage 测试**

更新测试以匹配新的返回值和行为（不再检查 DataLake/MessageIndex）：

```typescript
describe('sendMessage', () => {
  it('should send text message via adapter and return msgId', async () => {
    vi.spyOn(adapter, 'sendTextMessage').mockResolvedValue({ msgId: 'sent_123' })

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

    expect(result.msgId).toBe('sent_123')
    expect(adapter.sendTextMessage).toHaveBeenCalledWith('wxid_target', '你好')

    // 不再创建 MessageIndex
    const indexes = await db.getMessageIndexes(conversation.id, { limit: 10 })
    expect(indexes.length).toBe(0)
  })

  it('should throw error when conversation not found', async () => {
    await expect(messageService.sendMessage('not_exist', '你好')).rejects.toThrow('Conversation not found')
  })

  it('should send refer message when replyToMsgId is provided', async () => {
    vi.spyOn(adapter, 'sendTextMessage').mockResolvedValue({ msgId: 'text_123' })
    vi.spyOn(adapter, 'sendReferMessage').mockResolvedValue({ msgId: 'refer_456' })

    await db.createContact({ username: 'wxid_sender', nickname: 'Sender', type: 'friend' })
    const target = await db.createContact({ username: 'wxid_target', nickname: 'Target User', type: 'friend' })
    const client = await db.findClientByGuid('test-guid-123')
    const conversation = await db.createConversation({
      clientId: client!.id,
      type: 'private',
      contactId: target.id
    })

    // 先通过 webhook 创建一条原始消息
    const webhookPayload = {
      guid: 'test-guid-123',
      notify_type: 1,
      data: {
        msg_id: 'original_msg_123',
        msg_type: 1,
        from_username: 'wxid_sender',
        to_username: 'test-guid-123',
        content: '原始消息',
        create_time: Math.floor(Date.now() / 1000),
        chatroom_sender: '',
        chatroom: '',
        desc: '',
        is_chatroom_msg: 0,
        source: ''
      }
    }
    const parsed = adapter.parseWebhookPayload(webhookPayload)
    await messageService.handleIncomingMessage(parsed)

    // 发送引用消息
    const result = await messageService.sendMessage(conversation.id, '回复内容', 'original_msg_123')

    expect(result.msgId).toBe('refer_456')
    expect(adapter.sendReferMessage).toHaveBeenCalledWith(expect.objectContaining({
      toUsername: 'wxid_target',
      content: '回复内容',
      referMsg: expect.objectContaining({
        msgId: 'original_msg_123',
        msgType: 1,
        content: '原始消息',
      }),
    }))
  })
})
```

**Step 5: 更新去重测试**

去重测试需要反转：sendMessage 不再保存 MessageIndex，所以 webhook 回来的消息不会被去重，而是正常处理。

```typescript
it('should allow webhook to process message after sendMessage (no dedup)', async () => {
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

  // webhook 回传相同 msgId 的消息 — 应该正常处理
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

  expect(result).not.toBeNull()
  expect(result!.message.msgId).toBe('dup_123')

  const indexes = await db.getMessageIndexes(conversation.id, { limit: 10 })
  expect(indexes.length).toBe(1)
})
```

**Step 6: 运行测试验证**

Run: `cd apps/server && npx vitest run src/services/message.test.ts`
Expected: ALL PASS

**Step 7: Commit**

```bash
git add apps/server/src/services/message.ts apps/server/src/routes/messages.ts apps/server/src/services/message.test.ts
git commit -m "refactor: remove DataLake/MessageIndex from sendMessage, let webhook be single source of truth

Fixes #10"
```

---

### Task 2: 后端 - 简化 sendImageMessage 并更新测试

**Files:**
- Modify: `apps/server/src/services/message.ts:396-488`

**Step 1: 简化 sendImageMessage**

移除 DataLake 保存和 MessageIndex 创建，只返回 `{ msgId: string }`。

```typescript
async sendImageMessage(
  conversationId: string,
  imageBuffer: Buffer,
  filename: string
): Promise<{ msgId: string }> {
  const conversation = await this.db.findConversationById(conversationId)
  if (!conversation) {
    throw new Error('Conversation not found')
  }

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

  const ossUrl = await this.ossService.uploadImage(imageBuffer, filename)
  const cdnResult = await this.adapter.uploadImageToCdn(ossUrl)
  const metadata = await sharp(imageBuffer).metadata()
  const thumbWidth = metadata.width || 0
  const thumbHeight = metadata.height || 0

  const { msgId } = await this.adapter.sendImageMessage({
    toUsername,
    fileId: cdnResult.fileId,
    aesKey: cdnResult.aesKey,
    fileSize: cdnResult.fileSize,
    bigFileSize: cdnResult.fileSize,
    thumbFileSize: cdnResult.fileSize,
    fileMd5: cdnResult.fileMd5,
    thumbWidth,
    thumbHeight,
    fileCrc: 0,
  })

  return { msgId }
}
```

**Step 2: 更新 sendImageMessage 测试**

```typescript
describe('sendImageMessage', () => {
  it('should send image via adapter and return msgId', async () => {
    vi.mocked(sharp).mockReturnValue({
      metadata: vi.fn().mockResolvedValue({ width: 800, height: 600 })
    } as any)

    vi.spyOn(ossService, 'uploadImage').mockResolvedValue('https://oss.example.com/image.jpg')
    vi.spyOn(adapter, 'uploadImageToCdn').mockResolvedValue({
      fileId: 'cdn_file_123',
      aesKey: 'test_aes_key',
      fileSize: 12345,
      fileMd5: 'test_md5'
    })
    vi.spyOn(adapter, 'sendImageMessage').mockResolvedValue({ msgId: 'img_msg_123' })

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

    const imageBuffer = Buffer.from('fake-image-data')
    const result = await messageService.sendImageMessage(conversation.id, imageBuffer, 'test.jpg')

    expect(result.msgId).toBe('img_msg_123')
    expect(ossService.uploadImage).toHaveBeenCalledWith(imageBuffer, 'test.jpg')
    expect(adapter.uploadImageToCdn).toHaveBeenCalledWith('https://oss.example.com/image.jpg')

    // 不再创建 MessageIndex
    const indexes = await db.getMessageIndexes(conversation.id, { limit: 10 })
    expect(indexes.length).toBe(0)
  })
})
```

**Step 3: 运行测试**

Run: `cd apps/server && npx vitest run src/services/message.test.ts`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add apps/server/src/services/message.ts apps/server/src/services/message.test.ts
git commit -m "refactor: remove DataLake/MessageIndex from sendImageMessage"
```

---

### Task 3: 前端 - 调整 API 层适配新返回值

**Files:**
- Modify: `apps/web/src/api/chat.ts:211-244`

**Step 1: 更新 sendMessage 返回类型**

```typescript
// sendMessage 现在只返回 msgId
async sendMessage(data: SendMessageData): Promise<{ msgId: string }> {
  const response = await client.post<ApiResponse<{ msgId: string }>>(
    '/messages/send',
    data
  );

  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error?.message || 'Failed to send message');
  }

  return response.data.data;
},

// sendImage 同理
async sendImage(data: { conversationId: string; imageFile: File }): Promise<{ msgId: string }> {
  const formData = new FormData();
  formData.append('conversationId', data.conversationId);
  formData.append('image', data.imageFile);

  const response = await client.post<ApiResponse<{ msgId: string }>>(
    '/messages/send-image',
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    }
  );

  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error?.message || 'Failed to send image');
  }

  return response.data.data;
},
```

**Step 2: Commit**

```bash
git add apps/web/src/api/chat.ts
git commit -m "refactor: update sendMessage/sendImage API to expect msgId-only response"
```

---

### Task 4: 前端 - 重写 useSendMessage 乐观 UI

**Files:**
- Modify: `apps/web/src/hooks/useSendMessage.ts`

**Step 1: 重写 useSendMessage**

核心变化：onSuccess 不再用服务端返回的完整 Message 替换临时消息，而是只更新 msgId 和 status。WebSocket 负责后续替换。

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { chatApi, getCurrentUser } from '../api/chat';
import { addPendingMsgId } from '../utils/pendingMessages';
import type { Message } from '../types';

interface SendMessageData {
  conversationId: string;
  content: string;
  replyToMsgId?: string;
  replyingTo?: Message;
}

interface MessageQueryData {
  messages: Message[];
  hasMore: boolean;
  highlightedIds: string[];
  unreadCount: number;
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SendMessageData) => chatApi.sendMessage({
      conversationId: data.conversationId,
      content: data.content,
      replyToMsgId: data.replyToMsgId,
    }),

    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['messages', variables.conversationId] });

      const currentUser = await getCurrentUser();

      const isQuote = !!variables.replyingTo;
      const tempId = `temp-${Date.now()}`;
      const tempMessage: Message = {
        id: tempId,
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

      queryClient.setQueryData<MessageQueryData>(
        ['messages', variables.conversationId],
        (old) => {
          if (!old) {
            return { messages: [tempMessage], hasMore: false, highlightedIds: [], unreadCount: 0 };
          }
          return { ...old, messages: [...old.messages, tempMessage] };
        }
      );

      return { tempId };
    },

    onSuccess: (data, variables, context) => {
      if (!context) return;

      // 用真实 msgId 更新临时消息，保持乐观内容，等 WebSocket 替换完整数据
      queryClient.setQueryData<MessageQueryData>(
        ['messages', variables.conversationId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            messages: old.messages.map((msg) =>
              msg.id === context.tempId
                ? { ...msg, id: data.msgId, status: 'sent' as const }
                : msg
            ),
          };
        }
      );

      // 将真实 msgId 加入 pending 集合，防止 WebSocket 重复追加
      addPendingMsgId(data.msgId);

      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },

    onError: (_error, variables, context) => {
      if (!context) return;

      queryClient.setQueryData<MessageQueryData>(
        ['messages', variables.conversationId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            messages: old.messages.map((msg) =>
              msg.id === context.tempId
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

**Step 2: Commit**

```bash
git add apps/web/src/hooks/useSendMessage.ts
git commit -m "refactor: useSendMessage optimistic UI with msgId-only response"
```

---

### Task 5: 前端 - 重写 useSendImage 乐观 UI

**Files:**
- Modify: `apps/web/src/hooks/useSendImage.ts`

**Step 1: 重写 useSendImage**

同 useSendMessage 的模式：onSuccess 只更新 msgId。

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { chatApi, getCurrentUser } from '../api/chat';
import { addPendingMsgId } from '../utils/pendingMessages';
import type { Message } from '../types';

interface SendImageData {
  conversationId: string;
  imageFile: File;
}

interface MessageQueryData {
  messages: Message[];
  hasMore: boolean;
  highlightedIds: string[];
  unreadCount: number;
}

export function useSendImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SendImageData) => chatApi.sendImage(data),

    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['messages', variables.conversationId] });

      const currentUser = await getCurrentUser();

      const tempId = `temp-${Date.now()}`;
      const tempMessage: Message = {
        id: tempId,
        conversationId: variables.conversationId,
        senderId: currentUser.username,
        senderName: '我',
        content: '',
        timestamp: new Date().toISOString(),
        status: 'sending',
        isMine: true,
        msgType: 3,
        displayType: 'image',
      };

      queryClient.setQueryData<MessageQueryData>(
        ['messages', variables.conversationId],
        (old) => {
          if (!old) {
            return { messages: [tempMessage], hasMore: false, highlightedIds: [], unreadCount: 0 };
          }
          return { ...old, messages: [...old.messages, tempMessage] };
        }
      );

      return { tempId };
    },

    onSuccess: (data, variables, context) => {
      if (!context) return;

      queryClient.setQueryData<MessageQueryData>(
        ['messages', variables.conversationId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            messages: old.messages.map((msg) =>
              msg.id === context.tempId
                ? { ...msg, id: data.msgId, status: 'sent' as const }
                : msg
            ),
          };
        }
      );

      addPendingMsgId(data.msgId);
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },

    onError: (_error, variables, context) => {
      if (!context) return;

      queryClient.setQueryData<MessageQueryData>(
        ['messages', variables.conversationId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            messages: old.messages.map((msg) =>
              msg.id === context.tempId
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

**Step 2: Commit**

```bash
git add apps/web/src/hooks/useSendImage.ts
git commit -m "refactor: useSendImage optimistic UI with msgId-only response"
```

---

### Task 6: 前端 - WebSocket 消息匹配替换乐观消息

**Files:**
- Modify: `apps/web/src/utils/pendingMessages.ts`
- Modify: `apps/web/src/hooks/useMessages.ts:80-110`

**Step 1: 添加 consumePendingMsgId 到 pendingMessages**

```typescript
// pendingMessages.ts — 添加 consume 函数
export const consumePendingMsgId = (msgId: string): boolean => {
  if (!pendingMsgIds.has(msgId)) return false
  removePendingMsgId(msgId)
  return true
}
```

**Step 2: 修改 appendMessage 支持替换乐观消息**

当 WebSocket 推送的消息 msgId 在 pending 集合中时，用真实数据替换已有的乐观消息，而不是跳过。

```typescript
// useMessages.ts appendMessage 改为：
const appendMessage = useCallback(
  (message: Message) => {
    if (!conversationId) return;
    const isAtBottom = useChatStore.getState().isAtBottom;
    const isPending = consumePendingMsgId(message.id);

    queryClient.setQueryData<MessageQueryData>(
      ['messages', conversationId], (old) => {
      if (!old) return { messages: [message], hasMore: false, highlightedIds: [message.id], unreadCount: 0 };

      if (isPending) {
        // 替换乐观消息为真实数据
        return {
          ...old,
          messages: old.messages.map((m) =>
            m.id === message.id ? message : m
          ),
        };
      }

      // 按 msgId 去重（非 pending 的普通消息）
      if (old.messages.some((m) => m.id === message.id)) return old;
      return {
        messages: [...old.messages, message],
        hasMore: old.hasMore,
        highlightedIds: [...old.highlightedIds, message.id],
        unreadCount: isAtBottom ? 0 : old.unreadCount + 1,
      };
    });

    if (!isPending) {
      setTimeout(() => {
        queryClient.setQueryData<MessageQueryData>(
          ['messages', conversationId], (old) => {
          if (!old) return old;
          return {
            ...old,
            highlightedIds: old.highlightedIds.filter((id) => id !== message.id),
          };
        });
      }, HIGHLIGHT_DURATION);
    }
  },
  [conversationId, queryClient]
);
```

**Step 3: 运行 lint 和 type-check**

Run: `pnpm lint && pnpm type-check`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/web/src/utils/pendingMessages.ts apps/web/src/hooks/useMessages.ts
git commit -m "feat: WebSocket replaces optimistic messages with real data via pending msgId matching"
```

---

### Task 7: 后端路由测试更新

**Files:**
- Modify: `apps/server/src/routes/messages.test.ts`

**Step 1: 检查并更新路由测试**

路由测试中 sendMessage 的 mock 返回值需要从完整 message 对象改为 `{ msgId: string }`。

Run: `cd apps/server && npx vitest run src/routes/messages.test.ts`

根据失败情况更新 mock 返回值。

**Step 2: Commit**

```bash
git add apps/server/src/routes/messages.test.ts
git commit -m "test: update route tests for simplified sendMessage response"
```

---

### Task 8: 全量测试 + lint + type-check

**Step 1: 运行后端测试**

Run: `cd apps/server && npx vitest run`
Expected: ALL PASS

**Step 2: 运行 lint 和 type-check**

Run: `pnpm lint && pnpm type-check`
Expected: PASS

**Step 3: 修复任何失败**

如有失败，逐个修复并重新运行。

**Step 4: Final commit (if any fixes)**

```bash
git commit -m "fix: address test/lint issues from sendMessage refactor"
```
