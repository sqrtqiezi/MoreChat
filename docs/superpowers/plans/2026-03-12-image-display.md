# 图片消息显示功能实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 MoreChat 添加图片消息的按需下载与显示功能

**Architecture:** 用户点击图片占位符 → 后端调用微信 Cloud API 获取永久下载 URL → 缓存在 ImageCache 表 → 前端渲染图片。归档时将已下载的 URL 写入 Parquet。

**Tech Stack:** Prisma (SQLite), Hono, React, TanStack Query, fast-xml-parser

---

## Chunk 1: 前置验证与环境配置

### Task 1: 验证图片消息 XML 格式

**Files:**
- Read: DataLake 中的真实图片消息数据

- [ ] **Step 1: 从服务器查找图片消息样本**

```bash
# SSH 到服务器
ssh diting-server

# 查找 msgType=3 的图片消息
cd /path/to/data-lake/hot
grep -r '"msg_type":3' . | head -5
```

Expected: 找到至少一条图片消息的 JSONL 记录

- [ ] **Step 2: 提取并验证 XML 格式**

从找到的记录中提取 `content` 字段，确认格式为：
```xml
<?xml version="1.0"?>
<msg>
    <img aeskey="..." cdnmidimgurl="..." encryver="1" md5="..." length="..."/>
</msg>
```

Expected: XML 包含 `aeskey` 和 `cdnmidimgurl` 属性，`encryver="1"`

- [ ] **Step 3: 记录验证结果**

在 spec 文档中标记前置条件已完成，或如果格式不符，停止并报告差异。

---

### Task 2: 添加环境变量配置

**Files:**
- Modify: `apps/server/src/lib/env.ts:12-77`

- [ ] **Step 1: 扩展 EnvConfig 接口**

在 `apps/server/src/lib/env.ts` 的 `EnvConfig` 接口中添加：

```typescript
interface EnvConfig {
  DATABASE_URL: string
  DATA_LAKE_TYPE: 'filesystem' | 's3' | 'minio'
  DATA_LAKE_PATH: string
  PORT: string
  NODE_ENV: 'development' | 'production' | 'test'
  JUHEXBOT_API_URL: string
  JUHEXBOT_APP_KEY: string
  JUHEXBOT_APP_SECRET: string
  JUHEXBOT_CLIENT_GUID: string
  JUHEXBOT_CLOUD_API_URL: string  // 新增
  WEBHOOK_URL?: string
  LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error'
  AUTH_PASSWORD_HASH: string
  AUTH_JWT_SECRET: string
  CORS_ORIGIN?: string
}
```

- [ ] **Step 2: 添加到必填列表**

在 `loadEnv()` 函数的 `required` 数组中添加：

```typescript
const required = [
  'DATABASE_URL',
  'DATA_LAKE_TYPE',
  'DATA_LAKE_PATH',
  'PORT',
  'NODE_ENV',
  'JUHEXBOT_API_URL',
  'JUHEXBOT_APP_KEY',
  'JUHEXBOT_APP_SECRET',
  'JUHEXBOT_CLIENT_GUID',
  'JUHEXBOT_CLOUD_API_URL',  // 新增
  'AUTH_PASSWORD_HASH',
  'AUTH_JWT_SECRET'
]
```

- [ ] **Step 3: 添加到返回对象**

在 `loadEnv()` 的返回对象中添加：

```typescript
return {
  DATABASE_URL: process.env.DATABASE_URL!,
  DATA_LAKE_TYPE: dataLakeType as 'filesystem' | 's3' | 'minio',
  DATA_LAKE_PATH: process.env.DATA_LAKE_PATH!,
  PORT: process.env.PORT!,
  NODE_ENV: nodeEnv as 'development' | 'production' | 'test',
  JUHEXBOT_API_URL: process.env.JUHEXBOT_API_URL!,
  JUHEXBOT_APP_KEY: process.env.JUHEXBOT_APP_KEY!,
  JUHEXBOT_APP_SECRET: process.env.JUHEXBOT_APP_SECRET!,
  JUHEXBOT_CLIENT_GUID: process.env.JUHEXBOT_CLIENT_GUID!,
  JUHEXBOT_CLOUD_API_URL: process.env.JUHEXBOT_CLOUD_API_URL!,  // 新增
  WEBHOOK_URL: process.env.WEBHOOK_URL,
  LOG_LEVEL: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
  AUTH_PASSWORD_HASH: process.env.AUTH_PASSWORD_HASH!,
  AUTH_JWT_SECRET: process.env.AUTH_JWT_SECRET!,
  CORS_ORIGIN: process.env.CORS_ORIGIN
}
```

- [ ] **Step 4: 更新本地 .env 文件**

在 `apps/server/.env` 中添加（注意：.env 文件不提交到 git）：

```
JUHEXBOT_CLOUD_API_URL=http://101.132.162.209:35789
```

- [ ] **Step 5: 验证环境变量加载**

```bash
cd apps/server
npm run dev
```

Expected: 服务启动成功，无环境变量缺失错误

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/lib/env.ts
git commit -m "feat(server): add JUHEXBOT_CLOUD_API_URL env variable

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 2: 数据库与 XML 解析

### Task 3: 创建 ImageCache 表

**Files:**
- Modify: `apps/server/prisma/schema.prisma:145` (文件末尾)
- Create: `apps/server/prisma/migrations/YYYYMMDDHHMMSS_add_image_cache/migration.sql`

