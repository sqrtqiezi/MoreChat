# Phase 1 功能整合实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 整合 Phase 1 所有功能，包括环境变量管理、Prisma 单例、WebSocket 服务器，建立完整的依赖注入架构。

**Architecture:** 采用集中式依赖注入，在 index.ts 中按顺序初始化所有服务。HTTP 和 WebSocket 服务器共享同一端口，通过 HTTP Upgrade 机制实现。所有服务通过构造函数注入依赖。

**Tech Stack:** Node.js, TypeScript, Hono, Prisma, WebSocket (ws), dotenv

---

## Task 1: 环境变量管理

**Files:**
- Create: `apps/server/src/lib/env.ts`
- Create: `apps/server/src/lib/env.test.ts`

**Step 1: 编写环境变量加载测试**

创建 `apps/server/src/lib/env.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('env', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('should load required environment variables', () => {
    process.env.DATABASE_URL = 'file:./test.db'
    process.env.DATA_LAKE_TYPE = 'filesystem'
    process.env.DATA_LAKE_PATH = './test-lake'
    process.env.PORT = '3100'
    process.env.NODE_ENV = 'test'
    process.env.JUHEXBOT_API_URL = 'http://test.com'

    // 动态导入以重新加载环境变量
    const { env } = await import('./env.js')

    expect(env.DATABASE_URL).toBe('file:./test.db')
    expect(env.PORT).toBe('3100')
  })

  it('should throw error when required variable is missing', () => {
    delete process.env.DATABASE_URL
    
    expect(() => {
      require('./env')
    }).toThrow('DATABASE_URL is required')
  })
})
```

**Step 2: 运行测试确认失败**

```bash
cd apps/server
pnpm test env.test.ts
```

Expected: FAIL - "Cannot find module './env'"

**Step 3: 实现环境变量加载**

创建 `apps/server/src/lib/env.ts`:

```typescript
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// 加载 .env 文件
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '../../.env') })

interface EnvConfig {
  DATABASE_URL: string
  DATA_LAKE_TYPE: 'filesystem' | 's3' | 'minio'
  DATA_LAKE_PATH: string
  PORT: string
  NODE_ENV: 'development' | 'production' | 'test'
  JUHEXBOT_API_URL: string
}

function loadEnv(): EnvConfig {
  const required = [
    'DATABASE_URL',
    'DATA_LAKE_TYPE',
    'DATA_LAKE_PATH',
    'PORT',
    'NODE_ENV',
    'JUHEXBOT_API_URL'
  ]

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`${key} is required in environment variables`)
    }
  }

  return {
    DATABASE_URL: process.env.DATABASE_URL!,
    DATA_LAKE_TYPE: process.env.DATA_LAKE_TYPE as any,
    DATA_LAKE_PATH: process.env.DATA_LAKE_PATH!,
    PORT: process.env.PORT!,
    NODE_ENV: process.env.NODE_ENV as any,
    JUHEXBOT_API_URL: process.env.JUHEXBOT_API_URL!
  }
}

export const env = loadEnv()
```

**Step 4: 运行测试确认通过**

```bash
pnpm test env.test.ts
```

Expected: PASS

**Step 5: 提交**

```bash
git add src/lib/env.ts src/lib/env.test.ts
git commit -m "feat: implement environment variable management

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Prisma 客户端单例

**Files:**
- Create: `apps/server/src/lib/prisma.ts`

**Step 1: 实现 Prisma 单例**

创建 `apps/server/src/lib/prisma.ts`:

```typescript
import { PrismaClient } from '@prisma/client'

// 全局类型声明
declare global {
  var prisma: PrismaClient | undefined
}

// 创建 Prisma Client 单例
export const prisma =
  global.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error']
  })

// 开发模式下缓存实例，避免热重载时创建多个连接
if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma
}

