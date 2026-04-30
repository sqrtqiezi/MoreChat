import { useMutation, useQueryClient } from '@tanstack/react-query';
import { chatApi, getCurrentUser } from '../api/chat';
import type { Message } from '../types';

interface SendImageData {
  conversationId: string;
  imageFile: File;
}

interface MessageQueryData {
  messages: Message[];
  hasMore: boolean;
  highlightedIds: string[];
  unreadCount: number;
}

export function useSendImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SendImageData) => chatApi.sendImage(data),

    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['messages', variables.conversationId] });

      const currentUser = await getCurrentUser();

      const tempId = `temp-${Date.now()}`;
      const tempMessage: Message = {
        id: tempId,
        conversationId: variables.conversationId,
        senderId: currentUser.username,
        senderName: '我',
        content: '',
        timestamp: new Date().toISOString(),
        status: 'sending',
        isMine: true,
        msgType: 3,
        displayType: 'image',
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
