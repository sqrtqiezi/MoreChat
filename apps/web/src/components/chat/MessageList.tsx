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
    <div className="flex-1 relative overflow-hidden">
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