// 优雅关闭
export async function disconnectPrisma() {
  await prisma.$disconnect()
}
```

**Step 2: 更新现有服务使用 Prisma 单例**

修改 `apps/server/src/services/database.ts`:

```typescript
import { prisma } from '../lib/prisma.js'

export class DatabaseService {
  // 移除 prisma 属性，直接使用导入的单例
  
  async createClient(data: {
    guid: string
    proxy?: string
    isLoginProxy?: boolean
  }) {
    return prisma.client.create({ data })
  }

  async getClientByGuid(guid: string) {
    return prisma.client.findUnique({ where: { guid } })
  }

  async createMessageIndex(data: {
    conversationId: string
    msgId: string
    msgType: number
    fromUsername: string
    toUsername: string
    chatroomSender?: string
    createTime: number
    dataLakeKey: string
  }) {
    return prisma.messageIndex.create({ data })
  }
}
```

**Step 3: 更新消息服务使用 Prisma 单例**

修改 `apps/server/src/services/message.ts`:

```typescript
import { prisma } from '../lib/prisma.js'
import type { DatabaseService } from './database.js'
import type { DataLakeService, ChatMessage } from './dataLake.js'

export class MessageService {
  constructor(
    private dataLake: DataLakeService,
    private database: DatabaseService
  ) {}

  async saveMessage(conversationId: string, message: ChatMessage): Promise<void> {
    const dataLakeKey = await this.dataLake.saveMessage(conversationId, message)

    await this.database.createMessageIndex({
      conversationId,
      msgId: message.msg_id,
      msgType: message.msg_type,
      fromUsername: message.from_username,
      toUsername: message.to_username,
      chatroomSender: message.chatroom_sender || undefined,
      createTime: message.create_time,
      dataLakeKey
    })

    // 更新会话最后消息时间
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: new Date(message.create_time * 1000),
        unreadCount: { increment: 1 }
      }
    })
  }

  async getMessages(conversationId: string, limit: number = 50, offset: number = 0) {
    const indexes = await prisma.messageIndex.findMany({
      where: { conversationId },
      orderBy: { createTime: 'desc' },
      take: limit,
      skip: offset
    })

    const messages = await this.dataLake.getMessages(
      indexes.map(idx => idx.dataLakeKey)
    )

    return messages
  }

  async recordStateChange(
    msgId: string,
    changeType: 'revoke' | 'delete' | 'edit' | 'read',
    changeData?: any
  ): Promise<void> {
    await prisma.messageStateChange.create({
      data: {
        msgId,
        changeType,
        changeTime: Math.floor(Date.now() / 1000),
        changeData: changeData ? JSON.stringify(changeData) : null
      }
    })
  }
}
```

**Step 4: 运行现有测试确认通过**

```bash
pnpm test database.test.ts message.test.ts
```

Expected: PASS

**Step 5: 提交**

```bash
git add src/lib/prisma.ts src/services/database.ts src/services/message.ts
git commit -m "feat: implement Prisma client singleton

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: WebSocket 服务

**Files:**
- Create: `apps/server/src/services/websocket.ts`
- Create: `apps/server/src/services/websocket.test.ts`

**Step 1: 编写 WebSocket 服务测试**

