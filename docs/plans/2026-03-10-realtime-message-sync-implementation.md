# 实时消息同步 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 打开聊天窗口时拉取最新 20 条消息，webhook 新消息通过 WebSocket 实时推送到前端，支持向上无限滚动加载和滚动到底部裁剪。

**Architecture:** 后端 webhook 收到消息后通过 WebSocketService.broadcast 推送完整消息给前端。前端用 TanStack Query 管理消息滑动窗口（初始 20 条，向上加载 20 条，超 100 条裁剪到 20 条）。WebSocket 新消息直接追加到缓存，不重新拉取。

**Tech Stack:** Hono, WebSocket (ws), TanStack Query, React, @tanstack/react-virtual

---

### Task 1: 后端 — MessageService.handleIncomingMessage 返回消息数据

**Files:**
- Modify: `apps/server/src/services/message.ts:12-61`
- Modify: `apps/server/src/services/message.test.ts:46-57`

**Step 1: 更新测试验证返回值**

在 `apps/server/src/services/message.test.ts` 中，修改 `should process and store text message` 测试：

```typescript
it('should process and store text message', async () => {
  const parsed = adapter.parseWebhookPayload(textMessage)
  const result = await messageService.handleIncomingMessage(parsed)

  // 验证返回值
  expect(result).not.toBeNull()
  expect(result!.conversationId).toBeDefined()
  expect(result!.message).toBeDefined()
  expect(result!.message.msgId).toBe(parsed.message.msgId)
  expect(result!.message.displayType).toBe('text')
  expect(result!.message.displayContent).toBe(parsed.message.content)

  // 验证联系人已创建
  const contact = await db.findContactByUsername('test_user')
  expect(contact).not.toBeNull()
})
```

同时修改 `should process chatroom message and create group` 测试，验证返回值：

```typescript
it('should process chatroom message and create group', async () => {
  const parsed = adapter.parseWebhookPayload(appMessage)
  const result = await messageService.handleIncomingMessage(parsed)

  expect(result).not.toBeNull()
  expect(result!.conversationId).toBeDefined()
  expect(result!.message.msgType).toBe(parsed.message.msgType)

  // ... 其余验证不变
})
```

撤回消息测试验证返回 null：

```typescript
it('should handle message recall', async () => {
  const textParsed = adapter.parseWebhookPayload(textMessage)
  await messageService.handleIncomingMessage(textParsed)

  const recallParsed = adapter.parseWebhookPayload(messageRecall)
  const result = await messageService.handleIncomingMessage(recallParsed)

  expect(result).toBeNull()

  // ... 其余验证不变
})
```

**Step 2: 运行测试验证失败**

Run: `cd apps/server && npx vitest run src/services/message.test.ts -v`
Expected: FAIL — 当前 handleIncomingMessage 返回 void

**Step 3: 修改 MessageService 实现**

在 `apps/server/src/services/message.ts` 中：

1. 添加 import：
```typescript
import { processMessageContent } from './messageContentProcessor.js'
```

2. 定义返回类型：
```typescript
export interface IncomingMessageResult {
  conversationId: string
  message: {
    msgId: string
    msgType: number
    fromUsername: string
    toUsername: string
    content: string
    createTime: number
    chatroomSender?: string
    desc?: string
    isChatroomMsg: number
    chatroom?: string
    source?: string
    displayType: string
    displayContent: string
  }
}
```

3. 修改 `handleIncomingMessage` 签名和实现：
```typescript
async handleIncomingMessage(parsed: ParsedWebhookPayload): Promise<IncomingMessageResult | null> {
```

- 撤回分支 return `null`
- 正常消息处理完成后，用 `processMessageContent` 处理消息内容，构造 camelCase 消息对象并 return `{ conversationId: conversation.id, message: { ... } }`

**Step 4: 运行测试验证通过**

Run: `cd apps/server && npx vitest run src/services/message.test.ts -v`
Expected: PASS

**Step 5: 提交**

```bash
git add apps/server/src/services/message.ts apps/server/src/services/message.test.ts
git commit -m "feat: MessageService.handleIncomingMessage 返回 conversationId 和处理后的消息"
```

---

### Task 2: 后端 — Webhook handler 广播 WebSocket 消息

**Files:**
- Modify: `apps/server/src/app.ts:48-59`

