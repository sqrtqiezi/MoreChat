# 智能滚动实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 新消息到达时，仅在用户处于底部时自动滚动；否则显示「N 条新消息」浮动提示按钮。

**Architecture:** 修改 `useMessageScroll` 为条件性滚动，在 `useMessages` 中追踪未读计数，新建 `NewMessageIndicator` 浮动按钮组件。

**Tech Stack:** React, TanStack Query, Tailwind CSS

---

### Task 1: 修改 useMessageScroll — 条件性滚动

**Files:**
- Modify: `apps/web/src/hooks/useMessageScroll.ts`

**Step 1: 重写 useMessageScroll**

将无条件滚动改为条件性滚动。用 `isAtBottomRef` 避免闭包陷阱。

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
  const isAtBottomRef = useRef(true);

  // 同步 ref
  useEffect(() => {
    isAtBottomRef.current = isAtBottom;
  }, [isAtBottom]);

  const checkIsAtBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD;
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  useEffect(() => {
    const conversationChanged = prevConversationIdRef.current !== conversationId;
    const newMessageAdded =
      messagesLength !== undefined &&
      messagesLength > prevMessagesLengthRef.current;

    if (conversationChanged) {
      // 切换会话：无条件滚到底部
      setTimeout(() => {
        scrollToBottom();
        setIsAtBottom(true);
      }, 0);
    } else if (newMessageAdded && isAtBottomRef.current) {
      // 新消息 + 在底部：自动滚动
      setTimeout(scrollToBottom, 0);
    }
    // 新消息 + 不在底部：不滚动（由 unreadCount 处理提示）

    prevConversationIdRef.current = conversationId;
    prevMessagesLengthRef.current = messagesLength || 0;
  }, [messagesLength, conversationId, scrollToBottom]);

  return { scrollRef, isAtBottom, scrollToBottom, checkIsAtBottom, setIsAtBottom };
}
```

**Step 2: 验证无语法错误**

Run: `cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: 无与 useMessageScroll 相关的错误

**Step 3: Commit**

```bash
git add apps/web/src/hooks/useMessageScroll.ts
git commit -m "feat(scroll): conditional auto-scroll only when at bottom

Closes #8 (partial)"
```

---

### Task 2: chatStore 添加 isAtBottom 状态

**Files:**
- Modify: `apps/web/src/stores/chatStore.ts`

**Step 1: 添加 isAtBottom 到 chatStore**

```typescript
// 在 ChatState 接口中添加
isAtBottom: boolean;
setIsAtBottom: (v: boolean) => void;

// 在 create 中添加
isAtBottom: true,
setIsAtBottom: (v) => set({ isAtBottom: v }),
```

**Step 2: 修改 MessageList 同步 isAtBottom 到 store**

在 `apps/web/src/components/chat/MessageList.tsx` 的 `handleScroll` 中，将 `setIsAtBottom` 改为从 chatStore 获取：

```typescript
const storeSetIsAtBottom = useChatStore((s) => s.setIsAtBottom);

// handleScroll 中：
const atBottom = checkIsAtBottom();
setIsAtBottom(atBottom);       // useMessageScroll 内部状态
storeSetIsAtBottom(atBottom);  // 全局 store
```

**Step 3: Commit**

```bash
git add apps/web/src/stores/chatStore.ts apps/web/src/components/chat/MessageList.tsx
git commit -m "feat(scroll): sync isAtBottom to chatStore"
```

---

### Task 3: useMessages 添加 unreadCount

**Files:**
- Modify: `apps/web/src/hooks/useMessages.ts`
- Modify: `apps/web/src/pages/ChatPage.tsx`

**Step 1: 修改 MessageQueryData 和所有 setQueryData 调用**

在 `MessageQueryData` 添加 `unreadCount: number`。

所有 `setQueryData` 返回值中添加 `unreadCount` 字段：
- `queryFn`: `unreadCount: 0`
- `loadMore` fallback: `unreadCount: 0`，正常: `unreadCount: old.unreadCount`
- `appendMessage`: `unreadCount: isAtBottom ? 0 : old.unreadCount + 1`
- `trimToLatest`: `unreadCount: old.unreadCount`

修改 `appendMessage` 签名为 `(message: Message, isAtBottom: boolean)`。

