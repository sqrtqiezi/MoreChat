# 文件消息下载功能 实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 支持文件消息（appmsg type=6）的识别、展示和下载

**Architecture:** 后端解析 type 49 中 appmsg type=6 的文件消息，提取元数据存入 FileCache。前端展示微信风格文件卡片，点击触发后端从 juhexbot CDN 下载 → 上传 OSS → 返回永久 URL。

**Tech Stack:** Prisma (SQLite), Hono, juhexbot Cloud API, ali-oss, React, TanStack Query

---

### Task 1: 添加 FileCache 数据库模型

**Files:**
- Modify: `apps/server/prisma/schema.prisma`
- Modify: `apps/server/src/services/database.ts`

**Step 1: 在 schema.prisma 末尾添加 FileCache 模型**

在 `EmojiCache` 模型之后添加：

```prisma
// 文件缓存
model FileCache {
  msgId        String    @id @map("msg_id")
  fileName     String    @map("file_name")
  fileExt      String    @map("file_ext")
  fileSize     Int       @map("file_size")
  aesKey       String    @map("aes_key")
  cdnFileId    String    @map("cdn_file_id")
  md5          String?
  ossUrl       String?   @map("oss_url")
  status       String    @default("pending")
  errorMessage String?   @map("error_message")
  createdAt    DateTime  @default(now()) @map("created_at")
  downloadedAt DateTime? @map("downloaded_at")

  @@map("file_cache")
  @@index([status])
}
```

**Step 2: 在 database.ts 的 pushSchema 方法中添加 file_cache 表创建**

在 `emoji_cache` 表创建之后添加：

```typescript
await this.prisma.$executeRawUnsafe(`
  CREATE TABLE IF NOT EXISTS "file_cache" (
    "msg_id" TEXT NOT NULL PRIMARY KEY,
    "file_name" TEXT NOT NULL,
    "file_ext" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "aes_key" TEXT NOT NULL,
    "cdn_file_id" TEXT NOT NULL,
    "md5" TEXT,
    "oss_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "downloaded_at" DATETIME
  )
`)
await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "file_cache_status_idx" ON "file_cache"("status")`)
```

**Step 3: 在 database.ts 末尾添加 FileCache CRUD 方法**

在 `updateEmojiCache` 方法之后、class 结束之前添加：

```typescript
// --- FileCache ---

async createFileCache(data: {
  msgId: string
  fileName: string
  fileExt: string
  fileSize: number
  aesKey: string
  cdnFileId: string
  md5?: string
}) {
  return this.prisma.fileCache.create({
    data: {
      msgId: data.msgId,
      fileName: data.fileName,
      fileExt: data.fileExt,
      fileSize: data.fileSize,
      aesKey: data.aesKey,
      cdnFileId: data.cdnFileId,
      md5: data.md5,
      status: 'pending'
    }
  })
}

async findFileCacheByMsgId(msgId: string) {
  return this.prisma.fileCache.findUnique({
    where: { msgId }
  })
}

async updateFileCache(msgId: string, data: {
  status?: string
  ossUrl?: string
  errorMessage?: string
  downloadedAt?: Date
}) {
  return this.prisma.fileCache.update({
    where: { msgId },
    data
  })
}
```

**Step 4: 生成 Prisma Client**

Run: `cd apps/server && npx prisma generate`
Expected: Prisma Client generated successfully

**Step 5: Commit**

```bash
git add apps/server/prisma/schema.prisma apps/server/src/services/database.ts
git commit -m "feat: add FileCache model for file message downloads

Closes #7 (partial)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 解析文件消息 XML 并添加 displayType: 'file'

**Files:**
- Modify: `apps/server/src/services/messageContentProcessor.ts`

**Step 1: 添加 FileInfo 接口和 parseFileXml 函数**

在 `parseEmojiXml` 函数之后添加：

