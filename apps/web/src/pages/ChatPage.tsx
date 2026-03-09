import { Sidebar } from '../components/layout/Sidebar';
import { ChatWindow } from '../components/chat/ChatWindow';
import { mockConversations } from '../utils/mockData';
import { useChatStore } from '../stores/chatStore';

export function ChatPage() {
  const selectedConversationId = useChatStore((state) => state.selectedConversationId);

  return (
    <div className="h-screen flex">
      <Sidebar conversations={mockConversations} />
      <ChatWindow selectedConversationId={selectedConversationId} />
    </div>
  );
}
