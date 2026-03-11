import type { DatabaseService } from './database.js'
import type { DataLakeService, ChatMessage } from './dataLake.js'
import { processMessageContent } from './messageContentProcessor.js'

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
    const limit = options.limit || 20
    // 多取一条用于判断 hasMore
    const indexes = await this.db.getMessageIndexes(conversationId, {
      limit: limit + 1,
      before: options.before
    })

    const hasMore = indexes.length > limit
    const actualIndexes = hasMore ? indexes.slice(0, limit) : indexes

    const rawMessages = await this.dataLake.getMessages(
      actualIndexes.map((idx: { dataLakeKey: string }) => idx.dataLakeKey)
    )

    // 批量解析群聊发送者昵称
    const senderUsernames = [...new Set(
      rawMessages.map((msg: any) => msg.chatroom_sender).filter(Boolean) as string[]
    )]
    const senderNicknameMap = new Map<string, string>()
    if (senderUsernames.length > 0) {
      const contacts = await this.db.findContactsByUsernames(senderUsernames)
      for (const c of contacts) {
        senderNicknameMap.set(c.username, c.remark || c.nickname)
      }
    }

    // 转换字段名：下划线 -> 驼峰
    const messages = rawMessages.map((msg: any) => {
      const { displayType, displayContent } = processMessageContent(msg.msg_type, msg.content)
      return {
        msgId: msg.msg_id,
        msgType: msg.msg_type,
        fromUsername: msg.from_username,
        toUsername: msg.to_username,
        content: msg.content,
        createTime: msg.create_time,
        chatroomSender: msg.chatroom_sender,
        senderNickname: msg.chatroom_sender
          ? senderNicknameMap.get(msg.chatroom_sender)
          : undefined,
        desc: msg.desc,
        isChatroomMsg: msg.is_chatroom_msg,
        chatroom: msg.chatroom,
        source: msg.source,
        displayType,
        displayContent,
      }
    })

    // 数据库按 desc 取最新 N 条，反转为升序（旧→新）返回给前端
    return { messages: messages.reverse(), hasMore }
  }
}
