// ABOUTME: React Query hook for sending image messages with optimistic updates
// ABOUTME: Handles image upload, UI feedback, and cache synchronization
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { chatApi, getCurrentUser } from '../api/chat';
import { addPendingMsgId } from '../utils/pendingMessages';
import type { Message } from '../types';

interface SendImageData {
  conversationId: string;
  imageFile: File;
}

interface MessageQueryData {
  messages: Message[];
  hasMore: boolean;
  highlightedIds: string[];
}

export function useSendImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SendImageData) => chatApi.sendImage(data),

    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['messages', variables.conversationId] });

      const currentUser = await getCurrentUser();

      const tempMessage: Message = {
        id: `temp-${Date.now()}`,
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
            return { messages: [tempMessage], hasMore: false, highlightedIds: [] };
          }
          return {
            ...old,
            messages: [...old.messages, tempMessage],
          };
        }
      );

      return { tempMessage };
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
              msg.id === context.tempMessage.id
                ? { ...data, status: 'sent' as const }
                : msg
            ),
          };
        }
      );

      addPendingMsgId(data.id);
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
              msg.id === context.tempMessage.id
                ? { ...msg, status: 'failed' as const }
                : msg
            ),
          };
        }
      );
    },
  });
}
