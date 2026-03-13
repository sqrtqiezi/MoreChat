# 多尺寸图片 + Lightbox 查看功能实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 MoreChat 添加多尺寸图片支持（缩略图/中图/高清）和 Lightbox 查看功能

**Architecture:** 首次点击加载中图显示在气泡中，再次点击打开 Lightbox 并升级到高清图。长截图在 Lightbox 中垂直滚动。使用 `file_type` 参数区分图片尺寸（1=HD, 2=mid, 3=thumb），ImageCache 表仅存储最高质量 URL（HD 覆盖 mid）。

**Tech Stack:** Prisma (SQLite), Hono, React, TanStack Query, yet-another-react-lightbox, fast-xml-parser

---

## Chunk 1: 后端基础 - XML 解析与 API 适配

### Task 1: 扩展 parseImageXml 返回 hasHd 标志

**Files:**
- Modify: `apps/server/src/services/messageContentProcessor.ts:parseImageXml`
- Modify: `apps/server/src/services/messageContentProcessor.test.ts`

- [ ] **Step 1: 编写失败测试 - 验证 hasHd 字段**

在 `apps/server/src/services/messageContentProcessor.test.ts` 的 `parseImageXml` 测试组中添加：

```typescript
it('should return hasHd=true for HD images (hdlength > 0)', () => {
  const xml = `<?xml version="1.0"?>
<msg>
    <img aeskey="test_key" cdnmidimgurl="test_url" encryver="1" hdlength="123456"/>
</msg>`

  const result = parseImageXml(xml)

  expect(result).toEqual({
    aesKey: 'test_key',
    fileId: 'test_url',
    hasHd: true
  })
})

it('should return hasHd=false when hdlength is missing', () => {
  const xml = `<?xml version="1.0"?>
<msg>
    <img aeskey="test_key" cdnmidimgurl="test_url" encryver="1"/>
</msg>`

  const result = parseImageXml(xml)

  expect(result).toEqual({
    aesKey: 'test_key',
    fileId: 'test_url',
    hasHd: false
  })
})

it('should return hasHd=false when hdlength is 0', () => {
  const xml = `<?xml version="1.0"?>
<msg>
    <img aeskey="test_key" cdnmidimgurl="test_url" encryver="1" hdlength="0"/>
</msg>`

  const result = parseImageXml(xml)

  expect(result).toEqual({
    aesKey: 'test_key',
    fileId: 'test_url',
    hasHd: false
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd apps/server
npx vitest run src/services/messageContentProcessor.test.ts
```

Expected: 3 个新测试失败，提示 `hasHd` 字段缺失


- [ ] **Step 3: 修改 parseImageXml 实现**

在 `apps/server/src/services/messageContentProcessor.ts` 中修改 `parseImageXml` 函数：

```typescript
export function parseImageXml(content: string): { aesKey: string; fileId: string; hasHd: boolean } | null {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_'
    })
    const parsed = parser.parse(content)

    const img = parsed?.msg?.img
    if (!img) return null

    const encryver = img['@_encryver']
    if (encryver !== '1') return null

    const aesKey = img['@_aeskey']
    const fileId = img['@_cdnmidimgurl']
    if (!aesKey || !fileId) return null

    const hdlength = img['@_hdlength']
    const hasHd = hdlength && parseInt(hdlength, 10) > 0

    return { aesKey, fileId, hasHd }
  } catch {
    return null
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd apps/server
npx vitest run src/services/messageContentProcessor.test.ts
```

Expected: 所有测试通过

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/services/messageContentProcessor.ts apps/server/src/services/messageContentProcessor.test.ts
git commit -m "feat: parseImageXml returns hasHd flag for HD image detection

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: juhexbotAdapter.downloadImage 支持 fileType 参数

**Files:**
- Modify: `apps/server/src/services/juhexbotAdapter.ts:298-341`
- Modify: `apps/server/src/services/juhexbotAdapter.test.ts`

- [ ] **Step 1: 编写失败测试 - 验证 fileType 参数传递**

在 `apps/server/src/services/juhexbotAdapter.test.ts` 的 `downloadImage` 测试组中添加：

