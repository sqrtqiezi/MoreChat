import { useQuery } from '@tanstack/react-query';
import { chatApi } from '../api/chat';

export function useMessages(conversationId: string | null) {
  console.log('[useMessages] conversationId:', conversationId);

  return useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async () => {
      console.log('[useMessages] Fetching messages for:', conversationId);
      try {
        const response = await chatApi.getMessages(conversationId!);
        console.log('[useMessages] Response:', response);
        return response.messages; // Extract messages array from response
      } catch (error) {
        console.error('[useMessages] Error:', error);
        throw error;
      }
    },
    enabled: !!conversationId, // only query when conversationId exists
  });
}
