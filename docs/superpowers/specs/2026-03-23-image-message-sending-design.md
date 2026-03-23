---
name: 图片消息发送功能设计
description: 为 MoreChat 添加图片消息发送功能，支持多种输入方式、自动压缩、预览确认和完整的发送流程
type: feature
date: 2026-03-23
---

# 图片消息发送功能设计

## 概述

为 MoreChat 添加图片消息发送功能，支持点击选择、拖拽、粘贴三种输入方式，自动压缩大图片，显示预览确认后发送。图片通过后端中转上传到阿里云 OSS，再调用 juhexbot API 完成发送。

## 背景

- 项目已实现图片消息的显示功能（按需下载）
- 项目已实现文本消息的发送功能（包括乐观更新和去重）
- juhexbot API 提供 `/cloud/cdn_upload` 和 `/msg/send_image` 接口
- 需要先将图片上传获取 `file_id` 等参数，再调用发送接口

## 用户需求

1. **多种输入方式**：支持点击选择文件、拖拽图片到聊天窗口、粘贴剪贴板图片
2. **自动压缩**：大于 2MB 的图片自动压缩，保持合理质量
3. **预览确认**：发送前显示缩略图预览，用户确认后发送
4. **安全性**：阿里云 OSS 凭证不暴露到前端
5. **用户体验**：乐观更新、上传进度、错误重试

## 架构设计

### 整体流程

```
用户选择/拖拽/粘贴图片
  ↓
前端压缩图片（>2MB）
  ↓
显示预览（缩略图 + 文件信息）
  ↓
用户点击发送
  ↓
前端上传到后端（multipart/form-data）
  ↓
后端接收并上传到阿里云 OSS
  ↓
后端调用 juhexbot /cloud/cdn_upload（传入 OSS URL）
  ↓
后端调用 juhexbot /msg/send_image（传入 file_id、aes_key 等）
  ↓
后端存储到 DataLake + MessageIndex
  ↓
WebSocket 推送消息到前端
  ↓
前端显示已发送的图片消息
```

### 技术选型

| 组件 | 技术方案 | 说明 |
|------|----------|------|
| 前端图片压缩 | browser-image-compression | 轻量级，支持 Web Worker，不阻塞 UI |
| 后端文件上传 | Hono 内置 multipart | 无需额外依赖 |
| OSS SDK | @alicloud/oss-client | 阿里云官方 Node.js SDK |
| 支持格式 | JPEG、PNG、GIF、WebP | 常见图片格式 |

### 方案选择

**选择方案：后端中转上传**

**理由：**
1. **安全性最好**：阿里云 OSS AK/SK 只在后端，不会暴露到前端
2. **实现简单**：前端只需标准文件上传，不需要集成 OSS SDK
3. **易于维护**：所有 OSS 逻辑集中在后端
4. **性能可接受**：前端已压缩图片（≤2MB），中转性能损失可控

**未选择的方案：**
- 前端直传 OSS（使用 STS 临时凭证）：虽然性能最优，但增加复杂度（需要实现 STS 服务、配置 CORS、集成 OSS SDK）

## 前端设计

### 1. 图片输入组件（ImageInput）

**功能：** 支持三种图片输入方式

**实现：**

- **点击选择**：`<input type="file" accept="image/*" multiple={false}>`
- **拖拽上传**：监听聊天输入区域的 `dragover`、`drop` 事件，从 `dataTransfer.files` 获取图片
- **粘贴上传**：监听 `paste` 事件，从 `clipboardData.items` 中提取图片文件

**文件验证：**
- 只接受图片类型（JPEG、PNG、GIF、WebP）
- 单次只支持一张图片
- 最大原始文件大小：10MB（超过则提示用户）

### 2. 图片压缩逻辑

**压缩策略：**
- 文件大小 ≤ 2MB：不压缩，直接使用原图
- 文件大小 > 2MB：自动压缩到 2MB 以内

**实现：**

```typescript
import imageCompression from 'browser-image-compression'

async function compressImage(file: File): Promise<File> {
  if (file.size <= 2 * 1024 * 1024) {
    return file // 小于 2MB，不压缩
  }

  return await imageCompression(file, {
    maxSizeMB: 2,
    maxWidthOrHeight: 1920,
    useWebWorker: true, // 使用 Web Worker，不阻塞 UI
  })
}
```

### 3. 预览组件（ImagePreview）

**显示内容：**
- 缩略图预览（最大 200px × 200px，保持宽高比）
- 文件名
- 文件大小（压缩前/压缩后）
- 发送按钮
- 取消按钮

**交互：**
- 点击发送：调用 `useSendImage` hook 上传并发送
- 点击取消：清除预览，恢复输入框
- 支持键盘快捷键：Enter 发送，Esc 取消

