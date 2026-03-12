# 图片消息显示功能设计

## 概述

为 MoreChat 添加图片消息的按需下载与显示功能。用户在消息窗口看到图片类型占位符，点击后触发后端调用微信 Cloud API 获取图片下载 URL，前端渲染图片。下载 URL 永久有效（已通过 diting 项目长期使用验证），缓存在独立的 ImageCache 表中，避免重复请求。

## 背景

- 图片消息（msgType=3）的 content 是 XML，包含 `aes_key` 和 `cdnmidimgurl`（即 Cloud API 的 `file_id`）
- 微信 Cloud API（`/cloud/download`）可通过这两个参数获取图片的永久下载 URL
- diting 项目已实现批量提取和下载流程，本次移植其核心调用逻辑，但不做批量处理

## 前置条件

- **验证图片消息 XML 结构**：实现前必须从服务器日志或 DataLake 中获取真实的图片消息（msgType=3）content 字段，确认 XML 格式与 diting 中解析的一致（`<msg><img aeskey="..." cdnmidimgurl="..." encryver="1" .../></msg>`）

## 架构设计

### 整体流程

```
用户点击图片占位符
  → 前端 GET /api/messages/:msgId/image（TanStack Query 缓存）
  → 后端 ImageService.getImageUrl(msgId)
    → 查 ImageCache 表
      → 有 downloadUrl → 直接返回
      → 无记录 → 从 DataLake 读原始消息 XML
        → parseImageXml 解析出 aesKey + fileId (cdnmidimgurl)
        → 存入 ImageCache（无 downloadUrl）
        → 调用 JuhexbotAdapter.downloadImage
          → getCdnInfo（走网关 API，使用 config.clientGuid）
          → POST JUHEXBOT_CLOUD_API_URL/cloud/download
        → 获取 downloadUrl → 更新 ImageCache
        → 返回 { imageUrl }
  → 前端渲染 <img>
```

### 新增环境变量

| 变量 | 说明 | 必填 |
|------|------|------|
| `JUHEXBOT_CLOUD_API_URL` | 微信 Cloud API 地址（独立部署服务） | 是 |

需同步更新：
- `apps/server/src/lib/env.ts` — EnvConfig 接口和 required 列表
- `.github/` 部署配置 — 添加环境变量映射
- GitHub Secrets — 配置实际值

### 数据库 — ImageCache 表

新建 Prisma model：

```prisma
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

### 后端组件

#### 1. JuhexbotAdapter 扩展

新增两个方法，`guid` 统一使用 `this.config.clientGuid`（与现有 adapter 方法一致）：

- `getCdnInfo()`: 通过现有网关调用 `/cloud/get_cdn_info`，返回 `{ cdn_info, client_version, device_type, username }`
- `downloadImage(aesKey: string, fileId: string, fileName: string)`: 先调 `getCdnInfo` 构造 `base_request`，再直接 POST 到 `JUHEXBOT_CLOUD_API_URL/cloud/download`（不走网关），返回 `download_url`

`downloadImage` 请求体：

```json
{
  "base_request": { "cdn_info": "...", "client_version": 0, "device_type": "...", "username": "..." },
  "aes_key": "...",
  "file_id": "...",
  "file_name": "<msgId>.jpg",
  "file_type": 1
}
```

注意：`JuhexbotConfig` 接口需新增 `cloudApiUrl: string` 字段。

#### 2. 图片 XML 解析

在 `messageContentProcessor.ts` 中新增 `parseImageXml(content: string)` 函数：

- 解析 `<msg><img aeskey="..." cdnmidimgurl="..." encryver="1" .../></msg>` 格式
- 仅处理 `encryver="1"` 的加密图片
- 返回 `{ aesKey: string, fileId: string } | null`（`fileId` 即 XML 中的 `cdnmidimgurl`）
- 使用现有的 `fast-xml-parser` 实例
- 非 `encryver="1"` 或解析失败返回 `null`

#### 3. 图片服务（ImageService）

新建 `services/imageService.ts`，封装图片获取逻辑：

- 依赖：Prisma client、DataLake service、JuhexbotAdapter
- `getImageUrl(msgId: string): Promise<string>` — 主方法
- 内置 per-msgId 的 Promise 缓存（`Map<string, Promise<string>>`），防止并发请求重复调用 Cloud API。请求完成后从 Map 中移除。

#### 4. API 路由

扩展现有 `messageRoutes`（`apps/server/src/routes/messages.ts`），新增 `GET /:msgId/image`。

`MessageRouteDeps` 接口新增 `imageService: ImageService`。

| 状态码 | 场景 |
|--------|------|
| 200 | 成功，返回 `{ imageUrl: string }` |
| 404 | 消息不存在 |
| 422 | 非图片消息、XML 解析失败、或不支持的图片格式（非 encryver="1"） |
| 502 | Cloud API 调用失败 |

#### 5. 依赖注入组装

`apps/server/src/index.ts` 的 `main()` 中：
- 创建 `ImageService` 实例，注入 prisma、dataLakeService、juhexbotAdapter
- 传入 `createApp` 的 deps 对象

`apps/server/src/app.ts` 的 `AppDependencies` 接口新增 `imageService: ImageService`。

### 归档修改

`archiveService.ts` 修改：

- 构造函数新增 Prisma client 依赖（`ArchiveConfig` 或构造函数参数）
- `MESSAGE_COLUMNS` 新增 `image_url` 列
- `archiveHotToDaily` 写 Parquet 前，批量查询 ImageCache 表（按当日消息的 msgId 列表），将已下载的 `downloadUrl` 合并到消息记录的 `image_url` 字段
- 未下载的图片 `image_url` 写空字符串
- 月度归档合并不受影响（只是多了一列）
- `index.ts` 中 `ArchiveService` 的创建需传入 prisma client

### 前端组件

#### MessageItem 图片渲染

对 `displayType === 'image'` 的消息：

**初始状态：** 图片占位符，带图片图标和"点击查看图片"提示，可点击

**点击后：**
1. 显示加载状态（spinner）
2. 调用 `GET /api/messages/:msgId/image`
3. 成功 → 渲染 `<img>`，最大宽度 300px
4. 失败 → 显示错误提示，支持重试

**前端缓存：** 使用 TanStack Query 管理请求和缓存（项目已有此依赖），query key 为 `['image', msgId]`，`enabled: false` + 手动 `refetch` 实现点击触发。缓存自动处理组件卸载/重新挂载时的去重。

#### chatApi 扩展

新增 `getImageUrl(msgId: string): Promise<string>` 函数。

### 部署配置

- `.github/` 部署工作流中添加 `JUHEXBOT_CLOUD_API_URL` 环境变量映射
- 服务器上配置对应的 GitHub Secret 或环境变量

## 不做的事情

- 不做批量预下载
- 不做图片缩略图生成
- 不修改 DataLake 中的历史消息数据

## 后续优化方向（不在本期范围）

- getMessages API 批量附带已缓存的 imageUrl，减少点击请求
- 图片预览大图 / 图片查看器
- 前端图片加载失败时的降级重新获取（应对极端情况下 URL 失效）
