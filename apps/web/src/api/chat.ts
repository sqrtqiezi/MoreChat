import client from './client';
import type { Conversation, Message } from '../types';

// API response types
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
  };
}

interface ConversationsResponse {
  conversations: Conversation[];
}

interface MessagesResponse {
  messages: Message[];
  hasMore: boolean;
}

interface SendMessageResponse {
  message: Message;
}

// Query parameters for getMessages
interface GetMessagesParams {
  limit?: number;
  before?: number;
}

// Request body for sendMessage
interface SendMessageData {
  conversationId: string;
  content: string;
}

// Chat API methods
export const chatApi = {
  // GET /api/conversations - 获取会话列表
  async getConversations(limit = 50, offset = 0): Promise<Conversation[]> {
    const response = await client.get<ApiResponse<ConversationsResponse>>(
      '/conversations',
      {
        params: { limit, offset },
      }
    );

    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error?.message || 'Failed to get conversations');
    }

    return response.data.data.conversations;
  },

  // GET /api/conversations/:id/messages - 获取消息列表
  async getMessages(
    conversationId: string,
    params?: GetMessagesParams
  ): Promise<MessagesResponse> {
    const response = await client.get<ApiResponse<MessagesResponse>>(
      `/conversations/${conversationId}/messages`,
      {
        params: {
          limit: params?.limit || 50,
          before: params?.before,
        },
      }
    );

    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error?.message || 'Failed to get messages');
    }

    return response.data.data;
  },

  // POST /api/messages/send - 发送消息
  async sendMessage(data: SendMessageData): Promise<Message> {
    const response = await client.post<ApiResponse<SendMessageResponse>>(
      '/messages/send',
      data
    );

    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error?.message || 'Failed to send message');
    }

    return response.data.data.message;
  },

  // PUT /api/conversations/:id/read - 标记会话为已读
  async markAsRead(conversationId: string): Promise<void> {
    const response = await client.put<ApiResponse<void>>(
      `/conversations/${conversationId}/read`
    );

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to mark as read');
    }
  },
};