添加 `resetUnreadCount`：

```typescript
const resetUnreadCount = useCallback(() => {
  if (!conversationId) return;
  queryClient.setQueryData<MessageQueryData>(
    ['messages', conversationId], (old) => {
    if (!old || old.unreadCount === 0) return old;
    return { ...old, unreadCount: 0 };
  });
}, [conversationId, queryClient]);
```

返回值添加 `unreadCount` 和 `resetUnreadCount`。

**Step 2: 更新 ChatPage.tsx**

```typescript
const isAtBottom = useChatStore((s) => s.isAtBottom);

// handleWebSocketMessage 中：
appendMessage(mapped, isAtBottom);
```

**Step 3: 验证类型检查**

Run: `cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 4: Commit**

```bash
git add apps/web/src/hooks/useMessages.ts apps/web/src/pages/ChatPage.tsx
git commit -m "feat(scroll): add unread count tracking"
```

---

### Task 4: 创建 NewMessageIndicator 组件

**Files:**
- Create: `apps/web/src/components/chat/NewMessageIndicator.tsx`

**Step 1: 实现浮动按钮组件**

```tsx
interface NewMessageIndicatorProps {
  count: number;
  onClick: () => void;
}

export function NewMessageIndicator({ count, onClick }: NewMessageIndicatorProps) {
  if (count <= 0) return null;

  return (
    <button
      onClick={onClick}
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10
        bg-blue-500 hover:bg-blue-600 text-white text-sm
        px-4 py-2 rounded-full shadow-lg
        transition-all duration-200 animate-fade-in
        cursor-pointer"
    >
      ↓ {count} 条新消息
    </button>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/chat/NewMessageIndicator.tsx
git commit -m "feat(scroll): add NewMessageIndicator component"
```

---

### Task 5: 集成到 MessageList

**Files:**
- Modify: `apps/web/src/components/chat/MessageList.tsx`

**Step 1: 在 MessageList 中集成 NewMessageIndicator**

从 `useMessages` 获取 `unreadCount` 和 `resetUnreadCount`。

在滚动容器外层（`relative` 容器内）添加 `NewMessageIndicator`：

```tsx
const { messages, hasMore, isLoading, error, loadMore, trimToLatest, highlightedIds, unreadCount, resetUnreadCount } = useMessages(conversationId);
const { scrollRef, isAtBottom, checkIsAtBottom, setIsAtBottom, scrollToBottom } = useMessageScroll(messages?.length, conversationId);

const handleNewMessageClick = useCallback(() => {
  scrollToBottom();
  resetUnreadCount();
  setIsAtBottom(true);
  storeSetIsAtBottom(true);
}, [scrollToBottom, resetUnreadCount, setIsAtBottom, storeSetIsAtBottom]);

// 滚动回底部时自动重置 unreadCount
useEffect(() => {
  if (isAtBottom && unreadCount > 0) {
    resetUnreadCount();
  }
}, [isAtBottom, unreadCount, resetUnreadCount]);

// JSX 中，在 scrollRef div 之后：
<NewMessageIndicator count={unreadCount} onClick={handleNewMessageClick} />
```

**Step 2: 验证类型检查**

Run: `cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 3: Commit**

```bash
git add apps/web/src/components/chat/MessageList.tsx
git commit -m "feat(scroll): integrate NewMessageIndicator into MessageList

Closes #8"
```

---

### Task 6: 添加 fade-in 动画

**Files:**
- Modify: `apps/web/tailwind.config.js` 或全局 CSS

**Step 1: 检查项目是否已有 animate-fade-in**

如果没有，在 Tailwind 配置或全局 CSS 中添加：

```css
@keyframes fade-in {
  from { opacity: 0; transform: translate(-50%, 10px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}
.animate-fade-in {
  animation: fade-in 0.2s ease-out;
}
```

**Step 2: Commit**

```bash
git add <相关文件>
git commit -m "style: add fade-in animation for new message indicator"
```

---

### Task 7: 最终验证

**Step 1: 类型检查**

Run: `cd apps/web && npx tsc --noEmit --pretty`

**Step 2: Lint**

Run: `pnpm lint`

**Step 3: 构建**

Run: `pnpm build`
