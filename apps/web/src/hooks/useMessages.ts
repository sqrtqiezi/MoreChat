import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { chatApi } from '../api/chat';
import type { Message } from '../types';

const MAX_MESSAGES = 100;
const TRIM_TO = 20;
const PAGE_SIZE = 20;

export function useMessages(conversationId: string | null) {
  const queryClient = useQueryClient();
  const isLoadingMoreRef = useRef(false);

  const query = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async () => {
      const response = await chatApi.getMessages(conversationId!, {
        limit: PAGE_SIZE,
      });
      return { messages: response.messages, hasMore: response.hasMore };
    },
    enabled: !!conversationId,
  });

  // 向上加载更早的消息
  const loadMore = useCallback(async () => {
    if (!conversationId || isLoadingMoreRef.current) return;
    const currentData = queryClient.getQueryData<{
      messages: Message[];
      hasMore: boolean;
    }>(['messages', conversationId]);
    if (!currentData?.hasMore || !currentData.messages.length) return;

    isLoadingMoreRef.current = true;
    try {
      const oldestMessage = currentData.messages[0];
      const beforeTime = Math.floor(
        new Date(oldestMessage.timestamp).getTime() / 1000
      );
      const response = await chatApi.getMessages(conversationId, {
        limit: PAGE_SIZE,
        before: beforeTime,
      });

      queryClient.setQueryData<{
        messages: Message[];
        hasMore: boolean;
      }>(['messages', conversationId], (old) => {
        if (!old)
          return {
            messages: response.messages,
            hasMore: response.hasMore,
          };
        // 去重后拼接到头部
        const existingIds = new Set(old.messages.map((m) => m.id));
        const newMessages = response.messages.filter(
          (m) => !existingIds.has(m.id)
        );
        return {
          messages: [...newMessages, ...old.messages],
          hasMore: response.hasMore,
        };
      });
    } finally {
      isLoadingMoreRef.current = false;
    }
  }, [conversationId, queryClient]);

  // 追加新消息（WebSocket 推送用）
  const appendMessage = useCallback(
    (message: Message) => {
      if (!conversationId) return;
      queryClient.setQueryData<{
        messages: Message[];
        hasMore: boolean;
      }>(['messages', conversationId], (old) => {
        if (!old) return { messages: [message], hasMore: false };
        // 按 msgId 去重
        if (old.messages.some((m) => m.id === message.id)) return old;
        return {
          messages: [...old.messages, message],
          hasMore: old.hasMore,
        };
      });
    },
    [conversationId, queryClient]
  );

  // 裁剪到最新 TRIM_TO 条
  const trimToLatest = useCallback(() => {
    if (!conversationId) return;
    queryClient.setQueryData<{
      messages: Message[];
      hasMore: boolean;
    }>(['messages', conversationId], (old) => {
      if (!old || old.messages.length <= MAX_MESSAGES) return old;
      return {
        messages: old.messages.slice(-TRIM_TO),
        hasMore: true, // 裁剪后一定有更多历史消息
      };
    });
  }, [conversationId, queryClient]);

  return {
    messages: query.data?.messages,
    hasMore: query.data?.hasMore ?? false,
    isLoading: query.isLoading,
    error: query.error,
    loadMore,
    appendMessage,
    trimToLatest,
  };
}
