// ABOUTME: 测试 OssService 的图片上传功能
// ABOUTME: 使用 mock 验证 OSS 客户端调用

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OssService } from './ossService.js'

vi.mock('ali-oss')

describe('OssService', () => {
  let service: OssService
  let mockPut: any

  beforeEach(async () => {
    mockPut = vi.fn().mockResolvedValue({ url: 'https://oss.example.com/images/test.jpg' })
    const OSS = (await import('ali-oss')).default as any
    OSS.mockImplementation(function(this: any) {
      return { put: mockPut }
    })

    service = new OssService({
      region: 'oss-cn-hangzhou',
      bucket: 'test-bucket',
      accessKeyId: 'test-key',
      accessKeySecret: 'test-secret',
      endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
    })
  })

  it('should upload image and return URL', async () => {
    const buffer = Buffer.from('test')
    const url = await service.uploadImage(buffer, 'test.jpg')

    expect(url).toBe('https://oss.example.com/images/test.jpg')
    expect(mockPut).toHaveBeenCalledWith(
      expect.stringMatching(/^images\/\d+_[a-z0-9]+\.jpg$/),
      buffer
    )
  })
})
