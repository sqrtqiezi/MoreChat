import fs from 'fs/promises'
import path from 'path'
import { existsSync } from 'fs'

export interface ChatMessage {
  msg_id: string
  from_username: string
  to_username: string
  content: string
  create_time: number
  msg_type: number
  chatroom_sender: string
  desc: string
  is_chatroom_msg: number
  chatroom: string
  source: string
}

export interface DataLakeConfig {
  type: 'filesystem'
  path: string
}

export class DataLakeService {
  private config: DataLakeConfig

  constructor(config: DataLakeConfig) {
    this.config = config
  }

  /**
   * 保存消息到 Data Lake
   * @param conversationId 会话 ID
   * @param message 消息对象
   * @returns Data Lake key
   */
  async saveMessage(conversationId: string, message: ChatMessage): Promise<string> {
    // 生成 key: conversations/{conversationId}/messages/{timestamp}_{msgId}.json
    const timestamp = message.create_time
    const key = `conversations/${conversationId}/messages/${timestamp}_${message.msg_id}.json`
    const filePath = path.join(this.config.path, key)

    // 确保目录存在
    const dir = path.dirname(filePath)
    if (!existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true })
    }

    // 写入文件
    await fs.writeFile(filePath, JSON.stringify(message, null, 2), 'utf-8')

    return key
  }

  /**
   * 从 Data Lake 获取消息
   * @param key Data Lake key
   * @returns 消息对象
   */
  async getMessage(key: string): Promise<ChatMessage> {
    const filePath = path.join(this.config.path, key)
    const content = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(content)
  }

  /**
   * 批量获取消息
   * @param keys Data Lake keys
   * @returns 消息对象数组
   */
  async getMessages(keys: string[]): Promise<ChatMessage[]> {
    const messages = await Promise.all(
      keys.map(key => this.getMessage(key))
    )
    return messages
  }
}