**Step 1: 修改 webhook handler**

在 `apps/server/src/app.ts` 的 webhook handler 中，`handleIncomingMessage` 之后添加广播逻辑：

```typescript
app.post('/webhook', async (c) => {
  try {
    const payload = await c.req.json()
    logger.debug({ payload }, 'Webhook received')
    const parsed = deps.juhexbotAdapter.parseWebhookPayload(payload)
    logger.debug({ notifyType: parsed.notifyType, msgType: parsed.message?.msgType, msgId: parsed.message?.msgId, from: parsed.message?.fromUsername }, 'Webhook parsed')
    const result = await deps.messageService.handleIncomingMessage(parsed)

    // 广播新消息给所有 WebSocket 客户端
    if (result) {
      deps.wsService.broadcast('message:new', {
        conversationId: result.conversationId,
        message: result.message,
      })
      logger.debug({ conversationId: result.conversationId, msgId: result.message.msgId }, 'Message broadcasted via WebSocket')
    }

    return c.json({ success: true })
  } catch (error) {
    logger.error({ err: error }, 'Webhook error')
    return c.json({ success: false, error: 'Internal error' }, 500)
  }
})
```

**Step 2: 运行全部后端测试确认无回归**

Run: `cd apps/server && npx vitest run -v`
Expected: ALL PASS

**Step 3: 提交**

```bash
git add apps/server/src/app.ts
git commit -m "feat: webhook 收到消息后通过 WebSocket 广播给前端"
```

---

### Task 3: 后端 — 默认 limit 改为 20

**Files:**
- Modify: `apps/server/src/services/conversationService.ts:27`
- Modify: `apps/server/src/services/conversationService.test.ts`

**Step 1: 更新测试中的 limit 期望值**

在 `apps/server/src/services/conversationService.test.ts` 的 `getMessages` 测试中：

- `should return paginated messages from DataLake` 测试：将 `{ limit: 50 }` 改为 `{ limit: 20 }`
- `should indicate hasMore when limit is reached` 测试：将 `Array(51)` 改为 `Array(21)`，`{ limit: 50 }` 改为 `{ limit: 20 }`
- `should process non-text messages` 测试：将 `{ limit: 50 }` 改为 `{ limit: 20 }`

**Step 2: 运行测试验证失败**

Run: `cd apps/server && npx vitest run src/services/conversationService.test.ts -v`
Expected: FAIL — 当前默认 limit 是 50

**Step 3: 修改 ConversationService**

在 `apps/server/src/services/conversationService.ts:28`，将：
```typescript
const limit = options.limit || 50
```
改为：
```typescript
const limit = options.limit || 20
```

**Step 4: 运行测试验证通过**

Run: `cd apps/server && npx vitest run src/services/conversationService.test.ts -v`
Expected: PASS

**Step 5: 提交**

```bash
git add apps/server/src/services/conversationService.ts apps/server/src/services/conversationService.test.ts
git commit -m "feat: 消息默认加载数量从 50 改为 20"
```

---

### Task 4: 前端 — chatApi.getMessages 默认 limit 改为 20

**Files:**
- Modify: `apps/web/src/api/chat.ts:136`

**Step 1: 修改默认 limit**

在 `apps/web/src/api/chat.ts` 的 `getMessages` 方法中，将：
```typescript
limit: params?.limit || 50,
```
改为：
```typescript
limit: params?.limit || 20,
```

**Step 2: 提交**

```bash
git add apps/web/src/api/chat.ts
git commit -m "feat: 前端消息请求默认 limit 改为 20"
```

---

### Task 5: 前端 — 重构 useMessages hook 支持滑动窗口

**Files:**
- Modify: `apps/web/src/hooks/useMessages.ts`

**Step 1: 重构 useMessages**

完整替换 `apps/web/src/hooks/useMessages.ts`：

