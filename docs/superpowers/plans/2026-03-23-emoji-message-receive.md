# 表情消息接收功能实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现表情消息（msg_type: 47）的接收、异步下载和显示功能，用户能看到实际的表情图片。

**Architecture:** 采用占位符+异步下载的混合方案。接收表情消息时立即显示 `[表情]` 占位符，后台异步下载表情图片并上传到 OSS，下载完成后通过 WebSocket 推送更新通知，前端自动替换为实际图片。使用内存队列管理异步下载任务（并发数 3，最多重试 3 次）。

**Tech Stack:**
- 后端：Hono, Prisma, SQLite, Node.js fetch API
- 前端：React, TanStack Query, WebSocket
- 存储：阿里云 OSS
- 测试：Vitest

---

## 文件结构规划

### 后端新增文件
- `apps/server/src/services/emojiService.ts` - 表情下载和缓存管理服务
- `apps/server/src/services/emojiDownloadQueue.ts` - 异步下载任务队列
- `apps/server/src/services/emojiService.test.ts` - EmojiService 单元测试
- `apps/server/src/services/emojiDownloadQueue.test.ts` - EmojiDownloadQueue 单元测试

### 后端修改文件
- `apps/server/prisma/schema.prisma` - 添加 EmojiCache 表
- `apps/server/src/services/messageContentProcessor.ts` - 添加表情消息解析逻辑
- `apps/server/src/services/messageContentProcessor.test.ts` - 添加表情解析测试
- `apps/server/src/services/database.ts` - 添加 EmojiCache CRUD 方法
- `apps/server/src/services/juhexbotAdapter.ts` - 添加表情下载方法
- `apps/server/src/services/message.ts` - 集成表情消息处理
- `apps/server/src/services/websocket.ts` - 添加表情下载完成推送
- `apps/server/src/routes/messages.ts` - 添加获取表情 URL 的 API
- `apps/server/src/index.ts` - 初始化 EmojiService 和 EmojiDownloadQueue

### 前端新增文件
- `apps/web/src/components/EmojiMessage.tsx` - 表情消息显示组件
- `apps/web/src/components/EmojiMessage.module.css` - 表情消息样式

### 前端修改文件
- `packages/types/src/index.ts` - 添加 'emoji' DisplayType
- `apps/web/src/components/MessageItem.tsx` - 集成 EmojiMessage 组件
- `apps/web/src/hooks/useWebSocket.ts` - 添加 emoji_downloaded 事件监听

---

## Chunk 1: 数据库和类型定义

### Task 1: 添加 EmojiCache 数据库表

**Files:**
- Modify: `apps/server/prisma/schema.prisma`

- [ ] **Step 1: 添加 EmojiCache 模型定义**

在 `schema.prisma` 文件末尾添加：

```prisma
// 表情缓存
model EmojiCache {
  msgId        String    @id @map("msg_id")
  aesKey       String    @map("aes_key")
  cdnUrl       String    @map("cdn_url")
  encryptUrl   String?   @map("encrypt_url")
  md5          String?
  fileSize     Int?      @map("file_size")
  productId    String?   @map("product_id")
  ossUrl       String?   @map("oss_url")
  status       String    @default("pending")
  errorMessage String?   @map("error_message")
  createdAt    DateTime  @default(now()) @map("created_at")
  downloadedAt DateTime? @map("downloaded_at")

  @@map("emoji_cache")
  @@index([status])
}
```

- [ ] **Step 2: 生成 Prisma Client**

```bash
cd apps/server
npx prisma generate
```

Expected: "Generated Prisma Client"

- [ ] **Step 3: 创建数据库迁移**

```bash
cd apps/server
npx prisma migrate dev --name add_emoji_cache
```

Expected: Migration created successfully

- [ ] **Step 4: 提交**

```bash
git add apps/server/prisma/schema.prisma apps/server/prisma/migrations/
git commit -m "feat(db): add EmojiCache table for emoji message caching

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 扩展 DisplayType 类型定义

**Files:**
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: 添加 'emoji' 到 DisplayType**

找到 `DisplayType` 定义并添加 'emoji'：

```typescript
export type DisplayType = 'text' | 'image' | 'link' | 'video' | 'call' | 'recall' | 'quote' | 'emoji' | 'unknown'
```

- [ ] **Step 2: 提交**

```bash
git add packages/types/src/index.ts
git commit -m "feat(types): add emoji display type

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 2: 表情消息解析

