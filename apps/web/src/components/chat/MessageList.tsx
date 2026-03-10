import { useVirtualizer } from '@tanstack/react-virtual';
import { MessageItem } from './MessageItem';
import { useMessages } from '../../hooks/useMessages';
import { useMessageScroll } from '../../hooks/useMessageScroll';
import { MessageSkeleton } from '../common/Skeleton';
import { EmptyState } from '../common/EmptyState';

interface MessageListProps {
  conversationId: string | null;
}

export function MessageList({ conversationId }: MessageListProps) {
  const { data: messages, isLoading, error } = useMessages(conversationId);
  const parentRef = useMessageScroll(messages?.length, conversationId);

  const virtualizer = useVirtualizer({
    count: messages?.length || 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    overscan: 5,
    measureElement: (element) => element.getBoundingClientRect().height,
  });

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
        <EmptyState
          title="加载失败"
          description="无法加载消息，请稍后重试"
        />
      </div>
    );
  }

  if (!messages || messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <EmptyState
          title="暂无消息"
          description="发送一条消息开始聊天"
        />
      </div>
    );
  }

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto bg-gray-50">
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
  );
}