- [ ] **Step 1: 添加 Prisma model**

在 `apps/server/prisma/schema.prisma` 末尾添加：

```prisma
// 图片缓存
model ImageCache {
  msgId        String   @id @map("msg_id")
  aesKey       String   @map("aes_key")
  cdnFileId    String   @map("cdn_file_id")
  downloadUrl  String?  @map("download_url")
  createdAt    DateTime @default(now()) @map("created_at")
  downloadedAt DateTime? @map("downloaded_at")

  @@map("image_cache")
}
```

- [ ] **Step 2: 生成 migration**

```bash
cd apps/server
npx prisma migrate dev --name add_image_cache
```

Expected: Migration 文件生成，数据库更新成功

- [ ] **Step 3: 验证表创建**

```bash
npx prisma studio
```

Expected: 在 Prisma Studio 中看到 `image_cache` 表

- [ ] **Step 4: Commit**

```bash
git add apps/server/prisma/schema.prisma apps/server/prisma/migrations/
git commit -m "feat(server): add ImageCache table for image URL caching

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: 实现图片 XML 解析

**Files:**
- Modify: `apps/server/src/services/messageContentProcessor.ts:82` (文件末尾)
- Create: `apps/server/src/services/messageContentProcessor.test.ts`

- [ ] **Step 1: 编写解析函数的失败测试**

创建 `apps/server/src/services/messageContentProcessor.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseImageXml } from './messageContentProcessor.js'