### Task 3: 实现表情 XML 解析逻辑

**Files:**
- Modify: `apps/server/src/services/messageContentProcessor.ts`
- Modify: `apps/server/src/services/messageContentProcessor.test.ts`

- [ ] **Step 1: 编写表情解析测试**

在 `messageContentProcessor.test.ts` 文件顶部添加 import：

```typescript
import { parseEmojiXml, processMessageContent } from './messageContentProcessor.js'
```

然后在文件末尾添加测试：

```typescript
describe('parseEmojiXml', () => {
  it('should parse valid emoji XML', () => {
    const xml = `<msg><emoji aeskey="03ab8c3ec37706ed560587be5afa9d2f" cdnurl="http://wxapp.tc.qq.com/test" md5="c99f17060237ca21e7dce8d80d216e6d" len="73009" width="240" height="240" productid="com.tencent.xin.emoticon.test" encrypturl="http://wxapp.tc.qq.com/encrypt" /></msg>`

    const result = parseEmojiXml(xml)

    expect(result).toEqual({
      aesKey: '03ab8c3ec37706ed560587be5afa9d2f',
      cdnUrl: 'http://wxapp.tc.qq.com/test',
      encryptUrl: 'http://wxapp.tc.qq.com/encrypt',
      md5: 'c99f17060237ca21e7dce8d80d216e6d',
      fileSize: 73009,
      width: 240,
      height: 240,
      productId: 'com.tencent.xin.emoticon.test'
    })
  })

  it('should return null for invalid XML', () => {
    expect(parseEmojiXml('')).toBeNull()
    expect(parseEmojiXml('<msg></msg>')).toBeNull()
    expect(parseEmojiXml('<msg><emoji /></msg>')).toBeNull()
  })

  it('should handle missing optional fields', () => {
    const xml = `<msg><emoji aeskey="test" cdnurl="http://test.com" /></msg>`

    const result = parseEmojiXml(xml)

    expect(result).toEqual({
      aesKey: 'test',
      cdnUrl: 'http://test.com',
      encryptUrl: undefined,
      md5: undefined,
      fileSize: undefined,
      width: undefined,
      height: undefined,
      productId: undefined
    })
  })
})

describe('processType47', () => {
  it('should return emoji display type', () => {
    const result = processMessageContent(47, '<msg><emoji /></msg>')

    expect(result).toEqual({
      displayType: 'emoji',
      displayContent: '[表情]'
    })
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd apps/server
npx vitest run src/services/messageContentProcessor.test.ts
```

Expected: FAIL - parseEmojiXml is not defined

- [ ] **Step 3: 实现 parseEmojiXml 函数**

在 `messageContentProcessor.ts` 中添加接口和函数：

```typescript
export interface EmojiInfo {
  aesKey: string
  cdnUrl: string
  encryptUrl?: string
  md5?: string
  fileSize?: number
  width?: number
  height?: number
  productId?: string
}

export function parseEmojiXml(content: string): EmojiInfo | null {
  if (!content || !content.trim()) {
    return null
  }

  const parsed = parseXml(content)
  if (!parsed) {
    return null
  }

  const emoji = parsed?.msg?.emoji
  if (!emoji) {
    return null
  }

  const aesKey = emoji['@_aeskey']
  const cdnUrl = emoji['@_cdnurl']

  if (!aesKey || !cdnUrl) {
    return null
  }

  return {
    aesKey: String(aesKey).trim(),
    cdnUrl: String(cdnUrl).trim(),
    encryptUrl: emoji['@_encrypturl'] ? String(emoji['@_encrypturl']).trim() : undefined,
    md5: emoji['@_md5'] ? String(emoji['@_md5']).trim() : undefined,
    fileSize: emoji['@_len'] ? parseInt(emoji['@_len'], 10) : undefined,
    width: emoji['@_width'] ? parseInt(emoji['@_width'], 10) : undefined,
    height: emoji['@_height'] ? parseInt(emoji['@_height'], 10) : undefined,
    productId: emoji['@_productid'] ? String(emoji['@_productid']).trim() : undefined,
  }
}
```

- [ ] **Step 4: 实现 processType47 函数**

在 `processMessageContent` 函数的 switch 语句中添加 case 47：

