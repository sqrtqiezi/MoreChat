import { useMutation, useQueryClient } from '@tanstack/react-query';
import { chatApi, getCurrentUser } from '../api/chat';
import { addPendingMsgId } from '../utils/pendingMessages';
import type { Message } from '../types';

interface SendMessageData {
  conversationId: string;
  content: string;
  replyToMsgId?: string;
  replyingTo?: Message;
}

interface MessageQueryData {
  messages: Message[];
  hasMore: boolean;
  highlightedIds: string[];
  unreadCount: number;
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SendMessageData) => chatApi.sendMessage({
      conversationId: data.conversationId,
      content: data.content,
      replyToMsgId: data.replyToMsgId,
    }),

    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['messages', variables.conversationId] });

      const currentUser = await getCurrentUser();

      const isQuote = !!variables.replyingTo;
      const tempId = `temp-${Date.now()}`;
      const tempMessage: Message = {
        id: tempId,
        conversationId: variables.conversationId,
        senderId: currentUser.username,
        senderName: '我',
        content: variables.content,
        timestamp: new Date().toISOString(),
        status: 'sending',
        isMine: true,
        msgType: isQuote ? 49 : 1,
        displayType: isQuote ? 'quote' : 'text',
        referMsg: variables.replyingTo ? {
          type: variables.replyingTo.msgType || 1,
          senderName: variables.replyingTo.senderName,
          content: variables.replyingTo.content,
          msgId: variables.replyingTo.id,
        } : undefined,
      };

      queryClient.setQueryData<MessageQueryData>(
        ['messages', variables.conversationId],
        (old) => {
          if (!old) {
            return { messages: [tempMessage], hasMore: false, highlightedIds: [], unreadCount: 0 };
          }
          return { ...old, messages: [...old.messages, tempMessage] };
        }
      );

      return { tempId };
    },

    onSuccess: (data, variables, context) => {
      if (!context) return;

      // 用真实 msgId 更新临时消息，保持乐观内容，等 WebSocket 替换完整数据
      queryClient.setQueryData<MessageQueryData>(
        ['messages', variables.conversationId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            messages: old.messages.map((msg) =>
              msg.id === context.tempId
                ? { ...msg, id: data.msgId, status: 'sent' as const }
                : msg
            ),
          };
        }
      );

      // 将真实 msgId 加入 pending 集合，防止 WebSocket 重复追加
      addPendingMsgId(data.msgId);

      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },

    onError: (_error, variables, context) => {
      if (!context) return;

      queryClient.setQueryData<MessageQueryData>(
        ['messages', variables.conversationId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            messages: old.messages.map((msg) =>
              msg.id === context.tempId
                ? { ...msg, status: 'failed' as const }
                : msg
            ),
          };
        }
      );
    },
  });
}