创建 `apps/server/src/services/websocket.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { WebSocketService } from './websocket.js'
import { createServer } from 'http'
import WebSocket from 'ws'

describe('WebSocketService', () => {
  let server: ReturnType<typeof createServer>
  let wsService: WebSocketService
  let port: number

  beforeEach((done) => {
    server = createServer()
    server.listen(0, () => {
      port = (server.address() as any).port
      wsService = new WebSocketService(server)
      done()
    })
  })

  afterEach((done) => {
    server.close(() => done())
  })

  it('should accept WebSocket connections', (done) => {
    const client = new WebSocket(`ws://localhost:${port}`)
    
    client.on('open', () => {
      expect(client.readyState).toBe(WebSocket.OPEN)
      client.close()
      done()
    })
  })

  it('should handle client:connect event', (done) => {
    const client = new WebSocket(`ws://localhost:${port}`)
    
    client.on('open', () => {
      client.send(JSON.stringify({
        event: 'client:connect',
        data: { guid: 'test_client_123' }
      }))
    })

    client.on('message', (data) => {
      const message = JSON.parse(data.toString())
      expect(message.event).toBe('connected')
      expect(message.data.clientId).toBe('test_client_123')
      client.close()
      done()
    })
  })

  it('should send message to specific client', (done) => {
    const client = new WebSocket(`ws://localhost:${port}`)
    
    client.on('open', () => {
      client.send(JSON.stringify({
        event: 'client:connect',
        data: { guid: 'test_client_456' }
      }))
    })

    let connectedReceived = false
    client.on('message', (data) => {
      const message = JSON.parse(data.toString())
      
      if (message.event === 'connected') {
        connectedReceived = true
        // 发送测试消息
        wsService.sendToClient('test_client_456', 'test:event', { foo: 'bar' })
      } else if (message.event === 'test:event' && connectedReceived) {
        expect(message.data.foo).toBe('bar')
        client.close()
        done()
      }
    })
  })
})
```

**Step 2: 运行测试确认失败**

```bash
pnpm test websocket.test.ts
```

Expected: FAIL - "Cannot find module './websocket'"

**Step 3: 实现 WebSocket 服务**

创建 `apps/server/src/services/websocket.ts`:

```typescript
import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'http'

export interface WebSocketMessage {
  event: string
  data: any
}

export class WebSocketService {
  private wss: WebSocketServer
  private clients: Map<string, WebSocket> = new Map()

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server })
    this.setupEventHandlers()
  }

  private setupEventHandlers() {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('WebSocket client connected')

      ws.on('message', (data: Buffer) => {
        try {
          const message: WebSocketMessage = JSON.parse(data.toString())
          this.handleMessage(ws, message)
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      })

      ws.on('close', () => {
        console.log('WebSocket client disconnected')
        // 从 clients Map 中移除
        for (const [clientId, client] of this.clients.entries()) {
          if (client === ws) {
            this.clients.delete(clientId)
            break
          }
        }
      })

      ws.on('error', (error) => {
        console.error('WebSocket error:', error)
      })
    })
  }

  private handleMessage(ws: WebSocket, message: WebSocketMessage) {
    switch (message.event) {
      case 'client:connect':
        const clientId = message.data.guid
        this.clients.set(clientId, ws)
        this.send(ws, 'connected', { clientId })
        console.log(`Client registered: ${clientId}`)
        break

      default:
        console.log('Unknown event:', message.event)
    }
  }

  /**
   * 发送消息给指定 WebSocket 连接
   */
  send(ws: WebSocket, event: string, data: any) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event, data }))
    }
  }

  /**
   * 广播消息给所有客户端
   */
  broadcast(event: string, data: any) {
    const message = JSON.stringify({ event, data })
    this.wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message)
      }
    })
  }

  /**
   * 发送消息给指定客户端 ID
   */
  sendToClient(clientId: string, event: string, data: any) {
    const ws = this.clients.get(clientId)
    if (ws) {
      this.send(ws, event, data)
    }
  }

  /**
   * 获取当前连接数
   */
  getConnectionCount(): number {
    return this.clients.size
  }

  /**
   * 关闭所有连接
   */
  close() {
    this.wss.clients.forEach(client => {
      client.close()
    })
    this.wss.close()
  }
}
```

**Step 4: 运行测试确认通过**

```bash
pnpm test websocket.test.ts
```

Expected: PASS

**Step 5: 提交**

```bash
git add src/services/websocket.ts src/services/websocket.test.ts
git commit -m "feat: implement WebSocket service

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: 主入口整合

**Files:**
- Modify: `apps/server/src/index.ts`

**Step 1: 重构主入口文件**

修改 `apps/server/src/index.ts`:

