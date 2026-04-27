import { useQuery } from '@tanstack/react-query';
import { knowledgeApi } from '../api/knowledge';
import { useKnowledgeStore } from '../stores/knowledgeStore';

export function useSearch() {
  const { query, mode, filters } = useKnowledgeStore((state) => ({
    query: state.query,
    mode: state.mode,
    filters: state.filters,
  }));

  return useQuery({
    queryKey: ['knowledge-search', query, mode, filters],
    queryFn: () =>
      knowledgeApi.search({
        q: query,
        type: mode,
        ...filters,
        limit: 30,
        offset: 0,
      }),
    enabled: query.trim().length > 0,
  });
}
