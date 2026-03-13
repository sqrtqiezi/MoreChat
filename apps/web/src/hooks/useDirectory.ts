import { useQuery } from '@tanstack/react-query';
import { chatApi } from '../api/chat';

export function useDirectory(enabled: boolean) {
  return useQuery({
    queryKey: ['directory'],
    queryFn: () => chatApi.getDirectory(),
    enabled,
  });
}
