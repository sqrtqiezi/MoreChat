import { useQuery } from '@tanstack/react-query';
import { knowledgeApi } from '../api/knowledge';

export function useHighlights(limit = 20, offset = 0) {
  return useQuery({
    queryKey: ['highlights', limit, offset],
    queryFn: () => knowledgeApi.listHighlights(limit, offset),
  });
}