### 4. 发送 Hook（useSendImage）

**功能：** 类似 `useSendMessage`，支持乐观更新和错误处理

**实现：**

```typescript
interface SendImageData {
  conversationId: string
  imageFile: File
}

export function useSendImage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: SendImageData) => chatApi.sendImage(data),

    onMutate: async (variables) => {
      // 构造临时图片消息（status: 'sending'）
      // 显示 loading 占位符
      // 写入 TanStack Query 缓存
    },

    onSuccess: (data, variables, context) => {
      // 用真实消息替换临时消息
      // 将 msgId 加入 pendingMsgIds（防止 WebSocket 重复）
      // 刷新会话列表
    },

    onError: (error, variables, context) => {
      // 标记消息为失败状态
      // 保留在列表中，支持重试
    },
  })
}
```

### 5. API 客户端扩展

在 `apps/web/src/api/chat.ts` 中新增：

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
      timeout: 60000, // 60 秒超时
    }
  )

  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error?.message || 'Failed to send image')
  }

  return transformApiMessage(response.data.data.message)
}
```

## 后端设计

### 1. 环境变量配置

**新增环境变量：**

在 `apps/server/.env` 中添加：

```bash
# 阿里云 OSS 配置
ALICLOUD_OSS_REGION=oss-cn-hangzhou
ALICLOUD_OSS_BUCKET=your-bucket-name
ALICLOUD_OSS_ACCESS_KEY_ID=your-access-key
ALICLOUD_OSS_ACCESS_KEY_SECRET=your-secret-key
ALICLOUD_OSS_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com
```

**更新 EnvConfig：**

在 `apps/server/src/lib/env.ts` 中扩展接口：

```typescript
export interface EnvConfig {
  // ... 现有配置
  alicloudOssRegion: string
  alicloudOssBucket: string
  alicloudOssAccessKeyId: string
  alicloudOssAccessKeySecret: string
  alicloudOssEndpoint: string
}
```

并在 `required` 列表中添加这些字段。

### 2. OSS 服务（OssService）

**文件：** `apps/server/src/services/ossService.ts`

**职责：** 封装阿里云 OSS 上传逻辑

**接口：**

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
    // 生成唯一文件名：images/{timestamp}_{random}_{filename}
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8)
    const ext = filename.split('.').pop()
    const objectName = `images/${timestamp}_${random}.${ext}`

    // 上传到 OSS
    const result = await this.client.put(objectName, buffer)

    // 返回公网 URL
    return result.url
  }
}
```

**Why：** 将 OSS 逻辑封装为独立服务，便于测试和维护。

**How to apply：** 在 `index.ts` 中创建实例并注入到其他服务。

### 3. JuhexbotAdapter 扩展

**文件：** `apps/server/src/services/juhexbotAdapter.ts`

**新增方法：**