```typescript
function processType47(content: string): ProcessedContent {
  return { displayType: 'emoji', displayContent: '[表情]' }
}

export function processMessageContent(msgType: number, content: string): ProcessedContent {
  const safeContent = content ?? ''
  switch (msgType) {
    case 1:
      return { displayType: 'text', displayContent: safeContent }
    case 3:
      return { displayType: 'image', displayContent: '[图片]' }
    case 47:
      return processType47(safeContent)
    case 49:
      return processType49(safeContent)
    case 51:
      return { displayType: 'call', displayContent: '[语音/视频通话]' }
    case 10002:
      return processType10002(safeContent)
    default:
      return { displayType: 'unknown', displayContent: '[不支持的消息类型]' }
  }
}
```

- [ ] **Step 5: 运行测试确认通过**

```bash
cd apps/server
npx vitest run src/services/messageContentProcessor.test.ts
```

Expected: PASS - all tests pass

- [ ] **Step 6: 提交**

```bash
git add apps/server/src/services/messageContentProcessor.ts apps/server/src/services/messageContentProcessor.test.ts
git commit -m "feat(message): add emoji XML parsing and type 47 processing

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 3: Database Service 扩展

### Task 4: 添加 EmojiCache CRUD 方法

**Files:**
- Modify: `apps/server/src/services/database.ts`

- [ ] **Step 1: 添加 createEmojiCache 方法**

在 `DatabaseService` 类中添加：

```typescript
async createEmojiCache(data: {
  msgId: string
  aesKey: string
  cdnUrl: string
  encryptUrl?: string
  md5?: string
  fileSize?: number
  productId?: string
  status: string
}) {
  return this.prisma.emojiCache.create({
    data: {
      msgId: data.msgId,
      aesKey: data.aesKey,
      cdnUrl: data.cdnUrl,
      encryptUrl: data.encryptUrl,
      md5: data.md5,
      fileSize: data.fileSize,
      productId: data.productId,
      status: data.status
    }
  })
}
```

- [ ] **Step 2: 添加 findEmojiCacheByMsgId 方法**

```typescript
async findEmojiCacheByMsgId(msgId: string) {
  return this.prisma.emojiCache.findUnique({
    where: { msgId }
  })
}
```

- [ ] **Step 3: 添加 updateEmojiCache 方法**

```typescript
async updateEmojiCache(msgId: string, data: {
  status?: string
  ossUrl?: string
  errorMessage?: string
  downloadedAt?: Date
}) {
  return this.prisma.emojiCache.update({
    where: { msgId },
    data
  })
}
```

- [ ] **Step 4: 提交**

```bash
git add apps/server/src/services/database.ts
git commit -m "feat(db): add EmojiCache CRUD methods to DatabaseService

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 4: EmojiService 实现

### Task 5: 实现 EmojiService

**Files:**
- Create: `apps/server/src/services/emojiService.ts`
- Create: `apps/server/src/services/emojiService.test.ts`

- [ ] **Step 1: 编写 EmojiService 测试**

创建 `apps/server/src/services/emojiService.test.ts`：

```typescript
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
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd apps/server
npx vitest run src/services/emojiService.test.ts
```

Expected: FAIL - EmojiService not found

- [ ] **Step 3: 实现 EmojiService**

创建 `apps/server/src/services/emojiService.ts`：

```typescript
import type { DatabaseService } from './database.js'
import type { JuhexbotAdapter } from './juhexbotAdapter.js'
import type { OssService } from './ossService.js'
import { parseEmojiXml } from './messageContentProcessor.js'
import { logger } from '../lib/logger.js'

export class EmojiService {
  constructor(
    private db: DatabaseService,
    private adapter: JuhexbotAdapter,
    private ossService: OssService
  ) {}

  /**
   * 解析表情消息并创建缓存记录
   */
  async processEmojiMessage(msgId: string, content: string): Promise<void> {
    const emojiInfo = parseEmojiXml(content)
    if (!emojiInfo) {
      logger.warn(`Failed to parse emoji XML for msgId: ${msgId}`)
      return
    }

    await this.db.createEmojiCache({
      msgId,
      aesKey: emojiInfo.aesKey,
      cdnUrl: emojiInfo.cdnUrl,
      encryptUrl: emojiInfo.encryptUrl,
      md5: emojiInfo.md5,
      fileSize: emojiInfo.fileSize,
      productId: emojiInfo.productId,
      status: 'pending'
    })
  }

  /**
   * 下载表情图片
   */
  async downloadEmoji(msgId: string): Promise<string | null> {
    const cache = await this.db.findEmojiCacheByMsgId(msgId)
    if (!cache) {
      logger.warn(`Emoji cache not found for msgId: ${msgId}`)
      return null
    }

    if (cache.status === 'downloaded' && cache.ossUrl) {
      return cache.ossUrl
    }

    try {
      await this.db.updateEmojiCache(msgId, { status: 'downloading' })

      const emojiBuffer = await this.adapter.downloadEmoji({
        cdnUrl: cache.cdnUrl,
        aesKey: cache.aesKey,
        encryptUrl: cache.encryptUrl
      })

      const filename = `emoji_${msgId}_${Date.now()}`
      const ossUrl = await this.ossService.uploadImage(emojiBuffer, filename)

      await this.db.updateEmojiCache(msgId, {
        status: 'downloaded',
        ossUrl,
        downloadedAt: new Date()
      })

      return ossUrl
    } catch (error: any) {
      logger.error(`Failed to download emoji for msgId: ${msgId}`, error)
      await this.db.updateEmojiCache(msgId, {
        status: 'failed',
        errorMessage: error.message
      })
      return null
    }
  }

  /**
   * 获取表情 URL
   */
  async getEmojiUrl(msgId: string): Promise<string | null> {
    const cache = await this.db.findEmojiCacheByMsgId(msgId)
    if (!cache) {
      return null
    }

    if (cache.status === 'downloaded' && cache.ossUrl) {
      return cache.ossUrl
    }

    return null
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd apps/server
npx vitest run src/services/emojiService.test.ts
```

