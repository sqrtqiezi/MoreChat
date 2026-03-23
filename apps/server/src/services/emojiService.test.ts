import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EmojiService } from './emojiService.js'
import type { DatabaseService } from './database.js'
import type { JuhexbotAdapter } from './juhexbotAdapter.js'
import type { OssService } from './ossService.js'

describe('EmojiService', () => {
  let emojiService: EmojiService
  let mockDb: any
  let mockAdapter: any
  let mockOss: any

  beforeEach(() => {
    mockDb = {
      createEmojiCache: vi.fn(),
      findEmojiCacheByMsgId: vi.fn(),
      updateEmojiCache: vi.fn()
    }
    mockAdapter = {
      downloadEmoji: vi.fn()
    }
    mockOss = {
      uploadImage: vi.fn()
    }
    emojiService = new EmojiService(mockDb, mockAdapter, mockOss)
  })

  describe('processEmojiMessage', () => {
    it('should create emoji cache record', async () => {
      const msgId = '123'
      const content = '<msg><emoji aeskey="test" cdnurl="http://test.com" md5="abc" len="1000" /></msg>'

      await emojiService.processEmojiMessage(msgId, content)

      expect(mockDb.createEmojiCache).toHaveBeenCalledWith({
        msgId: '123',
        aesKey: 'test',
        cdnUrl: 'http://test.com',
        encryptUrl: undefined,
        md5: 'abc',
        fileSize: 1000,
        productId: undefined,
        status: 'pending'
      })
    })

    it('should not create cache for invalid XML', async () => {
      await emojiService.processEmojiMessage('123', '<invalid>')

      expect(mockDb.createEmojiCache).not.toHaveBeenCalled()
    })
  })

  describe('downloadEmoji', () => {
    it('should download and upload emoji', async () => {
      const cache = {
        msgId: '123',
        aesKey: 'test',
        cdnUrl: 'http://test.com',
        encryptUrl: 'http://encrypt.com',
        status: 'pending'
      }
      mockDb.findEmojiCacheByMsgId.mockResolvedValue(cache)
      mockAdapter.downloadEmoji.mockResolvedValue(Buffer.from('image'))
      mockOss.uploadImage.mockResolvedValue('https://oss.com/emoji.png')

      const result = await emojiService.downloadEmoji('123')

      expect(result).toBe('https://oss.com/emoji.png')
      expect(mockDb.updateEmojiCache).toHaveBeenCalledWith('123', {
        status: 'downloading'
      })
      expect(mockDb.updateEmojiCache).toHaveBeenCalledWith('123', {
        status: 'downloaded',
        ossUrl: 'https://oss.com/emoji.png',
        downloadedAt: expect.any(Date)
      })
    })

    it('should return cached URL if already downloaded', async () => {
      const cache = {
        msgId: '123',
        status: 'downloaded',
        ossUrl: 'https://oss.com/cached.png'
      }
      mockDb.findEmojiCacheByMsgId.mockResolvedValue(cache)

      const result = await emojiService.downloadEmoji('123')

      expect(result).toBe('https://oss.com/cached.png')
      expect(mockAdapter.downloadEmoji).not.toHaveBeenCalled()
    })

    it('should handle download failure', async () => {
      const cache = {
        msgId: '123',
        aesKey: 'test',
        cdnUrl: 'http://test.com',
        status: 'pending'
      }
      mockDb.findEmojiCacheByMsgId.mockResolvedValue(cache)
      mockAdapter.downloadEmoji.mockRejectedValue(new Error('Download failed'))

      const result = await emojiService.downloadEmoji('123')

      expect(result).toBeNull()
      expect(mockDb.updateEmojiCache).toHaveBeenCalledWith('123', {
        status: 'failed',
        errorMessage: 'Download failed'
      })
    })
  })

  describe('getEmojiUrl', () => {
    it('should return OSS URL if downloaded', async () => {
      mockDb.findEmojiCacheByMsgId.mockResolvedValue({
        status: 'downloaded',
        ossUrl: 'https://oss.com/emoji.png'
      })

      const result = await emojiService.getEmojiUrl('123')

      expect(result).toBe('https://oss.com/emoji.png')
    })

    it('should return null if not downloaded', async () => {
      mockDb.findEmojiCacheByMsgId.mockResolvedValue({
        status: 'pending'
      })

      const result = await emojiService.getEmojiUrl('123')

      expect(result).toBeNull()
    })

    it('should return null if cache not found', async () => {
      mockDb.findEmojiCacheByMsgId.mockResolvedValue(null)

      const result = await emojiService.getEmojiUrl('123')

      expect(result).toBeNull()
    })
  })
})