```typescript
// 上传图片到微信 CDN
async uploadImageToCdn(imageUrl: string): Promise<{
  fileId: string
  aesKey: string
  fileSize: number
  fileMd5: string
}> {
  const result = await this.sendRequest('/cloud/cdn_upload', {
    guid: this.config.clientGuid,
    file_type: 2, // 图片类型
    url: imageUrl,
  })

  if (result.errcode !== 0) {
    throw new Error(result.errmsg || 'Failed to upload image to CDN')
  }

  // 返回发送图片所需的参数
  return {
    fileId: result.data.file_id,
    aesKey: result.data.aes_key,
    fileSize: result.data.file_size,
    fileMd5: result.data.file_md5,
  }
}

// 发送图片消息
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

### 4. MessageService 扩展

**文件：** `apps/server/src/services/message.ts`

**新增方法：**

```typescript
async sendImageMessage(
  conversationId: string,
  imageBuffer: Buffer,
  filename: string
): Promise<ApiMessage> {
  // 1. 查询会话信息
  const conversation = await this.db.findConversationById(conversationId)
  if (!conversation) {
    throw new Error('Conversation not found')
  }

  const toUsername = conversation.type === 'private'
    ? (conversation.contact?.username || '')
    : (conversation.group?.roomUsername || '')

  // 2. 上传到 OSS
  const ossUrl = await this.ossService.uploadImage(imageBuffer, filename)

  // 3. 上传到微信 CDN
  const cdnResult = await this.juhexbotAdapter.uploadImageToCdn(ossUrl)

  // 4. 获取图片尺寸（使用 sharp 库）
  const metadata = await sharp(imageBuffer).metadata()
  const thumbWidth = metadata.width || 0
  const thumbHeight = metadata.height || 0

  // 5. 发送图片消息
  const { msgId } = await this.juhexbotAdapter.sendImageMessage({
    toUsername,
    fileId: cdnResult.fileId,
    aesKey: cdnResult.aesKey,
    fileSize: cdnResult.fileSize,
    bigFileSize: cdnResult.fileSize,
    thumbFileSize: cdnResult.fileSize,
    fileMd5: cdnResult.fileMd5,
    thumbWidth,
    thumbHeight,
    fileCrc: 0, // 可选，暂时传 0
  })

  // 6. 构造消息对象
  const createTime = Math.floor(Date.now() / 1000)
  const message = {
    msgId,
    msgType: 3,
    fromUsername: this.clientUsername,
    toUsername,
    content: '', // 图片消息的 content 是 XML，暂时为空
    createTime,
    chatroomSender: conversation.type === 'group' ? this.clientUsername : undefined,
    displayType: 'image',
    displayContent: ossUrl, // 使用 OSS URL 作为显示内容
  }

  // 7. 存储到 DataLake 和 MessageIndex
  await this.dataLakeService.saveMessage(conversationId, message)
  await this.db.createMessageIndex({
    msgId,
    conversationId,
    msgType: 3,
    createTime,
    dataLakeKey: `conversations/${conversationId}/messages/${createTime}_${msgId}.json`,
  })

  return message
}
```

**依赖注入：**

在 `MessageService` 构造函数中新增 `ossService: OssService` 参数。

### 5. API 路由

**文件：** `apps/server/src/routes/messages.ts`

**新增路由：**

```typescript
router.post('/send-image', async (c) => {
  try {
    const body = await c.req.parseBody()
    const conversationId = body.conversationId as string
    const imageFile = body.image as File

    if (!conversationId || !imageFile) {
      return c.json({
        success: false,
        error: { message: 'Missing conversationId or image' }
      }, 400)
    }

    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(imageFile.type)) {
      return c.json({
        success: false,
        error: { message: 'Invalid image type' }
      }, 422)
    }

    // 读取文件内容
    const arrayBuffer = await imageFile.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // 调用 MessageService 发送图片
    const message = await deps.messageService.sendImageMessage(
      conversationId,
      buffer,
      imageFile.name
    )

    // 通过 WebSocket 广播消息
    deps.wsService.broadcastMessage(conversationId, message)

    return c.json({ success: true, data: { message } })
  } catch (error) {
    logger.error({ err: error }, 'Failed to send image message')
    return c.json({
      success: false,
      error: { message: 'Failed to send image message' }
    }, 500)
  }
})
```

### 6. 依赖注入组装

**文件：** `apps/server/src/index.ts`

在 `main()` 函数中：

```typescript
// 创建 OSS 服务
const ossService = new OssService({
  region: env.alicloudOssRegion,
  bucket: env.alicloudOssBucket,
  accessKeyId: env.alicloudOssAccessKeyId,
  accessKeySecret: env.alicloudOssAccessKeySecret,
  endpoint: env.alicloudOssEndpoint,
})

