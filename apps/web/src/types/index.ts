// User interface
export interface User {
  username: string;
}

// Conversation interface
export interface Conversation {
  id: string;
  name: string;
  type: 'private' | 'group';
  lastMessage?: string;
  unreadCount: number;
  updatedAt: string;
}

// Message interface
export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: string;
  status: 'sending' | 'sent' | 'failed';
  isMine: boolean;
}

// ClientStatus interface
export interface ClientStatus {
  isOnline: boolean;
  clientId: string;
}
