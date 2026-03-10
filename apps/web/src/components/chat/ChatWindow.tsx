import { ChatHeader } from './ChatHeader';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { useConversations } from '../../hooks/useConversations';

interface ChatWindowProps {
  selectedConversationId: string | null;
}

export function ChatWindow({ selectedConversationId }: ChatWindowProps) {
  const { data: conversations } = useConversations();

  // Find selected conversation from real API data
  const selectedConversation = conversations?.find(
    (c) => c.id === selectedConversationId
  );

  // Empty state when no conversation selected
  if (!selectedConversationId || !selectedConversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-gray-200 flex items-center justify-center">
            <svg
              className="w-12 h-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">欢迎使用 MoreChat</h3>
          <p className="text-gray-500 text-sm">从左侧选择一个会话开始聊天</p>
        </div>
      </div>
    );
  }

  // Chat window with messages
  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden">
      <ChatHeader conversationName={selectedConversation.name} />
      <MessageList conversationId={selectedConversationId} />
      <MessageInput conversationId={selectedConversationId} />
    </div>
  );
}
