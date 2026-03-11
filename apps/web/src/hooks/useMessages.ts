import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { chatApi } from '../api/chat';
import type { Message } from '../types';
import { hasPendingMsgId } from '../utils/pendingMessages';

const HIGHLIGHT_DURATION = 2000; // ms

const MAX_MESSAGES = 100;
const TRIM_TO = 20;
const PAGE_SIZE = 20;

interface MessageQueryData {
  messages: Message[];
  hasMore: boolean;
  highlightedIds: string[];
}

export function useMessages(conversationId: string | null) {
  const queryClient = useQueryClient();
  const isLoadingMoreRef = useRef(false);

  const query = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async () => {
      const response = await chatApi.getMessages(conversationId!, {
        limit: PAGE_SIZE,
      });
      return { messages: response.messages, hasMore: response.hasMore, highlightedIds: [] as string[] };
    },
    enabled: !!conversationId,
  });

  // 向上加载更早的消息
  const loadMore = useCallback(async () => {
    if (!conversationId || isLoadingMoreRef.current) return;
    const currentData = queryClient.getQueryData<MessageQueryData>(['messages', conversationId]);
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

      queryClient.setQueryData<MessageQueryData>(
        ['messages', conversationId], (old) => {
        if (!old)
          return {
            messages: response.messages,
            hasMore: response.hasMore,
            highlightedIds: [],
          };
        // 去重后拼接到头部
        const existingIds = new Set(old.messages.map((m) => m.id));
        const newMessages = response.messages.filter(
          (m) => !existingIds.has(m.id)
        );
        return {
          messages: [...newMessages, ...old.messages],
          hasMore: response.hasMore,
          highlightedIds: old.highlightedIds,
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
      queryClient.setQueryData<MessageQueryData>(
        ['messages', conversationId], (old) => {
        if (!old) return { messages: [message], hasMore: false, highlightedIds: [message.id] };
        // 按 msgId 去重
        if (old.messages.some((m) => m.id === message.id) || hasPendingMsgId(message.id)) return old;
        return {
          messages: [...old.messages, message],
          hasMore: old.hasMore,
          highlightedIds: [...old.highlightedIds, message.id],
        };
      });

      // 2 秒后从缓存中移除高亮
      setTimeout(() => {
        queryClient.setQueryData<MessageQueryData>(
          ['messages', conversationId], (old) => {
          if (!old) return old;
          return {
            ...old,
            highlightedIds: old.highlightedIds.filter((id) => id !== message.id),
          };
        });
      }, HIGHLIGHT_DURATION);
    },
    [conversationId, queryClient]
  );

  // 裁剪到最新 TRIM_TO 条
  const trimToLatest = useCallback(() => {
    if (!conversationId) return;
    queryClient.setQueryData<MessageQueryData>(
      ['messages', conversationId], (old) => {
      if (!old || old.messages.length <= MAX_MESSAGES) return old;
      const trimmed = old.messages.slice(-TRIM_TO);
      const trimmedIds = new Set(trimmed.map((m) => m.id));
      return {
        messages: trimmed,
        hasMore: true,
        highlightedIds: old.highlightedIds.filter((id) => trimmedIds.has(id)),
      };
    });
  }, [conversationId, queryClient]);

  const highlightedIds = query.data?.highlightedIds ?? [];

  return {
    messages: query.data?.messages,
    hasMore: query.data?.hasMore ?? false,
    isLoading: query.isLoading,
    error: query.error,
    loadMore,
    appendMessage,
    trimToLatest,
    highlightedIds,
  };
}
