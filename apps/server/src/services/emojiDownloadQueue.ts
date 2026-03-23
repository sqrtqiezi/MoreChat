// ABOUTME: 表情下载队列管理器，负责异步下载任务的调度和重试
// ABOUTME: 控制并发下载数量，失败时自动重试，完成后通过 WebSocket 推送通知
import { logger } from '../lib/logger.js'
import type { EmojiService } from './emojiService.js'
import type { WebSocketService } from './websocket.js'

interface DownloadTask {
  msgId: string
  conversationId: string
  retryCount: number
}

export class EmojiDownloadQueue {
  private queue: DownloadTask[] = []
  private processing = false
  private readonly maxConcurrent = 3
  private readonly maxRetries = 3
  private activeCount = 0

  constructor(
    private emojiService: EmojiService,
    private wsService: WebSocketService
  ) {}

  enqueue(msgId: string, conversationId: string): void {
    this.queue.push({
      msgId,
      conversationId,
      retryCount: 0
    })
    this.process()
  }

  private async process(): Promise<void> {
    if (this.processing) {
      return
    }
    this.processing = true

    while (this.queue.length > 0 || this.activeCount > 0) {
      while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
        const task = this.queue.shift()!
        this.activeCount++
        this.processTask(task)
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    this.processing = false
  }

  private async processTask(task: DownloadTask): Promise<void> {
    try {
      const ossUrl = await this.emojiService.downloadEmoji(task.msgId)

      if (ossUrl) {
        this.wsService.broadcastEmojiDownloaded({
          msgId: task.msgId,
          conversationId: task.conversationId,
          ossUrl
        })
      } else if (task.retryCount < this.maxRetries) {
        task.retryCount++
        this.queue.push(task)
        logger.info(`Retry emoji download for msgId: ${task.msgId}, attempt: ${task.retryCount}`)
      } else {
        logger.error(`Failed to download emoji after ${this.maxRetries} retries: ${task.msgId}`)
      }
    } catch (error) {
      // 异常也要重试
      if (task.retryCount < this.maxRetries) {
        task.retryCount++
        this.queue.push(task)
        logger.warn(`Retry emoji download after error for msgId: ${task.msgId}, attempt: ${task.retryCount}`, error)
      } else {
        logger.error(`Error processing emoji download task after ${this.maxRetries} retries: ${task.msgId}`, error)
      }
    } finally {
      this.activeCount--
    }
  }
}
