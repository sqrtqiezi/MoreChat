---
name: 表情消息接收功能设计
description: 实现表情消息的接收、下载和显示功能，采用占位符+异步下载的混合方案
type: design
---

# 表情消息接收功能设计

## 需求概述

实现表情消息（msg_type: 47）的接收和显示功能，优先实现接收功能。用户发送表情后，接收方能够看到实际的表情图片（支持静态 PNG/JPG 和动态 GIF）。

**核心需求**：
- 接收表情消息时，立即显示占位符 `[表情]`
- 后台异步下载表情图片
- 下载完成后，通过 WebSocket 推送更新通知
- 前端自动替换占位符为实际图片
- 支持静态表情（PNG/JPG）和动态表情（GIF）

**技术约束**：
- 不引入新的架构组件（如 Redis）
- 使用内存队列处理异步下载任务
- 复用现有的 OSS 存储和 WebSocket 推送机制

## 架构设计

### 整体流程

```
1. 接收表情消息（msg_type: 47）
   ↓
2. 解析 XML 内容，提取表情元数据（aes_key, url, md5）
   ↓
3. 保存到 DataLake 和 MessageIndex
   ↓
4. 创建 EmojiCache 记录（status: pending）
   ↓
5. 立即返回消息（displayType: 'emoji', displayContent: '[表情]'）
   ↓
6. 触发异步下载任务（加入内存队列）
   ↓
7. 后台下载表情图片
   ↓
8. 下载完成后上传到 OSS
   ↓
9. 更新 EmojiCache（status: downloaded, ossUrl）
   ↓
10. 通过 WebSocket 推送更新通知
   ↓
11. 前端收到通知，刷新消息显示
```

### 核心组件

**后端新增组件**：

1. **EmojiService**
   - 职责：表情下载、缓存管理
   - 方法：
     - `downloadEmoji(emojiInfo)`: 下载表情
     - `getEmojiUrl(msgId)`: 获取表情 URL
     - `parseEmojiXml(content)`: 解析表情 XML

2. **EmojiDownloadQueue**
   - 职责：管理异步下载任务
   - 实现：内存队列 + 并发控制
   - 方法：
     - `enqueue(task)`: 添加下载任务
     - `process()`: 处理队列中的任务

**后端扩展组件**：

1. **MessageService**
   - 扩展 `handleIncomingMessage()` 处理 type 47
   - 调用 `EmojiService` 解析和下载

2. **MessageContentProcessor**
   - 新增 `processType47()` 处理表情消息
   - 返回 `displayType: 'emoji'`

**前端新增组件**：

1. **EmojiMessage 组件**
   - 显示表情占位符或实际图片
   - 监听 WebSocket 更新事件
   - 支持 GIF 动画播放

### 数据库设计

**新增表：EmojiCache**

```prisma
model EmojiCache {
  msgId        String    @id @map("msg_id")
  aesKey       String    @map("aes_key")
  cdnUrl       String    @map("cdn_url")
  encryptUrl   String?   @map("encrypt_url")
  md5          String?
  fileSize     Int?      @map("file_size")
  productId    String?   @map("product_id")
  ossUrl       String?   @map("oss_url")
  status       String    @default("pending")  // pending, downloading, downloaded, failed
  errorMessage String?   @map("error_message")
  createdAt    DateTime  @default(now()) @map("created_at")
  downloadedAt DateTime? @map("downloaded_at")

  @@map("emoji_cache")
  @@index([status])
}
```

**字段说明**：
- `msgId`: 消息 ID（主键）
- `aesKey`: AES 解密密钥
- `cdnUrl`: 微信 CDN 下载地址（未加密，优先使用）
- `encryptUrl`: 加密的表情文件下载地址（备用）
- `md5`: 表情文件 MD5（可选）
- `fileSize`: 文件大小（可选）
- `productId`: 表情包 ID（可选）
- `ossUrl`: OSS 存储地址（下载完成后填充）
- `status`: 下载状态
- `errorMessage`: 错误信息（下载失败时记录）

