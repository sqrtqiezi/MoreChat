import { useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Sidebar } from '../components/layout/Sidebar';
import { ChatWindow } from '../components/chat/ChatWindow';
import { ChatSearchResultsPane } from '../components/chat/ChatSearchResultsPane';
import { ChatMessageDetailPane } from '../components/chat/ChatMessageDetailPane';
import { useChatStore } from '../stores/chatStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { useMessages } from '../hooks/useMessages';
import { mapMessage, contactNameCache } from '../api/chat';
import type { ApiMessage } from '../api/chat';

export function ChatPage() {
  const selectedConversationId = useChatStore((state) => state.selectedConversationId);
  const selectConversation = useChatStore((state) => state.selectConversation);
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const conversationId = searchParams.get('conversationId');
  const query = searchParams.get('q') ?? '';
  const isSearchMode = query.length > 0;
  const effectiveConversationId = conversationId ?? selectedConversationId;

  useEffect(() => {
    if (conversationId && conversationId !== selectedConversationId) {
      selectConversation(conversationId);
    }
  }, [conversationId, selectedConversationId, selectConversation]);

  // useMessages for the selected conversation (to get appendMessage)
  const { appendMessage } = useMessages(effectiveConversationId);

  const handleWebSocketMessage = useCallback(
    (data: any) => {
      if (data.event === 'message:new') {
        const { conversationId, message } = data.data || {};
        if (!conversationId || !message) return;

        if (conversationId === effectiveConversationId) {
          // 当前会话：追加消息到缓存
          const mapped = mapMessage(message as ApiMessage, conversationId, contactNameCache);
          appendMessage(mapped);
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
    [effectiveConversationId, queryClient, appendMessage]
  );

  const handleReconnect = useCallback(() => {
    if (effectiveConversationId) {
      queryClient.invalidateQueries({ queryKey: ['messages', effectiveConversationId] });
    }
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
    queryClient.invalidateQueries({ queryKey: ['directory'] });
  }, [effectiveConversationId, queryClient]);

  const { isConnected } = useWebSocket({
    onMessage: handleWebSocketMessage,
    onReconnect: handleReconnect,
  });

  return (
    <div className="h-screen flex">
      <Sidebar />
      {isSearchMode ? (
        <>
          <ChatSearchResultsPane query={query} />
          <ChatMessageDetailPane />
        </>
      ) : (
        <ChatWindow selectedConversationId={effectiveConversationId} />
      )}
      {!isConnected && (
        <div className="fixed bottom-4 right-4 bg-yellow-100 text-yellow-800 px-4 py-2 rounded-lg shadow-lg text-sm">
          正在重新连接...
        </div>
      )}
    </div>
  );
}