```typescript
it('should pass fileType parameter to cloud API', async () => {
  const fetchMock = vi.fn()
  fetchMock.mockResolvedValueOnce({
    json: () => Promise.resolve({
      errcode: 0,
      data: {
        cdn_info: 'cdn-info',
        client_version: 1,
        device_type: 'ios',
        username: 'user'
      }
    })
  })
  fetchMock.mockResolvedValueOnce({
    json: () => Promise.resolve({
      errcode: 0,
      data: { url: 'https://cdn.example.com/hd.jpg' }
    })
  })
  globalThis.fetch = fetchMock

  await adapter.downloadImage('key', 'id', 'img.jpg', 1)

  const body = JSON.parse(fetchMock.mock.calls[1][1].body)
  expect(body.file_type).toBe(1)
})

it('should default to fileType=2 (mid) when not specified', async () => {
  const fetchMock = vi.fn()
  fetchMock.mockResolvedValueOnce({
    json: () => Promise.resolve({
      errcode: 0,
      data: {
        cdn_info: 'cdn-info',
        client_version: 1,
        device_type: 'ios',
        username: 'user'
      }
    })
  })
  fetchMock.mockResolvedValueOnce({
    json: () => Promise.resolve({
      errcode: 0,
      data: { url: 'https://cdn.example.com/mid.jpg' }
    })
  })
  globalThis.fetch = fetchMock

  await adapter.downloadImage('key', 'id', 'img.jpg')

  const body = JSON.parse(fetchMock.mock.calls[1][1].body)
  expect(body.file_type).toBe(2)
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd apps/server
npx vitest run src/services/juhexbotAdapter.test.ts -t "downloadImage"
```

Expected: 2 个新测试失败


- [ ] **Step 3: 修改 downloadImage 方法签名和实现**

在 `apps/server/src/services/juhexbotAdapter.ts` 中修改 `downloadImage` 方法：

```typescript
async downloadImage(aesKey: string, fileId: string, fileName: string, fileType: number = 2): Promise<string> {
  const cdnInfo = await this.getCdnInfo()

  const baseRequest = {
    cdn_info: cdnInfo.cdn_info,
    client_version: cdnInfo.client_version,
    device_type: cdnInfo.device_type,
    username: cdnInfo.username
  }

  const cloudUrl = `${this.config.cloudApiUrl}/cloud/download`
  const requestBody = {
    base_request: baseRequest,
    aes_key: aesKey,
    file_id: fileId,
    file_name: fileName,
    file_type: fileType
  }

  logger.info({ cloudUrl, fileName, fileType }, 'Calling cloud download API')

  const response = await fetch(cloudUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  })

  const result = await response.json() as any

  logger.info({ fileName, fileType, result }, 'Cloud download API response')

  if (result.errcode !== 0) {
    const err = new Error(result.errmsg || `Cloud API error: ${result.errcode}`)
    ;(err as any).cloudErrcode = result.errcode
    throw err
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
cd apps/server
npx vitest run src/services/juhexbotAdapter.test.ts -t "downloadImage"
```

Expected: 所有 downloadImage 测试通过

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/services/juhexbotAdapter.ts apps/server/src/services/juhexbotAdapter.test.ts
git commit -m "feat: juhexbotAdapter.downloadImage supports fileType parameter

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 2: 后端服务层 - ImageService 与路由

### Task 3: ImageService.getImageUrl 支持 size 参数

**Files:**
- Modify: `apps/server/src/services/imageService.ts`
- Modify: `apps/server/src/services/imageService.test.ts`

- [ ] **Step 1: 编写失败测试 - 验证 size 参数和返回值**

在 `apps/server/src/services/imageService.test.ts` 中添加新测试：