## 详细设计

### 1. 表情消息解析

**XML 格式**（基于生产环境真实数据 2026-03-23）：

```xml
<msg>
  <emoji
    fromusername="wxid_xxx"
    tousername="xxx@chatroom"
    type="2"
    md5="c99f17060237ca21e7dce8d80d216e6d"
    len="73009"
    productid="com.tencent.xin.emoticon.person.stiker_xxx"
    cdnurl="http://wxapp.tc.qq.com/262/20304/stodownload?m=xxx&amp;filekey=xxx..."
    thumburl="http://wxapp.tc.qq.com/275/20304/stodownload?m=xxx..."
    encrypturl="http://wxapp.tc.qq.com/262/20304/stodownload?m=xxx..."
    aeskey="03ab8c3ec37706ed560587be5afa9d2f"
    externurl="http://wxapp.tc.qq.com/262/20304/stodownload?m=xxx..."
    externmd5="c58b44563fedab361b044861c79acdef"
    width="240"
    height="240"
  />
  <gameext type="0" content="0" />
</msg>
```

**关键字段说明**：
- `cdnurl`: 表情文件的 CDN 下载地址（未加密，可直接下载）
- `aeskey`: AES 解密密钥（用于解密 encrypturl）
- `encrypturl`: 加密的表情文件下载地址
- `md5`: 表情文件的 MD5 值
- `len`: 表情文件大小（字节）
- `width/height`: 表情尺寸
- `thumburl`: 缩略图地址
- `productid`: 表情包 ID

**下载策略**：
优先使用 `cdnurl`（未加密，直接下载），如果失败则使用 `encrypturl` + `aeskey` 解密。

**解析逻辑**（`messageContentProcessor.ts`）：

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

function processType47(content: string): ProcessedContent {
  return { displayType: 'emoji', displayContent: '[表情]' }
}

// 更新 processMessageContent
export function processMessageContent(msgType: number, content: string): ProcessedContent {
  // ... existing cases
  case 47:
    return processType47(content)
  // ...
}
```

### 2. 表情下载服务

**EmojiService**（`apps/server/src/services/emojiService.ts`）：

```typescript
import type { DatabaseService } from './database.js'
import type { JuhexbotAdapter } from './juhexbotAdapter.js'
import type { OssService } from './ossService.js'
import { parseEmojiXml, type EmojiInfo } from './messageContentProcessor.js'
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

    // 创建缓存记录
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
      // 更新状态为 downloading
      await this.db.updateEmojiCache(msgId, { status: 'downloading' })

      // 调用 juhexbot API 下载表情
      const emojiBuffer = await this.adapter.downloadEmoji({
        cdnUrl: cache.cdnUrl,
        aesKey: cache.aesKey,
        encryptUrl: cache.encryptUrl
      })

      // 上传到 OSS
      const filename = `emoji_${msgId}_${Date.now()}`
      const ossUrl = await this.ossService.uploadImage(emojiBuffer, filename)

      // 更新缓存记录
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
   * 获取表情 URL（优先返回 OSS URL，否则返回 null）
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

### 3. 异步下载队列

