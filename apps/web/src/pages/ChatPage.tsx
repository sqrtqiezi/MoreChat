import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Sidebar } from '../components/layout/Sidebar';
import { ChatWindow } from '../components/chat/ChatWindow';
import { useChatStore } from '../stores/chatStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { useMessages } from '../hooks/useMessages';
import { mapMessage, contactNameCache } from '../api/chat';
import type { ApiMessage } from '../api/chat';

export function ChatPage() {
  const selectedConversationId = useChatStore((state) => state.selectedConversationId);
  const isAtBottom = useChatStore((s) => s.isAtBottom);
  const queryClient = useQueryClient();

  // useMessages for the selected conversation (to get appendMessage)
  const { appendMessage } = useMessages(selectedConversationId);

  const handleWebSocketMessage = useCallback(
    (data: any) => {
      if (data.event === 'message:new') {
        const { conversationId, message } = data.data || {};
        if (!conversationId || !message) return;

        if (conversationId === selectedConversationId) {
          // 当前会话：追加消息到缓存
          const mapped = mapMessage(message as ApiMessage, conversationId, contactNameCache);
          appendMessage(mapped, isAtBottom);
        }

        // 更新侧边栏会话列表
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      }

      if (data.event === 'message:recall') {
        const { conversationId, msgId } = data.data || {};
        if (!conversationId || !msgId) return;

        queryClient.setQueryData(
          ['messages', conversationId],
          (old: any) => {
            if (!old) return old;

            return {
              ...old,
              messages: old.messages.map((msg: any) =>
                msg.id === msgId ? { ...msg, isRecalled: true } : msg
              ),
            };
          }
        );
      }

      if (data.event === 'contact:updated' || data.event === 'group:updated') {
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
        queryClient.invalidateQueries({ queryKey: ['directory'] });
      }
    },
    [selectedConversationId, queryClient, appendMessage, isAtBottom]
  );

  const handleReconnect = useCallback(() => {
    if (selectedConversationId) {
      queryClient.invalidateQueries({ queryKey: ['messages', selectedConversationId] });
    }
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
    queryClient.invalidateQueries({ queryKey: ['directory'] });
  }, [selectedConversationId, queryClient]);

  const { isConnected } = useWebSocket({
    onMessage: handleWebSocketMessage,
    onReconnect: handleReconnect,
  });

  return (
    <div className="h-screen flex">
      <Sidebar />
      <ChatWindow selectedConversationId={selectedConversationId} />
      {!isConnected && (
        <div className="fixed bottom-4 right-4 bg-yellow-100 text-yellow-800 px-4 py-2 rounded-lg shadow-lg text-sm">
          正在重新连接...
        </div>
      )}
    </div>
  );
}
