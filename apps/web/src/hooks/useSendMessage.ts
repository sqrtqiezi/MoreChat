import { useMutation, useQueryClient } from '@tanstack/react-query';
import { chatApi } from '../api/chat';

interface SendMessageData {
  conversationId: string;
  content: string;
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SendMessageData) => chatApi.sendMessage(data),
    onSuccess: (_, variables) => {
      // Invalidate conversations query to update last message
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      // Invalidate messages query for the specific conversation
      queryClient.invalidateQueries({
        queryKey: ['messages', variables.conversationId]
      });
    },
  });
}
