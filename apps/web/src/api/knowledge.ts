import client from './client';
import type {
  HighlightsResponse,
  SearchFilters,
  SearchMode,
  SearchResponse,
  TopicDetailResponse,
  TopicSummary,
} from '../types';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
  };
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

  async listHighlights(limit = 20, offset = 0): Promise<HighlightsResponse> {
    const response = await client.get<ApiResponse<HighlightsResponse>>('/highlights', {
      params: { limit, offset },
    });

    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error?.message || 'Failed to load highlights');
    }

    return response.data.data;
  },

  async getTopicMessages(topicId: string): Promise<TopicDetailResponse> {
    const response = await client.get<ApiResponse<TopicDetailResponse>>(`/topics/${topicId}/messages`);

    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error?.message || 'Failed to load topic detail');
    }

    return response.data.data;
  },
};