```typescript
it('should return hasHd flag from XML parsing', async () => {
  mockPrisma.imageCache.findUnique.mockResolvedValue(null)
  mockPrisma.messageIndex.findUnique.mockResolvedValue({
    dataLakeKey: 'hot/conv_a/2026-03-12.jsonl:msg123',
    msgType: 3
  })
  mockDataLake.getMessage.mockResolvedValue({
    msg_id: 'msg123',
    msg_type: 3,
    content: '<?xml version="1.0"?><msg><img aeskey="aes123" cdnmidimgurl="cdn456" encryver="1" hdlength="999999"/></msg>'
  })
  mockAdapter.downloadImage.mockResolvedValue('https://new.url/image.jpg')

  const result = await service.getImageUrl('msg123', 'mid')

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
    content: '<?xml version="1.0"?><msg><img aeskey="aes123" cdnmidimgurl="cdn456" encryver="1" hdlength="999"/></msg>'
  })
  mockAdapter.downloadImage.mockResolvedValue('https://hd.url/image.jpg')

  await service.getImageUrl('msg123', 'hd')

  expect(mockAdapter.downloadImage).toHaveBeenCalledWith('aes123', 'cdn456', 'msg123.jpg', 1)
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

  await service.getImageUrl('msg123', 'mid')

  expect(mockAdapter.downloadImage).toHaveBeenCalledWith('aes123', 'cdn456', 'msg123.jpg', 2)
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
    content: '<?xml version="1.0"?><msg><img aeskey="aes" cdnmidimgurl="cdn" encryver="1" hdlength="999"/></msg>'
  })
  mockAdapter.downloadImage
    .mockResolvedValueOnce('https://mid.url.jpg')
    .mockResolvedValueOnce('https://hd.url.jpg')

  const [result1, result2] = await Promise.all([
    service.getImageUrl('msg123', 'mid'),
    service.getImageUrl('msg123', 'hd')
  ])

  expect(result1.imageUrl).toBe('https://mid.url.jpg')
  expect(result2.imageUrl).toBe('https://hd.url.jpg')
  expect(mockAdapter.downloadImage).toHaveBeenCalledTimes(2)
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd apps/server
npx vitest run src/services/imageService.test.ts
```

Expected: 4 个新测试失败


- [ ] **Step 3: 修改 ImageService 实现**

在 `apps/server/src/services/imageService.ts` 中修改：

```typescript
export class ImageService {
  private prisma: PrismaClient
  private dataLake: DataLakeService
  private adapter: JuhexbotAdapter
  private pendingRequests: Map<string, Promise<{ imageUrl: string; hasHd: boolean }>>

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

  async getImageUrl(msgId: string, size: 'mid' | 'hd' = 'mid'): Promise<{ imageUrl: string; hasHd: boolean }> {
    const cacheKey = `${msgId}:${size}`
    const pending = this.pendingRequests.get(cacheKey)
    if (pending) {
      logger.debug({ msgId, size }, 'Reusing pending image request')
      return pending
    }

    const promise = this._getImageUrlInternal(msgId, size)
    this.pendingRequests.set(cacheKey, promise)

    try {
      const result = await promise
      return result
    } finally {
      this.pendingRequests.delete(cacheKey)
    }
  }

  private async _getImageUrlInternal(msgId: string, size: 'mid' | 'hd'): Promise<{ imageUrl: string; hasHd: boolean }> {
    // 1. 查缓存
    const cached = await this.prisma.imageCache.findUnique({
      where: { msgId }
    })

    if (cached?.downloadUrl) {
      logger.debug({ msgId, size }, 'Image URL found in cache')
      // 从 DataLake 读取 hasHd 标志
      const messageIndex = await this.prisma.messageIndex.findUnique({
        where: { msgId },
        select: { dataLakeKey: true }
      })
      if (messageIndex) {
        const message = await this.dataLake.getMessage(messageIndex.dataLakeKey)
        const imageInfo = parseImageXml(message.content)
        if (imageInfo) {
          return { imageUrl: cached.downloadUrl, hasHd: imageInfo.hasHd }
        }
      }
      return { imageUrl: cached.downloadUrl, hasHd: false }
    }

    // 2. 从 MessageIndex 查出 dataLakeKey，再从 DataLake 读取消息
    const messageIndex = await this.prisma.messageIndex.findUnique({
      where: { msgId },
      select: { dataLakeKey: true, msgType: true }
    })

    if (!messageIndex) {
      throw new Error('Message not found')
    }

    // 3. 验证是图片消息
    if (messageIndex.msgType !== 3) {
      throw new Error('Not an image message')
    }

    const message = await this.dataLake.getMessage(messageIndex.dataLakeKey)

    // 4. 解析 XML
    const imageInfo = parseImageXml(message.content)
    if (!imageInfo) {
      throw new Error('Failed to parse image XML or unsupported image format')
    }

    // 5. 创建缓存条目
    if (!cached) {
      await this.prisma.imageCache.create({
        data: {
          msgId,
          aesKey: imageInfo.aesKey,
          cdnFileId: imageInfo.fileId
        }
      })
    }

    // 6. 调用 Cloud API 下载
    const fileType = size === 'hd' ? 1 : 2
    logger.info({ msgId, fileId: imageInfo.fileId, size, fileType }, 'Downloading image URL from cloud API')
    const downloadUrl = await this.adapter.downloadImage(
      imageInfo.aesKey,
      imageInfo.fileId,
      `${msgId}.jpg`,
      fileType
    )

    // 7. 更新缓存（仅当 HD 时覆盖，或首次下载）
    if (size === 'hd' || !cached?.downloadUrl) {
      await this.prisma.imageCache.update({
        where: { msgId },
        data: {
          downloadUrl,
          downloadedAt: new Date()
        }
      })
    }

    logger.info({ msgId, size, downloadUrl }, 'Image URL downloaded')
    return { imageUrl: downloadUrl, hasHd: imageInfo.hasHd }
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd apps/server
npx vitest run src/services/imageService.test.ts
```

