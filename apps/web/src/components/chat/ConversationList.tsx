import { useChatStore } from '../../stores/chatStore';
import { ConversationItem } from './ConversationItem';
import { useConversations } from '../../hooks/useConversations';

export function ConversationList() {
  const { data: conversations, isLoading, error } = useConversations();
  const selectedConversationId = useChatStore(
    (state) => state.selectedConversationId
  );
  const selectConversation = useChatStore((state) => state.selectConversation);

  if (isLoading) {
    return (
      <div className="overflow-y-auto flex-1 flex items-center justify-center">
        <p className="text-gray-500 text-sm">加载中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="overflow-y-auto flex-1 flex items-center justify-center">
        <p className="text-red-500 text-sm">加载失败，请稍后重试</p>
      </div>
    );
  }

  if (!conversations || conversations.length === 0) {
    return (
      <div className="overflow-y-auto flex-1 flex items-center justify-center">
        <p className="text-gray-500 text-sm">暂无会话</p>
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