```typescript
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { chatApi } from '../api/chat';
import type { Message } from '../types';

const MAX_MESSAGES = 100;
const TRIM_TO = 20;
const PAGE_SIZE = 20;

export function useMessages(conversationId: string | null) {
  const queryClient = useQueryClient();
  const isLoadingMoreRef = useRef(false);

  const query = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async () => {
      const response = await chatApi.getMessages(conversationId!, { limit: PAGE_SIZE });
      return { messages: response.messages, hasMore: response.hasMore };
    },
    enabled: !!conversationId,
  });

  // 向上加载更早的消息
  const loadMore = useCallback(async () => {
    if (!conversationId || isLoadingMoreRef.current) return;
    const currentData = queryClient.getQueryData<{ messages: Message[]; hasMore: boolean }>(['messages', conversationId]);
    if (!currentData?.hasMore || !currentData.messages.length) return;

    isLoadingMoreRef.current = true;
    try {
      const oldestMessage = currentData.messages[0];
      const beforeTime = Math.floor(new Date(oldestMessage.timestamp).getTime() / 1000);
      const response = await chatApi.getMessages(conversationId, { limit: PAGE_SIZE, before: beforeTime });

      queryClient.setQueryData<{ messages: Message[]; hasMore: boolean }>(
        ['messages', conversationId],
        (old) => {
          if (!old) return { messages: response.messages, hasMore: response.hasMore };
          // 去重后拼接到头部
          const existingIds = new Set(old.messages.map(m => m.id));
          const newMessages = response.messages.filter(m => !existingIds.has(m.id));
          return {
            messages: [...newMessages, ...old.messages],
            hasMore: response.hasMore,
          };
        }
      );
    } finally {
      isLoadingMoreRef.current = false;
    }
  }, [conversationId, queryClient]);

  // 追加新消息（WebSocket 推送用）
  const appendMessage = useCallback((message: Message) => {
    if (!conversationId) return;
    queryClient.setQueryData<{ messages: Message[]; hasMore: boolean }>(
      ['messages', conversationId],
      (old) => {
        if (!old) return { messages: [message], hasMore: false };
        // 按 msgId 去重
        if (old.messages.some(m => m.id === message.id)) return old;
        return {
          messages: [...old.messages, message],
          hasMore: old.hasMore,
        };
      }
    );
  }, [conversationId, queryClient]);

  // 裁剪到最新 TRIM_TO 条
  const trimToLatest = useCallback(() => {
    if (!conversationId) return;
    queryClient.setQueryData<{ messages: Message[]; hasMore: boolean }>(
      ['messages', conversationId],
      (old) => {
        if (!old || old.messages.length <= MAX_MESSAGES) return old;
        return {
          messages: old.messages.slice(-TRIM_TO),
          hasMore: true, // 裁剪后一定有更多历史消息
        };
      }
    );
  }, [conversationId, queryClient]);

  return {
    messages: query.data?.messages,
    hasMore: query.data?.hasMore ?? false,
    isLoading: query.isLoading,
    error: query.error,
    loadMore,
    appendMessage,
    trimToLatest,
  };
}
```

**Step 2: 提交**

```bash
git add apps/web/src/hooks/useMessages.ts
git commit -m "feat: useMessages 支持滑动窗口（loadMore/appendMessage/trimToLatest）"
```

---

### Task 6: 前端 — ChatPage WebSocket handler 追加消息

**Files:**
- Modify: `apps/web/src/pages/ChatPage.tsx`
- Reference: `apps/web/src/api/chat.ts:70-85` (mapMessage 函数)

**Step 1: 重构 ChatPage**

需要将 `mapMessage` 逻辑从 `chatApi` 中导出，或在 ChatPage 中做简单映射。由于 `chatApi.ts` 中 `mapMessage` 是模块内部函数，需要先导出它。

在 `apps/web/src/api/chat.ts` 中，将 `mapMessage` 改为 export：
```typescript
export function mapMessage(raw: ApiMessage, conversationId: string, contactNameMap: Map<string, string>): Message {
```

同时导出 `contactNameCache` 和 `ApiMessage` 类型：
```typescript
export { contactNameCache };
export type { ApiMessage };
```

然后修改 `apps/web/src/pages/ChatPage.tsx`：

