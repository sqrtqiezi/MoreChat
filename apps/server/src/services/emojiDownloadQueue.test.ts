// ABOUTME: EmojiDownloadQueue 的单元测试
// ABOUTME: 测试异步下载队列的任务管理、并发控制和重试机制
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EmojiDownloadQueue } from './emojiDownloadQueue.js'
import type { EmojiService } from './emojiService.js'
import type { WebSocketService } from './websocket.js'

describe('EmojiDownloadQueue', () => {
  let queue: EmojiDownloadQueue
  let mockEmojiService: any
  let mockWsService: any

  beforeEach(() => {
    mockEmojiService = {
      downloadEmoji: vi.fn()
    }
    mockWsService = {
      broadcastEmojiDownloaded: vi.fn()
    }
    queue = new EmojiDownloadQueue(mockEmojiService, mockWsService)
  })

  it('should enqueue and process download task', async () => {
    mockEmojiService.downloadEmoji.mockResolvedValue('https://oss.com/emoji.png')

    queue.enqueue('msg123', 'conv456')

    await new Promise(resolve => setTimeout(resolve, 200))

    expect(mockEmojiService.downloadEmoji).toHaveBeenCalledWith('msg123')
    expect(mockWsService.broadcastEmojiDownloaded).toHaveBeenCalledWith({
      msgId: 'msg123',
      conversationId: 'conv456',
      ossUrl: 'https://oss.com/emoji.png'
    })
  })

  it('should retry failed downloads', async () => {
    mockEmojiService.downloadEmoji
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce('https://oss.com/emoji.png')

    queue.enqueue('msg123', 'conv456')

    await new Promise(resolve => setTimeout(resolve, 300))

    expect(mockEmojiService.downloadEmoji).toHaveBeenCalledTimes(2)
    expect(mockWsService.broadcastEmojiDownloaded).toHaveBeenCalledTimes(1)
  })

  it('should not broadcast if download fails after max retries', async () => {
    mockEmojiService.downloadEmoji.mockResolvedValue(null)

    queue.enqueue('msg123', 'conv456')

    await new Promise(resolve => setTimeout(resolve, 200))

    expect(mockWsService.broadcastEmojiDownloaded).not.toHaveBeenCalled()
  })
})
