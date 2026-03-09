import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Sidebar } from '../components/layout/Sidebar';
import { ChatWindow } from '../components/chat/ChatWindow';
import { useChatStore } from '../stores/chatStore';
import { useWebSocket } from '../hooks/useWebSocket';

export function ChatPage() {
  const selectedConversationId = useChatStore((state) => state.selectedConversationId);
  const queryClient = useQueryClient();

  // Handle WebSocket messages
  const handleWebSocketMessage = useCallback(
    (data: any) => {
      // Listen for 'message:new' events
      if (data.type === 'message:new' || data.event === 'message:new') {
        const message = data.data || data.message;

        if (message) {
          console.log('[ChatPage] New message received:', message);

          // If it's for the current conversation, invalidate messages query
          if (message.conversationId === selectedConversationId) {
            queryClient.invalidateQueries({ queryKey: ['messages', selectedConversationId] });
          }

          // Always invalidate conversations query to update last message preview
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
        }
      }
    },
    [selectedConversationId, queryClient]
  );

  // Establish WebSocket connection
  const { isConnected } = useWebSocket({
    onMessage: handleWebSocketMessage,
  });

  return (
    <div className="h-screen flex">
      <Sidebar />
      <ChatWindow selectedConversationId={selectedConversationId} />
      {/* Optional: Show connection status indicator */}
      {!isConnected && (
        <div className="fixed bottom-4 right-4 bg-yellow-100 text-yellow-800 px-4 py-2 rounded-lg shadow-lg text-sm">
          正在重新连接...
        </div>
      )}
    </div>
  );
}
