import type { DatabaseService } from './database.js'
import type { DataLakeService } from './dataLake.js'
import { processMessageContent } from './messageContentProcessor.js'
import { logger } from '../lib/logger.js'

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

  async openConversation(
    clientGuid: string,
    input: { type: 'private'; username: string } | { type: 'group'; roomUsername: string }
  ) {
    const client = await this.db.findClientByGuid(clientGuid)
    if (!client) {
      throw new Error('Client not found')
    }

    const peerId = input.type === 'private' ? input.username : input.roomUsername
    const existing = await this.db.findConversation(client.id, peerId)
    if (existing) {
      return { conversationId: existing.id }
    }

    if (input.type === 'private') {
      const contact = await this.db.findContactByUsername(input.username)
      if (!contact) {
        throw new Error('Contact not found')
      }

      const created = await this.db.createConversation({
        clientId: client.id,
        type: 'private',
        contactId: contact.id,
      })

      return { conversationId: created.id }
    }

    const group = await this.db.findGroupByRoomUsername(input.roomUsername)
    if (!group) {
      throw new Error('Group not found')
    }

    const created = await this.db.createConversation({
      clientId: client.id,
      type: 'group',
      groupId: group.id,
    })

    return { conversationId: created.id }
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

    const hydrated = actualIndexes.map((index, i) => ({
      index,
      raw: rawMessages[i]
    }))
    const available = hydrated.filter((entry): entry is { index: typeof actualIndexes[number], raw: NonNullable<typeof rawMessages[number]> } => Boolean(entry.raw))
    const missingCount = hydrated.length - available.length
    if (missingCount > 0) {
      logger.warn({ conversationId, missingCount, requested: hydrated.length }, 'Missing messages in Data Lake for existing indexes')
    }

    // 批量解析群聊发送者昵称
    const senderUsernames = [...new Set(
      available.map(({ raw }: any) => raw.chatroom_sender).filter(Boolean) as string[]
    )]
    const senderNicknameMap = new Map<string, string>()
    if (senderUsernames.length > 0) {
      const contacts = await this.db.findContactsByUsernames(senderUsernames)
      for (const c of contacts) {
        senderNicknameMap.set(c.username, c.remark || c.nickname)
      }
    }

    // 转换字段名：下划线 -> 驼峰
    const messages = available.map(({ raw, index }: any) => {
      const msg = raw
      const { displayType, displayContent, referMsg } = processMessageContent(msg.msg_type, msg.content)
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
        referMsg,
        isRecalled: index?.isRecalled ?? false,
      }
    })

    // 数据库按 desc 取最新 N 条，反转为升序（旧→新）返回给前端
    return { messages: messages.reverse(), hasMore }
  }
}
