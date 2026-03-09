import { useQuery } from '@tanstack/react-query';
import { chatApi } from '../api/chat';

export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async () => {
      const response = await chatApi.getMessages(conversationId!);
      return response.messages; // Extract messages array from response
    },
    enabled: !!conversationId, // only query when conversationId exists
  });
}