// 创建 MessageService 时注入 ossService
const messageService = new MessageService({
  db: databaseService,
  dataLakeService,
  juhexbotAdapter,
  ossService, // 新增
  clientUsername: env.juhexbotClientUsername,
})
```

## 数据库设计

图片消息复用现有的消息存储架构，不需要新增表：

- **MessageIndex**：存储消息元数据，`msgType=3`（图片消息）
- **DataLake**：存储完整的原始消息 JSON
- **ImageCache**：复用现有表，用于存储接收到的图片下载 URL（发送的图片不需要缓存，因为 OSS URL 已经可用）

**Why：** 发送的图片消息不需要新增表，因为 OSS URL 已经在消息对象中，图片元数据存储在 DataLake 的 JSON 中。

## 错误处理

### 前端错误处理

| 错误类型 | 处理方式 |
|---------|---------|
| 文件类型错误 | 只接受图片格式，其他文件类型显示 toast 提示 |
| 文件过大 | 原图超过 10MB 时提示用户，拒绝上传 |
| 压缩失败 | 显示错误提示，建议用户选择其他图片 |
| 上传失败 | 消息标记为 `failed`，显示重试按钮 |
| 网络超时 | 60 秒超时，超时后标记为失败，支持重试 |

### 后端错误处理

| 错误场景 | HTTP 状态码 | 处理方式 |
|---------|------------|---------|
| 缺少参数 | 400 | 返回错误信息 |
| 文件类型不支持 | 422 | 返回错误信息 |
| 会话不存在 | 404 | 返回错误信息 |
| OSS 上传失败 | 502 | 记录日志，返回错误信息，前端可重试 |
| juhexbot API 失败 | 502 | 记录日志，返回具体错误信息 |
| 其他服务器错误 | 500 | 记录日志，返回通用错误信息 |

## 测试策略

### 后端单元测试

**OssService 测试：** `apps/server/src/services/ossService.test.ts`
- Mock OSS SDK
- 测试 `uploadImage` 方法返回正确的 URL

**JuhexbotAdapter 测试：** `apps/server/src/services/juhexbotAdapter.test.ts`
- Mock fetch
- 测试 `uploadImageToCdn` 方法
- 测试 `sendImageMessage` 方法
- 测试错误处理（errcode !== 0）

**MessageService 测试：** `apps/server/src/services/message.test.ts`
- Mock 所有依赖（db、dataLakeService、juhexbotAdapter、ossService）
- 测试 `sendImageMessage` 完整流程
- 测试会话不存在的错误场景

### 后端集成测试

**路由测试：** `apps/server/src/routes/messages.test.ts`
- 测试 `POST /send-image` 成功场景
- 测试缺少参数（400）
- 测试文件类型错误（422）
- 测试会话不存在（404）

### 前端单元测试

**图片压缩测试：**
- 测试小于 2MB 的图片不压缩
- 测试大于 2MB 的图片自动压缩

**useSendImage Hook 测试：**
- Mock chatApi.sendImage
- 测试乐观更新（onMutate）
- 测试成功场景（onSuccess）
- 测试失败场景（onError）

**事件处理测试：**
- 测试拖拽事件处理
- 测试粘贴事件处理
- 测试文件类型验证

### 手动测试清单

- [ ] 点击选择图片并发送
- [ ] 拖拽图片到聊天窗口并发送
- [ ] 粘贴剪贴板图片并发送
- [ ] 发送小图片（< 2MB）
- [ ] 发送大图片（> 2MB），验证自动压缩
- [ ] 发送各种格式（JPEG、PNG、GIF、WebP）
- [ ] 取消发送
- [ ] 网络断开时发送（验证错误处理）
- [ ] 发送失败后重试
- [ ] 私聊发送图片
- [ ] 群聊发送图片
- [ ] 验证 WebSocket 推送不重复

## 部署配置

### 环境变量配置

在生产环境的 `.env` 文件中添加阿里云 OSS 配置：

```bash
ALICLOUD_OSS_REGION=oss-cn-hangzhou
ALICLOUD_OSS_BUCKET=morechat-images
ALICLOUD_OSS_ACCESS_KEY_ID=<your-access-key>
ALICLOUD_OSS_ACCESS_KEY_SECRET=<your-secret-key>
ALICLOUD_OSS_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com
```

### GitHub Actions 配置

在 `.github/workflows/deploy.yml` 中添加环境变量映射：

```yaml
env:
  ALICLOUD_OSS_REGION: ${{ secrets.ALICLOUD_OSS_REGION }}
  ALICLOUD_OSS_BUCKET: ${{ secrets.ALICLOUD_OSS_BUCKET }}
  ALICLOUD_OSS_ACCESS_KEY_ID: ${{ secrets.ALICLOUD_OSS_ACCESS_KEY_ID }}
  ALICLOUD_OSS_ACCESS_KEY_SECRET: ${{ secrets.ALICLOUD_OSS_ACCESS_KEY_SECRET }}
  ALICLOUD_OSS_ENDPOINT: ${{ secrets.ALICLOUD_OSS_ENDPOINT }}
```

并在 GitHub Secrets 中配置对应的值。

### 阿里云 OSS 配置

1. **创建 Bucket**：在阿里云 OSS 控制台创建 Bucket，设置为公共读
2. **配置 CORS**：允许前端预览图片（虽然本方案不需要前端直传，但预览时需要）
3. **生命周期规则**（可选）：设置图片过期删除策略

## 依赖包

### 前端新增依赖

```bash
cd apps/web
pnpm add browser-image-compression
```

### 后端新增依赖

```bash
cd apps/server
pnpm add ali-oss sharp
pnpm add -D @types/ali-oss @types/sharp
```

## 不在范围内

以下功能不在本次实现范围内，可作为后续优化：

- 图片编辑（裁剪、旋转、滤镜等）
- 批量发送多张图片
- 图片发送进度条（显示上传百分比）
- 图片预加载和缓存优化
- 图片懒加载
- 发送原图选项（不压缩）
- 图片水印

## 总结

本设计方案实现了完整的图片消息发送功能，支持多种输入方式、自动压缩、预览确认和完整的错误处理。采用后端中转上传方案，平衡了安全性、简单性和性能。前端使用乐观更新提供流畅的用户体验，后端通过服务分层保持代码清晰可维护。
