import { useChatStore } from '../../stores/chatStore';
import { ConversationGroup } from './ConversationGroup';
import { useConversations } from '../../hooks/useConversations';
import { ConversationSkeleton } from '../common/Skeleton';
import { EmptyState } from '../common/EmptyState';

export function ConversationList() {
  const { data: conversations, isLoading, error } = useConversations();
  const selectedConversationId = useChatStore(
    (state) => state.selectedConversationId
  );
  const selectConversation = useChatStore((state) => state.selectConversation);
  const isChatGroupCollapsed = useChatStore((state) => state.isChatGroupCollapsed);
  const isMpGroupCollapsed = useChatStore((state) => state.isMpGroupCollapsed);
  const toggleChatGroupCollapsed = useChatStore((state) => state.toggleChatGroupCollapsed);
  const toggleMpGroupCollapsed = useChatStore((state) => state.toggleMpGroupCollapsed);

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

  // 按 contactType 分组
  const chatConversations = conversations.filter((conv) => conv.contactType !== 3);
  const mpConversations = conversations.filter((conv) => conv.contactType === 3);

  return (
    <div className="overflow-y-auto flex-1">
      <ConversationGroup
        title="聊天"
        count={chatConversations.length}
        conversations={chatConversations}
        isCollapsed={isChatGroupCollapsed}
        onToggle={toggleChatGroupCollapsed}
        selectedId={selectedConversationId}
        onSelect={selectConversation}
      />
      <ConversationGroup
        title="公众号"
        count={mpConversations.length}
        conversations={mpConversations}
        isCollapsed={isMpGroupCollapsed}
        onToggle={toggleMpGroupCollapsed}
        selectedId={selectedConversationId}
        onSelect={selectConversation}
      />
    </div>
  );
}