**EmojiDownloadQueue**（`apps/server/src/services/emojiDownloadQueue.ts`）：

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

    // 触发处理
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
      // 控制并发数
      while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
        const task = this.queue.shift()!
        this.activeCount++
        this.processTask(task)
      }

      // 等待一段时间再检查
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
        // 下载成功，推送 WebSocket 通知
        this.wsService.broadcastEmojiDownloaded({
          msgId: task.msgId,
          conversationId: task.conversationId,
          ossUrl
        })
      } else if (task.retryCount < this.maxRetries) {
        // 下载失败，重试
        task.retryCount++
        this.queue.push(task)
        logger.info(`Retry emoji download for msgId: ${task.msgId}, attempt: ${task.retryCount}`)
      } else {
        // 超过最大重试次数
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

### 4. MessageService 集成

**扩展 MessageService**（`apps/server/src/services/message.ts`）：

```typescript
// 在构造函数中添加依赖
constructor(
  private db: DatabaseService,
  private dataLake: DataLakeService,
  private adapter: JuhexbotAdapter,
  private clientUsername: string,
  private ossService: OssService,
  private emojiService: EmojiService,  // 新增
  private emojiQueue: EmojiDownloadQueue  // 新增
) {}

// 在 handleIncomingMessage 中添加处理逻辑
async handleIncomingMessage(parsed: ParsedWebhookPayload): Promise<IncomingMessageResult | RecallResult | null> {
  const { message } = parsed

  // ... existing code (去重、过滤、撤回处理)

  // 保存到 DataLake 和创建索引（existing code）
  const dataLakeKey = await this.dataLake.saveMessage(conversation.id, chatMessage)
  await this.db.createMessageIndex({...})

  // 更新会话最后消息时间
  await this.db.updateConversationLastMessage(conversation.id, new Date(message.createTime * 1000))

  // 处理表情消息
  if (message.msgType === 47) {
    await this.emojiService.processEmojiMessage(message.msgId, message.content)
    // 触发异步下载
    this.emojiQueue.enqueue(message.msgId, conversation.id)
  }

  const { displayType, displayContent, referMsg } = processMessageContent(message.msgType, message.content)

  // ... existing code (返回结果)
}
```

### 5. Database Service 扩展

**新增方法**（`apps/server/src/services/database.ts`）：

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

async findEmojiCacheByMsgId(msgId: string) {
  return this.prisma.emojiCache.findUnique({
    where: { msgId }
  })
}

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

### 6. JuhexbotAdapter 扩展

**新增方法**（`apps/server/src/services/juhexbotAdapter.ts`）：

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

**说明**：
- 优先使用 `cdnUrl` 直接下载（更快，无需解密）
- 如果 `cdnUrl` 失败，使用 juhexbot API 下载加密表情
- 基于生产环境验证的 API 端点和参数格式

### 7. WebSocket 推送

**扩展 WebSocketService**（`apps/server/src/services/websocket.ts`）：

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

### 8. API 扩展

**新增 API 端点**（`apps/server/src/routes/messages.ts`）：

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

## 前端设计

### 1. 类型定义

**扩展 DisplayType**（`packages/types/src/index.ts`）：

```typescript
export type DisplayType = 'text' | 'image' | 'link' | 'video' | 'call' | 'recall' | 'quote' | 'emoji' | 'unknown'
```

### 2. EmojiMessage 组件

**组件实现**（`apps/web/src/components/EmojiMessage.tsx`）：

```typescript
import { useState, useEffect } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'

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
    // 尝试获取表情 URL
    fetchEmojiUrl()

    // 监听 WebSocket 更新
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
  }, [msgId])

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
    return <span className="emoji-placeholder">{displayContent}</span>
  }

  return (
    <img
      src={emojiUrl}
      alt="表情"
      className="emoji-image"
      style={{ maxWidth: '120px', maxHeight: '120px' }}
    />
  )
}
```

### 3. MessageItem 组件集成

**更新 MessageItem**（`apps/web/src/components/MessageItem.tsx`）：

```typescript
import { EmojiMessage } from './EmojiMessage'

function MessageItem({ message }: { message: Message }) {
  // ... existing code

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

  return (
    <div className="message-item">
      {renderContent()}
    </div>
  )
}
```

## 错误处理

### 1. 下载失败处理

**策略**：
- 最多重试 3 次
- 重试间隔：指数退避（1s, 2s, 4s）
- 超过重试次数后，标记为 failed
- 前端显示占位符 `[表情]`

### 2. 解析失败处理

**策略**：
- XML 解析失败时，记录警告日志
- 不创建 EmojiCache 记录
- 前端显示 `[表情]` 占位符（与正常表情一致）

### 3. 网络异常处理

**策略**：
- juhexbot API 调用失败时，捕获异常
- 更新 EmojiCache 状态为 failed
- 记录错误信息到 errorMessage 字段

## 测试策略

### 1. 单元测试

**测试文件**：
- `messageContentProcessor.test.ts`：测试 `parseEmojiXml()` 和 `processType47()`
- `emojiService.test.ts`：测试表情下载和缓存逻辑
- `emojiDownloadQueue.test.ts`：测试队列管理和并发控制

**测试用例**：
- 正常的表情 XML 解析
- 缺少必要字段的 XML
- 下载成功场景
- 下载失败重试场景
- 队列并发控制

### 2. 集成测试

**测试场景**：
- 接收表情消息 → 创建缓存 → 触发下载 → WebSocket 推送
- 下载失败重试机制
- 前端获取表情 URL

### 3. 手动测试

**测试步骤**：
1. 发送表情消息到测试账号
2. 验证接收方立即看到占位符
3. 等待下载完成（观察日志）
4. 验证前端自动更新为实际图片
5. 测试静态表情（PNG/JPG）
6. 测试动态表情（GIF）

## 性能优化

### 1. 下载并发控制

- 最大并发数：3
- 避免同时下载过多表情导致资源耗尽

### 2. 缓存策略

- 已下载的表情不重复下载
- 优先从 EmojiCache 查询

### 3. 前端优化

- 懒加载：只下载可见区域的表情
- 图片压缩：OSS 返回压缩后的图片

## 部署注意事项

### 1. 数据库迁移

```bash
cd apps/server
npx prisma migrate dev --name add_emoji_cache
npx prisma generate
```

### 2. 环境变量

确保 `.env` 中配置了：
- `JUHEXBOT_CLOUD_API_URL`：juhexbot 云端 API 地址

### 3. 服务依赖注入

在 `apps/server/src/index.ts` 中初始化：

```typescript
const emojiService = new EmojiService(db, adapter, ossService)
const emojiQueue = new EmojiDownloadQueue(emojiService, wsService)
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

## 后续优化方向

1. **表情包管理**：实现表情包列表获取和管理
2. **表情发送**：实现从表情商店选择并发送表情
3. **表情搜索**：支持按关键词搜索表情
4. **表情预加载**：预加载常用表情，提升响应速度
5. **表情分类**：按表情包分类展示

## 风险与应对

### 风险 1：juhexbot API 不稳定

**应对**：
- 实现重试机制（最多 3 次）
- 记录详细的错误日志
- 提供降级方案（显示占位符 `[表情]`）
- 优先使用 cdnUrl 直接下载，减少对 juhexbot API 的依赖

### 风险 2：内存队列丢失

**应对**：
- 服务重启时，从数据库恢复 pending 状态的任务
- 实现队列持久化（可选，后续优化）

### 风险 3：CDN 下载失败

**应对**：
- 实现双重下载策略（cdnUrl + encryptUrl）
- 记录失败原因到 errorMessage 字段
- 前端显示占位符 `[表情]`

## 总结

本设计采用混合方案（占位符 + 异步下载），在不引入新架构组件的前提下，实现了表情消息的接收和显示功能。核心优势：

1. **响应速度快**：立即显示占位符，不阻塞消息流
2. **用户体验好**：自动更新为实际图片，无需手动刷新
3. **架构简单**：使用内存队列，无需 Redis
4. **可扩展性强**：为后续的表情发送和表情包管理打好基础

**Why（为什么这样设计）**：
- 混合方案平衡了响应速度和用户体验
- 内存队列满足当前需求，避免过度设计
- 异步下载避免阻塞主流程
- WebSocket 推送实现实时更新

**How to apply（如何应用）**：
- 优先实现接收功能，验证技术可行性
- 收集真实表情消息样本，确认 XML 格式
- 基于真实数据调整实现细节
- 后续再实现表情发送功能