```typescript
import { serve } from '@hono/node-server'
import { env } from './lib/env.js'
import { prisma, disconnectPrisma } from './lib/prisma.js'
import { DataLakeService } from './services/dataLake.js'
import { DatabaseService } from './services/database.js'
import { MessageService } from './services/message.js'
import { JuhexbotAdapter } from './services/juhexbotAdapter.js'
import { createApp } from './app.js'
import { WebSocketService } from './services/websocket.js'
import type { ParsedWebhookPayload } from './services/juhexbotAdapter.js'

// 1. 初始化服务（依赖注入）
console.log('🔧 Initializing services...')

const dataLake = new DataLakeService({
  type: env.DATA_LAKE_TYPE,
  path: env.DATA_LAKE_PATH
})

const database = new DatabaseService()

const messageService = new MessageService(dataLake, database)

const juhexbotAdapter = new JuhexbotAdapter({
  apiUrl: env.JUHEXBOT_API_URL
})

// 2. 创建消息处理器
const messageHandler = async (parsed: ParsedWebhookPayload) => {
  console.log('📨 Received message:', parsed.type)
  
  // TODO: 根据消息类型处理
  // 目前只是记录日志
}

// 3. 创建 Hono App
const app = createApp(juhexbotAdapter, messageHandler)

// 4. 启动 HTTP 服务器
const port = parseInt(env.PORT)
console.log(`🚀 Starting server on http://localhost:${port}`)

const server = serve({
  fetch: app.fetch,
  port
})

// 5. 创建 WebSocket 服务
const wsService = new WebSocketService(server)
console.log('✅ WebSocket service initialized')

