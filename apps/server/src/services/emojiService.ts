// ABOUTME: 表情消息处理服务
// ABOUTME: 负责解析表情消息、下载表情图片并上传到 OSS

import type { DatabaseService } from './database.js'
import type { JuhexbotAdapter } from './juhexbotAdapter.js'
import type { OssService } from './ossService.js'
import { parseEmojiXml } from './messageContentProcessor.js'
import { logger } from '../lib/logger.js'

export class EmojiService {
  constructor(
    private db: DatabaseService,
    private adapter: JuhexbotAdapter,
    private ossService: OssService
  ) {}

  async processEmojiMessage(msgId: string, content: string): Promise<void> {
    const emojiInfo = parseEmojiXml(content)
    if (!emojiInfo) {
      logger.warn(`Failed to parse emoji XML for msgId: ${msgId}`)
      return
    }

    await this.db.createEmojiCache({
      msgId,
      aesKey: emojiInfo.aesKey,
      cdnUrl: emojiInfo.cdnUrl,
      encryptUrl: emojiInfo.encryptUrl,
      md5: emojiInfo.md5,
      fileSize: emojiInfo.fileSize,
      productId: emojiInfo.productId,
      status: 'pending'
    })
  }

  async downloadEmoji(msgId: string): Promise<string | null> {
    const cache = await this.db.findEmojiCacheByMsgId(msgId)
    if (!cache) {
      logger.warn(`Emoji cache not found for msgId: ${msgId}`)
      return null
    }

    if (cache.status === 'downloaded' && cache.ossUrl) {
      return cache.ossUrl
    }

    try {
      await this.db.updateEmojiCache(msgId, { status: 'downloading' })

      const emojiBuffer = await this.adapter.downloadEmoji({
        cdnUrl: cache.cdnUrl,
        aesKey: cache.aesKey,
        encryptUrl: cache.encryptUrl ?? undefined
      })

      const filename = `emoji_${msgId}_${Date.now()}`
      const ossUrl = await this.ossService.uploadImage(emojiBuffer, filename)

      await this.db.updateEmojiCache(msgId, {
        status: 'downloaded',
        ossUrl,
        downloadedAt: new Date()
      })

      return ossUrl
    } catch (error: any) {
      logger.error(`Failed to download emoji for msgId: ${msgId}`, error)
      await this.db.updateEmojiCache(msgId, {
        status: 'failed',
        errorMessage: error.message
      })
      return null
    }
  }

  async getEmojiUrl(msgId: string): Promise<string | null> {
    const cache = await this.db.findEmojiCacheByMsgId(msgId)
    if (!cache) {
      return null
    }

    if (cache.status === 'downloaded' && cache.ossUrl) {
      return cache.ossUrl
    }

    return null
  }
}
