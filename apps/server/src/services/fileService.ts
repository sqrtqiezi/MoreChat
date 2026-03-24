import type { DatabaseService } from './database.js'
import type { JuhexbotAdapter } from './juhexbotAdapter.js'
import { CDN_FILE_TYPE } from './juhexbotAdapter.js'
import type { OssService } from './ossService.js'
import { parseFileXml } from './messageContentProcessor.js'
import { logger } from '../lib/logger.js'

export interface FileUrlResult {
  ossUrl: string
  fileName: string
  fileExt: string
  fileSize: number
}

export class FileService {
  constructor(
    private db: DatabaseService,
    private adapter: JuhexbotAdapter,
    private ossService: OssService
  ) {}

  async processFileMessage(msgId: string, content: string): Promise<void> {
    const fileInfo = parseFileXml(content)
    if (!fileInfo) {
      logger.warn({ msgId }, 'Failed to parse file XML')
      return
    }

    const existing = await this.db.findFileCacheByMsgId(msgId)
    if (existing) {
      return
    }

    await this.db.createFileCache({
      msgId,
      fileName: fileInfo.fileName,
      fileExt: fileInfo.fileExt,
      fileSize: fileInfo.fileSize,
      aesKey: fileInfo.aesKey,
      cdnFileId: fileInfo.cdnFileId,
      md5: fileInfo.md5,
    })
  }

  async getFileUrl(msgId: string): Promise<FileUrlResult> {
    const cache = await this.db.findFileCacheByMsgId(msgId)
    if (!cache) {
      throw new Error('File not found')
    }

    if (cache.status === 'downloaded' && cache.ossUrl) {
      return {
        ossUrl: cache.ossUrl,
        fileName: cache.fileName,
        fileExt: cache.fileExt,
        fileSize: cache.fileSize,
      }
    }

    try {
      await this.db.updateFileCache(msgId, { status: 'downloading' })

      const tempUrl = await this.adapter.downloadImage(
        cache.aesKey,
        cache.cdnFileId,
        `${cache.fileName}.${cache.fileExt}`,
        CDN_FILE_TYPE.ATTACHMENT
      )

      const response = await fetch(tempUrl)
      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.statusText}`)
      }
      const buffer = Buffer.from(await response.arrayBuffer())

      const ossUrl = await this.ossService.uploadFile(
        buffer,
        cache.fileName,
        cache.fileExt
      )

      await this.db.updateFileCache(msgId, {
        status: 'downloaded',
        ossUrl,
        downloadedAt: new Date(),
      })

      return {
        ossUrl,
        fileName: cache.fileName,
        fileExt: cache.fileExt,
        fileSize: cache.fileSize,
      }
    } catch (error: any) {
      logger.error({ msgId, err: error }, 'Failed to download file')
      await this.db.updateFileCache(msgId, {
        status: 'failed',
        errorMessage: error.message,
      })
      throw error
    }
  }
}