```typescript
export interface FileInfo {
  fileName: string
  fileExt: string
  fileSize: number
  aesKey: string
  cdnFileId: string
  md5?: string
}

export function parseFileXml(content: string): FileInfo | null {
  if (!content || !content.trim()) {
    return null
  }

  const parsed = parseXml(content)
  if (!parsed) {
    return null
  }

  const appmsg = parsed?.msg?.appmsg
  if (!appmsg) {
    return null
  }

  const msgType = appmsg.type ? Number(appmsg.type) : 0
  if (msgType !== 6) {
    return null
  }

  const appattach = appmsg.appattach
  if (!appattach) {
    return null
  }

  const cdnFileId = appattach.cdnattachurl ? String(appattach.cdnattachurl).trim() : ''
  const aesKey = appattach.aeskey ? String(appattach.aeskey).trim() : ''

  if (!cdnFileId || !aesKey) {
    return null
  }

  const title = appmsg.title ? String(appmsg.title).trim() : ''
  const fileExt = appattach.fileext ? String(appattach.fileext).trim() : ''
  const fileSize = appattach.totallen ? Number(appattach.totallen) : 0
  const md5 = appmsg.md5 ? String(appmsg.md5).trim() : undefined

  return {
    fileName: title || `file.${fileExt}`,
    fileExt,
    fileSize,
    aesKey,
    cdnFileId,
    md5,
  }
}
```

**Step 2: 更新 DisplayType 类型**

修改第 3 行：

```typescript
export type DisplayType = 'text' | 'image' | 'link' | 'video' | 'call' | 'recall' | 'quote' | 'emoji' | 'file' | 'unknown'
```

**Step 3: 在 processType49 中添加 type=6 文件消息分支**

在 `processType49` 函数中，在 quote (type 57) 检查之后、finderFeed 检查之前，添加：

```typescript
  // Check for file message (type 6)
  if (msgType === 6) {
    const appattach = appmsg.appattach
    const cdnFileId = appattach?.cdnattachurl ? String(appattach.cdnattachurl).trim() : ''
    const aesKey = appattach?.aeskey ? String(appattach.aeskey).trim() : ''

    if (cdnFileId && aesKey) {
      const title = appmsg.title ? String(appmsg.title).trim() : ''
      const fileExt = appattach?.fileext ? String(appattach.fileext).trim() : ''
      const fileSize = appattach?.totallen ? Number(appattach.totallen) : 0
      return {
        displayType: 'file',
        displayContent: JSON.stringify({ fileName: title || `file.${fileExt}`, fileExt, fileSize }),
      }
    }
  }
```

**Step 4: 在 summarizeReferContent 的 case 49 中添加文件引用支持**

在 `summarizeReferContent` 函数的 `case 49` 分支中，在 finderFeed 检查之前添加：

```typescript
      const appType = appmsg.type ? Number(appmsg.type) : 0
      if (appType === 6) {
        const title = appmsg.title ? String(appmsg.title).trim() : ''
        return title ? `[文件] ${title}` : '[文件]'
      }
```

**Step 5: Commit**

```bash
git add apps/server/src/services/messageContentProcessor.ts
git commit -m "feat: parse file messages (appmsg type=6) with displayType 'file'

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 创建 FileService

**Files:**
- Create: `apps/server/src/services/fileService.ts`

**Step 1: 创建 FileService**

```typescript
import type { DatabaseService } from './database.js'
import type { JuhexbotAdapter } from './juhexbotAdapter.js'
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

      // 1. 从 juhexbot CDN 获取临时下载 URL
      const tempUrl = await this.adapter.downloadImage(
        cache.aesKey,
        cache.cdnFileId,
        `${cache.fileName}.${cache.fileExt}`,
        2
      )

      // 2. 下载文件内容
      const response = await fetch(tempUrl)
      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.statusText}`)
      }
      const buffer = Buffer.from(await response.arrayBuffer())

      // 3. 上传到 OSS
      const ossUrl = await this.ossService.uploadFile(
        buffer,
        `${cache.fileName}`,
        cache.fileExt
      )

      // 4. 更新缓存
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
```

**Step 2: 在 OssService 中添加 uploadFile 方法**

在 `apps/server/src/services/ossService.ts` 的 `uploadImage` 方法之后添加：

```typescript
async uploadFile(buffer: Buffer, filename: string, ext: string): Promise<string> {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  const safeFilename = filename.replace(/[^a-zA-Z0-9._\u4e00-\u9fff-]/g, '_')
  const objectName = `files/${timestamp}_${random}_${safeFilename}.${ext}`

  const result = await this.client.put(objectName, buffer)
  return result.url
}
```

