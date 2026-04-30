import { useQuery } from '@tanstack/react-query'
import { chatApi } from '../api/chat'

export function useChatSearch(query: string) {
  return useQuery({
    queryKey: ['chat-search', query],
    queryFn: () => chatApi.searchMessages(query),
    enabled: query.length > 0,
  })
}