Expected: 所有测试通过

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/services/imageService.ts apps/server/src/services/imageService.test.ts
git commit -m "feat: ImageService supports multi-size image requests (mid/hd)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: 路由支持 size 查询参数

**Files:**
- Modify: `apps/server/src/routes/messages.ts:32-60`

- [ ] **Step 1: 编写集成测试（可选，手动测试）**

创建测试脚本 `/tmp/test_image_size_api.sh`：

```bash
#!/bin/bash
# 测试 mid 尺寸
curl -s "http://localhost:3100/api/messages/test_msg_123/image?size=mid" | jq

# 测试 hd 尺寸
curl -s "http://localhost:3100/api/messages/test_msg_123/image?size=hd" | jq

# 测试默认（无 size 参数）
curl -s "http://localhost:3100/api/messages/test_msg_123/image" | jq
```

- [ ] **Step 2: 修改路由实现**

在 `apps/server/src/routes/messages.ts` 中修改 `/api/messages/:msgId/image` 路由：

```typescript
// GET /api/messages/:msgId/image - 获取图片下载 URL
router.get('/:msgId/image', async (c) => {
  try {
    const msgId = c.req.param('msgId')
    const size = c.req.query('size') as 'mid' | 'hd' | undefined

    if (!msgId) {
      return c.json({ success: false, error: { message: 'msgId is required' } }, 400)
    }

    if (size && size !== 'mid' && size !== 'hd') {
      return c.json({ success: false, error: { message: 'size must be "mid" or "hd"' } }, 400)
    }

    const result = await deps.imageService.getImageUrl(msgId, size || 'mid')
    return c.json({ success: true, data: result })
  } catch (error: any) {
    logger.error({ err: error, msgId: c.req.param('msgId') }, 'Failed to get image URL')

    if (error.message === 'Message not found' || error.message?.includes('Message not found')) {
      return c.json({ success: false, error: { message: 'Message not found' } }, 404)
    }

    if (error.message === 'Not an image message' || error.message?.includes('parse')) {
      return c.json({ success: false, error: { message: 'Not an image message or unsupported format' } }, 422)
    }

    if (error.message?.includes('Cloud API') || error.message?.includes('CDN')) {
      return c.json({ success: false, error: { message: 'Failed to download image from cloud service' } }, 502)
    }

    return c.json({ success: false, error: { message: 'Internal server error' } }, 500)
  }
})
```


- [ ] **Step 3: 手动测试路由**

启动开发服务器：

```bash
cd apps/server
pnpm dev
```

在另一个终端运行测试脚本：

```bash
bash /tmp/test_image_size_api.sh
```

Expected: 
- mid 请求返回 `{ success: true, data: { imageUrl: "...", hasHd: true/false } }`
- hd 请求返回 HD URL
- 无效 size 返回 400 错误

- [ ] **Step 4: 提交**

