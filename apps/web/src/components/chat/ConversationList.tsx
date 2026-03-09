import { useChatStore } from '../../stores/chatStore';
import { ConversationItem } from './ConversationItem';
import { useConversations } from '../../hooks/useConversations';
import { ConversationSkeleton } from '../common/Skeleton';
import { EmptyState } from '../common/EmptyState';

export function ConversationList() {
  const { data: conversations, isLoading, error } = useConversations();
  const selectedConversationId = useChatStore(
    (state) => state.selectedConversationId
  );
  const selectConversation = useChatStore((state) => state.selectConversation);

  if (isLoading) {
    return (
      <div className="overflow-y-auto flex-1">
        <ConversationSkeleton />
        <ConversationSkeleton />
        <ConversationSkeleton />
        <ConversationSkeleton />
        <ConversationSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="overflow-y-auto flex-1 flex items-center justify-center">
        <EmptyState
          title="加载失败"
          description="无法加载会话列表，请稍后重试"
        />
      </div>
    );
  }

  if (!conversations || conversations.length === 0) {
    return (
      <div className="overflow-y-auto flex-1 flex items-center justify-center">
        <EmptyState
          title="暂无会话"
          description="开始一个新的对话吧"
        />
      </div>
    );
  }

  return (
    <div className="overflow-y-auto flex-1">
      {conversations.map((conversation) => (
        <ConversationItem
          key={conversation.id}
          conversation={conversation}
          isSelected={selectedConversationId === conversation.id}
          onClick={() => selectConversation(conversation.id)}
        />
      ))}
    </div>
  );
}
