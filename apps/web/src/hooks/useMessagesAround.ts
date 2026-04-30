import { useQuery } from '@tanstack/react-query'
import { chatApi } from '../api/chat'

export function useMessagesAround(
  conversationId: string | null,
  msgId: string | null,
  limit: number = 21
) {
  return useQuery({
    queryKey: ['messages-around', conversationId, msgId, limit],
    queryFn: () => {
      if (!conversationId || !msgId) {
        throw new Error('conversationId and msgId are required')
      }
      return chatApi.getMessagesAround(conversationId, msgId, limit)
    },
    enabled: Boolean(conversationId && msgId),
  })
}
