import { useQuery } from '@tanstack/react-query';
import { chatApi } from '../api/chat';

export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => chatApi.getMessages(conversationId!),
    enabled: !!conversationId, // only query when conversationId exists
    refetchInterval: 3000, // 3 seconds polling
  });
}
