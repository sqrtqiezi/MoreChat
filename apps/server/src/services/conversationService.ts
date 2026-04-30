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

  private async hydrateMessages(
    conversationId: string,
    indexes: Array<{ dataLakeKey: string; msgId?: string; isRecalled?: boolean }>
  ) {
    const rawMessages = await this.dataLake.getMessages(
      indexes.map(idx => idx.dataLakeKey)
    )

    const hydrated = indexes.map((index, i) => ({
      index,
      raw: rawMessages[i] as ChatMessage | undefined
    }))
    const available = hydrated.filter(
      (entry): entry is { index: typeof indexes[number]; raw: ChatMessage } => Boolean(entry.raw)
    )
    const missingCount = hydrated.length - available.length
    if (missingCount > 0) {
      logger.warn({ conversationId, missingCount, requested: hydrated.length }, 'Missing messages in Data Lake for existing indexes')
    }

    // 批量解析群聊发送者昵称
    const senderUsernames = [...new Set(
      available.map(({ raw }) => raw.chatroom_sender).filter(Boolean) as string[]
    )]
    const senderNicknameMap = new Map<string, string>()
    if (senderUsernames.length > 0) {
      const contacts = await this.db.findContactsByUsernames(senderUsernames)
      for (const c of contacts) {
        senderNicknameMap.set(c.username, c.remark || c.nickname)
      }
    }

    // 转换字段名：下划线 -> 驼峰
    const messages = available.map(({ raw, index }) => {
      const { displayType, displayContent, referMsg } = processMessageContent(raw.msg_type, raw.content)
      return {
        msgId: raw.msg_id,
        msgType: raw.msg_type,
        fromUsername: raw.from_username,
        toUsername: raw.to_username,
        content: raw.content,
        createTime: raw.create_time,
        chatroomSender: raw.chatroom_sender,
        senderNickname: raw.chatroom_sender
          ? senderNicknameMap.get(raw.chatroom_sender)
          : undefined,
        desc: raw.desc,
        isChatroomMsg: raw.is_chatroom_msg,
        chatroom: raw.chatroom,
        source: raw.source,
        displayType,
        displayContent,
        referMsg,
        isRecalled: index?.isRecalled ?? false,
      }
    })

    return { messages, available }
  }

  async getMessages(conversationId: string, options: { limit?: number; before?: number } = {}) {
    type MessageIndexRow = { dataLakeKey: string; msgId?: string; isRecalled?: boolean }

    const limit = options.limit || 20
    // 多取一条用于判断 hasMore
    const indexes = await this.db.getMessageIndexes(conversationId, {
      limit: limit + 1,
      before: options.before
    }) as MessageIndexRow[]

    const hasMore = indexes.length > limit
    const actualIndexes: MessageIndexRow[] = hasMore ? indexes.slice(0, limit) : indexes

    const { messages } = await this.hydrateMessages(conversationId, actualIndexes)

    // 数据库按 desc 取最新 N 条，反转为升序（旧→新）返回给前端
    return { messages: messages.reverse(), hasMore }
  }

  async getMessagesAround(
    conversationId: string,
    msgId: string,
    limit: number = 21
  ) {
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
    })

    // 4. 查询后面的消息（createTime >= target，倒序）
    const afterIndexes = await this.db.getMessageIndexes(conversationId, {
      after: targetMsg.createTime,
      limit: after
    })

    // 5. 合并索引（beforeIndexes 需要反转变为正序，afterIndexes 也需要反转）
    const allIndexes = [...beforeIndexes.reverse(), ...afterIndexes.reverse()]

    // 6. 从 DataLake 加载完整消息，过滤缺失项
    const { messages, available } = await this.hydrateMessages(conversationId, allIndexes)

    // 7. 计算目标消息在 available 数组中的实际位置
    const targetIndex = available.findIndex(({ index }) => index.msgId === msgId)
    if (targetIndex === -1) {
      logger.warn({ conversationId, msgId }, 'Target message missing from DataLake in getMessagesAround')
    }

    return { messages, targetIndex }
  }
}