describe('parseImageXml', () => {
  it('should parse valid encrypted image XML', () => {
    const xml = `<?xml version="1.0"?>
<msg>
    <img aeskey="test_aes_key_123" cdnmidimgurl="test_cdn_url_456" encryver="1" md5="abc123" length="12345"/>
</msg>`

    const result = parseImageXml(xml)

    expect(result).toEqual({
      aesKey: 'test_aes_key_123',
      fileId: 'test_cdn_url_456'
    })
  })

  it('should return null for non-encryver-1 images', () => {
    const xml = `<?xml version="1.0"?>
<msg>
    <img aeskey="key" cdnmidimgurl="url" encryver="0"/>
</msg>`

    expect(parseImageXml(xml)).toBeNull()
  })

  it('should return null for invalid XML', () => {
    expect(parseImageXml('not xml')).toBeNull()
    expect(parseImageXml('')).toBeNull()
  })

  it('should return null for missing required fields', () => {
    const xml = `<?xml version="1.0"?>
<msg>
    <img encryver="1"/>
</msg>`

    expect(parseImageXml(xml)).toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd apps/server
npx vitest run src/services/messageContentProcessor.test.ts
```

Expected: FAIL - `parseImageXml is not defined`

- [ ] **Step 3: 实现 parseImageXml 函数**

在 `apps/server/src/services/messageContentProcessor.ts` 末尾添加：

```typescript
export interface ImageInfo {
  aesKey: string
  fileId: string
}

export function parseImageXml(content: string): ImageInfo | null {
  if (!content || !content.trim()) {
    return null
  }

  const parsed = parseXml(content)
  if (!parsed) {
    return null
  }

  const img = parsed?.msg?.img
  if (!img) {
    return null
  }

  // 仅处理 encryver="1" 的加密图片
  const encryver = img['@_encryver']
  if (encryver !== '1') {
    return null
  }

  const aesKey = img['@_aeskey']
  const cdnMidImgUrl = img['@_cdnmidimgurl']

  if (!aesKey || !cdnMidImgUrl) {
    return null
  }

  return {
    aesKey: String(aesKey),
    fileId: String(cdnMidImgUrl)
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run src/services/messageContentProcessor.test.ts
```

Expected: PASS - all tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/messageContentProcessor.ts apps/server/src/services/messageContentProcessor.test.ts
git commit -m "feat(server): add parseImageXml function with tests

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 3: JuhexbotAdapter Cloud API 集成

### Task 5: 扩展 JuhexbotAdapter 配置

**Files:**
- Modify: `apps/server/src/services/juhexbotAdapter.ts:3-9`

- [ ] **Step 1: 扩展 JuhexbotConfig 接口**

在 `apps/server/src/services/juhexbotAdapter.ts` 中修改 `JuhexbotConfig`:

```typescript
export interface JuhexbotConfig {
  apiUrl: string
  appKey: string
  appSecret: string
  clientGuid: string
  clientUsername?: string
  cloudApiUrl: string  // 新增
}
```

- [ ] **Step 2: 在构造函数中存储 cloudApiUrl**

修改 `JuhexbotAdapter` 类：

```typescript
export class JuhexbotAdapter {
  private config: JuhexbotConfig

  constructor(config: JuhexbotConfig) {
    this.config = config
  }
  // ... rest
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/services/juhexbotAdapter.ts
git commit -m "feat(server): add cloudApiUrl to JuhexbotConfig

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 6: 实现 getCdnInfo 方法

**Files:**
- Modify: `apps/server/src/services/juhexbotAdapter.ts:274` (在 getProfile 方法后)
- Modify: `apps/server/src/services/juhexbotAdapter.test.ts`

- [ ] **Step 1: 编写 getCdnInfo 的失败测试**

在 `apps/server/src/services/juhexbotAdapter.test.ts` 中添加：

```typescript
describe('getCdnInfo', () => {
  it('should call /cloud/get_cdn_info and return CDN info', async () => {
    const mockResponse = {
      errcode: 0,
      errmsg: '',
      data: {
        cdn_info: 'mock_cdn_info_string',
        client_version: 123456,
        device_type: 'mock_device',
        username: 'mock_username'
      }
    }

    global.fetch = vi.fn().mockResolvedValue({
      json: async () => mockResponse,
      status: 200
    })

    const adapter = new JuhexbotAdapter({
      apiUrl: 'http://test.com',
      appKey: 'key',
      appSecret: 'secret',
      clientGuid: 'guid123',
      cloudApiUrl: 'http://cloud.test.com'
    })

    const result = await adapter.getCdnInfo()

    expect(result).toEqual({
      cdn_info: 'mock_cdn_info_string',
      client_version: 123456,
      device_type: 'mock_device',
      username: 'mock_username'
    })
  })

  it('should throw error when API returns error', async () => {
    const mockResponse = {
      errcode: 500,
      errmsg: 'CDN info error'
    }

    global.fetch = vi.fn().mockResolvedValue({
      json: async () => mockResponse,
      status: 200
    })

    const adapter = new JuhexbotAdapter({
      apiUrl: 'http://test.com',
      appKey: 'key',
      appSecret: 'secret',
      clientGuid: 'guid123',
      cloudApiUrl: 'http://cloud.test.com'
    })

    await expect(adapter.getCdnInfo()).rejects.toThrow('CDN info error')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd apps/server
npx vitest run src/services/juhexbotAdapter.test.ts
```

Expected: FAIL - `getCdnInfo is not a function`

- [ ] **Step 3: 实现 getCdnInfo 方法**

在 `apps/server/src/services/juhexbotAdapter.ts` 的 `getProfile` 方法后添加：

```typescript
async getCdnInfo(): Promise<{
  cdn_info: string
  client_version: number
  device_type: string
  username: string
}> {
  const result = await this.sendRequest('/cloud/get_cdn_info', {
    guid: this.config.clientGuid
  })

  if (result.errcode !== 0) {
    throw new Error(result.errmsg || 'Failed to get CDN info')
  }

  return {
    cdn_info: result.data.cdn_info,
    client_version: result.data.client_version,
    device_type: result.data.device_type,
    username: result.data.username
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run src/services/juhexbotAdapter.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/juhexbotAdapter.ts apps/server/src/services/juhexbotAdapter.test.ts
git commit -m "feat(server): implement getCdnInfo method with tests

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7: 实现 downloadImage 方法

**Files:**
- Modify: `apps/server/src/services/juhexbotAdapter.ts` (在 getCdnInfo 后)
- Modify: `apps/server/src/services/juhexbotAdapter.test.ts`

- [ ] **Step 1: 编写 downloadImage 的失败测试**

在 `apps/server/src/services/juhexbotAdapter.test.ts` 中添加：

```typescript
describe('downloadImage', () => {
  it('should call cloud API and return download URL', async () => {
    const mockCdnInfo = {
      cdn_info: 'cdn_info_str',
      client_version: 123,
      device_type: 'device',
      username: 'user'
    }

    const mockDownloadResponse = {
      errcode: 0,
      data: {
        url: 'https://download.url/image.jpg'
      }
    }

    let fetchCallCount = 0
    global.fetch = vi.fn().mockImplementation(async (url) => {
      fetchCallCount++
      if (fetchCallCount === 1) {
        // First call: getCdnInfo via gateway
        return {
          json: async () => ({ errcode: 0, data: mockCdnInfo }),
          status: 200
        }
      } else {
        // Second call: cloud download
        return {
          json: async () => mockDownloadResponse,
          status: 200
        }
      }
    })

    const adapter = new JuhexbotAdapter({
      apiUrl: 'http://test.com',
      appKey: 'key',
      appSecret: 'secret',
      clientGuid: 'guid123',
      cloudApiUrl: 'http://cloud.test.com'
    })

    const result = await adapter.downloadImage('aes_key_123', 'file_id_456', 'test.jpg')

    expect(result).toBe('https://download.url/image.jpg')
    expect(fetchCallCount).toBe(2)
  })

  it('should throw error when cloud API returns error', async () => {
    const mockCdnInfo = {
      cdn_info: 'cdn_info_str',
      client_version: 123,
      device_type: 'device',
      username: 'user'
    }

    let fetchCallCount = 0
    global.fetch = vi.fn().mockImplementation(async () => {
      fetchCallCount++
      if (fetchCallCount === 1) {
        return {
          json: async () => ({ errcode: 0, data: mockCdnInfo }),
          status: 200
        }
      } else {
        return {
          json: async () => ({ errcode: 500, errmsg: 'Download failed' }),
          status: 200
        }
      }
    })

    const adapter = new JuhexbotAdapter({
      apiUrl: 'http://test.com',
      appKey: 'key',
      appSecret: 'secret',
      clientGuid: 'guid123',
      cloudApiUrl: 'http://cloud.test.com'
    })

    await expect(adapter.downloadImage('aes', 'file', 'test.jpg')).rejects.toThrow()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run src/services/juhexbotAdapter.test.ts
```

Expected: FAIL - `downloadImage is not a function`

- [ ] **Step 3: 实现 downloadImage 方法**

在 `apps/server/src/services/juhexbotAdapter.ts` 的 `getCdnInfo` 方法后添加：

```typescript
async downloadImage(aesKey: string, fileId: string, fileName: string): Promise<string> {
  // 1. 获取 CDN 信息
  const cdnInfo = await this.getCdnInfo()

  // 2. 构造 base_request
  const baseRequest = {
    cdn_info: cdnInfo.cdn_info,
    client_version: cdnInfo.client_version,
    device_type: cdnInfo.device_type,
    username: cdnInfo.username
  }

  // 3. 直接 POST 到 cloud API（不走网关）
  const cloudUrl = `${this.config.cloudApiUrl}/cloud/download`
  const requestBody = {
    base_request: baseRequest,
    aes_key: aesKey,
    file_id: fileId,
    file_name: fileName,
    file_type: 1  // 图片类型
  }

  logger.info({ cloudUrl, fileName }, 'Calling cloud download API')

  const response = await fetch(cloudUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  })

  const result = await response.json() as any

  logger.info({ fileName, result }, 'Cloud download API response')

  if (result.errcode !== 0) {
    throw new Error(result.errmsg || `Cloud API error: ${result.errcode}`)
  }

  const downloadUrl = result.data?.url || result.data?.download_url
  if (!downloadUrl) {
    throw new Error('No download URL in cloud API response')
  }

  return downloadUrl
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run src/services/juhexbotAdapter.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/juhexbotAdapter.ts apps/server/src/services/juhexbotAdapter.test.ts
git commit -m "feat(server): implement downloadImage method with cloud API

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7.5: 更新 JuhexbotAdapter 初始化

**Files:**
- Modify: `apps/server/src/index.ts:40-45`

- [ ] **Step 1: 添加 cloudApiUrl 参数**

在 `apps/server/src/index.ts` 中修改 JuhexbotAdapter 的创建：

```typescript
const juhexbotAdapter = new JuhexbotAdapter({
  apiUrl: env.JUHEXBOT_API_URL,
  appKey: env.JUHEXBOT_APP_KEY,
  appSecret: env.JUHEXBOT_APP_SECRET,
  clientGuid: env.JUHEXBOT_CLIENT_GUID,
  cloudApiUrl: env.JUHEXBOT_CLOUD_API_URL  // 新增
})
```

- [ ] **Step 2: 验证服务启动**

```bash
cd apps/server
npm run dev
```

Expected: 服务启动成功，JuhexbotAdapter 正确初始化

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/index.ts
git commit -m "feat(server): add cloudApiUrl to JuhexbotAdapter initialization

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 4: ImageService 实现

### Task 8: 创建 ImageService

**Files:**
- Create: `apps/server/src/services/imageService.ts`
- Create: `apps/server/src/services/imageService.test.ts`

- [ ] **Step 1: 编写 ImageService 的失败测试**

创建 `apps/server/src/services/imageService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ImageService } from './imageService.js'
import type { PrismaClient } from '@prisma/client'
import type { DataLakeService } from './dataLake.js'
import type { JuhexbotAdapter } from './juhexbotAdapter.js'

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
    // No cache
    mockPrisma.imageCache.findUnique.mockResolvedValue(null)

    // DataLake returns message with XML
    mockDataLake.getMessage.mockResolvedValue({
      msg_id: 'msg123',
      msg_type: 3,
      content: '<?xml version="1.0"?><msg><img aeskey="aes123" cdnmidimgurl="cdn456" encryver="1"/></msg>'
    })

    // Adapter returns download URL
    mockAdapter.downloadImage.mockResolvedValue('https://new.url/image.jpg')

    const url = await service.getImageUrl('msg123')

    expect(url).toBe('https://new.url/image.jpg')
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
    mockDataLake.getMessage.mockResolvedValue(null)

    await expect(service.getImageUrl('msg123')).rejects.toThrow('Message not found')
  })

  it('should throw error if not image message', async () => {
    mockPrisma.imageCache.findUnique.mockResolvedValue(null)
    mockDataLake.getMessage.mockResolvedValue({
      msg_id: 'msg123',
      msg_type: 1,  // Text message
      content: 'Hello'
    })

    await expect(service.getImageUrl('msg123')).rejects.toThrow('Not an image message')
  })

  it('should throw error if XML parse fails', async () => {
    mockPrisma.imageCache.findUnique.mockResolvedValue(null)
    mockDataLake.getMessage.mockResolvedValue({
      msg_id: 'msg123',
      msg_type: 3,
      content: 'invalid xml'
    })

    await expect(service.getImageUrl('msg123')).rejects.toThrow('Failed to parse image XML')
  })

  it('should deduplicate concurrent requests', async () => {
    mockPrisma.imageCache.findUnique.mockResolvedValue(null)
    mockDataLake.getMessage.mockResolvedValue({
      msg_id: 'msg123',
      msg_type: 3,
      content: '<?xml version="1.0"?><msg><img aeskey="aes" cdnmidimgurl="cdn" encryver="1"/></msg>'
    })
    mockAdapter.downloadImage.mockResolvedValue('https://url.jpg')

    // Fire two concurrent requests
    const [url1, url2] = await Promise.all([
      service.getImageUrl('msg123'),
      service.getImageUrl('msg123')
    ])

    expect(url1).toBe('https://url.jpg')
    expect(url2).toBe('https://url.jpg')
    // downloadImage should only be called once
    expect(mockAdapter.downloadImage).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd apps/server
npx vitest run src/services/imageService.test.ts
```

Expected: FAIL - `Cannot find module './imageService.js'`

- [ ] **Step 3: 实现 ImageService**

创建 `apps/server/src/services/imageService.ts`:

```typescript
import type { PrismaClient } from '@prisma/client'
import type { DataLakeService } from './dataLake.js'
import type { JuhexbotAdapter } from './juhexbotAdapter.js'
import { parseImageXml } from './messageContentProcessor.js'
import { logger } from '../lib/logger.js'

export class ImageService {
  private prisma: PrismaClient
  private dataLake: DataLakeService
  private adapter: JuhexbotAdapter
  private pendingRequests: Map<string, Promise<string>>

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

  async getImageUrl(msgId: string): Promise<string> {
    // Check for pending request (deduplication)
    const pending = this.pendingRequests.get(msgId)
    if (pending) {
      logger.debug({ msgId }, 'Reusing pending image request')
      return pending
    }

    // Create new request promise
    const promise = this._getImageUrlInternal(msgId)
    this.pendingRequests.set(msgId, promise)

    try {
      const url = await promise
      return url
    } finally {
      this.pendingRequests.delete(msgId)
    }
  }

  private async _getImageUrlInternal(msgId: string): Promise<string> {
    // 1. Check cache
    const cached = await this.prisma.imageCache.findUnique({
      where: { msgId }
    })

    if (cached?.downloadUrl) {
      logger.debug({ msgId }, 'Image URL found in cache')
      return cached.downloadUrl
    }

    // 2. Read message from DataLake
    const message = await this.dataLake.getMessage(msgId)
    if (!message) {
      throw new Error('Message not found')
    }

    // 3. Verify it's an image message
    if (message.msg_type !== 3) {
      throw new Error('Not an image message')
    }

    // 4. Parse XML
    const imageInfo = parseImageXml(message.content)
    if (!imageInfo) {
      throw new Error('Failed to parse image XML or unsupported image format')
    }

    // 5. Create cache entry (without downloadUrl yet)
    if (!cached) {
      await this.prisma.imageCache.create({
        data: {
          msgId,
          aesKey: imageInfo.aesKey,
          cdnFileId: imageInfo.fileId
        }
      })
      logger.debug({ msgId }, 'Created image cache entry')
    }

    // 6. Download image URL from cloud API
    logger.info({ msgId, fileId: imageInfo.fileId }, 'Downloading image URL from cloud API')
    const downloadUrl = await this.adapter.downloadImage(
      imageInfo.aesKey,
      imageInfo.fileId,
      `${msgId}.jpg`
    )

    // 7. Update cache with downloadUrl
    await this.prisma.imageCache.update({
      where: { msgId },
      data: {
        downloadUrl,
        downloadedAt: new Date()
      }
    })

    logger.info({ msgId, downloadUrl }, 'Image URL downloaded and cached')
    return downloadUrl
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run src/services/imageService.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/imageService.ts apps/server/src/services/imageService.test.ts
git commit -m "feat(server): implement ImageService with caching and deduplication

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 9: 集成 ImageService 到应用

**Files:**
- Modify: `apps/server/src/index.ts:58` (在 messageService 创建后)
- Modify: `apps/server/src/app.ts:21-40` (AppDependencies 接口)

- [ ] **Step 1: 在 index.ts 中创建 ImageService**

在 `apps/server/src/index.ts` 的第 58 行后添加：

```typescript
const messageService = new MessageService(databaseService, dataLakeService, juhexbotAdapter, userProfile.username)

// 新增 ImageService
const imageService = new ImageService(
  databaseService.prisma,
  dataLakeService,
  juhexbotAdapter
)
```

- [ ] **Step 2: 将 ImageService 传入 createApp**

修改 `apps/server/src/index.ts` 的 `createApp` 调用（第 77 行）：

```typescript
const app = createApp({
  clientService,
  conversationService,
  messageService,
  imageService,  // 新增
  contactSyncService,
  juhexbotAdapter,
  get wsService() { return wsService },
  clientGuid: env.JUHEXBOT_CLIENT_GUID,
  userProfile: {
    username: userProfile.username,
    nickname: userProfile.nickname,
    avatar: userProfile.avatar
  },
  auth: {
    passwordHash: env.AUTH_PASSWORD_HASH,
    jwtSecret: env.AUTH_JWT_SECRET,
  },
  corsOrigin: env.CORS_ORIGIN,
  nodeEnv: env.NODE_ENV,
} as any)
```

- [ ] **Step 3: 扩展 AppDependencies 接口**

在 `apps/server/src/app.ts` 的 `AppDependencies` 接口中添加：

```typescript
export interface AppDependencies {
  clientService: ClientService
  conversationService: ConversationService
  messageService: MessageService
  imageService: ImageService  // 新增
  contactSyncService: ContactSyncService
  juhexbotAdapter: JuhexbotAdapter
  wsService: WebSocketService
  clientGuid: string
  userProfile: {
    username: string
    nickname: string
    avatar?: string
  }
  auth: {
    passwordHash: string
    jwtSecret: string
  }
  corsOrigin?: string
  nodeEnv?: string
}
```

- [ ] **Step 4: 添加 import**

在 `apps/server/src/index.ts` 顶部添加：

```typescript
import { ImageService } from './services/imageService.js'
```

在 `apps/server/src/app.ts` 顶部添加：

```typescript
import type { ImageService } from './services/imageService.js'
```

- [ ] **Step 5: 验证服务启动**

```bash
cd apps/server
npm run dev
```

Expected: 服务启动成功，无类型错误

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/index.ts apps/server/src/app.ts
git commit -m "feat(server): integrate ImageService into app dependencies

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 5: API 路由实现

### Task 10: 添加图片下载 API 路由

**Files:**
- Modify: `apps/server/src/routes/messages.ts:5-7,31` (扩展接口和添加路由)

- [ ] **Step 1: 扩展 MessageRouteDeps 接口**

在 `apps/server/src/routes/messages.ts` 中修改接口：

```typescript
import type { ImageService } from '../services/imageService.js'

interface MessageRouteDeps {
  messageService: MessageService
  imageService: ImageService  // 新增
}
```

- [ ] **Step 2: 添加 GET /:msgId/image 路由**

在 `apps/server/src/routes/messages.ts` 的 `router.post('/send', ...)` 后添加：

```typescript
// GET /api/messages/:msgId/image - 获取图片下载 URL
router.get('/:msgId/image', async (c) => {
  try {
    const msgId = c.req.param('msgId')

    if (!msgId) {
      return c.json({ success: false, error: { message: 'msgId is required' } }, 400)
    }

    const imageUrl = await deps.imageService.getImageUrl(msgId)
    return c.json({ success: true, data: { imageUrl } })
  } catch (error: any) {
    logger.error({ err: error, msgId: c.req.param('msgId') }, 'Failed to get image URL')

    // 根据错误类型返回不同状态码
    if (error.message === 'Message not found') {
      return c.json({ success: false, error: { message: 'Message not found' } }, 404)
    }

    if (error.message === 'Not an image message' || error.message.includes('parse')) {
      return c.json({ success: false, error: { message: 'Not an image message or unsupported format' } }, 422)
    }

    // Cloud API 错误
    if (error.message.includes('Cloud API') || error.message.includes('CDN')) {
      return c.json({ success: false, error: { message: 'Failed to download image from cloud service' } }, 502)
    }

    return c.json({ success: false, error: { message: 'Internal server error' } }, 500)
  }
})
```

- [ ] **Step 3: 更新 app.ts 中的路由挂载**

在 `apps/server/src/app.ts` 的第 106 行修改：

```typescript
app.route('/api/messages', messageRoutes({
  messageService: deps.messageService,
  imageService: deps.imageService  // 新增
}))
```

- [ ] **Step 4: 手动测试 API**

启动服务器，使用 curl 测试（需要先获取一个真实的图片消息 msgId）：

```bash
# 获取 JWT token
TOKEN=$(curl -X POST http://localhost:3100/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"your_password"}' | jq -r '.data.token')

# 测试图片 URL 获取
curl -X GET "http://localhost:3100/api/messages/msg_xxx/image" \
  -H "Authorization: Bearer $TOKEN"
```

Expected: 返回 `{ "success": true, "data": { "imageUrl": "https://..." } }`

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routes/messages.ts apps/server/src/app.ts
git commit -m "feat(server): add GET /api/messages/:msgId/image endpoint

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---


## Chunk 6: 归档修改

### Task 11: 修改 ArchiveService 支持图片 URL

**Files:**
- Modify: `apps/server/src/services/archiveService.ts:24-27,34-39,135-157`

- [ ] **Step 1: 添加 Prisma 依赖到 ArchiveConfig**

在 `apps/server/src/services/archiveService.ts` 中修改：

```typescript
import type { PrismaClient } from '@prisma/client'

export interface ArchiveConfig {
  lakePath: string
  hotRetentionDays?: number
  prisma: PrismaClient  // 新增
}
```

- [ ] **Step 2: 在构造函数中存储 prisma**

修改 `ArchiveService` 类：

```typescript
export class ArchiveService {
  private config: ArchiveConfig
  private prisma: PrismaClient  // 新增
  private dailyTimer?: NodeJS.Timeout
  private monthlyTimer?: NodeJS.Timeout

  constructor(config: ArchiveConfig) {
    this.config = {
      hotRetentionDays: 3,
      ...config
    }
    this.prisma = config.prisma  // 新增
  }
  // ... rest
}
```

- [ ] **Step 3: 扩展 MESSAGE_COLUMNS**

修改 `MESSAGE_COLUMNS` 常量：

```typescript
const MESSAGE_COLUMNS = [
  'msg_id', 'from_username', 'to_username', 'content', 'create_time',
  'msg_type', 'chatroom_sender', 'desc', 'is_chatroom_msg', 'chatroom', 'source',
  'image_url',  // 新增
] as const
```

- [ ] **Step 4: 修改 archiveHotToDaily 方法**

在 `archiveHotToDaily` 方法中，读取 JSONL 后、写入 Parquet 前，批量查询 ImageCache 并合并：

```typescript
private async archiveHotToDaily(date: string) {
  const hotDir = path.join(this.config.lakePath, 'hot')
  if (!existsSync(hotDir)) return

  const convDirs = await fs.readdir(hotDir, { withFileTypes: true })

  for (const convDir of convDirs) {
    if (!convDir.isDirectory()) continue

    const convId = convDir.name
    const hotFile = path.join(hotDir, convId, `${date}.jsonl`)
    if (!existsSync(hotFile)) continue

    const dailyFile = path.join(this.config.lakePath, 'daily', convId, `${date}.parquet`)
    await fs.mkdir(path.dirname(dailyFile), { recursive: true })

    const messages = await this.readJsonl(hotFile)
    if (messages.length === 0) continue

    // 新增：批量查询 ImageCache
    const msgIds = messages.map(m => String(m.msg_id))
    const imageCaches = await this.prisma.imageCache.findMany({
      where: {
        msgId: { in: msgIds },
        downloadUrl: { not: null }
      },
      select: {
        msgId: true,
        downloadUrl: true
      }
    })

    // 构建 msgId -> downloadUrl 映射
    const imageUrlMap = new Map(
      imageCaches.map(c => [c.msgId, c.downloadUrl!])
    )

    // 合并 image_url 到消息记录
    const messagesWithImageUrl = messages.map(m => ({
      ...m,
      image_url: imageUrlMap.get(String(m.msg_id)) || ''
    }))

    await this.writeParquet(dailyFile, messagesWithImageUrl)
    logger.debug({ convId, date, count: messages.length, imagesWithUrl: imageCaches.length }, 'Archived hot to daily')
  }
}
```

- [ ] **Step 5: 修改 writeParquet 方法支持 image_url 列**

在 `writeParquet` 方法中添加 `image_url` 列处理：

```typescript
private async writeParquet(filePath: string, messages: Record<string, unknown>[]) {
  const columnData = MESSAGE_COLUMNS.map(col => {
    const isNumeric = col === 'create_time' || col === 'msg_type' || col === 'is_chatroom_msg'
    return {
      name: col,
      data: messages.map(m => isNumeric ? BigInt(Number(m[col] ?? 0)) : String(m[col] ?? '')),
      type: isNumeric ? 'INT64' as const : 'STRING' as const,
    }
  })

  await parquetWriteFile({ filename: filePath, columnData })
}
```

- [ ] **Step 6: 更新 index.ts 中的 ArchiveService 创建**

在 `apps/server/src/index.ts` 的第 68 行修改：

```typescript
const archiveService = new ArchiveService({
  lakePath: env.DATA_LAKE_PATH,
  hotRetentionDays: 3,
  prisma: databaseService.prisma  // 新增
})
```

- [ ] **Step 7: 验证归档功能**

```bash
cd apps/server
npm run dev
```

在另一个终端触发手动归档测试：

```bash
# 通过 Node REPL 或测试脚本触发
node -e "
const { ArchiveService } = require('./dist/services/archiveService.js');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const service = new ArchiveService({ lakePath: './data/lake', prisma });
service.manualArchive().then(() => console.log('Done'));
"
```

Expected: 归档成功，Parquet 文件包含 `image_url` 列

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/services/archiveService.ts apps/server/src/index.ts
git commit -m "feat(server): archive image URLs to Parquet files

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 7: 前端实现

### Task 12: 添加前端 API 方法

**Files:**
- Modify: `apps/web/src/api/chat.ts:207` (文件末尾)

- [ ] **Step 1: 添加 getImageUrl 方法**

在 `apps/web/src/api/chat.ts` 的 `chatApi` 对象中添加：

```typescript
export const chatApi = {
  // ... existing methods

  // GET /api/messages/:msgId/image - 获取图片下载 URL
  async getImageUrl(msgId: string): Promise<string> {
    const response = await client.get<ApiResponse<{ imageUrl: string }>>(`/messages/${msgId}/image`)

    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error?.message || 'Failed to get image URL')
    }

    return response.data.data.imageUrl
  },
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/api/chat.ts
git commit -m "feat(web): add getImageUrl API method

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 13: 实现图片消息渲染组件

**Files:**
- Modify: `apps/web/src/components/chat/MessageItem.tsx:14-20`

- [ ] **Step 1: 添加图片渲染逻辑**

在 `MessageItem.tsx` 中修改 `renderContent` 函数：

```typescript
import { memo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { chatApi } from '../../api/chat';

// ... existing imports and interface

export const MessageItem = memo(function MessageItem({ message, isHighlighted }: MessageItemProps) {
  const { isMine, senderName, content, timestamp, status, displayType, id: msgId } = message;
  const [showImage, setShowImage] = useState(false);

  // TanStack Query for image URL
  const { data: imageUrl, isLoading: imageLoading, error: imageError, refetch } = useQuery({
    queryKey: ['image', msgId],
    queryFn: () => chatApi.getImageUrl(msgId),
    enabled: false,  // Manual trigger
    staleTime: Infinity,  // Cache forever (URL is permanent)
    retry: 1,
  });

  const renderContent = () => {
    if (!displayType || displayType === 'text') {
      return <span>{content}</span>;
    }

    // Image message
    if (displayType === 'image') {
      if (!showImage) {
        // Placeholder: clickable
        return (
          <button
            onClick={() => {
              setShowImage(true);
              refetch();
            }}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-sm">点击查看图片</span>
          </button>
        );
      }

      // Loading state
      if (imageLoading) {
        return (
          <div className="flex items-center gap-2 text-gray-500">
            <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-sm">加载中...</span>
          </div>
        );
      }

      // Error state
      if (imageError) {
        return (
          <div className="flex flex-col gap-2">
            <span className="text-sm text-red-500">图片加载失败</span>
            <button
              onClick={() => refetch()}
              className="text-sm text-blue-500 hover:text-blue-700 underline"
            >
              重试
            </button>
          </div>
        );
      }

      // Success: render image
      if (imageUrl) {
        return (
          <img
            src={imageUrl}
            alt="图片消息"
            className="max-w-[300px] rounded-lg"
            loading="lazy"
          />
        );
      }
    }

    // Non-text, non-image messages: gray italic style
    return <span className="text-gray-500 italic">{content}</span>;
  };

  // ... rest of component unchanged
});
```

- [ ] **Step 2: 验证前端渲染**

```bash
cd apps/web
npm run dev
```

在浏览器中：
1. 打开聊天窗口
2. 找到图片消息（显示"点击查看图片"）
3. 点击占位符
4. 确认显示加载状态 → 图片渲染

Expected: 图片正常显示，最大宽度 300px

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/chat/MessageItem.tsx
git commit -m "feat(web): implement image message rendering with on-demand loading

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 8: 部署配置与最终验证

### Task 14: 更新部署配置

**Files:**
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: 添加环境变量到 deploy.yml**

在 `.github/workflows/deploy.yml` 的第 80 行，在 `envs` 列表末尾添加 `JUHEXBOT_CLOUD_API_URL`：

```yaml
envs: DATABASE_URL,DATA_LAKE_TYPE,DATA_LAKE_PATH,PORT,NODE_ENV,CORS_ORIGIN,JUHEXBOT_API_URL,JUHEXBOT_APP_KEY,JUHEXBOT_APP_SECRET,JUHEXBOT_CLIENT_GUID,JUHEXBOT_CLOUD_API_URL,WEBHOOK_URL,LOG_LEVEL,AUTH_PASSWORD_HASH,AUTH_JWT_SECRET
```

在第 118 行后添加 export 语句：

```yaml
export AUTH_JWT_SECRET="${AUTH_JWT_SECRET}"
export JUHEXBOT_CLOUD_API_URL="${JUHEXBOT_CLOUD_API_URL}"  # 新增
bash init-env.sh
```

在第 168 行后添加 env 映射：

```yaml
AUTH_JWT_SECRET: ${{ secrets.ENV_AUTH_JWT_SECRET }}
JUHEXBOT_CLOUD_API_URL: ${{ secrets.ENV_JUHEXBOT_CLOUD_API_URL }}  # 新增
```

- [ ] **Step 2: 在 GitHub Secrets 中配置**

在 GitHub 仓库设置中添加 Secret:
- Name: `ENV_JUHEXBOT_CLOUD_API_URL`
- Value: `http://101.132.162.209:35789`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: add JUHEXBOT_CLOUD_API_URL to deployment config

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 15: 端到端测试

**Files:**
- None (manual testing)

- [ ] **Step 1: 本地完整流程测试**

1. 启动后端：`cd apps/server && npm run dev`
2. 启动前端：`cd apps/web && npm run dev`
3. 登录系统
4. 找到包含图片的会话
5. 点击图片占位符
6. 确认图片加载并显示

Expected: 完整流程无错误

- [ ] **Step 2: 验证缓存机制**

1. 点击同一张图片的占位符
2. 检查浏览器 Network 面板
3. 确认第二次点击没有发起新的 API 请求（TanStack Query 缓存生效）

Expected: 第二次点击直接显示图片，无网络请求

- [ ] **Step 3: 验证数据库缓存**

```bash
cd apps/server
npx prisma studio
```

打开 `image_cache` 表，确认：
- 有对应的记录
- `download_url` 字段已填充
- `downloaded_at` 有时间戳

Expected: 数据正确存储

- [ ] **Step 4: 验证归档功能**

触发手动归档，检查生成的 Parquet 文件是否包含 `image_url` 列：

```bash
# 使用 Python 或其他工具读取 Parquet
python3 -c "
import pyarrow.parquet as pq
table = pq.read_table('data/lake/daily/<conv_id>/<date>.parquet')
print(table.schema)
print(table.to_pandas()[['msg_id', 'image_url']].head())
"
```

Expected: Parquet 包含 `image_url` 列，已下载的图片有 URL

- [ ] **Step 5: 记录测试结果**

在 spec 文档或 commit message 中记录测试通过。

---

### Task 16: 创建 Pull Request

**Files:**
- None (Git operations)

- [ ] **Step 1: 推送分支**

```bash
git push origin HEAD
```

- [ ] **Step 2: 创建 PR**

使用 GitHub CLI 或 Web 界面创建 PR：

```bash
gh pr create --title "feat: 图片消息显示功能" \
  --body "实现图片消息的按需下载与显示功能

## 功能
- 用户点击图片占位符触发下载
- 后端调用微信 Cloud API 获取永久下载 URL
- ImageCache 表缓存 URL，避免重复请求
- 归档时将已下载的 URL 写入 Parquet

## 测试
- [x] 单元测试通过
- [x] 端到端测试通过
- [x] 缓存机制验证
- [x] 归档功能验证

Closes #<issue_number>
"
```

- [ ] **Step 3: 等待 Review**

通知团队成员 review PR。

---

## 完成

所有任务完成后，功能已实现并准备合并到主分支。

