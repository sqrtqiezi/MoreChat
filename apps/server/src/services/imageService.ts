// ABOUTME: 图片消息服务，处理图片 URL 的获取、缓存和去重
// ABOUTME: 从 DataLake 读取消息 XML → 解析 → 调用 Cloud API 下载 → 缓存到 ImageCache 表

import type { PrismaClient } from '@prisma/client'
import type { DataLakeService } from './dataLake.js'
import type { JuhexbotAdapter } from './juhexbotAdapter.js'
import { parseImageXml } from './messageContentProcessor.js'
import { logger } from '../lib/logger.js'

export class ImageService {
  private prisma: PrismaClient
  private dataLake: DataLakeService
  private adapter: JuhexbotAdapter
  private pendingRequests: Map<string, Promise<string>>

  constructor(
    prisma: PrismaClient,
    dataLake: DataLakeService,
    adapter: JuhexbotAdapter
  ) {
    this.prisma = prisma
    this.dataLake = dataLake
    this.adapter = adapter
    this.pendingRequests = new Map()
  }

  async getImageUrl(msgId: string): Promise<string> {
    const pending = this.pendingRequests.get(msgId)
    if (pending) {
      logger.debug({ msgId }, 'Reusing pending image request')
      return pending
    }

    const promise = this._getImageUrlInternal(msgId)
    this.pendingRequests.set(msgId, promise)

    try {
      const url = await promise
      return url
    } finally {
      this.pendingRequests.delete(msgId)
    }
  }

  private async _getImageUrlInternal(msgId: string): Promise<string> {
    // 1. 查缓存
    const cached = await this.prisma.imageCache.findUnique({
      where: { msgId }
    })

    if (cached?.downloadUrl) {
      logger.debug({ msgId }, 'Image URL found in cache')
      return cached.downloadUrl
    }

    // 2. 从 DataLake 读取消息
    const message = await this.dataLake.getMessage(msgId)

    // 3. 验证是图片消息
    if (message.msg_type !== 3) {
      throw new Error('Not an image message')
    }

    // 4. 解析 XML
    const imageInfo = parseImageXml(message.content)
    if (!imageInfo) {
      throw new Error('Failed to parse image XML or unsupported image format')
    }

    // 5. 创建缓存条目
    if (!cached) {
      await this.prisma.imageCache.create({
        data: {
          msgId,
          aesKey: imageInfo.aesKey,
          cdnFileId: imageInfo.fileId
        }
      })
    }

    // 6. 调用 Cloud API 下载
    logger.info({ msgId, fileId: imageInfo.fileId }, 'Downloading image URL from cloud API')
    const downloadUrl = await this.adapter.downloadImage(
      imageInfo.aesKey,
      imageInfo.fileId,
      `${msgId}.jpg`
    )

    // 7. 更新缓存
    await this.prisma.imageCache.update({
      where: { msgId },
      data: {
        downloadUrl,
        downloadedAt: new Date()
      }
    })

    logger.info({ msgId, downloadUrl }, 'Image URL downloaded and cached')
    return downloadUrl
  }
}