Expected: PASS - all tests pass

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/services/emojiService.ts apps/server/src/services/emojiService.test.ts
git commit -m "feat(emoji): implement EmojiService for emoji download and caching

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---


## Chunk 5: JuhexbotAdapter 和 EmojiDownloadQueue

### Task 6: 扩展 JuhexbotAdapter 添加表情下载方法

**Files:**
- Modify: `apps/server/src/services/juhexbotAdapter.ts`

- [ ] **Step 1: 添加 downloadEmoji 方法**

在 `JuhexbotAdapter` 类中添加：

```typescript
/**
 * 下载表情图片
 * 策略：优先使用 cdnUrl 直接下载，失败则使用 encryptUrl + aesKey
 */
async downloadEmoji(params: {
  cdnUrl: string
  aesKey?: string
  encryptUrl?: string
}): Promise<Buffer> {
  // 策略 1：直接从 CDN 下载（未加密）
  try {
    const response = await fetch(params.cdnUrl)
    if (response.ok) {
      return Buffer.from(await response.arrayBuffer())
    }
  } catch (error) {
    logger.warn(`Failed to download emoji from cdnUrl: ${error}`)
  }

  // 策略 2：使用 juhexbot API 下载加密表情
  if (params.encryptUrl && params.aesKey) {
    try {
      const response = await fetch(`${this.config.cloudApiUrl}/cloud/download_wx_emotion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aes_key: params.aesKey,
          url: params.encryptUrl,
          base_request: {
            username: this.config.clientUsername || '',
            device_type: 'mac',
            client_version: 0,
            cdn_info: ''
          },
          file_name: `emoji_${Date.now()}`
        })
      })

      if (!response.ok) {
        throw new Error(`Failed to download emoji: ${response.statusText}`)
      }

      return Buffer.from(await response.arrayBuffer())
    } catch (error) {
      logger.error(`Failed to download emoji from encryptUrl: ${error}`)
      throw error
    }
  }

  throw new Error('No valid download URL available')
}
```

- [ ] **Step 2: 提交**

```bash
git add apps/server/src/services/juhexbotAdapter.ts
git commit -m "feat(juhexbot): add downloadEmoji method with dual download strategy

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 实现 EmojiDownloadQueue

**Files:**
- Create: `apps/server/src/services/emojiDownloadQueue.ts`
- Create: `apps/server/src/services/emojiDownloadQueue.test.ts`

- [ ] **Step 1: 编写 EmojiDownloadQueue 测试**

创建 `apps/server/src/services/emojiDownloadQueue.test.ts`：

```typescript
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

    // 等待队列处理
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
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd apps/server && npx vitest run src/services/emojiDownloadQueue.test.ts
```

Expected: FAIL - EmojiDownloadQueue not found

- [ ] **Step 3: 实现 EmojiDownloadQueue**

创建 `apps/server/src/services/emojiDownloadQueue.ts`：

