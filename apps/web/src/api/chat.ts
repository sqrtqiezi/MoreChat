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

// Raw API conversation shape (from backend)
interface ApiConversation {
  id: string;
  clientId: string;
  type: string;
  contactId: string | null;
  groupId: string | null;
  unreadCount: number;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  contact: { id: string; username: string; nickname: string; remark: string | null; avatar: string | null; type: string } | null;
  group: { id: string; roomUsername: string; name: string; avatar: string | null; memberCount: number } | null;
}

// Raw API message shape (from backend)
interface ApiMessage {
  msgId: string;
  msgType: number;
  fromUsername: string;
  toUsername: string;
  content: string;
  createTime: number;
  chatroomSender?: string;
}

interface ConversationsResponse {
  conversations: ApiConversation[];
}

interface ApiMessagesResponse {
  messages: ApiMessage[];
  hasMore: boolean;
}

// Current user identifier (used to determine isMine)
const CURRENT_USER = 'wxid_test_user';

// Global contact name cache, built from conversations API
const contactNameCache = new Map<string, string>();

function mapConversation(raw: ApiConversation): Conversation {
  const name = raw.type === 'group'
    ? (raw.group?.name || '未知群组')
    : (raw.contact?.remark || raw.contact?.nickname || '未知联系人');

  return {
    id: raw.id,
    name,
    type: raw.type as 'private' | 'group',
    unreadCount: raw.unreadCount,
    updatedAt: raw.lastMessageAt || raw.updatedAt,
  };
}

function mapMessage(raw: ApiMessage, conversationId: string, contactNameMap: Map<string, string>): Message {
  const isMine = raw.fromUsername === CURRENT_USER;

  return {
    id: raw.msgId,
    conversationId,
    senderId: raw.fromUsername,
    senderName: isMine ? '我' : (contactNameMap.get(raw.fromUsername) || raw.fromUsername),
    content: raw.content,
    timestamp: new Date(raw.createTime * 1000).toISOString(),
    status: 'sent',
    isMine,
  };
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

    // Build global contact name cache
    for (const raw of response.data.data.conversations) {
      if (raw.contact) {
        contactNameCache.set(raw.contact.username, raw.contact.remark || raw.contact.nickname);
      }
    }

    return response.data.data.conversations.map(mapConversation);
  },

  // GET /api/conversations/:id/messages - 获取消息列表
  async getMessages(
    conversationId: string,
    params?: GetMessagesParams
  ): Promise<{ messages: Message[]; hasMore: boolean }> {
    const response = await client.get<ApiResponse<ApiMessagesResponse>>(
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

    return {
      messages: response.data.data.messages.map(m => mapMessage(m, conversationId, contactNameCache)),
      hasMore: response.data.data.hasMore,
    };
  },

  // POST /api/messages/send - 发送消息
  async sendMessage(data: SendMessageData): Promise<Message> {
    const response = await client.post<ApiResponse<{ message: ApiMessage }>>(
      '/messages/send',
      data
    );

    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error?.message || 'Failed to send message');
    }

    return mapMessage(response.data.data.message, data.conversationId, new Map());
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
