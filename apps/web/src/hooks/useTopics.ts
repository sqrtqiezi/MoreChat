import { useQuery } from '@tanstack/react-query';
import { knowledgeApi } from '../api/knowledge';

export function useTopics() {
  return useQuery({
    queryKey: ['knowledge-topics'],
    queryFn: () => knowledgeApi.listTopics(),
    staleTime: 60_000,
  });
}
