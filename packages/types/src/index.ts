export interface User {
  id: string
  username: string
  avatar?: string
  createdAt: Date
}

export interface Message {
  id: string
  content: string
  senderId: string
  receiverId: string
  timestamp: Date
  type: 'text' | 'image' | 'file'
  status: 'sending' | 'sent' | 'delivered' | 'read'
}

export interface Conversation {
  id: string
  participants: User[]
  lastMessage?: Message
  unreadCount: number
  updatedAt: Date
}

export interface ChatRoom {
  id: string
  name: string
  type: 'private' | 'group'
  participants: User[]
  createdAt: Date
}
