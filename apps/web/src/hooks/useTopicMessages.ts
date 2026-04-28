import { useQuery } from '@tanstack/react-query';
import { knowledgeApi } from '../api/knowledge';

export function useTopicMessages(topicId: string) {
  return useQuery({
    queryKey: ['topic-messages', topicId],
    queryFn: () => knowledgeApi.getTopicMessages(topicId),
    enabled: Boolean(topicId),
  });
}
