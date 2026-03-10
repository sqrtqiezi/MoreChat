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
    }
  }, []);

  useEffect(() => {
    const conversationChanged = prevConversationIdRef.current !== conversationId;
    const newMessageAdded =
      messagesLength !== undefined &&
      messagesLength > prevMessagesLengthRef.current;

    if (conversationChanged || newMessageAdded) {
      setTimeout(scrollToBottom, 0);
    }

    prevConversationIdRef.current = conversationId;
    prevMessagesLengthRef.current = messagesLength || 0;
  }, [messagesLength, conversationId, scrollToBottom]);

  return { scrollRef, isAtBottom, scrollToBottom, checkIsAtBottom, setIsAtBottom };
}
