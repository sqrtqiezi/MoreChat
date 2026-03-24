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
