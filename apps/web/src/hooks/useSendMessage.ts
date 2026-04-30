import { useMutation } from '@tanstack/react-query';
import { chatApi } from '../api/chat';
import type { Message } from '../types';

interface SendMessageData {
  conversationId: string;
  content: string;
  replyToMsgId?: string;
  replyingTo?: Message;
}

export function useSendMessage() {
  return useMutation({
    mutationFn: (data: SendMessageData) => chatApi.sendMessage({
      conversationId: data.conversationId,
      content: data.content,
      replyToMsgId: data.replyToMsgId,
    }),

    onSuccess: () => {
      // Message will appear via WebSocket, no need to update cache
    },
  });
}
