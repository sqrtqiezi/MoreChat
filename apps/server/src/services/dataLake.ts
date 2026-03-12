import fs from 'fs/promises'
import path from 'path'
import { formatLocalDate } from '../lib/date.js'

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
   * 保存消息到 Data Lake（双层写入：raw + hot）
   * @param conversationId 会话 ID
   * @param message 消息对象
   * @returns Data Lake key
   */
  async saveMessage(conversationId: string, message: ChatMessage): Promise<string> {
    const timestamp = message.create_time
    const date = formatLocalDate(new Date(timestamp * 1000))

    // 1. 追加原始数据到 raw/{date}.jsonl（永久保留）
    const rawFile = path.join(this.config.path, 'raw', `${date}.jsonl`)
    await fs.mkdir(path.dirname(rawFile), { recursive: true })
    await fs.appendFile(rawFile, JSON.stringify(message) + '\n', 'utf-8')

    // 2. 追加处理后数据到 hot/{convId}/{date}.jsonl（3 天）
    const hotFile = path.join(this.config.path, 'hot', conversationId, `${date}.jsonl`)
    await fs.mkdir(path.dirname(hotFile), { recursive: true })
    await fs.appendFile(hotFile, JSON.stringify(message) + '\n', 'utf-8')

    // 3. 返回新格式 key
    return `hot/${conversationId}/${date}.jsonl:${message.msg_id}`
  }

  /**
   * 从 Data Lake 获取消息（支持多格式）
   * @param key Data Lake key
   * @returns 消息对象
   */
  async getMessage(key: string): Promise<ChatMessage> {
    if (key.startsWith('hot/')) {
      // 新格式：hot/{convId}/{date}.jsonl:{msgId}
      const [filePart, msgId] = key.split(':')
      const filePath = path.join(this.config.path, filePart)

      const content = await fs.readFile(filePath, 'utf-8')
      const lines = content.split('\n').filter(Boolean)

      for (const line of lines) {
        try {
          const msg = JSON.parse(line)
          if (msg.msg_id === msgId) {
            return msg
          }
        } catch (error) {
          console.warn(`Skipping corrupted line in ${filePath}`)
        }
      }

      throw new Error(`Message not found: ${key}`)
    } else {
      // 旧格式（单文件 JSON）：
      // - conversations/{convId}/messages/{ts}_{msgId}.json
      // - {convId}/msg_{ts}_{msgId}.json
      const filePath = path.join(this.config.path, key)
      const content = await fs.readFile(filePath, 'utf-8')
      return JSON.parse(content)
    }
  }

  /**
   * 批量获取消息（优化：按文件分组）
   * @param keys Data Lake keys
   * @returns 消息对象数组
   */
  async getMessages(keys: string[]): Promise<ChatMessage[]> {
    // 按文件分组
    const fileGroups = new Map<string, string[]>()

    for (const key of keys) {
      if (key.startsWith('hot/')) {
        // 新格式：多个 key 可能对应同一个 JSONL 文件
        const [filePart, id] = key.split(':')
        if (!fileGroups.has(filePart)) {
          fileGroups.set(filePart, [])
        }
        fileGroups.get(filePart)!.push(id)
      } else {
        // 旧格式（单文件 JSON）：每个 key 对应一个文件
        fileGroups.set(key, [])
      }
    }

    // 读取文件并构建消息映射
    const messageMap = new Map<string, ChatMessage>()

    for (const [filePath, msgIds] of fileGroups) {
      const fullPath = path.join(this.config.path, filePath)
      const content = await fs.readFile(fullPath, 'utf-8')

      if (msgIds.length === 0) {
        // 旧格式：单个 JSON 文件
        const msg = JSON.parse(content)
        messageMap.set(filePath, msg)
      } else {
        // 新格式：JSONL 文件
        const lines = content.split('\n').filter(Boolean)
        for (const line of lines) {
          try {
            const msg = JSON.parse(line)
            if (msgIds.includes(msg.msg_id)) {
              messageMap.set(msg.msg_id, msg)
            }
          } catch (error) {
            console.warn(`Skipping corrupted line in ${fullPath}`)
          }
        }
      }
    }

    // 按原始顺序返回消息
    return keys.map(key => {
      if (key.startsWith('hot/')) {
        const msgId = key.split(':')[1]
        return messageMap.get(msgId)!
      } else {
        return messageMap.get(key)!
      }
    })
  }
}
