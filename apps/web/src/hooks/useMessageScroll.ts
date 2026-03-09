import { useEffect, useRef } from 'react';

/**
 * Custom hook to handle auto-scrolling to bottom of message list
 * Scrolls when new messages arrive or conversation changes
 */
export function useMessageScroll(
  messagesLength: number | undefined,
  conversationId: string | null
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevConversationIdRef = useRef<string | null>(null);
  const prevMessagesLengthRef = useRef<number>(0);

  useEffect(() => {
    const conversationChanged = prevConversationIdRef.current !== conversationId;
    const newMessageAdded =
      messagesLength !== undefined &&
      messagesLength > prevMessagesLengthRef.current;

    // Scroll to bottom when conversation changes or new message arrives
    if (scrollRef.current && (conversationChanged || newMessageAdded)) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }

    // Update refs
    prevConversationIdRef.current = conversationId;
    prevMessagesLengthRef.current = messagesLength || 0;
  }, [messagesLength, conversationId]);

  return scrollRef;
}
