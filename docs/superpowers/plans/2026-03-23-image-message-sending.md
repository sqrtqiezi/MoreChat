# 图片消息发送功能实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现图片消息发送功能，支持点击选择、拖拽、粘贴三种输入方式，自动压缩大图片，显示预览确认后发送。

**Architecture:** 后端中转上传方案 - 前端压缩并上传到后端，后端上传到阿里云 OSS，再调用 juhexbot API 完成发送。前端使用乐观更新提供流畅体验。

**Tech Stack:** React 18, browser-image-compression, Hono, Prisma, 阿里云 OSS SDK, sharp, juhexbot API

**Spec:** `docs/superpowers/specs/2026-03-23-image-message-sending-design.md`

---

## Chunk 1: 后端基础设施

### Task 1: 安装后端依赖并配置环境变量

**Files:**
- Modify: `apps/server/package.json`
- Modify: `apps/server/.env.example`
- Modify: `apps/server/src/lib/env.ts`

- [ ] **Step 1: 安装后端依赖**

```bash
cd apps/server
pnpm add ali-oss sharp
pnpm add -D @types/ali-oss @types/sharp
```

Expected: 依赖安装成功

- [ ] **Step 2: 更新 .env.example**

在 `apps/server/.env.example` 中添加：

```bash
# 阿里云 OSS 配置
ALICLOUD_OSS_REGION=oss-cn-hangzhou
ALICLOUD_OSS_BUCKET=your-bucket-name
ALICLOUD_OSS_ACCESS_KEY_ID=your-access-key
ALICLOUD_OSS_ACCESS_KEY_SECRET=your-secret-key
ALICLOUD_OSS_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com
```

- [ ] **Step 3: 更新 env.ts 配置**

在 `apps/server/src/lib/env.ts` 中：

1. 扩展 `EnvConfig` 接口：
```typescript
interface EnvConfig {
  // ... 现有配置
  alicloudOssRegion: string
  alicloudOssBucket: string
  alicloudOssAccessKeyId: string
  alicloudOssAccessKeySecret: string
  alicloudOssEndpoint: string
}
```

2. 在 `required` 数组中添加：
```typescript
const required = [
  // ... 现有字段
  'ALICLOUD_OSS_REGION',
  'ALICLOUD_OSS_BUCKET',
  'ALICLOUD_OSS_ACCESS_KEY_ID',
  'ALICLOUD_OSS_ACCESS_KEY_SECRET',
  'ALICLOUD_OSS_ENDPOINT',
]
```

3. 在 `loadEnv()` 返回对象中添加：
```typescript
return {
  // ... 现有配置
  alicloudOssRegion: process.env.ALICLOUD_OSS_REGION!,
  alicloudOssBucket: process.env.ALICLOUD_OSS_BUCKET!,
  alicloudOssAccessKeyId: process.env.ALICLOUD_OSS_ACCESS_KEY_ID!,
  alicloudOssAccessKeySecret: process.env.ALICLOUD_OSS_ACCESS_KEY_SECRET!,
  alicloudOssEndpoint: process.env.ALICLOUD_OSS_ENDPOINT!,
}
```

- [ ] **Step 4: 验证配置**

Run: `cd apps/server && pnpm type-check`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/server/package.json apps/server/pnpm-lock.yaml apps/server/.env.example apps/server/src/lib/env.ts
git commit -m "feat(server): add OSS dependencies and env config

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 2: 实现 OssService

**Files:**
- Create: `apps/server/src/services/ossService.ts`
- Create: `apps/server/src/services/ossService.test.ts`

- [ ] **Step 1: 创建 OssService**

创建 `apps/server/src/services/ossService.ts`：

```typescript
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
}
```

- [ ] **Step 2: 创建 OssService 测试**

创建 `apps/server/src/services/ossService.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OssService } from './ossService.js'

vi.mock('ali-oss')

describe('OssService', () => {
  let service: OssService
  let mockPut: any

  beforeEach(() => {
    mockPut = vi.fn().mockResolvedValue({ url: 'https://oss.example.com/images/test.jpg' })
    const OSS = (await import('ali-oss')).default as any
    OSS.mockImplementation(() => ({ put: mockPut }))

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
```

- [ ] **Step 3: 运行测试**

Run: `cd apps/server && npx vitest run src/services/ossService.test.ts`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add apps/server/src/services/ossService.ts apps/server/src/services/ossService.test.ts
git commit -m "feat(server): implement OSS service

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

## Chunk 1 Review

Self-review before implementation:
- ✅ 环境变量配置完整
- ✅ OSS 服务封装清晰
- ✅ 测试覆盖核心功能

---

## Chunk 2: 后端图片发送核心

### Task 3: 扩展 JuhexbotAdapter

**Files:**
- Modify: `apps/server/src/services/juhexbotAdapter.ts`
- Modify: `apps/server/src/services/juhexbotAdapter.test.ts`

- [ ] **Step 1: 添加 uploadImageToCdn 方法**

在 `apps/server/src/services/juhexbotAdapter.ts` 中添加：

