import type { DatabaseService } from './database'
import type { DataLakeService, ChatMessage } from './dataLake'
import type { JuhexbotAdapter, ParsedWebhookPayload } from './juhexbotAdapter'

export class MessageService {
  constructor(
    private db: DatabaseService,
    private dataLake: DataLakeService,
    private adapter: JuhexbotAdapter
  ) {}

  async handleIncomingMessage(parsed: ParsedWebhookPayload): Promise<void> {
    const { message } = parsed

    // 消息撤回特殊处理
    if (message.msgType === 10002) {
      await this.handleRecall(parsed)
      return
    }

    // 确保联系人存在
    await this.ensureContact(message.fromUsername)
    if (message.toUsername) {
      await this.ensureContact(message.toUsername)
    }

    // 获取或创建会话
    const conversationId = this.adapter.getConversationId(parsed)
    const conversation = await this.ensureConversation(parsed.guid, conversationId, message.isChatroomMsg)

    // 保存原始消息到 Data Lake
    const chatMessage: ChatMessage = {
      msg_id: message.msgId,
      from_username: message.fromUsername,
      to_username: message.toUsername,
      content: message.content,
      create_time: message.createTime,
      msg_type: message.msgType,
      chatroom_sender: message.chatroomSender,
      desc: message.desc,
      is_chatroom_msg: message.isChatroomMsg ? 1 : 0,
      chatroom: message.chatroom,
      source: message.source
    }

    const dataLakeKey = await this.dataLake.saveMessage(conversation.id, chatMessage)

    // 创建消息索引
    await this.db.createMessageIndex({
      conversationId: conversation.id,
      msgId: message.msgId,
      msgType: message.msgType,
      fromUsername: message.fromUsername,
      toUsername: message.toUsername,
      chatroomSender: message.chatroomSender || undefined,
      createTime: message.createTime,
      dataLakeKey
    })

    // 更新会话最后消息时间
    await this.db.updateConversationLastMessage(conversation.id, new Date(message.createTime * 1000))
  }

  private async handleRecall(parsed: ParsedWebhookPayload): Promise<void> {
    const { message } = parsed

    await this.db.createMessageStateChange({
      msgId: message.msgId,
      changeType: 'recall',
      changeTime: message.createTime,
      changeData: message.content
    })
  }

  private async ensureContact(username: string): Promise<void> {
    const existing = await this.db.findContactByUsername(username)
    if (!existing) {
      const type = username.endsWith('@chatroom') ? 'group' : 'friend'
      await this.db.createContact({
        username,
        nickname: username,
        type
      })
    }
  }

  private async ensureConversation(clientGuid: string, conversationId: string, isChatroom: boolean) {
    const client = await this.db.findClientByGuid(clientGuid)
    if (!client) {
      throw new Error(`Client not found: ${clientGuid}`)
    }

    // 查找已有会话
    const existing = await this.db.findConversation(client.id, conversationId)
    if (existing) {
      return existing
    }

    // 创建新会话
    if (isChatroom) {
      return this.db.createConversation({
        clientId: client.id,
        type: 'group',
        groupId: undefined
      })
    }

    const contact = await this.db.findContactByUsername(conversationId)
    return this.db.createConversation({
      clientId: client.id,
      type: 'private',
      contactId: contact?.id
    })
  }
}
