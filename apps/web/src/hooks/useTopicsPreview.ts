import { useQuery } from '@tanstack/react-query';
import { knowledgeApi } from '../api/knowledge';

export function useTopicsPreview() {
  return useQuery({
    queryKey: ['topics-preview'],
    queryFn: () => knowledgeApi.listTopics(3),
    staleTime: 60_000,
  });
}
