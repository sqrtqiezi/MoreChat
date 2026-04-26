import type { DatabaseService } from './database.js'
import type { DataLakeService, ChatMessage } from './dataLake.js'
import type { JuhexbotAdapter, ParsedWebhookPayload } from './juhexbotAdapter.js'
import type { OssService } from './ossService.js'
import type { EmojiService } from './emojiService.js'
import type { EmojiDownloadQueue } from './emojiDownloadQueue.js'
import type { FileService } from './fileService.js'
import type { DuckDBService } from './duckdbService.js'
import type { Tokenizer } from './tokenizer.js'
import type { EmbeddingQueue } from './embeddingQueue.js'
import type { RuleEngine } from './ruleEngine.js'
import type { KnowledgeQueue } from './knowledgeQueue.js'
import { processMessageContent, parseRecallXml } from './messageContentProcessor.js'
import { logger } from '../lib/logger.js'
import sharp from 'sharp'

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
    senderNickname?: string
    desc?: string
    isChatroomMsg: number
    chatroom?: string
    source?: string
    displayType: string
    displayContent: string
    referMsg?: {
      type: number
      senderName: string
      content: string
      msgId: string
    }
  }
}

export interface RecallResult {
  type: 'recall'
  conversationId: string
  revokedMsgId: string
}

export class MessageService {
  constructor(
    private db: DatabaseService,
    private dataLake: DataLakeService,
    private adapter: JuhexbotAdapter,
    private clientUsername: string,
    private ossService: OssService,
    private emojiService?: EmojiService,
    private emojiQueue?: EmojiDownloadQueue,
    private fileService?: FileService,
    private duckdb?: DuckDBService,
    private tokenizer?: Tokenizer,
    private embeddingQueue?: EmbeddingQueue,
    private ruleEngine?: RuleEngine,
    private knowledgeQueue?: KnowledgeQueue
  ) {}

