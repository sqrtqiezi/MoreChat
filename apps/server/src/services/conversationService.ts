import type { DatabaseService } from './database.js'
import type { DataLakeService, ChatMessage } from './dataLake.js'
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
    type MessageIndexRow = { dataLakeKey: string; isRecalled?: boolean }

    const limit = options.limit || 20
    // 多取一条用于判断 hasMore
    const indexes = await this.db.getMessageIndexes(conversationId, {
      limit: limit + 1,
      before: options.before
    }) as MessageIndexRow[]

    const hasMore = indexes.length > limit
    const actualIndexes: MessageIndexRow[] = hasMore ? indexes.slice(0, limit) : indexes

    const rawMessages = await this.dataLake.getMessages(
      actualIndexes.map((idx: MessageIndexRow) => idx.dataLakeKey)
    )

    const hydrated: Array<{ index: MessageIndexRow; raw: ChatMessage | undefined }> = actualIndexes.map((index: MessageIndexRow, i: number) => ({
      index,
      raw: rawMessages[i]
    }))
    const available = hydrated.filter((entry: { index: MessageIndexRow; raw: ChatMessage | undefined }): entry is { index: MessageIndexRow; raw: ChatMessage } => Boolean(entry.raw))
    const missingCount = hydrated.length - available.length
    if (missingCount > 0) {
      logger.warn({ conversationId, missingCount, requested: hydrated.length }, 'Missing messages in Data Lake for existing indexes')
    }

    // 批量解析群聊发送者昵称
    const senderUsernames = [...new Set(
      available.map(({ raw }: { raw: ChatMessage }) => raw.chatroom_sender).filter(Boolean) as string[]
    )]
    const senderNicknameMap = new Map<string, string>()
    if (senderUsernames.length > 0) {
      const contacts = await this.db.findContactsByUsernames(senderUsernames)
      for (const c of contacts) {
        senderNicknameMap.set(c.username, c.remark || c.nickname)
      }
    }

    // 转换字段名：下划线 -> 驼峰
    const messages = available.map(({ raw, index }: { raw: ChatMessage; index: MessageIndexRow }) => {
      const msg: ChatMessage = raw
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

  async getMessagesAround(
    conversationId: string,
    msgId: string,
    limit: number = 21
  ): Promise<{ messages: any[], targetIndex: number }> {
    type MessageIndexRow = { dataLakeKey: string; isRecalled?: boolean }

    // 1. 查询目标消息
    const targetMsg = await this.db.findMessageIndexInConversation(conversationId, msgId)
    if (!targetMsg) {
      throw new Error('Message not found')
    }

    // 2. 计算前后数量
    const before = Math.floor(limit / 2)
    const after = limit - before

    // 3. 查询前面的消息（createTime < target，倒序）
    const beforeIndexes = await this.db.getMessageIndexes(conversationId, {
      before: targetMsg.createTime,
      limit: before
    }) as MessageIndexRow[]

    // 4. 查询后面的消息（createTime >= target，倒序）
    const afterIndexes = await this.db.getMessageIndexes(conversationId, {
      after: targetMsg.createTime,
      limit: after
    }) as MessageIndexRow[]

    // 5. 合并索引（beforeIndexes 需要反转变为正序，afterIndexes 也需要反转）
    const allIndexes = [...beforeIndexes.reverse(), ...afterIndexes.reverse()]

    // 6. 从 DataLake 加载完整消息
    const rawMessages = await this.dataLake.getMessages(
      allIndexes.map((idx: MessageIndexRow) => idx.dataLakeKey)
    )

    const hydrated: Array<{ index: MessageIndexRow; raw: ChatMessage | undefined }> = allIndexes.map((index: MessageIndexRow, i: number) => ({
      index,
      raw: rawMessages[i]
    }))

    const available = hydrated.filter((entry: { index: MessageIndexRow; raw: ChatMessage | undefined }): entry is { index: MessageIndexRow; raw: ChatMessage } => Boolean(entry.raw))

    // 7. 批量解析群聊发送者昵称
    const senderUsernames = [...new Set(
      available.map(({ raw }: { raw: ChatMessage }) => raw.chatroom_sender).filter(Boolean) as string[]
    )]
    const senderNicknameMap = new Map<string, string>()
    if (senderUsernames.length > 0) {
      const contacts = await this.db.findContactsByUsernames(senderUsernames)
      for (const c of contacts) {
        senderNicknameMap.set(c.username, c.remark || c.nickname)
      }
    }

    // 8. 转换字段名（复用现有的 processMessageContent 函数）
    const messages = available.map(({ raw, index }: { raw: ChatMessage; index: MessageIndexRow }) => {
      const msg: ChatMessage = raw
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

    // 9. 计算目标消息索引（前面消息数量）
    const targetIndex = beforeIndexes.length

    return { messages, targetIndex }
  }
}