```typescript
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Sidebar } from '../components/layout/Sidebar';
import { ChatWindow } from '../components/chat/ChatWindow';
import { useChatStore } from '../stores/chatStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { useMessages } from '../hooks/useMessages';
import { mapMessage, contactNameCache } from '../api/chat';
import type { ApiMessage } from '../api/chat';

export function ChatPage() {
  const selectedConversationId = useChatStore((state) => state.selectedConversationId);
  const queryClient = useQueryClient();

  // useMessages for the selected conversation (to get appendMessage)
  const { appendMessage } = useMessages(selectedConversationId);

  const handleWebSocketMessage = useCallback(
    (data: any) => {
      if (data.event === 'message:new') {
        const { conversationId, message } = data.data || {};
        if (!conversationId || !message) return;

        if (conversationId === selectedConversationId) {
          // 当前会话：追加消息到缓存
          const mapped = mapMessage(message as ApiMessage, conversationId, contactNameCache);
          appendMessage(mapped);
        }

        // 更新侧边栏会话列表
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      }
    },
    [selectedConversationId, queryClient, appendMessage]
  );

  const { isConnected } = useWebSocket({
    onMessage: handleWebSocketMessage,
  });

  return (
    <div className="h-screen flex">
      <Sidebar />
      <ChatWindow selectedConversationId={selectedConversationId} />
      {!isConnected && (
        <div className="fixed bottom-4 right-4 bg-yellow-100 text-yellow-800 px-4 py-2 rounded-lg shadow-lg text-sm">
          正在重新连接...
        </div>
      )}
    </div>
  );
}
```

**Step 2: 提交**

```bash
git add apps/web/src/api/chat.ts apps/web/src/pages/ChatPage.tsx
git commit -m "feat: WebSocket 新消息直接追加到缓存，不重新拉取"
```

---

### Task 7: 前端 — MessageList 支持向上加载和向下裁剪

**Files:**
- Modify: `apps/web/src/components/chat/MessageList.tsx`
- Modify: `apps/web/src/hooks/useMessageScroll.ts`

**Step 1: 重构 useMessageScroll**

替换 `apps/web/src/hooks/useMessageScroll.ts`，增加底部检测和新消息提示支持：

```typescript
import { useEffect, useRef, useState, useCallback } from 'react';

const BOTTOM_THRESHOLD = 50; // px

export function useMessageScroll(
  messagesLength: number | undefined,
  conversationId: string | null
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevConversationIdRef = useRef<string | null>(null);
  const prevMessagesLengthRef = useRef<number>(0);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasNewMessage, setHasNewMessage] = useState(false);

  // 检测是否在底部
  const checkIsAtBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD;
  }, []);

  // 滚动到底部
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
      setHasNewMessage(false);
    }
  }, []);

  useEffect(() => {
    const conversationChanged = prevConversationIdRef.current !== conversationId;
    const newMessageAdded =
      messagesLength !== undefined &&
      messagesLength > prevMessagesLengthRef.current;

    if (conversationChanged) {
      // 切换会话：滚到底部
      setTimeout(scrollToBottom, 0);
      setHasNewMessage(false);
    } else if (newMessageAdded) {
      if (checkIsAtBottom()) {
        setTimeout(scrollToBottom, 0);
      } else {
        setHasNewMessage(true);
      }
    }

    prevConversationIdRef.current = conversationId;
    prevMessagesLengthRef.current = messagesLength || 0;
  }, [messagesLength, conversationId, checkIsAtBottom, scrollToBottom]);

  return { scrollRef, isAtBottom, hasNewMessage, scrollToBottom, checkIsAtBottom, setIsAtBottom };
}
```

**Step 2: 重构 MessageList**

替换 `apps/web/src/components/chat/MessageList.tsx`：

