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
      downloadUrl: 'https://cached.url/image.jpg',
      hasHd: true,
      cachedSize: 'mid'
    })

    const result = await service.getImageUrl('msg123')

    expect(result.imageUrl).toBe('https://cached.url/image.jpg')
    expect(result.hasHd).toBe(true)
    expect(mockPrisma.messageIndex.findUnique).not.toHaveBeenCalled()
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

    const result = await service.getImageUrl('msg123')

    expect(result.imageUrl).toBe('https://new.url/image.jpg')
    expect(result.hasHd).toBe(false)
    expect(mockDataLake.getMessage).toHaveBeenCalledWith('hot/conv_a/2026-03-12.jsonl:msg123')
    expect(mockPrisma.imageCache.create).toHaveBeenCalledWith({
      data: {
        msgId: 'msg123',
        aesKey: 'aes123',
        cdnFileId: 'cdn456',
        hasHd: false,
        cachedSize: null
      }
    })
    expect(mockPrisma.imageCache.update).toHaveBeenCalledWith({
      where: { msgId: 'msg123' },
      data: {
        downloadUrl: 'https://new.url/image.jpg',
        downloadedAt: expect.any(Date),
        hasHd: false,
        cachedSize: 'mid'
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

    const [result1, result2] = await Promise.all([
      service.getImageUrl('msg123'),
      service.getImageUrl('msg123')
    ])

    expect(result1.imageUrl).toBe('https://url.jpg')
    expect(result2.imageUrl).toBe('https://url.jpg')
    expect(mockAdapter.downloadImage).toHaveBeenCalledTimes(1)
  })

  it('should return hasHd flag from XML parsing', async () => {
    mockPrisma.imageCache.findUnique.mockResolvedValue(null)
    mockPrisma.messageIndex.findUnique.mockResolvedValue({
      dataLakeKey: 'hot/conv_a/2026-03-12.jsonl:msg123',
      msgType: 3
    })
    mockDataLake.getMessage.mockResolvedValue({
      msg_id: 'msg123',
      msg_type: 3,
      content: '<?xml version="1.0"?><msg><img aeskey="aes123" cdnmidimgurl="cdn456" encryver="1" hdlength="1024"/></msg>'
    })
    mockAdapter.downloadImage.mockResolvedValue('https://new.url/image.jpg')

    const result = await service.getImageUrl('msg123')

    expect(result).toEqual({
      imageUrl: 'https://new.url/image.jpg',
      hasHd: true
    })
  })

  it('should request HD image when size=hd', async () => {
    mockPrisma.imageCache.findUnique.mockResolvedValue(null)
    mockPrisma.messageIndex.findUnique.mockResolvedValue({
      dataLakeKey: 'hot/conv_a/2026-03-12.jsonl:msg123',
      msgType: 3
    })
    mockDataLake.getMessage.mockResolvedValue({
      msg_id: 'msg123',
      msg_type: 3,
      content: '<?xml version="1.0"?><msg><img aeskey="aes123" cdnmidimgurl="cdn456" encryver="1" hdlength="1024"/></msg>'
    })
    mockAdapter.downloadImage.mockResolvedValue('https://hd.url/image.jpg')

    const result = await service.getImageUrl('msg123', 'hd')

    expect(result.imageUrl).toBe('https://hd.url/image.jpg')
    expect(mockAdapter.downloadImage).toHaveBeenCalledWith(
      'aes123',
      'cdn456',
      'msg123.jpg',
      1
    )
  })

  it('should request mid image when size=mid', async () => {
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
    mockAdapter.downloadImage.mockResolvedValue('https://mid.url/image.jpg')

    const result = await service.getImageUrl('msg123', 'mid')

    expect(result.imageUrl).toBe('https://mid.url/image.jpg')
    expect(mockAdapter.downloadImage).toHaveBeenCalledWith(
      'aes123',
      'cdn456',
      'msg123.jpg',
      2
    )
  })

  it('should deduplicate concurrent requests with different sizes', async () => {
    mockPrisma.imageCache.findUnique.mockResolvedValue(null)
    mockPrisma.messageIndex.findUnique.mockResolvedValue({
      dataLakeKey: 'hot/conv_a/2026-03-12.jsonl:msg123',
      msgType: 3
    })
    mockDataLake.getMessage.mockResolvedValue({
      msg_id: 'msg123',
      msg_type: 3,
      content: '<?xml version="1.0"?><msg><img aeskey="aes" cdnmidimgurl="cdn" encryver="1" hdlength="1024"/></msg>'
    })
    mockAdapter.downloadImage
      .mockResolvedValueOnce('https://mid.url/image.jpg')
      .mockResolvedValueOnce('https://hd.url/image.jpg')

    const [midResult, hdResult] = await Promise.all([
      service.getImageUrl('msg123', 'mid'),
      service.getImageUrl('msg123', 'hd')
    ])

    expect(midResult.imageUrl).toBe('https://mid.url/image.jpg')
    expect(hdResult.imageUrl).toBe('https://hd.url/image.jpg')
    expect(mockAdapter.downloadImage).toHaveBeenCalledTimes(2)
    expect(mockAdapter.downloadImage).toHaveBeenNthCalledWith(1, 'aes', 'cdn', 'msg123.jpg', 2)
    expect(mockAdapter.downloadImage).toHaveBeenNthCalledWith(2, 'aes', 'cdn', 'msg123.jpg', 1)
  })

  it('should reuse HD cache for mid requests', async () => {
    mockPrisma.imageCache.findUnique.mockResolvedValue({
      msgId: 'msg123',
      downloadUrl: 'https://hd.url/image.jpg',
      hasHd: true,
      cachedSize: 'hd'
    })

    const result = await service.getImageUrl('msg123', 'mid')

    expect(result.imageUrl).toBe('https://hd.url/image.jpg')
    expect(result.hasHd).toBe(true)
    expect(mockPrisma.messageIndex.findUnique).not.toHaveBeenCalled()
    expect(mockAdapter.downloadImage).not.toHaveBeenCalled()
  })

  it('should reuse HD cache for HD requests', async () => {
    mockPrisma.imageCache.findUnique.mockResolvedValue({
      msgId: 'msg123',
      downloadUrl: 'https://hd.url/image.jpg',
      hasHd: true,
      cachedSize: 'hd'
    })

    const result = await service.getImageUrl('msg123', 'hd')

    expect(result.imageUrl).toBe('https://hd.url/image.jpg')
    expect(result.hasHd).toBe(true)
    expect(mockPrisma.messageIndex.findUnique).not.toHaveBeenCalled()
    expect(mockAdapter.downloadImage).not.toHaveBeenCalled()
  })

  it('should download HD when mid cache exists but HD is requested', async () => {
    mockPrisma.imageCache.findUnique.mockResolvedValue({
      msgId: 'msg123',
      aesKey: 'aes123',
      cdnFileId: 'cdn456',
      downloadUrl: 'https://mid.url/image.jpg',
      hasHd: true,
      cachedSize: 'mid'
    })
    mockPrisma.messageIndex.findUnique.mockResolvedValue({
      dataLakeKey: 'hot/conv_a/2026-03-12.jsonl:msg123',
      msgType: 3
    })
    mockDataLake.getMessage.mockResolvedValue({
      msg_id: 'msg123',
      msg_type: 3,
      content: '<?xml version="1.0"?><msg><img aeskey="aes123" cdnmidimgurl="cdn456" encryver="1" hdlength="1024"/></msg>'
    })
    mockAdapter.downloadImage.mockResolvedValue('https://hd.url/image.jpg')

    const result = await service.getImageUrl('msg123', 'hd')

    expect(result.imageUrl).toBe('https://hd.url/image.jpg')
    expect(mockAdapter.downloadImage).toHaveBeenCalledWith('aes123', 'cdn456', 'msg123.jpg', 1)
    expect(mockPrisma.imageCache.update).toHaveBeenCalledWith({
      where: { msgId: 'msg123' },
      data: {
        downloadUrl: 'https://hd.url/image.jpg',
        downloadedAt: expect.any(Date),
        hasHd: true,
        cachedSize: 'hd'
      }
    })
  })

  it('should update cache when mid request succeeds after HD request created cache entry', async () => {
    // 模拟场景：HD 请求创建了缓存条目但 downloadUrl 为 null（下载失败）
    // 然后 mid 请求成功下载，应该更新缓存
    mockPrisma.imageCache.findUnique.mockResolvedValue({
      msgId: 'msg123',
      aesKey: 'aes123',
      cdnFileId: 'cdn456',
      downloadUrl: null,
      hasHd: true,
      cachedSize: null
    })
    mockPrisma.messageIndex.findUnique.mockResolvedValue({
      dataLakeKey: 'hot/conv_a/2026-03-12.jsonl:msg123',
      msgType: 3
    })
    mockDataLake.getMessage.mockResolvedValue({
      msg_id: 'msg123',
      msg_type: 3,
      content: '<?xml version="1.0"?><msg><img aeskey="aes123" cdnmidimgurl="cdn456" encryver="1" hdlength="1024"/></msg>'
    })
    mockAdapter.downloadImage.mockResolvedValue('https://mid.url/image.jpg')

    const result = await service.getImageUrl('msg123', 'mid')

    expect(result.imageUrl).toBe('https://mid.url/image.jpg')
    expect(mockAdapter.downloadImage).toHaveBeenCalledWith('aes123', 'cdn456', 'msg123.jpg', 2)
    expect(mockPrisma.imageCache.update).toHaveBeenCalledWith({
      where: { msgId: 'msg123' },
      data: {
        downloadUrl: 'https://mid.url/image.jpg',
        downloadedAt: expect.any(Date),
        hasHd: true,
        cachedSize: 'mid'
      }
    })
  })

  it('should not update cache when mid request but HD cache already exists', async () => {
    // 模拟场景：HD 缓存已存在，mid 请求不应该降级缓存
    mockPrisma.imageCache.findUnique.mockResolvedValue({
      msgId: 'msg123',
      aesKey: 'aes123',
      cdnFileId: 'cdn456',
      downloadUrl: 'https://hd.url/image.jpg',
      hasHd: true,
      cachedSize: 'hd'
    })

    const result = await service.getImageUrl('msg123', 'mid')

    expect(result.imageUrl).toBe('https://hd.url/image.jpg')
    expect(mockAdapter.downloadImage).not.toHaveBeenCalled()
    expect(mockPrisma.imageCache.update).not.toHaveBeenCalled()
  })
})
