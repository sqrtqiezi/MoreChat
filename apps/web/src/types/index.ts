// Conversation interface
export interface Conversation {
  id: string;
  name: string;
  type: 'private' | 'group';
  avatar?: string;
  memberCount?: number;
  lastMessage?: string;
  unreadCount: number;
  updatedAt: string;
  contactType: number | null;  // 0=Stranger, 1=System, 2=Friend, 3=Mp, 4=ChatRoom, null=Group
}

// ReferMsg interface
export interface ReferMsg {
  type: number;
  senderName: string;
  content: string;
  msgId: string;
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
  msgType?: number;
  displayType?: 'text' | 'image' | 'link' | 'video' | 'call' | 'recall' | 'quote' | 'emoji' | 'file' | 'unknown';
  referMsg?: ReferMsg;
  isRecalled?: boolean;
}

// ClientStatus interface
export interface ClientStatus {
  isOnline: boolean;
  clientId: string;
}

export interface DirectoryContact {
  id: string;
  username: string;
  nickname: string;
  remark: string | null;
  avatar?: string;
  conversationId: string | null;
}

export interface DirectoryGroup {
  id: string;
  roomUsername: string;
  name: string;
  avatar?: string;
  memberCount?: number;
  conversationId: string | null;
}

export type SearchMode = 'keyword' | 'semantic' | 'hybrid';

export interface SearchFilters {
  from?: string;
  group?: string;
  after?: number;
  before?: number;
  important?: boolean;
}

export interface SearchResultItem {
  msgId: string;
  content: string;
  createTime: number;
  fromUsername: string;
  toUsername?: string;
  conversationId?: string;
}

export interface SearchResponse {
  results: SearchResultItem[];
  total: number;
  query: string;
  appliedType: SearchMode;
  downgradedFrom?: Extract<SearchMode, 'semantic' | 'hybrid'>;
}

export interface TopicSummary {
  id: string;
  title: string;
  summary: string;
  messageCount: number;
  participantCount: number;
  lastSeenAt: number;
  status: string;
}

export interface HighlightTag {
  tag: string;
  source: string;
}

export interface HighlightDigest {
  id: string;
  summary: string;
  messageCount: number;
  startTime: number;
  endTime: number;
}

export interface HighlightKnowledgeCard {
  id: string;
  title: string;
  summary: string;
  decisions: string;
  actionItems: string;
}

export interface HighlightItem {
  msgId: string;
  content: string;
  createTime: number;
  fromUsername: string;
  toUsername: string;
  conversationId: string;
  tags: HighlightTag[];
  digest?: HighlightDigest;
  knowledgeCard?: HighlightKnowledgeCard;
}

export interface HighlightsResponse {
  items: HighlightItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface TopicDetailResponse {
  topic: TopicSummary;
  messages: SearchResultItem[];
}

export interface MessagesAroundResponse {
  messages: Message[]
  targetIndex: number
}
