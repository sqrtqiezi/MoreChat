// ABOUTME: 封装阿里云 OSS 图片上传功能
// ABOUTME: 提供 uploadImage 方法上传图片并返回 URL

import OSS from 'ali-oss'

export interface OssConfig {
  region: string
  bucket: string
  accessKeyId: string
  accessKeySecret: string
  endpoint: string
}

export class OssService {
  private client: OSS

  constructor(config: OssConfig) {
    this.client = new OSS({
      region: config.region,
      bucket: config.bucket,
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
      endpoint: config.endpoint,
    })
  }

  async uploadImage(buffer: Buffer, filename: string): Promise<string> {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8)
    const ext = filename.split('.').pop()
    const objectName = `images/${timestamp}_${random}.${ext}`

    const result = await this.client.put(objectName, buffer)
    return result.url
  }

  async uploadFile(buffer: Buffer, filename: string, ext: string): Promise<string> {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8)
    const safeFilename = filename.replace(/[^a-zA-Z0-9._\u4e00-\u9fff-]/g, '_')
    const objectName = `files/${timestamp}_${random}_${safeFilename}.${ext}`

    const result = await this.client.put(objectName, buffer)
    return result.url
  }
}
