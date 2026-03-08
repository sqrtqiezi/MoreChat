# Phase 0: 数据格式验证实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 验证 juhexbot API 实际推送的消息格式，确保后续开发基于准确的数据结构。

**Architecture:** 创建最小化的 Webhook 接收器，使用 ngrok 暴露到公网，采集真实的消息样本数据。

**Tech Stack:**
- Node.js, TypeScript, Hono
- ngrok (内网穿透)
- 文件系统存储样本数据

**预计时间:** 1-2 小时

---

## Task 0.1: 创建数据采集工具

**Files:**
- Create: `tools/capture-webhook.ts`
- Create: `tools/package.json`
- Create: `samples/.gitkeep`

**Step 1: 创建 tools 目录结构**

```bash
mkdir -p tools samples
touch samples/.gitkeep
```

**Step 2: 创建 tools 的 package.json**

创建 `tools/package.json`:

```json
{
  "name": "morechat-tools",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "capture": "tsx capture-webhook.ts"
  },
  "dependencies": {
    "hono": "^4.0.0",
    "@hono/node-server": "^1.8.0"
  },
  "devDependencies": {
    "tsx": "^4.7.0",
    "typescript": "^5.3.0"
  }
}
```

**Step 3: 安装依赖**

```bash
cd tools
pnpm install
cd ..
```

**Step 4: 创建数据采集工具**

创建 `tools/capture-webhook.ts`:

```typescript
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import fs from 'fs/promises'
import path from 'path'

const app = new Hono()

// 采集计数器
let captureCount = 0

app.post('/webhook', async (c) => {
  try {
    const data = await c.req.json()
    const timestamp = Date.now()
    captureCount++

    // 确保 samples 目录存在
    await fs.mkdir('./samples', { recursive: true })

    // 保存原始数据
    const filename = `msg-${timestamp}-${captureCount}.json`
    const filepath = path.join('./samples', filename)
    await fs.writeFile(filepath, JSON.stringify(data, null, 2), 'utf-8')

    // 控制台输出
    console.log(`\n✅ [${captureCount}] Captured message: ${filename}`)
    console.log('─'.repeat(60))
    console.log(JSON.stringify(data, null, 2))
    console.log('─'.repeat(60))

    return c.json({ success: true, captured: captureCount })
  } catch (error) {
    console.error('❌ Error capturing message:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// 健康检查端点
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    captured: captureCount,
    timestamp: new Date().toISOString()
  })
})

// 根路径
app.get('/', (c) => {
  return c.html(`
    <html>
      <head><title>MoreChat Webhook Capture</title></head>
      <body>
        <h1>🎣 MoreChat Webhook Capture Tool</h1>
        <p>Status: <strong>Running</strong></p>
        <p>Messages captured: <strong>${captureCount}</strong></p>
        <p>Webhook endpoint: <code>POST /webhook</code></p>
        <hr>
        <p>Set juhexbot notify_url to: <code>https://your-ngrok-url.ngrok.io/webhook</code></p>
      </body>
    </html>
  `)
})

const port = 3100
console.log('🎣 MoreChat Webhook Capture Tool')
console.log('─'.repeat(60))
console.log(`📡 Server running on http://localhost:${port}`)
console.log(`🔗 Webhook endpoint: http://localhost:${port}/webhook`)
console.log(`💚 Health check: http://localhost:${port}/health`)
console.log('─'.repeat(60))
console.log('Waiting for messages...\n')

serve({ fetch: app.fetch, port })
```

**Step 5: 测试本地运行**

```bash
cd tools
pnpm capture
```

Expected: Server starts and shows "Waiting for messages..."

**Step 6: 测试健康检查**

在另一个终端：

```bash
curl http://localhost:3100/health
```

Expected: `{"status":"ok","captured":0,"timestamp":"..."}`

**Step 7: 提交**

```bash
git add tools/ samples/.gitkeep
git commit -m "feat: add webhook capture tool for data validation"
```

---

## Task 0.2: 配置 ngrok 并采集数据

**Files:**
- Create: `tools/ngrok.yml` (optional)
- Create: `docs/development-setup.md`

**Step 1: 安装 ngrok**

```bash
# macOS
brew install ngrok

# 或者下载二进制文件
# https://ngrok.com/download
```

**Step 2: 注册 ngrok 账号并获取 authtoken**

访问 https://dashboard.ngrok.com/get-started/your-authtoken

```bash
ngrok config add-authtoken YOUR_TOKEN_HERE
```

**Step 3: 启动采集工具**

终端 1:
```bash
cd tools
pnpm capture
```

**Step 4: 启动 ngrok**

终端 2:
```bash
ngrok http 3100
```

Expected: 显示类似 `https://abc123.ngrok.io -> http://localhost:3100`

**Step 5: 记录 ngrok URL**

复制 ngrok 提供的 HTTPS URL，例如：`https://abc123.ngrok.io`

