// ABOUTME: ImageService 单元测试
// ABOUTME: 测试图片 URL 缓存查询、下载、去重等逻辑

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ImageService } from './imageService.js'

describe('ImageService', () => {
  let mockPrisma: any
  let mockDataLake: any
  let mockAdapter: any
  let service: ImageService

  beforeEach(() => {
    mockPrisma = {
      imageCache: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn()
      },
      messageIndex: {
        findUnique: vi.fn()
      }
    }

    mockDataLake = {
      getMessage: vi.fn()
    }

    mockAdapter = {
      downloadImage: vi.fn()
    }

    service = new ImageService(mockPrisma, mockDataLake, mockAdapter)
  })

  it('should return cached URL if exists', async () => {
    mockPrisma.imageCache.findUnique.mockResolvedValue({
      msgId: 'msg123',
      downloadUrl: 'https://cached.url/image.jpg'
    })

    const url = await service.getImageUrl('msg123')

    expect(url).toBe('https://cached.url/image.jpg')
    expect(mockDataLake.getMessage).not.toHaveBeenCalled()
  })

  it('should download and cache if not cached', async () => {
    mockPrisma.imageCache.findUnique.mockResolvedValue(null)
    mockPrisma.messageIndex.findUnique.mockResolvedValue({
      dataLakeKey: 'hot/conv_a/2026-03-12.jsonl:msg123',
      msgType: 3
    })
    mockDataLake.getMessage.mockResolvedValue({
      msg_id: 'msg123',
      msg_type: 3,
      content: '<?xml version="1.0"?><msg><img aeskey="aes123" cdnmidimgurl="cdn456" encryver="1"/></msg>'
    })
    mockAdapter.downloadImage.mockResolvedValue('https://new.url/image.jpg')

    const url = await service.getImageUrl('msg123')

    expect(url).toBe('https://new.url/image.jpg')
    expect(mockDataLake.getMessage).toHaveBeenCalledWith('hot/conv_a/2026-03-12.jsonl:msg123')
    expect(mockPrisma.imageCache.create).toHaveBeenCalledWith({
      data: {
        msgId: 'msg123',
        aesKey: 'aes123',
        cdnFileId: 'cdn456'
      }
    })
    expect(mockPrisma.imageCache.update).toHaveBeenCalledWith({
      where: { msgId: 'msg123' },
      data: {
        downloadUrl: 'https://new.url/image.jpg',
        downloadedAt: expect.any(Date)
      }
    })
  })

  it('should throw error if message not found', async () => {
    mockPrisma.imageCache.findUnique.mockResolvedValue(null)
    mockPrisma.messageIndex.findUnique.mockResolvedValue(null)

    await expect(service.getImageUrl('msg123')).rejects.toThrow('Message not found')
  })

  it('should throw error if not image message', async () => {
    mockPrisma.imageCache.findUnique.mockResolvedValue(null)
    mockPrisma.messageIndex.findUnique.mockResolvedValue({
      dataLakeKey: 'hot/conv_a/2026-03-12.jsonl:msg123',
      msgType: 1
    })

    await expect(service.getImageUrl('msg123')).rejects.toThrow('Not an image message')
  })

  it('should throw error if XML parse fails', async () => {
    mockPrisma.imageCache.findUnique.mockResolvedValue(null)
    mockPrisma.messageIndex.findUnique.mockResolvedValue({
      dataLakeKey: 'hot/conv_a/2026-03-12.jsonl:msg123',
      msgType: 3
    })
    mockDataLake.getMessage.mockResolvedValue({
      msg_id: 'msg123',
      msg_type: 3,
      content: 'invalid xml'
    })

    await expect(service.getImageUrl('msg123')).rejects.toThrow('Failed to parse image XML')
  })

  it('should deduplicate concurrent requests', async () => {
    mockPrisma.imageCache.findUnique.mockResolvedValue(null)
    mockPrisma.messageIndex.findUnique.mockResolvedValue({
      dataLakeKey: 'hot/conv_a/2026-03-12.jsonl:msg123',
      msgType: 3
    })
    mockDataLake.getMessage.mockResolvedValue({
      msg_id: 'msg123',
      msg_type: 3,
      content: '<?xml version="1.0"?><msg><img aeskey="aes" cdnmidimgurl="cdn" encryver="1"/></msg>'
    })
    mockAdapter.downloadImage.mockResolvedValue('https://url.jpg')

    const [url1, url2] = await Promise.all([
      service.getImageUrl('msg123'),
      service.getImageUrl('msg123')
    ])

    expect(url1).toBe('https://url.jpg')
    expect(url2).toBe('https://url.jpg')
    expect(mockAdapter.downloadImage).toHaveBeenCalledTimes(1)
  })
})
