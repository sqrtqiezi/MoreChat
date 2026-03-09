import type { DatabaseService } from './database'
import type { DataLakeService, ChatMessage } from './dataLake'

export class ConversationService {
  constructor(
    private db: DatabaseService,
    private dataLake: DataLakeService
  ) {}

  async list(clientId: string, limit: number = 50, offset: number = 0) {
    return this.db.getConversations(clientId, { limit, offset })
  }

  async getById(id: string) {
    const conversation = await this.db.findConversationById(id)
    if (!conversation) {
      throw new Error('Conversation not found')
    }
    return conversation
  }

  async markAsRead(id: string): Promise<void> {
    await this.db.updateConversation(id, { unreadCount: 0 })
  }

  async getMessages(conversationId: string, options: { limit?: number; before?: number } = {}) {
    const limit = options.limit || 50
    // 多取一条用于判断 hasMore
    const indexes = await this.db.getMessageIndexes(conversationId, {
      limit: limit + 1,
      before: options.before
    })

    const hasMore = indexes.length > limit
    const actualIndexes = hasMore ? indexes.slice(0, limit) : indexes

    const messages = await this.dataLake.getMessages(
      actualIndexes.map((idx: { dataLakeKey: string }) => idx.dataLakeKey)
    )

    return { messages, hasMore }
  }
}