```typescript
import { useEffect, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { MessageItem } from './MessageItem';
import { useMessages } from '../../hooks/useMessages';
import { useMessageScroll } from '../../hooks/useMessageScroll';
import { MessageSkeleton } from '../common/Skeleton';
import { EmptyState } from '../common/EmptyState';

interface MessageListProps {
  conversationId: string | null;
}

const SCROLL_TOP_THRESHOLD = 50; // px

export function MessageList({ conversationId }: MessageListProps) {
  const { messages, hasMore, isLoading, error, loadMore, trimToLatest } = useMessages(conversationId);
  const { scrollRef, hasNewMessage, scrollToBottom, checkIsAtBottom, setIsAtBottom } = useMessageScroll(messages?.length, conversationId);

  const virtualizer = useVirtualizer({
    count: messages?.length || 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 80,
    overscan: 5,
    measureElement: (element) => element.getBoundingClientRect().height,
  });

  // 滚动事件处理
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    // 向上滚动到顶部：加载更多
    if (el.scrollTop < SCROLL_TOP_THRESHOLD && hasMore) {
      const prevScrollHeight = el.scrollHeight;
      loadMore().then(() => {
        // 保持滚动位置
        requestAnimationFrame(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight - prevScrollHeight;
          }
        });
      });
    }

    // 向下滚动到底部：裁剪
    const atBottom = checkIsAtBottom();
    setIsAtBottom(atBottom);
    if (atBottom) {
      trimToLatest();
    }
  }, [hasMore, loadMore, trimToLatest, checkIsAtBottom, setIsAtBottom, scrollRef]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll, scrollRef]);

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <MessageSkeleton isMine={false} />
        <MessageSkeleton isMine={true} />
        <MessageSkeleton isMine={false} />
        <MessageSkeleton isMine={true} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <EmptyState title="加载失败" description="无法加载消息，请稍后重试" />
      </div>
    );
  }

  if (!messages || messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <EmptyState title="暂无消息" description="发送一条消息开始聊天" />
      </div>
    );
  }

  return (
    <div className="flex-1 relative">
      <div ref={scrollRef} className="h-full overflow-y-auto bg-gray-50">
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => (
            <div
              key={virtualItem.key}
              ref={virtualizer.measureElement}
              data-index={virtualItem.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <MessageItem message={messages[virtualItem.index]} />
            </div>
          ))}
        </div>
      </div>

      {/* 新消息提示条 */}
      {hasNewMessage && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-blue-500 text-white px-4 py-2 rounded-full shadow-lg text-sm hover:bg-blue-600 transition-colors"
        >
          有新消息
        </button>
      )}
    </div>
  );
}
```

**Step 3: 提交**

```bash
git add apps/web/src/components/chat/MessageList.tsx apps/web/src/hooks/useMessageScroll.ts
git commit -m "feat: MessageList 支持向上无限加载、向下裁剪、新消息提示"
```

---

### Task 8: 前端 — WebSocket 重连后刷新消息

**Files:**
- Modify: `apps/web/src/pages/ChatPage.tsx`

**Step 1: 添加重连刷新逻辑**

在 `ChatPage` 中，WebSocket 重连成功后 invalidate 当前会话的消息缓存，确保补全断连期间的消息。

修改 `useWebSocket` 调用，添加 `onReconnect` 回调。由于 `useWebSocket` 目前没有 `onReconnect`，改为在 `WebSocketClient` 的 `onConnect` 回调中处理。

在 `apps/web/src/hooks/useWebSocket.ts` 中，添加 `onReconnect` 支持：

```typescript
interface UseWebSocketOptions {
  onMessage?: (data: any) => void;
  onReconnect?: () => void;
}

export function useWebSocket(options?: UseWebSocketOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const hasConnectedBefore = useRef(false);

  const handleConnect = useCallback(() => {
    if (hasConnectedBefore.current) {
      // 这是重连，不是首次连接
      options?.onReconnect?.();
    }
    hasConnectedBefore.current = true;
    setIsConnected(true);
  }, [options?.onReconnect]);

  // ... 其余不变
}
```

在 `ChatPage` 中使用 `onReconnect`：

```typescript
const handleReconnect = useCallback(() => {
  if (selectedConversationId) {
    queryClient.invalidateQueries({ queryKey: ['messages', selectedConversationId] });
  }
  queryClient.invalidateQueries({ queryKey: ['conversations'] });
}, [selectedConversationId, queryClient]);

const { isConnected } = useWebSocket({
  onMessage: handleWebSocketMessage,
  onReconnect: handleReconnect,
});
```

**Step 2: 提交**

```bash
git add apps/web/src/hooks/useWebSocket.ts apps/web/src/pages/ChatPage.tsx
git commit -m "feat: WebSocket 重连后自动刷新消息和会话列表"
```

---

### Task 9: 全量测试 + 类型检查

**Step 1: 运行后端测试**

Run: `cd apps/server && npx vitest run -v`
Expected: ALL PASS

**Step 2: 运行类型检查**

Run: `pnpm type-check`
Expected: No errors

**Step 3: 运行 lint**

Run: `pnpm lint`
Expected: No errors (or only pre-existing warnings)

**Step 4: 提交（如有修复）**

```bash
git add -A
git commit -m "fix: 修复类型和 lint 问题"
```
