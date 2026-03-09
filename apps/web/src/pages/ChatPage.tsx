import { Sidebar } from '../components/layout/Sidebar';
import { ChatWindow } from '../components/chat/ChatWindow';
import { useChatStore } from '../stores/chatStore';

export function ChatPage() {
  const selectedConversationId = useChatStore((state) => state.selectedConversationId);

  return (
    <div className="h-screen flex">
      <Sidebar />
      <ChatWindow selectedConversationId={selectedConversationId} />
    </div>
  );
}