```typescript
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

  /**
   * 添加下载任务到队列
   */
  enqueue(msgId: string, conversationId: string): void {
    this.queue.push({
      msgId,
      conversationId,
      retryCount: 0
    })

    this.process()
  }

  /**
   * 处理队列中的任务
   */
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

  /**
   * 处理单个任务
   */
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
      logger.error(`Error processing emoji download task: ${task.msgId}`, error)
    } finally {
      this.activeCount--
    }
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd apps/server && npx vitest run src/services/emojiDownloadQueue.test.ts
```

Expected: PASS - all tests pass

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/services/emojiDownloadQueue.ts apps/server/src/services/emojiDownloadQueue.test.ts
git commit -m "feat(emoji): implement EmojiDownloadQueue for async download management

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 6: MessageService 和 WebSocket 集成

### Task 8: 扩展 WebSocketService 添加表情下载推送

**Files:**
- Modify: `apps/server/src/services/websocket.ts`

- [ ] **Step 1: 添加 broadcastEmojiDownloaded 方法**

在 `WebSocketService` 类中添加：

```typescript
broadcastEmojiDownloaded(data: {
  msgId: string
  conversationId: string
  ossUrl: string
}): void {
  this.broadcast({
    type: 'emoji_downloaded',
    data
  })
}
```

- [ ] **Step 2: 提交**

```bash
git add apps/server/src/services/websocket.ts
git commit -m "feat(websocket): add emoji download completion broadcast

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: 集成表情消息处理到 MessageService

**Files:**
- Modify: `apps/server/src/services/message.ts`

- [ ] **Step 1: 更新构造函数添加依赖**

在 `MessageService` 构造函数中添加：

```typescript
constructor(
  private db: DatabaseService,
  private dataLake: DataLakeService,
  private adapter: JuhexbotAdapter,
  private clientUsername: string,
  private ossService: OssService,
  private emojiService: EmojiService,
  private emojiQueue: EmojiDownloadQueue
) {}
```

- [ ] **Step 2: 在 handleIncomingMessage 中添加表情处理**

在 `handleIncomingMessage` 方法中，更新会话最后消息时间之后添加：

```typescript
// 处理表情消息
if (message.msgType === 47) {
  await this.emojiService.processEmojiMessage(message.msgId, message.content)
  this.emojiQueue.enqueue(message.msgId, conversation.id)
}
```

- [ ] **Step 3: 提交**

```bash
git add apps/server/src/services/message.ts
git commit -m "feat(message): integrate emoji message processing

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: 添加获取表情 URL 的 API

**Files:**
- Modify: `apps/server/src/routes/messages.ts`

- [ ] **Step 1: 添加 API 路由**

在 `messages.ts` 路由文件中添加：

```typescript
// GET /api/conversations/:id/messages/:msgId/emoji
app.get('/api/conversations/:id/messages/:msgId/emoji', async (c) => {
  const { id: conversationId, msgId } = c.req.param()

  const emojiUrl = await emojiService.getEmojiUrl(msgId)

  if (!emojiUrl) {
    return c.json({ error: 'Emoji not found or not downloaded yet' }, 404)
  }

  return c.json({ ossUrl: emojiUrl })
})
```

- [ ] **Step 2: 提交**

```bash
git add apps/server/src/routes/messages.ts
git commit -m "feat(api): add endpoint to get emoji URL

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: 初始化服务依赖

**Files:**
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: 初始化 EmojiService 和 EmojiDownloadQueue**

在 `index.ts` 中，找到服务初始化部分，添加：

```typescript
// 初始化 EmojiService
const emojiService = new EmojiService(db, adapter, ossService)

// 初始化 EmojiDownloadQueue
const emojiQueue = new EmojiDownloadQueue(emojiService, wsService)

// 更新 MessageService 初始化
const messageService = new MessageService(
  db,
  dataLake,
  adapter,
  clientUsername,
  ossService,
  emojiService,
  emojiQueue
)
```

- [ ] **Step 2: 提交**

```bash
git add apps/server/src/index.ts
git commit -m "feat(server): initialize EmojiService and EmojiDownloadQueue

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 7: 前端实现

### Task 12: 实现 EmojiMessage 组件

**Files:**
- Create: `apps/web/src/components/EmojiMessage.tsx`
- Create: `apps/web/src/components/EmojiMessage.module.css`

- [ ] **Step 1: 创建 EmojiMessage 组件**

创建 `apps/web/src/components/EmojiMessage.tsx`：

