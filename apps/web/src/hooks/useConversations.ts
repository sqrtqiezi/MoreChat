import { useQuery } from '@tanstack/react-query';
import { chatApi } from '../api/chat';

export function useConversations() {
  return useQuery({
    queryKey: ['conversations'],
    queryFn: () => chatApi.getConversations(),
  });
}