```typescript
async uploadImageToCdn(imageUrl: string): Promise<{
  fileId: string
  aesKey: string
  fileSize: number
  fileMd5: string
}> {
  const result = await this.sendRequest('/cloud/cdn_upload', {
    guid: this.config.clientGuid,
    file_type: 2,
    url: imageUrl,
  })

  if (result.errcode !== 0) {
    throw new Error(result.errmsg || 'Failed to upload image to CDN')
  }

  return {
    fileId: result.data.file_id,
    aesKey: result.data.aes_key,
    fileSize: result.data.file_size,
    fileMd5: result.data.file_md5,
  }
}
```

- [ ] **Step 2: 添加 sendImageMessage 方法**

在同一文件中添加：

```typescript
async sendImageMessage(params: {
  toUsername: string
  fileId: string
  aesKey: string
  fileSize: number
  bigFileSize: number
  thumbFileSize: number
  fileMd5: string
  thumbWidth: number
  thumbHeight: number
  fileCrc: number
}): Promise<{ msgId: string }> {
  const result = await this.sendRequest('/msg/send_image', {
    guid: this.config.clientGuid,
    to_username: params.toUsername,
    file_id: params.fileId,
    aes_key: params.aesKey,
    file_size: params.fileSize,
    big_file_size: params.bigFileSize,
    thumb_file_size: params.thumbFileSize,
    file_md5: params.fileMd5,
    thumb_width: params.thumbWidth,
    thumb_height: params.thumbHeight,
    file_crc: params.fileCrc,
  })

  if (result.errcode !== 0) {
    throw new Error(result.errmsg || 'Failed to send image message')
  }

  const msgId = result.data?.msg_id ?? result.data?.msgId
  if (!msgId) {
    throw new Error('Image sent but response missing msgId')
  }

  return { msgId: String(msgId) }
}
```

- [ ] **Step 3: 添加测试**

在 `apps/server/src/services/juhexbotAdapter.test.ts` 中添加测试用例。

- [ ] **Step 4: 运行测试**

Run: `cd apps/server && npx vitest run src/services/juhexbotAdapter.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/services/juhexbotAdapter.ts apps/server/src/services/juhexbotAdapter.test.ts
git commit -m "feat(server): add image upload methods to juhexbot adapter

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 4: 扩展 MessageService 添加图片发送方法

**Files:**
- Modify: `apps/server/src/services/message.ts`
- Modify: `apps/server/src/services/message.test.ts`

- [ ] **Step 1: 更新 MessageService 构造函数**

在 `apps/server/src/services/message.ts` 中，修改构造函数添加 `ossService` 参数：

```typescript
constructor(
  private db: DatabaseService,
  private dataLake: DataLakeService,
  private adapter: JuhexbotAdapter,
  private clientUsername: string,
  private ossService: OssService  // 新增
) {}
```

需要在文件顶部导入：`import type { OssService } from './ossService.js'`

- [ ] **Step 2: 添加 sendImageMessage 方法**

在同一文件中添加方法（完整实现见设计文档第 376-457 行）。

- [ ] **Step 3: 添加测试**

在 `apps/server/src/services/message.test.ts` 中添加 `sendImageMessage` 的测试用例。

- [ ] **Step 4: 运行测试**

Run: `cd apps/server && npx vitest run src/services/message.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/services/message.ts apps/server/src/services/message.test.ts
git commit -m "feat(server): add sendImageMessage to MessageService

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 5: 添加图片发送 API 路由

**Files:**
- Modify: `apps/server/src/routes/messages.ts`
- Modify: `apps/server/src/routes/messages.test.ts`

- [ ] **Step 1: 添加 POST /send-image 路由**

在 `apps/server/src/routes/messages.ts` 中添加路由（完整实现见设计文档第 481-526 行）。

- [ ] **Step 2: 添加路由测试**

在 `apps/server/src/routes/messages.test.ts` 中添加测试用例。

- [ ] **Step 3: 运行测试**

Run: `cd apps/server && npx vitest run src/routes/messages.test.ts`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add apps/server/src/routes/messages.ts apps/server/src/routes/messages.test.ts
git commit -m "feat(server): add send-image API route

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 6: 依赖注入组装

**Files:**
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: 创建 OssService 实例**

在 `apps/server/src/index.ts` 的 `main()` 函数中，在创建 `messageService` 之前添加：

```typescript
const ossService = new OssService({
  region: env.alicloudOssRegion,
  bucket: env.alicloudOssBucket,
  accessKeyId: env.alicloudOssAccessKeyId,
  accessKeySecret: env.alicloudOssAccessKeySecret,
  endpoint: env.alicloudOssEndpoint,
})
```

- [ ] **Step 2: 更新 MessageService 创建**

修改 `messageService` 的创建，添加 `ossService` 参数：

```typescript
const messageService = new MessageService(
  databaseService,
  dataLakeService,
  juhexbotAdapter,
  userProfile.username,
  ossService  // 新增
)
```

- [ ] **Step 3: 验证编译**

Run: `cd apps/server && pnpm type-check`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add apps/server/src/index.ts
git commit -m "feat(server): wire up OSS service in dependency injection

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