```typescript
import { useState, useEffect } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import styles from './EmojiMessage.module.css'

interface EmojiMessageProps {
  msgId: string
  conversationId: string
  displayContent: string
}

export function EmojiMessage({ msgId, conversationId, displayContent }: EmojiMessageProps) {
  const [emojiUrl, setEmojiUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const ws = useWebSocket()

  useEffect(() => {
    fetchEmojiUrl()

    const handleEmojiDownloaded = (data: any) => {
      if (data.msgId === msgId) {
        setEmojiUrl(data.ossUrl)
        setLoading(false)
      }
    }

    ws.on('emoji_downloaded', handleEmojiDownloaded)

    return () => {
      ws.off('emoji_downloaded', handleEmojiDownloaded)
    }
  }, [msgId, ws])

  const fetchEmojiUrl = async () => {
    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages/${msgId}/emoji`)
      if (response.ok) {
        const data = await response.json()
        setEmojiUrl(data.ossUrl)
      }
    } catch (error) {
      console.error('Failed to fetch emoji URL:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading || !emojiUrl) {
    return <span className={styles.placeholder}>{displayContent}</span>
  }

  return (
    <img
      src={emojiUrl}
      alt="表情"
      className={styles.emoji}
    />
  )
}
```

- [ ] **Step 2: 创建样式文件**

创建 `apps/web/src/components/EmojiMessage.module.css`：

```css
.placeholder {
  color: #666;
  font-style: italic;
}

.emoji {
  max-width: 120px;
  max-height: 120px;
  display: block;
}
```

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/components/EmojiMessage.tsx apps/web/src/components/EmojiMessage.module.css
git commit -m "feat(web): implement EmojiMessage component

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: 集成 EmojiMessage 到 MessageItem

**Files:**
- Modify: `apps/web/src/components/MessageItem.tsx`

- [ ] **Step 1: 导入 EmojiMessage 组件**

在文件顶部添加：

```typescript
import { EmojiMessage } from './EmojiMessage'
```

- [ ] **Step 2: 在 renderContent 中添加 emoji case**

找到 `renderContent` 函数，添加 emoji 分支：

```typescript
const renderContent = () => {
  switch (message.displayType) {
    case 'text':
      return <div className="message-text">{message.displayContent}</div>
    case 'image':
      return <ImageMessage msgId={message.msgId} />
    case 'emoji':
      return (
        <EmojiMessage
          msgId={message.msgId}
          conversationId={message.conversationId}
          displayContent={message.displayContent}
        />
      )
    // ... other cases
  }
}
```

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/components/MessageItem.tsx
git commit -m "feat(web): integrate EmojiMessage into MessageItem

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 8: 集成测试和验证

### Task 14: 端到端测试

**Files:**
- Test existing functionality

- [ ] **Step 1: 启动开发服务器**

```bash
pnpm dev
```

Expected: 前端运行在 :3000，后端运行在 :3100

- [ ] **Step 2: 发送测试表情消息**

通过微信向测试账号发送一个表情消息

- [ ] **Step 3: 验证接收流程**

检查：
1. 后端日志显示接收到 type 47 消息
2. 数据库中创建了 EmojiCache 记录（status: pending）
3. 前端立即显示 `[表情]` 占位符
4. 后台开始下载表情
5. 下载完成后 EmojiCache 更新为 downloaded
6. WebSocket 推送更新通知
7. 前端自动替换为实际表情图片

- [ ] **Step 4: 验证错误处理**

测试场景：
1. 网络断开时发送表情 → 应显示占位符，后台重试
2. 下载失败 → 应记录错误，保持占位符显示
3. 刷新页面 → 已下载的表情应立即显示

- [ ] **Step 5: 检查数据库**

```bash
cd apps/server
sqlite3 data/morechat.db "SELECT msgId, status, ossUrl FROM emoji_cache LIMIT 5"
```

Expected: 显示表情缓存记录

- [ ] **Step 6: 最终提交**

```bash
git add .
git commit -m "test: verify emoji message receive functionality

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## 完成检查清单

- [ ] 所有测试通过
- [ ] 数据库迁移成功
- [ ] 前端能正确显示表情占位符
- [ ] 后台异步下载正常工作
- [ ] WebSocket 推送正常
- [ ] 前端能自动更新为实际图片
- [ ] 错误处理正常（下载失败、网络异常）
- [ ] 代码已提交到 git

---

## 参考文档

- 设计规范：`docs/superpowers/specs/2026-03-23-emoji-message-receive-design.md`
- Prisma 文档：https://www.prisma.io/docs
- Hono 文档：https://hono.dev
- React 文档：https://react.dev