// 6. 优雅关闭
const shutdown = async () => {
  console.log('\n🛑 Shutting down gracefully...')
  
  try {
    // 关闭 WebSocket 连接
    wsService.close()
    console.log('✅ WebSocket connections closed')
    
    // 关闭数据库连接
    await disconnectPrisma()
    console.log('✅ Database connections closed')
    
    process.exit(0)
  } catch (error) {
    console.error('❌ Error during shutdown:', error)
    process.exit(1)
  }
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

console.log('✅ Server is ready')

// 导出服务实例供测试使用
export { wsService, messageService, juhexbotAdapter }
```

**Step 2: 测试服务器启动**

```bash
pnpm dev
```

Expected: 
- "🔧 Initializing services..."
- "🚀 Starting server on http://localhost:3100"
- "✅ WebSocket service initialized"
- "✅ Server is ready"
- 无错误信息

**Step 3: 测试健康检查端点**

在另一个终端：

```bash
curl http://localhost:3100/health
```

Expected: `{"status":"ok","timestamp":...}`

**Step 4: 测试 WebSocket 连接**

创建测试脚本 `apps/server/test-ws.js`:

```javascript
import WebSocket from 'ws'

const ws = new WebSocket('ws://localhost:3100')

ws.on('open', () => {
  console.log('✅ Connected to WebSocket')
  
  ws.send(JSON.stringify({
    event: 'client:connect',
    data: { guid: 'test_client_001' }
  }))
})

ws.on('message', (data) => {
  const message = JSON.parse(data.toString())
  console.log('📨 Received:', message)
  
  if (message.event === 'connected') {
    console.log('✅ Client registered successfully')
    ws.close()
  }
})

ws.on('close', () => {
  console.log('👋 Connection closed')
  process.exit(0)
})

ws.on('error', (error) => {
  console.error('❌ Error:', error)
  process.exit(1)
})
```

运行测试：

```bash
node apps/server/test-ws.js
```

Expected:
- "✅ Connected to WebSocket"
- "📨 Received: { event: 'connected', data: { clientId: 'test_client_001' } }"
- "✅ Client registered successfully"
- "👋 Connection closed"

**Step 5: 提交**

```bash
git add src/index.ts test-ws.js
git commit -m "feat: integrate all Phase 1 services with dependency injection

- Initialize services in correct order
- Share HTTP server with WebSocket
- Implement graceful shutdown
- Export services for testing

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: 集成测试

**Files:**
- Create: `apps/server/src/integration.test.ts`

**Step 1: 编写集成测试**

创建 `apps/server/src/integration.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { serve } from '@hono/node-server'
import { env } from './lib/env.js'
import { DataLakeService } from './services/dataLake.js'
import { DatabaseService } from './services/database.js'
import { MessageService } from './services/message.js'
import { JuhexbotAdapter } from './services/juhexbotAdapter.js'
import { createApp } from './app.js'
import { WebSocketService } from './services/websocket.js'
import WebSocket from 'ws'

describe('Integration Test', () => {
  let server: any
  let wsService: WebSocketService
  let port: number

  beforeAll(() => {
    // 初始化服务
    const dataLake = new DataLakeService({
      type: 'filesystem',
      path: './test-integration-lake'
    })

    const database = new DatabaseService()
    const messageService = new MessageService(dataLake, database)
    const juhexbotAdapter = new JuhexbotAdapter({
      apiUrl: 'http://test.com'
    })

    const app = createApp(juhexbotAdapter, async () => {})

    // 启动服务器
    server = serve({
      fetch: app.fetch,
      port: 0 // 随机端口
    })

    port = (server.address() as any).port
    wsService = new WebSocketService(server)
  })

  afterAll(() => {
    wsService.close()
    server.close()
  })

  it('should handle HTTP health check', async () => {
    const response = await fetch(`http://localhost:${port}/health`)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.status).toBe('ok')
  })

  it('should handle WebSocket connection', (done) => {
    const ws = new WebSocket(`ws://localhost:${port}`)

    ws.on('open', () => {
      ws.send(JSON.stringify({
        event: 'client:connect',
        data: { guid: 'integration_test_client' }
      }))
    })

    ws.on('message', (data) => {
      const message = JSON.parse(data.toString())
      
      if (message.event === 'connected') {
        expect(message.data.clientId).toBe('integration_test_client')
        ws.close()
        done()
      }
    })
  })
})
```

**Step 2: 运行集成测试**

```bash
pnpm test integration.test.ts
```

Expected: PASS

**Step 3: 提交**

```bash
git add src/integration.test.ts
git commit -m "test: add integration tests for Phase 1

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: 文档更新

**Files:**
- Modify: `README.md`
- Create: `apps/server/README.md`

**Step 1: 更新项目 README**

在根目录 `README.md` 中添加 Phase 1 完成说明：

```markdown
## Phase 1: 基础架构 ✅

已完成的功能：
- ✅ 数据库模型和 Prisma 配置
- ✅ Data Lake 存储服务
- ✅ juhexbot 适配器
- ✅ WebSocket 服务器
- ✅ 消息服务层
- ✅ 依赖注入架构
- ✅ 环境变量管理
- ✅ 优雅关闭机制

## 快速开始

### 环境配置

复制环境变量模板：

\`\`\`bash
cp apps/server/.env.example apps/server/.env
\`\`\`

编辑 `.env` 文件，配置必要的参数。

### 启动开发服务器

\`\`\`bash
pnpm install
pnpm dev
\`\`\`

服务器将在 http://localhost:3100 启动。

### 测试

\`\`\`bash
# 运行所有测试
pnpm test

# 运行特定测试
pnpm test database.test.ts

# 测试 UI
pnpm test:ui
\`\`\`
```

**Step 2: 创建服务器 README**

创建 `apps/server/README.md`:

```markdown
# MoreChat Server

后端服务器，提供 HTTP API 和 WebSocket 实时通信。

## 架构

### 服务层次

\`\`\`
index.ts (入口)
    ↓
├─ HTTP Server (Hono)
│   ├─ REST API
│   └─ Webhook
│
└─ WebSocket Server
    └─ 实时消息推送

业务服务层
├─ MessageService
├─ JuhexbotAdapter
├─ DatabaseService
└─ DataLakeService

基础设施层
├─ Prisma Client
└─ 文件系统
\`\`\`

### 依赖注入

所有服务通过构造函数注入依赖，在 `index.ts` 中集中初始化。

## 环境变量

| 变量 | 说明 | 示例 |
|------|------|------|
| DATABASE_URL | SQLite 数据库路径 | file:./data/morechat.db |
| DATA_LAKE_TYPE | Data Lake 类型 | filesystem |
| DATA_LAKE_PATH | Data Lake 路径 | ./data/lake |
| PORT | 服务器端口 | 3100 |
| NODE_ENV | 运行环境 | development |
| JUHEXBOT_API_URL | juhexbot API 地址 | http://localhost:8000 |

## 开发

### 启动开发服务器

\`\`\`bash
pnpm dev
\`\`\`

### 运行测试

\`\`\`bash
# 所有测试
pnpm test

# 监听模式
pnpm test --watch

# 测试 UI
pnpm test:ui
\`\`\`

### 数据库操作

\`\`\`bash
# 生成 Prisma Client
pnpm db:generate

# 推送 schema 到数据库
pnpm db:push

# 打开 Prisma Studio
pnpm db:studio
\`\`\`

## API 端点

### HTTP

- `GET /health` - 健康检查
- `POST /webhook` - juhexbot webhook

### WebSocket

连接: `ws://localhost:3100`

**客户端 → 服务器:**
- `client:connect` - 注册客户端

**服务器 → 客户端:**
- `connected` - 连接确认
- `message:new` - 新消息推送

## 测试

### 单元测试

每个服务都有对应的测试文件：
- `dataLake.test.ts`
- `database.test.ts`
- `message.test.ts`
- `juhexbotAdapter.test.ts`
- `websocket.test.ts`

### 集成测试

`integration.test.ts` 测试完整的服务启动和交互流程。

## 部署

### 构建

\`\`\`bash
pnpm build
\`\`\`

### 启动生产服务器

\`\`\`bash
pnpm start
\`\`\`

### 使用 PM2

\`\`\`bash
pm2 start dist/index.js --name morechat-server
\`\`\`
```

**Step 3: 提交**

```bash
git add README.md apps/server/README.md
git commit -m "docs: update README for Phase 1 completion

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## 验证清单

完成所有任务后，验证以下功能：

### 服务启动

- [ ] `pnpm dev` 成功启动服务器
- [ ] 无错误或警告信息
- [ ] 显示所有初始化步骤

### HTTP 端点

- [ ] `curl http://localhost:3100/health` 返回 200
- [ ] `curl http://localhost:3100/webhook -X POST -d '{}'` 返回响应

### WebSocket

- [ ] 可以建立 WebSocket 连接
- [ ] `client:connect` 事件正常工作
- [ ] 收到 `connected` 确认消息

### 测试

- [ ] 所有单元测试通过
- [ ] 集成测试通过
- [ ] 测试覆盖率 > 80%

### 数据库

- [ ] Prisma Client 正常工作
- [ ] 可以创建和查询数据
- [ ] 数据库文件正确创建

### Data Lake

- [ ] 消息正确保存到文件系统
- [ ] 可以读取保存的消息
- [ ] 目录结构正确

### 优雅关闭

- [ ] Ctrl+C 触发优雅关闭
- [ ] WebSocket 连接正确关闭
- [ ] 数据库连接正确关闭
- [ ] 无错误信息

---

## 计划完成

**计划已保存到:** `docs/plans/2026-03-09-phase1-integration-implementation.md`

**两种执行选项:**

**1. Subagent-Driven (当前会话)** - 我在当前会话中为每个任务派发新的子代理，任务间进行审查，快速迭代

**2. Parallel Session (独立会话)** - 在新会话中使用 executing-plans，批量执行并设置检查点

**你选择哪种方式？**