  async handleIncomingMessage(parsed: ParsedWebhookPayload): Promise<IncomingMessageResult | RecallResult | null> {
    const { message } = parsed

    // 跳过 msgId 缺失的 webhook 消息
    if (!message.msgId) {
      logger.warn({ msgType: message.msgType, fromUsername: message.fromUsername }, 'Webhook message missing msgId, skipping')
      return null
    }

    // 去重：检查 msgId 是否已存在
    const existing = await this.db.findMessageIndexByMsgId(message.msgId)
    if (existing) {
      return null
    }

    // 过滤 type 51 消息（通话消息）
    if (message.msgType === 51) {
      return null
    }

    // 消息撤回特殊处理
    if (message.msgType === 10002) {
      return this.handleRecall(parsed)
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

    // 索引到 DuckDB FTS（仅文本消息）
    if (this.duckdb && this.tokenizer && message.msgType === 1 && message.content) {
      try {
        const contentTokens = this.tokenizer.tokenizeAndJoin(message.content)
        await this.duckdb.insertFTS({
          msgId: message.msgId,
          contentTokens,
          createTime: message.createTime,
          fromUsername: message.fromUsername,
          toUsername: message.toUsername
        })
      } catch (error) {
        logger.warn({ err: error, msgId: message.msgId }, 'Failed to index message to DuckDB FTS')
      }
    }

    // 规则引擎评估（仅文本消息）
    let ruleTagsCount = 0
    let ruleHitImportant = false
    if (this.ruleEngine && message.msgType === 1 && message.content) {
      try {
        const currentUsername = this.adapter.getCurrentUsername()
        const tags = await this.ruleEngine.evaluateMessage({
          msgId: message.msgId,
          fromUsername: message.fromUsername,
          toUsername: message.toUsername,
          content: message.content,
          msgType: message.msgType,
          currentUsername
        })
        if (tags.length > 0) {
          await this.ruleEngine.applyTags(tags)
          ruleTagsCount = tags.length
          ruleHitImportant = tags.some((t) => t.tag === 'important')
        }
      } catch (error) {
        logger.warn({ err: error, msgId: message.msgId }, 'Failed to evaluate message rules')
      }
    }

    // 自动摘要：规则命中 important 即入队（语义命中由 handler 内部入队）
    if (this.knowledgeQueue && ruleHitImportant) {
      try {
        await this.knowledgeQueue.enqueue({
          type: 'digest-generation',
          msgId: message.msgId,
          data: {}
        })
      } catch (error) {
        logger.warn({ err: error, msgId: message.msgId }, 'Failed to enqueue digest generation')
      }
    }

    // 语义重要性分析（仅未被规则标记的文本消息）
    if (this.knowledgeQueue && message.msgType === 1 && message.content && ruleTagsCount === 0) {
      try {
        await this.knowledgeQueue.enqueue({
          type: 'semantic-importance',
          msgId: message.msgId,
          data: { content: message.content }
        })
      } catch (error) {
        logger.warn({ err: error, msgId: message.msgId }, 'Failed to enqueue semantic importance analysis')
      }
    }

    // 实体提取（所有文本消息）
    if (this.knowledgeQueue && message.msgType === 1 && message.content) {
      try {
        await this.knowledgeQueue.enqueue({
          type: 'entity-extraction',
          msgId: message.msgId,
          data: { content: message.content }
        })
      } catch (error) {
        logger.warn({ err: error, msgId: message.msgId }, 'Failed to enqueue entity extraction')
      }
    }

    // 异步生成向量嵌入（仅文本消息）
    if (this.embeddingQueue && message.msgType === 1 && message.content) {
      try {
        this.embeddingQueue.enqueue({
          msgId: message.msgId,
          content: message.content,
          createTime: message.createTime
        })
      } catch (error) {
        logger.warn({ err: error, msgId: message.msgId }, 'Failed to enqueue vector generation')
      }
    }

    // 更新会话最后消息时间
    await this.db.updateConversationLastMessage(conversation.id, new Date(message.createTime * 1000))

    // 处理表情消息
    if (message.msgType === 47 && this.emojiService && this.emojiQueue) {
      await this.emojiService.processEmojiMessage(message.msgId, message.content)
      this.emojiQueue.enqueue(message.msgId, conversation.id)
    }

    const { displayType, displayContent, referMsg } = processMessageContent(message.msgType, message.content)

    // 处理文件消息（异步，不阻塞）
    if (displayType === 'file' && this.fileService) {
      this.fileService.processFileMessage(message.msgId, message.content).catch(err => {
        logger.error({ err, msgId: message.msgId }, 'Failed to process file message')
      })
    }

    // 群聊消息：查询发送者昵称
    let senderNickname: string | undefined
    if (message.chatroomSender) {
      const contact = await this.db.findContactByUsername(message.chatroomSender)
      if (contact) {
        senderNickname = contact.remark || contact.nickname
      }
    }

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
        senderNickname,
        desc: message.desc,
        isChatroomMsg: message.isChatroomMsg ? 1 : 0,
        chatroom: message.chatroom,
        source: message.source,
        displayType,
        displayContent,
        referMsg,
      }
    }
  }

  private async handleRecall(parsed: ParsedWebhookPayload): Promise<RecallResult | null> {
    const { message } = parsed
    const revokedMsgId = parseRecallXml(message.content)

    let result: RecallResult | null = null

    if (revokedMsgId) {
      const originalIndex = await this.db.findMessageIndexByMsgId(revokedMsgId)
      if (originalIndex) {
        await this.db.updateMessageIndex(revokedMsgId, { isRecalled: true })
        result = {
          type: 'recall',
          conversationId: originalIndex.conversationId,
          revokedMsgId
        }
      }
    }

    await this.db.createMessageStateChange({
      msgId: message.msgId,
      changeType: 'recall',
      changeTime: message.createTime,
      changeData: message.content
    })

    return result
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

  async sendMessage(conversationId: string, content: string, replyToMsgId?: string): Promise<{
    msgId: string
  }> {
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

    // 3. 发送消息（普通文本 or 引用）
    let msgId: string

    if (replyToMsgId) {
      const refIndex = await this.db.findMessageIndexByMsgId(replyToMsgId)
      if (!refIndex) {
        throw new Error('Referenced message not found')
      }
      const refMessage = await this.dataLake.getMessage(refIndex.dataLakeKey)
      const refSender = refIndex.chatroomSender || refIndex.fromUsername
      const refContact = await this.db.findContactByUsername(refSender)
      const refNickname = refContact?.remark || refContact?.nickname || refSender

      const result = await this.adapter.sendReferMessage({
        toUsername,
        content,
        referMsg: {
          msgType: refMessage.msg_type,
          msgId: refMessage.new_msg_id || replyToMsgId,
          fromUsername: refSender,
          fromNickname: refNickname,
          source: refMessage.source || '',
          content: refMessage.content,
        },
      })
      msgId = result.msgId
    } else {
      const result = await this.adapter.sendTextMessage(toUsername, content)
      msgId = result.msgId
    }

    // 4. 持久化到 DataLake + MessageIndex
    const createTime = Math.floor(Date.now() / 1000)
    const isChatroom = conversation.type === 'group'

    const chatMessage: ChatMessage = {
      msg_id: msgId,
      from_username: isChatroom ? toUsername : this.clientUsername,
      to_username: toUsername,
      content,
      create_time: createTime,
      msg_type: 1,
      chatroom_sender: isChatroom ? this.clientUsername : '',
      desc: '',
      is_chatroom_msg: isChatroom ? 1 : 0,
      chatroom: isChatroom ? toUsername : '',
      source: '',
    }

    const dataLakeKey = await this.dataLake.saveMessage(conversationId, chatMessage)
    await this.db.createMessageIndex({
      conversationId,
      msgId,
      msgType: 1,
      fromUsername: chatMessage.from_username,
      toUsername,
      chatroomSender: isChatroom ? this.clientUsername : undefined,
      createTime,
      dataLakeKey,
    })

    // 索引到 DuckDB FTS
    if (this.duckdb && this.tokenizer && content) {
      try {
        const contentTokens = this.tokenizer.tokenizeAndJoin(content)
        await this.duckdb.insertFTS({
          msgId,
          contentTokens,
          createTime,
          fromUsername: chatMessage.from_username,
          toUsername
        })
      } catch (error) {
        logger.warn({ err: error, msgId }, 'Failed to index sent message to DuckDB FTS')
      }
    }

    // 异步生成向量嵌入
    if (this.embeddingQueue && content) {
      try {
        this.embeddingQueue.enqueue({
          msgId,
          content,
          createTime
        })
      } catch (error) {
        logger.warn({ err: error, msgId }, 'Failed to enqueue vector generation for sent message')
      }
    }

    await this.db.updateConversationLastMessage(conversationId, new Date(createTime * 1000))

    return { msgId }
  }

  async sendImageMessage(
    conversationId: string,
    imageBuffer: Buffer,
    filename: string
  ): Promise<{ msgId: string }> {
    const conversation = await this.db.findConversationById(conversationId)
    if (!conversation) {
      throw new Error('Conversation not found')
    }

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

    const ossUrl = await this.ossService.uploadImage(imageBuffer, filename)
    const cdnResult = await this.adapter.uploadImageToCdn(ossUrl)
    const metadata = await sharp(imageBuffer).metadata()
    const thumbWidth = metadata.width || 0
    const thumbHeight = metadata.height || 0

    const { msgId, newMsgId } = await this.adapter.sendImageMessage({
      toUsername,
      fileId: cdnResult.fileId,
      aesKey: cdnResult.aesKey,
      fileSize: cdnResult.fileSize,
      bigFileSize: cdnResult.fileSize,
      thumbFileSize: cdnResult.fileSize,
      fileMd5: cdnResult.fileMd5,
      thumbWidth,
      thumbHeight,
      fileCrc: 0,
    })

    // 保存到 DataLake + MessageIndex（图片 content 始终是 XML，不存在 type 49 的解析问题）
    const imgContent = `<msg><img aeskey="${cdnResult.aesKey}" cdnmidimgurl="${cdnResult.fileId}" encryver="1" length="${cdnResult.fileSize}" hdlength="${cdnResult.fileSize}"/></msg>`
    const createTime = Math.floor(Date.now() / 1000)
    const isChatroom = conversation.type === 'group'

    const chatMessage: ChatMessage = {
      msg_id: msgId,
      from_username: isChatroom ? toUsername : this.clientUsername,
      to_username: toUsername,
      content: imgContent,
      create_time: createTime,
      msg_type: 3,
      chatroom_sender: isChatroom ? this.clientUsername : '',
      desc: '',
      is_chatroom_msg: isChatroom ? 1 : 0,
      chatroom: isChatroom ? toUsername : '',
      source: '',
      new_msg_id: newMsgId,
    }

    const dataLakeKey = await this.dataLake.saveMessage(conversationId, chatMessage)
    await this.db.createMessageIndex({
      conversationId,
      msgId,
      msgType: 3,
      fromUsername: chatMessage.from_username,
      toUsername,
      chatroomSender: isChatroom ? this.clientUsername : undefined,
      createTime,
      dataLakeKey,
    })
    await this.db.updateConversationLastMessage(conversationId, new Date(createTime * 1000))

    return { msgId }
  }
}