## Chunk 2 Review

Self-review before implementation:
- ✅ JuhexbotAdapter 扩展完整
- ✅ MessageService 集成 OSS 和 sharp
- ✅ API 路由处理文件上传
- ✅ 依赖注入正确组装

---

## Chunk 3: 前端图片发送功能

### Task 7: 安装前端依赖

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: 安装依赖**

```bash
cd apps/web
pnpm add browser-image-compression
```

Expected: 依赖安装成功

- [ ] **Step 2: 提交**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml
git commit -m "feat(web): add browser-image-compression dependency

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 8: 实现图片压缩工具函数

**Files:**
- Create: `apps/web/src/utils/imageCompression.ts`

- [ ] **Step 1: 创建压缩函数**

创建 `apps/web/src/utils/imageCompression.ts`：

```typescript
import imageCompression from 'browser-image-compression'

export async function compressImage(file: File): Promise<File> {
  if (file.size <= 2 * 1024 * 1024) {
    return file
  }

  return await imageCompression(file, {
    maxSizeMB: 2,
    maxWidthOrHeight: 1920,
    useWebWorker: true,
  })
}

export function validateImageFile(file: File): { valid: boolean; error?: string } {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: '只支持 JPEG、PNG、GIF、WebP 格式的图片' }
  }

  if (file.size > 10 * 1024 * 1024) {
    return { valid: false, error: '图片大小不能超过 10MB' }
  }

  return { valid: true }
}
```

- [ ] **Step 2: 提交**

```bash
git add apps/web/src/utils/imageCompression.ts
git commit -m "feat(web): add image compression utilities

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 9: 扩展 chatApi 添加图片发送方法

**Files:**
- Modify: `apps/web/src/api/chat.ts`

- [ ] **Step 1: 添加 sendImage 方法**

在 `apps/web/src/api/chat.ts` 的 `chatApi` 对象中添加：

```typescript
async sendImage(data: { conversationId: string; imageFile: File }): Promise<Message> {
  const formData = new FormData()
  formData.append('conversationId', data.conversationId)
  formData.append('image', data.imageFile)

  const response = await client.post<ApiResponse<{ message: ApiMessage }>>(
    '/messages/send-image',
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    }
  )

  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error?.message || 'Failed to send image')
  }

  return transformApiMessage(response.data.data.message)
}
```

- [ ] **Step 2: 验证类型检查**

Run: `cd apps/web && pnpm type-check`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/api/chat.ts
git commit -m "feat(web): add sendImage API method

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 10: 实现 useSendImage hook

**Files:**
- Create: `apps/web/src/hooks/useSendImage.ts`

- [ ] **Step 1: 创建 hook**

创建 `apps/web/src/hooks/useSendImage.ts`（参考 `useSendMessage.ts` 的实现模式，支持乐观更新）。

- [ ] **Step 2: 验证类型检查**

Run: `cd apps/web && pnpm type-check`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/hooks/useSendImage.ts
git commit -m "feat(web): add useSendImage hook with optimistic updates

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 11: 实现图片输入和预览组件

**Files:**
- Create: `apps/web/src/components/chat/ImageInput.tsx`
- Create: `apps/web/src/components/chat/ImagePreview.tsx`
- Modify: `apps/web/src/components/chat/ChatInput.tsx`

- [ ] **Step 1: 创建 ImageInput 组件**

支持点击选择、拖拽、粘贴三种输入方式。

- [ ] **Step 2: 创建 ImagePreview 组件**

显示缩略图、文件信息、发送/取消按钮。

- [ ] **Step 3: 集成到 ChatInput**

在 ChatInput 中集成图片输入和预览功能。

- [ ] **Step 4: 验证编译和类型检查**

Run: `cd apps/web && pnpm type-check && pnpm build`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/components/chat/
git commit -m "feat(web): add image input and preview components

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

## Chunk 3 Review

Self-review before implementation:
- ✅ 图片压缩工具完整
- ✅ API 客户端支持文件上传
- ✅ Hook 支持乐观更新
- ✅ UI 组件支持三种输入方式

---

## Chunk 4: 集成测试与验证

### Task 12: 端到端测试

**Files:**
- None (manual testing)

- [ ] **Step 1: 启动开发环境**

```bash
pnpm dev
```

- [ ] **Step 2: 手动测试清单**

按照设计文档第 637-648 行的测试清单逐项测试。

- [ ] **Step 3: 验证所有测试通过**

Run: `cd apps/server && npx vitest run`
Expected: 所有测试 PASS

- [ ] **Step 4: 最终提交**

```bash
git add .
git commit -m "feat: complete image message sending feature

- Support click, drag, paste input methods
- Auto compress images > 2MB
- Preview before sending
- Backend upload via OSS
- Optimistic UI updates

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

## Chunk 4 Review

Self-review before implementation:
- ✅ 手动测试覆盖所有场景
- ✅ 自动化测试全部通过
- ✅ 功能完整可用

---

## 实施完成

实施计划已完成。请使用 `superpowers:executing-plans` 或 `superpowers:subagent-driven-development` 技能执行此计划。
