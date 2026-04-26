import client from './client';
import type { SearchFilters, SearchMode, SearchResultItem, TopicSummary } from '../types';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
  };
}

interface SearchResponse {
  results: SearchResultItem[];
  total: number;
  query: string;
}

export const knowledgeApi = {
  async search(
    params: {
      q: string;
      type: SearchMode;
      limit?: number;
      offset?: number;
    } & SearchFilters
  ): Promise<SearchResponse> {
    const response = await client.get<ApiResponse<SearchResponse>>('/search', { params });

    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error?.message || 'Failed to search');
    }

    return response.data.data;
  },

  async listTopics(limit = 8): Promise<TopicSummary[]> {
    const response = await client.get<ApiResponse<TopicSummary[]>>('/topics', {
      params: { limit, offset: 0 },
    });

    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error?.message || 'Failed to load topics');
    }

    return response.data.data;
  },
};