**Step 6: 设置 juhexbot notify_url**

```bash
# 替换为你的实际值
JUHEXBOT_API="http://your-juhexbot-api:8000"
CLIENT_GUID="your-client-guid"
NGROK_URL="https://abc123.ngrok.io"

curl -X POST "${JUHEXBOT_API}/client/set_notify_url" \
  -H "Content-Type: application/json" \
  -d "{\"guid\":\"${CLIENT_GUID}\",\"notify_url\":\"${NGROK_URL}/webhook\"}"
```

Expected: 返回成功响应

**Step 7: 发送测试消息**

通过微信客户端发送以下类型的消息：

1. **文本消息** - 发送 "Hello, this is a test"
2. **图片消息** - 发送一张图片
3. **群消息** - 在群里发送消息
4. **@消息** - 在群里 @某人
5. **撤回消息** - 发送后立即撤回
6. **文件消息** - 发送一个文件
7. **语音消息** - 发送语音
8. **表情消息** - 发送表情

**Step 8: 验证数据采集**

检查 `samples/` 目录：

```bash
ls -lh samples/
```

Expected: 看到多个 `msg-*.json` 文件

**Step 9: 查看采集的数据**

```bash
cat samples/msg-*.json | head -50
```

**Step 10: 停止服务**

- 终端 1: Ctrl+C 停止采集工具
- 终端 2: Ctrl+C 停止 ngrok

---

## Task 0.3: 分析数据并生成类型定义

**Files:**
- Create: `tools/analyze-samples.ts`
- Create: `apps/server/src/types/juhexbot.ts`
- Create: `tests/fixtures/messages.ts`
- Create: `docs/juhexbot-message-formats.md`

**Step 1: 创建数据分析工具**

创建 `tools/analyze-samples.ts`:

```typescript
import fs from 'fs/promises'
import path from 'path'

interface MessageSample {
  filename: string
  data: any
  msgType: number
}

async function analyzeSamples() {
  const samplesDir = './samples'
  const files = await fs.readdir(samplesDir)
  const jsonFiles = files.filter(f => f.endsWith('.json'))

  console.log(`📊 Analyzing ${jsonFiles.length} message samples...\n`)

  const samples: MessageSample[] = []

  // 读取所有样本
  for (const file of jsonFiles) {
    const filepath = path.join(samplesDir, file)
    const content = await fs.readFile(filepath, 'utf-8')
    const data = JSON.parse(content)
    samples.push({ filename: file, data, msgType: data.msg_type })
  }

  // 按消息类型分组
  const byType = new Map<number, MessageSample[]>()
  for (const sample of samples) {
    const type = sample.msgType
    if (!byType.has(type)) {
      byType.set(type, [])
    }
    byType.get(type)!.push(sample)
  }

  // 输出分析结果
  console.log('📋 Message Types Found:')
  console.log('─'.repeat(60))
  for (const [type, msgs] of byType.entries()) {
    const typeName = getMessageTypeName(type)
    console.log(`Type ${type} (${typeName}): ${msgs.length} samples`)
    console.log(`  Files: ${msgs.map(m => m.filename).join(', ')}`)
  }
  console.log('─'.repeat(60))

  // 分析字段
  console.log('\n📝 Common Fields:')
  const allFields = new Set<string>()
  for (const sample of samples) {
    Object.keys(sample.data).forEach(key => allFields.add(key))
  }
  console.log(Array.from(allFields).sort().join(', '))

  // 输出每种类型的示例
  console.log('\n📄 Sample Data by Type:\n')
  for (const [type, msgs] of byType.entries()) {
    console.log(`\n### Type ${type} - ${getMessageTypeName(type)}`)
    console.log('```json')
    console.log(JSON.stringify(msgs[0].data, null, 2))
    console.log('```')
  }
}

function getMessageTypeName(type: number): string {
  const types: Record<number, string> = {
    1: 'Text',
    3: 'Image',
    34: 'Voice',
    43: 'Video',
    47: 'Emoji',
    49: 'App/Link/File',
    10000: 'System',
  }
  return types[type] || 'Unknown'
}

analyzeSamples().catch(console.error)
```

**Step 2: 运行分析工具**

```bash
cd tools
pnpm tsx analyze-samples.ts > ../docs/juhexbot-message-formats.md
```

**Step 3: 基于真实数据定义类型**

创建 `apps/server/src/types/juhexbot.ts`:

```typescript
/**
 * juhexbot API 类型定义
 * 基于真实采集的消息样本生成
 * 生成时间: 2026-03-09
 */

// 基础消息接口
export interface ChatMsgModel {
  from_username: string
  to_username: string
  chatroom_sender: string
  create_time: number
  desc: string
  msg_id: string
  msg_type: number
  chatroom: string
  source: string
  content: string
}

// 文本消息 (msg_type: 1)
export interface TextMessage extends ChatMsgModel {
  msg_type: 1
  content: string  // 纯文本内容
}