**Step 3: Commit**

```bash
git add apps/server/src/services/fileService.ts apps/server/src/services/ossService.ts
git commit -m "feat: add FileService for file download and OSS upload

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 添加文件下载 API 路由并注入 FileService

**Files:**
- Modify: `apps/server/src/routes/messages.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/index.ts`

**Step 1: 在 messages.ts 中添加 FileService 依赖和路由**

在 `MessageRouteDeps` 接口中添加：

```typescript
import type { FileService } from '../services/fileService.js'

interface MessageRouteDeps {
  messageService: MessageService
  imageService: ImageService
  emojiService: EmojiService
  fileService: FileService
}
```

在 emoji 路由之后添加文件下载路由：

```typescript
// GET /api/messages/:msgId/file - 获取文件下载 URL
router.get('/:msgId/file', async (c) => {
  try {
    const msgId = c.req.param('msgId')

    if (!msgId) {
      return c.json({ success: false, error: { message: 'msgId is required' } }, 400)
    }

    const result = await deps.fileService.getFileUrl(msgId)
    return c.json({ success: true, data: result })
  } catch (error: any) {
    logger.error({ err: error, msgId: c.req.param('msgId') }, 'Failed to get file URL')

    if (error.message === 'File not found') {
      return c.json({ success: false, error: { message: 'File not found' } }, 404)
    }

    if (error.message?.includes('Cloud API') || error.message?.includes('CDN')) {
      return c.json({ success: false, error: { message: 'Failed to download file from cloud service' } }, 502)
    }

    return c.json({ success: false, error: { message: 'Failed to download file' } }, 500)
  }
})
```

**Step 2: 在 app.ts 中添加 FileService 到 AppDependencies**

添加 import 和接口字段：

```typescript
import type { FileService } from './services/fileService.js'

// 在 AppDependencies 接口中添加：
fileService: FileService
```

更新 messageRoutes 调用：

```typescript
app.route('/api/messages', messageRoutes({
  messageService: deps.messageService,
  imageService: deps.imageService,
  emojiService: deps.emojiService,
  fileService: deps.fileService,
}))
```

**Step 3: 在 index.ts 中创建和注入 FileService**

添加 import：

```typescript
import { FileService } from './services/fileService.js'
```

在 `imageService` 创建之后添加：

```typescript
const fileService = new FileService(databaseService, juhexbotAdapter, ossService)
```

在 `createApp` 调用中添加 `fileService`。

**Step 4: 在 MessageService.handleIncomingMessage 中处理文件消息**

在 `apps/server/src/services/message.ts` 中，找到处理 emoji (type 47) 的逻辑，在其后添加文件消息处理：

```typescript
// 处理文件消息（type 49, appmsg type 6）
if (processed.displayType === 'file') {
  this.fileService.processFileMessage(parsed.message.msgId, parsed.message.content).catch(err => {
    logger.error({ err, msgId: parsed.message.msgId }, 'Failed to process file message')
  })
}
```

需要在 MessageService 构造函数中注入 FileService。

**Step 5: Commit**

```bash
git add apps/server/src/routes/messages.ts apps/server/src/app.ts apps/server/src/index.ts apps/server/src/services/message.ts
git commit -m "feat: add file download API route and wire FileService

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 前端 - 添加 'file' displayType 和 API 方法

**Files:**
- Modify: `apps/web/src/types/index.ts`
- Modify: `apps/web/src/api/chat.ts`

**Step 1: 更新 Message displayType 类型**

在 `apps/web/src/types/index.ts` 中，更新 `displayType`：

```typescript
displayType?: 'text' | 'image' | 'link' | 'video' | 'call' | 'recall' | 'quote' | 'emoji' | 'file' | 'unknown';
```

**Step 2: 在 chatApi 中添加 getFileUrl 方法**

在 `apps/web/src/api/chat.ts` 的 `chatApi` 对象中，在 `getImageUrl` 之后添加：

