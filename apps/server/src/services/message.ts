import type { DatabaseService } from './database.js'
import type { DataLakeService, ChatMessage } from './dataLake.js'
import type { JuhexbotAdapter, ParsedWebhookPayload } from './juhexbotAdapter.js'
import { processMessageContent } from './messageContentProcessor.js'

export interface IncomingMessageResult {
  conversationId: string
  message: {
    msgId: string
    msgType: number
    fromUsername: string
    toUsername: string
    content: string
    createTime: number
    chatroomSender?: string
    desc?: string
    isChatroomMsg: number
    chatroom?: string
    source?: string
    displayType: string
    displayContent: string
  }
}

export class MessageService {
  constructor(
    private db: DatabaseService,
    private dataLake: DataLakeService,
    private adapter: JuhexbotAdapter,
    private clientUsername: string
  ) {}

  async handleIncomingMessage(parsed: ParsedWebhookPayload): Promise<IncomingMessageResult | null> {
    const { message } = parsed

    // 去重：检查 msgId 是否已存在
    const existing = await this.db.findMessageIndexByMsgId(message.msgId)
    if (existing) {
      return null
    }

    // 消息撤回特殊处理
    if (message.msgType === 10002) {
      await this.handleRecall(parsed)
      return null
    }

    // 确保联系人存在
    await this.ensureContact(message.fromUsername)
    if (message.toUsername) {
      await this.ensureContact(message.toUsername)
    }
    if (message.chatroomSender) {
      await this.ensureContact(message.chatroomSender)
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

    const { displayType, displayContent } = processMessageContent(message.msgType, message.content)

    return {
      conversationId: conversation.id,
      message: {
        msgId: message.msgId,
        msgType: message.msgType,
        fromUsername: message.fromUsername,
        toUsername: message.toUsername,
        content: message.content,
        createTime: message.createTime,
        chatroomSender: message.chatroomSender,
        desc: message.desc,
        isChatroomMsg: message.isChatroomMsg ? 1 : 0,
        chatroom: message.chatroom,
        source: message.source,
        displayType,
        displayContent,
      }
    }
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
      try {
        const type = username.endsWith('@chatroom') ? 'group' : 'friend'
        await this.db.createContact({
          username,
          nickname: username,
          type
        })
      } catch (error: any) {
        // 并发创建时忽略 unique constraint 冲突
        if (error?.code !== 'P2002') throw error
      }
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
      // 确保群组存在
      let group = await this.db.findGroupByRoomUsername(conversationId)
      if (!group) {
        try {
          group = await this.db.createGroup({
            roomUsername: conversationId,
            name: conversationId
          })
        } catch (error: any) {
          // 并发创建时忽略 unique constraint 冲突
          if (error?.code === 'P2002') {
            group = await this.db.findGroupByRoomUsername(conversationId)
          } else {
            throw error
          }
        }
      }

      try {
        return await this.db.createConversation({
          clientId: client.id,
          type: 'group',
          groupId: group!.id
        })
      } catch (error: any) {
        if (error?.code === 'P2002') {
          const conv = await this.db.findConversation(client.id, conversationId)
          if (conv) return conv
        }
        throw error
      }
    }

    const contact = await this.db.findContactByUsername(conversationId)
    try {
      return await this.db.createConversation({
        clientId: client.id,
        type: 'private',
        contactId: contact?.id
      })
    } catch (error: any) {
      if (error?.code === 'P2002') {
        const conv = await this.db.findConversation(client.id, conversationId)
        if (conv) return conv
      }
      throw error
    }
  }

  async sendMessage(conversationId: string, content: string): Promise<{ msgId: string }> {
    // 1. 获取会话信息
    const conversation = await this.db.findConversationById(conversationId)
    if (!conversation) {
      throw new Error('Conversation not found')
    }

    // 2. 确定接收者
    let toUsername: string
    if (conversation.type === 'group') {
      const group = await this.db.findGroupById(conversation.groupId!)
      if (!group) throw new Error('Group not found')
      toUsername = group.roomUsername
    } else {
      const contact = await this.db.findContactById(conversation.contactId!)
      if (!contact) throw new Error('Contact not found')
      toUsername = contact.username
    }

    // 3. 发送消息
    const { msgId } = await this.adapter.sendTextMessage(toUsername, content)

    // 4. 保存到 DataLake
    const createTime = Math.floor(Date.now() / 1000)
    const chatMessage: ChatMessage = {
      msg_id: msgId,
      from_username: this.clientUsername,  // 修改：使用真实用户名
      to_username: toUsername,
      content,
      create_time: createTime,
      msg_type: 1,
      chatroom_sender: '',
      desc: '',
      is_chatroom_msg: conversation.type === 'group' ? 1 : 0,
      chatroom: conversation.type === 'group' ? toUsername : '',
      source: ''
    }

    const dataLakeKey = await this.dataLake.saveMessage(conversationId, chatMessage)

    // 5. 创建消息索引
    await this.db.createMessageIndex({
      conversationId,
      msgId,
      msgType: 1,
      fromUsername: this.clientUsername,  // 修改：使用真实用户名
      toUsername,
      createTime,
      dataLakeKey
    })

    // 6. 更新会话最后消息时间
    await this.db.updateConversationLastMessage(conversationId, new Date(createTime * 1000))

    return { msgId }
  }
}