// 图片消息 (msg_type: 3)
export interface ImageMessage extends ChatMsgModel {
  msg_type: 3
  content: string  // 图片路径或 URL
  // 根据实际采集的数据补充字段
}

// 语音消息 (msg_type: 34)
export interface VoiceMessage extends ChatMsgModel {
  msg_type: 34
  // 根据实际采集的数据补充字段
}

// 视频消息 (msg_type: 43)
export interface VideoMessage extends ChatMsgModel {
  msg_type: 43
  // 根据实际采集的数据补充字段
}

// 表情消息 (msg_type: 47)
export interface EmojiMessage extends ChatMsgModel {
  msg_type: 47
  // 根据实际采集的数据补充字段
}

// 应用消息/链接/文件 (msg_type: 49)
export interface AppMessage extends ChatMsgModel {
  msg_type: 49
  // 根据实际采集的数据补充字段
}

// 系统消息 (msg_type: 10000)
export interface SystemMessage extends ChatMsgModel {
  msg_type: 10000
  // 撤回、加群等系统消息
}

// 消息联合类型
export type Message =
  | TextMessage
  | ImageMessage
  | VoiceMessage
  | VideoMessage
  | EmojiMessage
  | AppMessage
  | SystemMessage
```

**Step 4: 创建测试 fixtures**

创建 `tests/fixtures/messages.ts`:

```typescript
import type { TextMessage, ImageMessage } from '../../apps/server/src/types/juhexbot'

// 从 samples/ 目录复制真实数据
export const sampleTextMessage: TextMessage = {
  // 粘贴真实采集的文本消息数据
  from_username: 'user123',
  to_username: 'me',
  chatroom_sender: '',
  create_time: 1234567890,
  desc: '',
  msg_id: 'msg_001',
  msg_type: 1,
  chatroom: '',
  source: '',
  content: 'Hello, this is a test'
}

export const sampleImageMessage: ImageMessage = {
  // 粘贴真实采集的图片消息数据
  from_username: 'user123',
  to_username: 'me',
  chatroom_sender: '',
  create_time: 1234567891,
  desc: '',
  msg_id: 'msg_002',
  msg_type: 3,
  chatroom: '',
  source: '',
  content: '/path/to/image.jpg'
}

// 根据采集的数据添加更多 fixtures
```

**Step 5: 创建开发文档**

创建 `docs/development-setup.md`:

```markdown
# 开发环境设置

## 数据格式验证

我们已经采集了真实的 juhexbot 消息样本，存储在 `samples/` 目录中。

### 采集的消息类型

- 文本消息 (msg_type: 1)
- 图片消息 (msg_type: 3)
- 语音消息 (msg_type: 34)
- 视频消息 (msg_type: 43)
- 表情消息 (msg_type: 47)
- 应用消息 (msg_type: 49)
- 系统消息 (msg_type: 10000)

### 类型定义

所有类型定义基于真实数据生成，位于：
- `apps/server/src/types/juhexbot.ts`

### 测试数据

测试 fixtures 位于：
- `tests/fixtures/messages.ts`

## 重新采集数据

如果需要重新采集数据：

1. 启动采集工具：`cd tools && pnpm capture`
2. 启动 ngrok：`ngrok http 3100`
3. 设置 juhexbot notify_url
4. 发送测试消息
5. 分析数据：`pnpm tsx analyze-samples.ts`
```

**Step 6: 提交所有文件**

```bash
git add tools/analyze-samples.ts \
  apps/server/src/types/juhexbot.ts \
  tests/fixtures/messages.ts \
  docs/juhexbot-message-formats.md \
  docs/development-setup.md \
  samples/

git commit -m "feat: analyze message samples and generate type definitions

- 分析采集的真实消息样本
- 基于真实数据生成 TypeScript 类型定义
- 创建测试 fixtures
- 文档化消息格式

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Phase 0 完成检查清单

完成 Phase 0 后，你应该拥有：

- ✅ Webhook 数据采集工具
- ✅ 至少 5-10 个真实消息样本
- ✅ 准确的 TypeScript 类型定义
- ✅ 测试用的真实数据 fixtures
- ✅ 消息格式文档
- ✅ 开发环境设置文档

## 下一步

Phase 0 完成后，可以安心进入 Phase 1（基础架构），因为：

1. 我们知道了真实的消息格式
2. 类型定义基于真实数据
3. 测试可以使用真实样本
4. 不再需要猜测或假设

---

## 注意事项

1. **samples/ 目录不要提交到 git**
   - 添加到 `.gitignore`
   - 可能包含敏感信息

2. **ngrok URL 会变化**
   - 免费版每次重启 URL 都会变
   - 需要重新设置 notify_url

3. **采集足够的样本**
   - 每种消息类型至少 2-3 个样本
   - 包含边界情况（空内容、特殊字符等）

4. **验证文档一致性**
   - 对比 juhexbot.md 文档
   - 记录发现的差异