```typescript
// GET /api/messages/:msgId/file - 获取文件下载 URL
async getFileUrl(msgId: string): Promise<{ ossUrl: string; fileName: string; fileExt: string; fileSize: number }> {
  const response = await client.get<ApiResponse<{ ossUrl: string; fileName: string; fileExt: string; fileSize: number }>>(
    `/messages/${msgId}/file`
  );

  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error?.message || 'Failed to get file URL');
  }

  return response.data.data;
},
```

**Step 3: Commit**

```bash
git add apps/web/src/types/index.ts apps/web/src/api/chat.ts
git commit -m "feat(web): add file displayType and getFileUrl API method

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 前端 - 创建 FileMessage 组件

**Files:**
- Create: `apps/web/src/components/chat/FileMessage.tsx`
- Modify: `apps/web/src/components/chat/MessageItem.tsx`

**Step 1: 创建 FileMessage 组件**

```tsx
import { useState } from 'react';
import { chatApi } from '../../api/chat';

interface FileMessageProps {
  msgId: string;
  displayContent: string;  // JSON string: { fileName, fileExt, fileSize }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(ext: string): string {
  const icons: Record<string, string> = {
    pdf: 'PDF',
    doc: 'DOC',
    docx: 'DOC',
    xls: 'XLS',
    xlsx: 'XLS',
    ppt: 'PPT',
    pptx: 'PPT',
    zip: 'ZIP',
    rar: 'RAR',
    txt: 'TXT',
    csv: 'CSV',
    mp3: 'MP3',
    mp4: 'MP4',
  };
  return icons[ext.toLowerCase()] || ext.toUpperCase().slice(0, 4);
}

export function FileMessage({ msgId, displayContent }: FileMessageProps) {
  const [status, setStatus] = useState<'idle' | 'downloading' | 'error'>('idle');

  let fileName = '未知文件';
  let fileExt = '';
  let fileSize = 0;

  try {
    const parsed = JSON.parse(displayContent);
    fileName = parsed.fileName || '未知文件';
    fileExt = parsed.fileExt || '';
    fileSize = parsed.fileSize || 0;
  } catch {
    // displayContent 不是 JSON，直接用作文件名
    fileName = displayContent;
  }

  const handleClick = async () => {
    if (status === 'downloading') return;

    setStatus('downloading');
    try {
      const result = await chatApi.getFileUrl(msgId);
      // 触发浏览器下载
      const a = document.createElement('a');
      a.href = result.ossUrl;
      a.download = result.fileName;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={status === 'downloading'}
      className="flex items-center gap-3 p-2 -m-1 rounded-lg hover:bg-black/5 transition-colors cursor-pointer text-left min-w-[200px]"
    >
      <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
        {status === 'downloading' ? (
          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        ) : (
          getFileIcon(fileExt)
        )}
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-sm truncate max-w-[180px]">{fileName}</span>
        <span className="text-xs text-gray-500">
          {status === 'downloading' ? '下载中...' : status === 'error' ? '下载失败，点击重试' : formatFileSize(fileSize)}
        </span>
      </div>
    </button>
  );
}
```

**Step 2: 在 MessageItem.tsx 中添加 file displayType 渲染**

在 `import { EmojiMessage } from '../EmojiMessage';` 之后添加：

```typescript
import { FileMessage } from './FileMessage';
```

在 `renderContent` 函数中，在 `emoji` 分支之后、默认灰色斜体之前添加：

```tsx
if (displayType === 'file') {
  return <FileMessage msgId={msgId} displayContent={content} />;
}
```

**Step 3: Commit**

```bash
git add apps/web/src/components/chat/FileMessage.tsx apps/web/src/components/chat/MessageItem.tsx
git commit -m "feat(web): add FileMessage component with WeChat-style file card

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 测试和验证

**Step 1: 运行类型检查**

Run: `pnpm type-check`
Expected: No type errors

**Step 2: 运行 lint**

Run: `pnpm lint`
Expected: No lint errors

**Step 3: 运行后端测试**

Run: `cd apps/server && npx vitest run`
Expected: All tests pass

**Step 4: 修复任何问题**

如果有类型错误或测试失败，修复后重新验证。

**Step 5: 最终提交**

```bash
git add -A
git commit -m "feat: file message download support

Closes #7

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```