```bash
git add apps/server/src/routes/messages.ts
git commit -m "feat: image route supports size query parameter (mid/hd)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 3: 前端 - API 客户端与 Lightbox 组件

### Task 5: 前端 API 客户端支持 size 参数

**Files:**
- Modify: `apps/web/src/api/chat.ts`

- [ ] **Step 1: 修改 getImageUrl 方法**

在 `apps/web/src/api/chat.ts` 中修改 `getImageUrl` 方法：

```typescript
async getImageUrl(msgId: string, size: 'mid' | 'hd' = 'mid'): Promise<{ imageUrl: string; hasHd: boolean }> {
  const response = await this.client.get<ApiResponse<{ imageUrl: string; hasHd: boolean }>>(
    `/messages/${msgId}/image`,
    { params: { size } }
  )
  if (!response.data.success) {
    throw new Error(response.data.error?.message || 'Failed to get image URL')
  }
  return response.data.data
}
```

- [ ] **Step 2: 验证类型定义**

确认 TypeScript 编译通过：

```bash
cd apps/web
pnpm type-check
```

Expected: 无类型错误

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/api/chat.ts
git commit -m "feat: chatApi.getImageUrl supports size parameter

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 6: 安装 Lightbox 库并创建组件

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/components/chat/ImageLightbox.tsx`

- [ ] **Step 1: 安装 yet-another-react-lightbox**

```bash
cd apps/web
pnpm add yet-another-react-lightbox
```

- [ ] **Step 2: 创建 ImageLightbox 组件**

创建 `apps/web/src/components/chat/ImageLightbox.tsx`：

```typescript
import { useState } from 'react'
import Lightbox from 'yet-another-react-lightbox'
import 'yet-another-react-lightbox/styles.css'

interface ImageLightboxProps {
  isOpen: boolean
  onClose: () => void
  imageUrl: string
  onUpgradeToHd?: () => void
}

export function ImageLightbox({ isOpen, onClose, imageUrl, onUpgradeToHd }: ImageLightboxProps) {
  const [isUpgrading, setIsUpgrading] = useState(false)

  const handleUpgrade = async () => {
    if (!onUpgradeToHd || isUpgrading) return
    setIsUpgrading(true)
    try {
      await onUpgradeToHd()
    } finally {
      setIsUpgrading(false)
    }
  }

  return (
    <Lightbox
      open={isOpen}
      close={onClose}
      slides={[{ src: imageUrl }]}
      render={{
        buttonPrev: () => null,
        buttonNext: () => null,
      }}
      toolbar={{
        buttons: [
          onUpgradeToHd && (
            <button
              key="upgrade-hd"
              type="button"
              className="yarl__button"
              onClick={handleUpgrade}
              disabled={isUpgrading}
              title="升级到高清"
            >
              {isUpgrading ? '加载中...' : 'HD'}
            </button>
          ),
          'close',
        ].filter(Boolean),
      }}
      styles={{
        container: { backgroundColor: 'rgba(0, 0, 0, 0.9)' },
      }}
    />
  )
}
```

- [ ] **Step 3: 验证编译**

```bash
cd apps/web
pnpm type-check
```

Expected: 无类型错误

- [ ] **Step 4: 提交**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml apps/web/src/components/chat/ImageLightbox.tsx
git commit -m "feat: add ImageLightbox component with HD upgrade button

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7: MessageItem 集成多尺寸图片和 Lightbox

**Files:**
- Modify: `apps/web/src/components/chat/MessageItem.tsx`

- [ ] **Step 1: 修改 MessageItem 组件**

在 `apps/web/src/components/chat/MessageItem.tsx` 中：


