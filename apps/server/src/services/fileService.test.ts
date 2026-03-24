import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FileService } from './fileService.js'
import { CDN_FILE_TYPE } from './juhexbotAdapter.js'
import type { DatabaseService } from './database.js'
import type { JuhexbotAdapter } from './juhexbotAdapter.js'
import type { OssService } from './ossService.js'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('FileService', () => {
  let fileService: FileService
  let mockDb: any
  let mockAdapter: any
  let mockOss: any

  beforeEach(() => {
    mockDb = {
      createFileCache: vi.fn(),
      findFileCacheByMsgId: vi.fn(),
      updateFileCache: vi.fn()
    }
    mockAdapter = {
      downloadImage: vi.fn()
    }
    mockOss = {
      uploadFile: vi.fn()
    }
    fileService = new FileService(mockDb, mockAdapter, mockOss)
    vi.clearAllMocks()
  })

  describe('processFileMessage', () => {
    const validFileXml = `<?xml version="1.0"?>
<msg>
  <appmsg appid="wx6618f1cfc6c132f8" sdkver="0">
    <title>report.pdf</title>
    <type>6</type>
    <appattach>
      <totallen>448797</totallen>
      <fileext>pdf</fileext>
      <cdnattachurl>305702abc</cdnattachurl>
      <aeskey>de1ff3c9945e7d26f96b6a1432bb78ed</aeskey>
    </appattach>
    <md5>dcacefe202a72887a574ff53e98b95e6</md5>
  </appmsg>
</msg>`

    it('should create file cache record for valid file XML', async () => {
      mockDb.findFileCacheByMsgId.mockResolvedValue(null)

      await fileService.processFileMessage('msg123', validFileXml)

      expect(mockDb.createFileCache).toHaveBeenCalledWith({
        msgId: 'msg123',
        fileName: 'report.pdf',
        fileExt: 'pdf',
        fileSize: 448797,
        aesKey: 'de1ff3c9945e7d26f96b6a1432bb78ed',
        cdnFileId: '305702abc',
        md5: 'dcacefe202a72887a574ff53e98b95e6',
      })
    })

    it('should skip if cache already exists', async () => {
      mockDb.findFileCacheByMsgId.mockResolvedValue({ msgId: 'msg123' })

      await fileService.processFileMessage('msg123', validFileXml)

      expect(mockDb.createFileCache).not.toHaveBeenCalled()
    })

    it('should not create cache for invalid XML', async () => {
      await fileService.processFileMessage('msg123', '<invalid>')

      expect(mockDb.createFileCache).not.toHaveBeenCalled()
    })
  })

  describe('getFileUrl', () => {
    it('should return cached OSS URL if already downloaded', async () => {
      mockDb.findFileCacheByMsgId.mockResolvedValue({
        msgId: 'msg123',
        fileName: 'report.pdf',
        fileExt: 'pdf',
        fileSize: 448797,
        status: 'downloaded',
        ossUrl: 'https://oss.com/files/report.pdf',
      })

      const result = await fileService.getFileUrl('msg123')

      expect(result).toEqual({
        ossUrl: 'https://oss.com/files/report.pdf',
        fileName: 'report.pdf',
        fileExt: 'pdf',
        fileSize: 448797,
      })
      expect(mockAdapter.downloadImage).not.toHaveBeenCalled()
    })

    it('should download from CDN, upload to OSS, and cache', async () => {
      mockDb.findFileCacheByMsgId.mockResolvedValue({
        msgId: 'msg123',
        fileName: 'report.pdf',
        fileExt: 'pdf',
        fileSize: 448797,
        aesKey: 'aes123',
        cdnFileId: 'cdn456',
        status: 'pending',
        ossUrl: null,
      })
      mockAdapter.downloadImage.mockResolvedValue('https://cdn.temp/file.pdf')
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
      })
      mockOss.uploadFile.mockResolvedValue('https://oss.com/files/report.pdf')

      const result = await fileService.getFileUrl('msg123')

      expect(result.ossUrl).toBe('https://oss.com/files/report.pdf')
      expect(result.fileName).toBe('report.pdf')
      expect(mockAdapter.downloadImage).toHaveBeenCalledWith('aes123', 'cdn456', 'report.pdf.pdf', CDN_FILE_TYPE.ATTACHMENT)
      expect(mockDb.updateFileCache).toHaveBeenCalledWith('msg123', { status: 'downloading' })
      expect(mockDb.updateFileCache).toHaveBeenCalledWith('msg123', {
        status: 'downloaded',
        ossUrl: 'https://oss.com/files/report.pdf',
        downloadedAt: expect.any(Date),
      })
    })

    it('should throw and mark failed on download error', async () => {
      mockDb.findFileCacheByMsgId.mockResolvedValue({
        msgId: 'msg123',
        fileName: 'report.pdf',
        fileExt: 'pdf',
        fileSize: 100,
        aesKey: 'aes123',
        cdnFileId: 'cdn456',
        status: 'pending',
        ossUrl: null,
      })
      mockAdapter.downloadImage.mockRejectedValue(new Error('CDN error'))

      await expect(fileService.getFileUrl('msg123')).rejects.toThrow('CDN error')
      expect(mockDb.updateFileCache).toHaveBeenCalledWith('msg123', {
        status: 'failed',
        errorMessage: 'CDN error',
      })
    })

    it('should throw when file not found in cache', async () => {
      mockDb.findFileCacheByMsgId.mockResolvedValue(null)

      await expect(fileService.getFileUrl('msg123')).rejects.toThrow('File not found')
    })
  })
})
