// ABOUTME: 图片消息服务，处理图片 URL 的获取、缓存和去重
// ABOUTME: 从 DataLake 读取消息 XML → 解析 → 调用 Cloud API 下载 → 缓存到 ImageCache 表

import type { PrismaClient } from '@prisma/client'
import type { DataLakeService } from './dataLake.js'
import type { JuhexbotAdapter } from './juhexbotAdapter.js'
import { parseImageXml } from './messageContentProcessor.js'
import { logger } from '../lib/logger.js'

export interface ImageUrlResult {
  imageUrl: string
  hasHd: boolean
}

export class ImageService {
  private prisma: PrismaClient
  private dataLake: DataLakeService
  private adapter: JuhexbotAdapter
  private pendingRequests: Map<string, Promise<ImageUrlResult>>

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

  async getImageUrl(msgId: string, size: 'mid' | 'hd' = 'mid'): Promise<ImageUrlResult> {
    const cacheKey = `${msgId}:${size}`
    const pending = this.pendingRequests.get(cacheKey)
    if (pending) {
      logger.debug({ msgId, size }, 'Reusing pending image request')
      return pending
    }

    const promise = this._getImageUrlInternal(msgId, size)
    this.pendingRequests.set(cacheKey, promise)

    try {
      const result = await promise
      return result
    } finally {
      this.pendingRequests.delete(cacheKey)
    }
  }

  private async _getImageUrlInternal(msgId: string, size: 'mid' | 'hd'): Promise<ImageUrlResult> {
    // 1. 查缓存
    const cached = await this.prisma.imageCache.findUnique({
      where: { msgId }
    })

    // 2. 如果缓存中的尺寸 >= 请求的尺寸，直接返回缓存
    if (cached?.downloadUrl && cached.cachedSize) {
      const cachedSizeRank = cached.cachedSize === 'hd' ? 2 : 1
      const requestedSizeRank = size === 'hd' ? 2 : 1
      if (cachedSizeRank >= requestedSizeRank) {
        logger.debug({ msgId, size, cachedSize: cached.cachedSize }, 'Image URL found in cache')
        return { imageUrl: cached.downloadUrl, hasHd: cached.hasHd }
      }
    }

    // 3. 从 MessageIndex 查出 dataLakeKey，再从 DataLake 读取消息
    const messageIndex = await this.prisma.messageIndex.findUnique({
      where: { msgId },
      select: { dataLakeKey: true, msgType: true }
    })

    if (!messageIndex) {
      throw new Error('Message not found')
    }

    // 4. 验证是图片消息
    if (messageIndex.msgType !== 3) {
      throw new Error('Not an image message')
    }

    const message = await this.dataLake.getMessage(messageIndex.dataLakeKey)

    // 5. 解析 XML
    const imageInfo = parseImageXml(message.content)
    if (!imageInfo) {
      throw new Error('Failed to parse image XML or unsupported image format')
    }

    // 6. 创建缓存条目
    if (!cached) {
      await this.prisma.imageCache.create({
        data: {
          msgId,
          aesKey: imageInfo.aesKey,
          cdnFileId: imageInfo.fileId,
          hasHd: imageInfo.hasHd,
          cachedSize: null
        }
      })
    }

    // 7. 调用 Cloud API 下载
    const fileType = size === 'hd' ? 1 : 2
    logger.info({ msgId, fileId: imageInfo.fileId, size, fileType }, 'Downloading image URL from cloud API')
    const downloadUrl = await this.adapter.downloadImage(
      imageInfo.aesKey,
      imageInfo.fileId,
      `${msgId}.jpg`,
      fileType
    )

    // 8. 更新缓存（HD 图片会覆盖 mid 图片）
    if (size === 'hd' || !cached?.downloadUrl) {
      await this.prisma.imageCache.update({
        where: { msgId },
        data: {
          downloadUrl,
          downloadedAt: new Date(),
          hasHd: imageInfo.hasHd,
          cachedSize: size
        }
      })
    }

    logger.info({ msgId, downloadUrl, size }, 'Image URL downloaded and cached')
    return {
      imageUrl: downloadUrl,
      hasHd: imageInfo.hasHd
    }
  }
}