```typescript
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { chatApi } from '../../api/chat'
import { ImageLightbox } from './ImageLightbox'

// 在 MessageItem 组件内部添加状态
const [lightboxOpen, setLightboxOpen] = useState(false)
const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null)
const [currentMsgId, setCurrentMsgId] = useState<string | null>(null)
const [hasHd, setHasHd] = useState(false)

// 修改图片加载逻辑
const { data: imageData, refetch: refetchImage } = useQuery({
  queryKey: ['image', message.id, 'mid'],
  queryFn: async () => {
    const result = await chatApi.getImageUrl(message.id, 'mid')
    setHasHd(result.hasHd)
    return result
  },
  enabled: false,
  staleTime: Infinity,
  retry: 1
})

const handleImageClick = () => {
  if (!imageData) {
    refetchImage()
  } else {
    setCurrentImageUrl(imageData.imageUrl)
    setCurrentMsgId(message.id)
    setLightboxOpen(true)
  }
}

const handleUpgradeToHd = async () => {
  if (!currentMsgId) return
  const hdResult = await chatApi.getImageUrl(currentMsgId, 'hd')
  setCurrentImageUrl(hdResult.imageUrl)
  // 更新 mid 缓存
  queryClient.setQueryData(['image', currentMsgId, 'mid'], hdResult)
}

// 渲染图片消息
{displayType === 'image' && (
  <div className="mt-1">
    {imageData ? (
      <img
        src={imageData.imageUrl}
        alt="图片"
        className="max-w-[300px] max-h-[300px] rounded cursor-pointer"
        onClick={handleImageClick}
      />
    ) : (
      <button
        onClick={handleImageClick}
        className="px-3 py-2 bg-gray-100 rounded hover:bg-gray-200"
      >
        [图片] 点击加载
      </button>
    )}
  </div>
)}

// 在组件末尾添加 Lightbox
{lightboxOpen && currentImageUrl && (
  <ImageLightbox
    isOpen={lightboxOpen}
    onClose={() => setLightboxOpen(false)}
    imageUrl={currentImageUrl}
    onUpgradeToHd={hasHd ? handleUpgradeToHd : undefined}
  />
)}
```

同样修改 ReferImage 组件：

```typescript
function ReferImage({ msgId }: { msgId: string }) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [hasHd, setHasHd] = useState(false)
  const queryClient = useQueryClient()

  const { data: imageData, refetch } = useQuery({
    queryKey: ['image', msgId, 'mid'],
    queryFn: async () => {
      const result = await chatApi.getImageUrl(msgId, 'mid')
      setHasHd(result.hasHd)
      return result
    },
    enabled: false,
    staleTime: Infinity,
    retry: 1
  })

  const handleClick = () => {
    if (!imageData) {
      refetch()
    } else {
      setLightboxOpen(true)
    }
  }

  const handleUpgradeToHd = async () => {
    const hdResult = await chatApi.getImageUrl(msgId, 'hd')
    queryClient.setQueryData(['image', msgId, 'mid'], hdResult)
  }

  return (
    <>
      {imageData ? (
        <img
          src={imageData.imageUrl}
          alt="引用的图片"
          className="max-w-[150px] max-h-[100px] rounded cursor-pointer"
          onClick={handleClick}
        />
      ) : (
        <button
          onClick={handleClick}
          className="text-sm text-blue-600 hover:underline"
        >
          [图片] 点击加载
        </button>
      )}
      {lightboxOpen && imageData && (
        <ImageLightbox
          isOpen={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          imageUrl={imageData.imageUrl}
          onUpgradeToHd={hasHd ? handleUpgradeToHd : undefined}
        />
      )}
    </>
  )
}
```

- [ ] **Step 2: 验证编译**

```bash
cd apps/web
pnpm type-check
```

Expected: 无类型错误

- [ ] **Step 3: 手动测试前端**

启动开发服务器：

```bash
cd /Users/niujin/develop/MoreChat
pnpm dev
```

测试场景：
1. 点击图片占位符 → 加载中图并显示在气泡中
2. 再次点击图片 → 打开 Lightbox
3. 如果有 HD 按钮 → 点击升级到高清
4. 引用消息中的图片缩略图 → 同样支持点击和 Lightbox

Expected: 所有场景正常工作

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/components/chat/MessageItem.tsx
git commit -m "feat: integrate multi-size images and lightbox in MessageItem

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 4: 端到端测试与文档

### Task 8: 端到端测试

**Files:**
- None (manual testing)

- [ ] **Step 1: 准备测试环境**

确保服务器和前端都在运行：

```bash
# 终端 1
cd /Users/niujin/develop/MoreChat
pnpm dev
```

- [ ] **Step 2: 测试图片消息显示**

测试步骤：
1. 打开包含图片消息的对话
2. 点击 "[图片] 点击加载" 按钮
3. 验证中图加载并显示在气泡中（max 300x300）
4. 点击图片打开 Lightbox
5. 如果有 HD 按钮，点击升级到高清
6. 验证图片 URL 变化（通过浏览器开发者工具 Network 面板）

Expected: 
- 中图加载成功
- Lightbox 正常打开
- HD 升级成功（如果有 HD）

- [ ] **Step 3: 测试引用消息中的图片**

