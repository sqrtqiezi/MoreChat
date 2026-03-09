import { useChatStore } from '../../stores/chatStore';
import { Conversation } from '../../types';
import { ConversationItem } from './ConversationItem';

interface ConversationListProps {
  conversations: Conversation[];
}

export function ConversationList({ conversations }: ConversationListProps) {
  const selectedConversationId = useChatStore(
    (state) => state.selectedConversationId
  );
  const selectConversation = useChatStore((state) => state.selectConversation);

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
