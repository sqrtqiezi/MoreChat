# 文件消息下载功能设计

Issue: #7 - 文件消息，可以下载文件

## 背景

当前 type 49 消息处理了链接（type=5）、引用（type=57）、视频号（finderFeed），但未处理文件消息（appmsg type=6）。文件消息在前端显示为 `[不支持的消息类型]`。

## 真实数据结构

文件消息为 `msg_type=49`，`appmsg type=6`：

```xml
<appmsg appid="..." sdkver="0">
  <title>Claude Code Cheat Sheet.pdf</title>
  <type>6</type>
  <appattach>
    <totallen>448797</totallen>
    <attachid>@cdn_305702...</attachid>
    <fileext>pdf</fileext>
    <cdnattachurl>305702...</cdnattachurl>
    <aeskey>de1ff3c9945e7d26f96b6a1432bb78ed</aeskey>
    <fileuploadtoken>v1_...</fileuploadtoken>
  </appattach>
  <md5>dcacefe202a72887a574ff53e98b95e6</md5>
</appmsg>
<extcommoninfo>
  <media_expire_at>1775527959</media_expire_at>
</extcommoninfo>
```

注意：`appmsg type=74` 是同一文件的重复通知消息（缺少 cdnattachurl/aeskey），应忽略。

## 方案

即时下载模式（与 ImageCache/EmojiCache 一致）：
- 用户点击 → 后端从 juhexbot CDN 下载 → 上传 OSS → 缓存 URL → 返回
- 第二次点击直接返回缓存 URL

## 数据层

新增 `FileCache` 模型：

```prisma
model FileCache {
  msgId        String   @id
  fileName     String
  fileExt      String
  fileSize     Int
  aesKey       String
  cdnFileId    String
  md5          String?
  ossUrl       String?
  status       String   @default("pending")
  errorMessage String?
  downloadedAt DateTime?
}
```

## 后端

### 消息处理（messageContentProcessor.ts）

type 49 新增 `appmsg type=6` 分支：
- 解析 title、appattach（totallen/fileext/cdnattachurl/aeskey）、md5
- 返回 `displayType: 'file'`，`displayContent` 为文件名
- 创建 FileCache 记录（status=pending）

### 下载 API

`GET /api/messages/:msgId/file`：
1. 查 FileCache，`downloaded` 直接返回 `{ ossUrl, fileName, fileSize, fileExt }`
2. `pending` → 调用 juhexbot `/cloud/download` → 下载 → 上传 OSS → 更新缓存 → 返回

## 前端

### displayType: 'file'

新增 `FileMessage` 组件，微信风格气泡：
- 左侧：文件类型图标（PDF/DOC/XLS 等）
- 右侧：文件名 + 文件大小（人类可读格式）
- 点击整个卡片触发下载
- 状态：idle → downloading（loading 动画）→ 浏览器保存

### 数据流

```
点击卡片 → GET /api/messages/:msgId/file
         → { ossUrl, fileName, fileSize, fileExt }
         → <a href={ossUrl} download={fileName}> 触发下载
```