测试步骤：
1. 找到包含图片引用的消息（referMsg.type === 3）
2. 点击引用块中的图片缩略图
3. 验证中图加载并显示（max 150x100）
4. 点击缩略图打开 Lightbox
5. 如果有 HD 按钮，点击升级

Expected: 引用图片功能正常

- [ ] **Step 4: 测试并发请求去重**

测试步骤：
1. 快速连续点击同一图片 3 次
2. 打开浏览器开发者工具 Network 面板
3. 验证只有 1 个 API 请求发出

Expected: 并发请求被正确去重

- [ ] **Step 5: 测试缓存机制**

测试步骤：
1. 加载一张图片（mid）
2. 关闭 Lightbox
3. 再次点击同一图片
4. 验证 Network 面板无新请求（使用缓存）
5. 点击 HD 按钮
6. 验证发出 HD 请求
7. 关闭并重新打开 Lightbox
8. 验证显示 HD 图片且无新请求

Expected: 缓存机制正常工作

- [ ] **Step 6: 记录测试结果**

在 spec 文档或 commit message 中记录测试通过。

---

### Task 9: 更新文档

**Files:**
- Modify: `docs/superpowers/specs/2026-03-12-multi-size-image-lightbox-design.md`

- [ ] **Step 1: 在 spec 文档末尾添加实施完成标记**

在 `docs/superpowers/specs/2026-03-12-multi-size-image-lightbox-design.md` 末尾添加：

```markdown
---

## 实施状态

✅ **已完成** (2026-03-13)

### 实施计划
详见：`docs/superpowers/plans/2026-03-13-multi-size-image-lightbox.md`

### 测试结果
- ✅ 后端单元测试全部通过
- ✅ 前端类型检查通过
- ✅ 端到端测试通过
- ✅ 缓存机制验证通过
- ✅ 并发去重验证通过

### 关键文件
- `apps/server/src/services/messageContentProcessor.ts` - XML 解析 hasHd
- `apps/server/src/services/juhexbotAdapter.ts` - fileType 参数
- `apps/server/src/services/imageService.ts` - 多尺寸支持
- `apps/server/src/routes/messages.ts` - size 查询参数
- `apps/web/src/api/chat.ts` - API 客户端
- `apps/web/src/components/chat/ImageLightbox.tsx` - Lightbox 组件
- `apps/web/src/components/chat/MessageItem.tsx` - 集成
```

- [ ] **Step 2: 提交文档更新**

```bash
git add docs/superpowers/specs/2026-03-12-multi-size-image-lightbox-design.md
git commit -m "docs: mark multi-size image lightbox spec as implemented

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 10: 创建 Pull Request

**Files:**
- None (Git operations)

- [ ] **Step 1: 推送分支**

```bash
git push origin HEAD
```

- [ ] **Step 2: 创建 PR**

使用 GitHub CLI 或 Web 界面创建 PR：

```bash
gh pr create --title "feat: 多尺寸图片 + Lightbox 查看功能" \
  --body "实现多尺寸图片支持和 Lightbox 查看功能

## 功能
- 首次点击加载中图显示在气泡中
- 再次点击打开 Lightbox 查看
- 支持 HD 升级（如果图片有高清版本）
- 引用消息中的图片缩略图支持点击和 Lightbox
- 长截图在 Lightbox 中垂直滚动

## 技术实现
- 后端：parseImageXml 返回 hasHd 标志
- 后端：juhexbotAdapter.downloadImage 支持 fileType 参数（1=HD, 2=mid）
- 后端：ImageService.getImageUrl 支持 size 参数
- 后端：路由支持 size 查询参数
- 前端：chatApi.getImageUrl 支持 size 参数
- 前端：ImageLightbox 组件（基于 yet-another-react-lightbox）
- 前端：MessageItem 集成多尺寸图片和 Lightbox

## 测试
- [x] 后端单元测试通过
- [x] 前端类型检查通过
- [x] 端到端测试通过
- [x] 缓存机制验证
- [x] 并发去重验证

Closes #<issue_number>
"
```

- [ ] **Step 3: 等待 Review**

通知团队成员 review PR。

---

## 完成

所有任务完成后，多尺寸图片 + Lightbox 查看功能已实现并准备合并到主分支。

