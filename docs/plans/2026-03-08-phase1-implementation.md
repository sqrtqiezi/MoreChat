# Phase 1: 基础架构实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 搭建 MoreChat 项目的基础架构，包括数据库模型、Data Lake 存储、juhexbot 适配器和 WebSocket 服务器。

**Architecture:** 采用 SQLite + Data Lake 混合存储架构，SQLite 存储索引和元数据，Data Lake 存储不可变的原始消息数据。后端使用 Hono 框架，通过适配器模式封装 juhexbot API。

**Tech Stack:**
- Backend: Node.js, TypeScript, Hono, Prisma, WebSocket
- Database: SQLite (索引和元数据)
- Storage: 本地文件系统 (Data Lake)
- Testing: Vitest

---

## Task 1: 项目依赖安装和配置

**Files:**
- Modify: `apps/server/package.json`
- Create: `apps/server/tsconfig.json`
- Create: `apps/server/.env.example`

**Step 1: 安装后端依赖**

在 `apps/server` 目录下安装依赖：

```bash
cd apps/server
pnpm add hono @hono/node-server
pnpm add prisma @prisma/client
pnpm add ws @types/ws
pnpm add zod
pnpm add -D vitest @vitest/ui
pnpm add -D tsx
```

**Step 2: 创建 TypeScript 配置**

创建 `apps/server/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ES2022",
    "lib": ["ES2022"],
    "types": ["node", "vitest/globals"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: 创建环境变量模板**

创建 `apps/server/.env.example`:

```bash
# Database
DATABASE_URL="file:./data/morechat.db"

# Data Lake
DATA_LAKE_TYPE="filesystem"
DATA_LAKE_PATH="./data/lake"

# Server
PORT=3100
NODE_ENV="development"

# juhexbot API
JUHEXBOT_API_URL="http://localhost:8000"
```

**Step 4: 复制环境变量文件**

```bash
cp apps/server/.env.example apps/server/.env
```

**Step 5: 更新 package.json 脚本**

修改 `apps/server/package.json`，添加脚本：

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "db:generate": "prisma generate",
    "db:push": "prisma db push",
    "db:studio": "prisma studio"
  }
}
```

**Step 6: 提交**

```bash
git add apps/server/package.json apps/server/tsconfig.json apps/server/.env.example
git commit -m "chore: setup server dependencies and configuration"
```

---

## Task 2: Prisma Schema 定义

**Files:**
- Create: `apps/server/prisma/schema.prisma`

**Step 1: 创建 Prisma 目录**

```bash
mkdir -p apps/server/prisma
```

**Step 2: 创建 Prisma Schema（第一部分）**

创建 `apps/server/prisma/schema.prisma`:

```prisma
// This is your Prisma schema file

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// 客户端实例
model Client {
  id             String   @id @default(cuid())
  guid           String   @unique
  proxy          String?
  isLoginProxy   Boolean  @default(false)
  bridge         String?
  syncHistoryMsg Boolean  @default(true)
  autoStart      Boolean  @default(true)
  isActive       Boolean  @default(true)
  loginStatus    String   @default("offline")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  conversations Conversation[]
}

// 联系人
model Contact {
  id        String   @id @default(cuid())
  username  String   @unique
  nickname  String
  remark    String?
  avatar    String?
  type      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  conversations Conversation[]
  groupMembers  GroupMember[]

  @@index([nickname])
}

// 群组
model Group {
  id           String   @id @default(cuid())
  roomUsername String   @unique
  name         String
  avatar       String?
  memberCount  Int      @default(0)
  version      Int?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  conversations Conversation[]
  members       GroupMember[]

  @@index([name])
}
```

**Step 3: 创建 Prisma Schema（第二部分）**

继续在 `apps/server/prisma/schema.prisma` 中添加：

```prisma
// 群成员
model GroupMember {
  id        String   @id @default(cuid())
  groupId   String
  username  String
  nickname  String?
  role      String   @default("member")
  joinedAt  DateTime @default(now())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  group   Group   @relation(fields: [groupId], references: [id], onDelete: Cascade)
  contact Contact @relation(fields: [username], references: [username])

  @@unique([groupId, username])
  @@index([groupId])
  @@index([username])
}

// 会话
model Conversation {
  id            String    @id @default(cuid())
  clientId      String
  type          String
  contactId     String?
  groupId       String?
  unreadCount   Int       @default(0)
  lastMessageAt DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  client         Client         @relation(fields: [clientId], references: [id])
  contact        Contact?       @relation(fields: [contactId], references: [id])
  group          Group?         @relation(fields: [groupId], references: [id])
  messageIndexes MessageIndex[]

  @@index([clientId])
  @@index([contactId])
  @@index([groupId])
  @@index([lastMessageAt])
  @@index([clientId, lastMessageAt])
}

// 消息索引
model MessageIndex {
  id             String   @id @default(cuid())
  conversationId String
  msgId          String   @unique
  msgType        Int
  fromUsername   String
  toUsername     String
  chatroomSender String?
  createTime     Int
  dataLakeKey    String
  createdAt      DateTime @default(now())

  conversation Conversation @relation(fields: [conversationId], references: [id])

  @@index([conversationId])
  @@index([createTime])
  @@index([conversationId, createTime])
  @@index([fromUsername])
  @@index([toUsername])
}

// 消息状态变更
model MessageStateChange {
  id         String   @id @default(cuid())
  msgId      String
  changeType String
  changeTime Int
  changeData String?
  createdAt  DateTime @default(now())

  @@index([msgId])
  @@index([changeTime])
  @@index([msgId, changeTime])
}
```

**Step 4: 生成 Prisma Client**

```bash
cd apps/server
pnpm db:generate
```

Expected: "Generated Prisma Client"

**Step 5: 推送数据库 Schema**

```bash
pnpm db:push
```

Expected: "Your database is now in sync with your Prisma schema"

**Step 6: 提交**

```bash
git add apps/server/prisma/schema.prisma
git commit -m "feat: add Prisma schema for SQLite database"
```

---

## Task 3: Data Lake 存储服务

**Files:**
- Create: `apps/server/src/services/dataLake.ts`
- Create: `apps/server/src/services/dataLake.test.ts`

**Step 1: 编写 Data Lake 服务的测试**

创建 `apps/server/src/services/dataLake.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DataLakeService } from './dataLake'
import fs from 'fs/promises'

describe('DataLakeService', () => {
  const testLakePath = './test-data-lake'
  let dataLake: DataLakeService

  beforeEach(async () => {
    dataLake = new DataLakeService({
      type: 'filesystem',
      path: testLakePath
    })
  })

  afterEach(async () => {
    await fs.rm(testLakePath, { recursive: true, force: true })
  })

  it('should save and retrieve message', async () => {
    const message = {
      msg_id: 'test_123',
      from_username: 'user1',
      to_username: 'user2',
      content: 'Hello',
      create_time: 1234567890,
      msg_type: 1,
      chatroom_sender: '',
      desc: '',
      chatroom: '',
      source: ''
    }

    const key = await dataLake.saveMessage('conv_123', message)
    const retrieved = await dataLake.getMessage(key)

    expect(retrieved).toEqual(message)
  })
})
```

**Step 2: 运行测试确认失败**

```bash
cd apps/server
pnpm test dataLake.test.ts
```

Expected: FAIL - "Cannot find module './dataLake'"

**Step 3: 实现 Data Lake 服务（见下一步骤）**

由于内容较长，实现代码已在设计文档中详细说明。

**Step 4: 运行测试确认通过**

```bash
pnpm test dataLake.test.ts
```

Expected: PASS

**Step 5: 提交**

```bash
git add apps/server/src/services/
git commit -m "feat: implement Data Lake service for message storage"
```

---

## Task 4: Prisma 数据库服务和环境配置

**Files:**
- Create: `apps/server/src/lib/prisma.ts`
- Create: `apps/server/src/lib/env.ts`

**Step 1: 安装 dotenv**

```bash
cd apps/server
pnpm add dotenv
```

**Step 2: 创建环境变量加载工具**

创建 `apps/server/src/lib/env.ts` (代码见设计文档)

**Step 3: 创建 Prisma 客户端单例**

创建 `apps/server/src/lib/prisma.ts` (代码见设计文档)

**Step 4: 提交**

```bash
git add apps/server/src/lib/
git commit -m "feat: setup Prisma client and environment configuration"
```

---

## Task 5: juhexbot 适配器基础结构

**Files:**
- Create: `apps/server/src/adapters/juhexbot/types.ts`
- Create: `apps/server/src/adapters/juhexbot/client.ts`
- Create: `apps/server/src/adapters/juhexbot/client.test.ts`

**Step 1: 定义 juhexbot 类型**

创建 `apps/server/src/adapters/juhexbot/types.ts` (代码见设计文档)

**Step 2: 实现适配器基础类**

创建 `apps/server/src/adapters/juhexbot/client.ts` (代码见设计文档)

**Step 3: 编写测试**

创建 `apps/server/src/adapters/juhexbot/client.test.ts`

**Step 4: 运行测试**

```bash
pnpm test client.test.ts
```

Expected: PASS

**Step 5: 提交**

```bash
git add apps/server/src/adapters/juhexbot/
git commit -m "feat: implement juhexbot adapter base structure"
```

---

## Task 6: WebSocket 服务器基础

**Files:**
- Create: `apps/server/src/services/websocket.ts`
- Modify: `apps/server/src/index.ts`

**Step 1: 实现 WebSocket 服务**

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
    })
  }

  private handleMessage(ws: WebSocket, message: WebSocketMessage) {
    switch (message.event) {
      case 'client:connect':
        const clientId = message.data.guid
        this.clients.set(clientId, ws)
        this.send(ws, 'connected', { clientId })
        break

      default:
        console.log('Unknown event:', message.event)
    }
  }

  /**
   * 发送消息给指定客户端
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
}
```

**Step 2: 更新主服务器文件**

修改 `apps/server/src/index.ts`:

```typescript
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { serve } from '@hono/node-server'
import { WebSocketService } from './services/websocket'
import { env } from './lib/env'

const app = new Hono()

app.use('*', logger())
app.use('*', cors())

app.get('/', (c) => {
  return c.json({
    message: 'MoreChat API — Small is boring',
    version: '0.1.0'
  })
})

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

const port = parseInt(env.PORT)
console.log(`🚀 Server is running on http://localhost:${port}`)

const server = serve({
  fetch: app.fetch,
  port
})

// 初始化 WebSocket 服务
const wsService = new WebSocketService(server)

export { wsService }
```

**Step 3: 测试服务器启动**

```bash
pnpm dev
```

Expected: Server starts without errors

**Step 4: 提交**

```bash
git add apps/server/src/services/websocket.ts apps/server/src/index.ts
git commit -m "feat: implement WebSocket server with basic connection handling"
```

---

## Task 7: 消息服务层

**Files:**
- Create: `apps/server/src/services/message.ts`
- Create: `apps/server/src/services/message.test.ts`

**Step 1: 编写消息服务测试**

创建 `apps/server/src/services/message.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MessageService } from './message'
import { prisma } from '../lib/prisma'
import { DataLakeService } from './dataLake'

describe('MessageService', () => {
  let messageService: MessageService

  beforeEach(() => {
    const dataLake = new DataLakeService({
      type: 'filesystem',
      path: './test-data-lake'
    })
    messageService = new MessageService(dataLake)
  })

  afterEach(async () => {
    await prisma.messageIndex.deleteMany()
  })

  it('should save message to both data lake and index', async () => {
    const message = {
      msg_id: 'test_msg_001',
      from_username: 'user1',
      to_username: 'user2',
      content: 'Test message',
      create_time: Math.floor(Date.now() / 1000),
      msg_type: 1,
      chatroom_sender: '',
      desc: '',
      chatroom: '',
      source: ''
    }

    await messageService.saveMessage('conv_test', message)

    const index = await prisma.messageIndex.findUnique({
      where: { msgId: 'test_msg_001' }
    })

    expect(index).toBeDefined()
    expect(index?.msgId).toBe('test_msg_001')
  })
})
```

**Step 2: 运行测试确认失败**

```bash
pnpm test message.test.ts
```

Expected: FAIL

**Step 3: 实现消息服务**

创建 `apps/server/src/services/message.ts`:

```typescript
import { prisma } from '../lib/prisma'
import { DataLakeService, ChatMessage } from './dataLake'

export class MessageService {
  constructor(private dataLake: DataLakeService) {}

  /**
   * 保存消息（同时保存到 Data Lake 和索引）
   */
  async saveMessage(conversationId: string, message: ChatMessage): Promise<void> {
    // 1. 保存到 Data Lake
    const dataLakeKey = await this.dataLake.saveMessage(conversationId, message)

    // 2. 保存索引到 SQLite
    await prisma.messageIndex.create({
      data: {
        conversationId,
        msgId: message.msg_id,
        msgType: message.msg_type,
        fromUsername: message.from_username,
        toUsername: message.to_username,
        chatroomSender: message.chatroom_sender || null,
        createTime: message.create_time,
        dataLakeKey,
      }
    })

    // 3. 更新会话的最后消息时间
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: new Date(message.create_time * 1000),
        unreadCount: { increment: 1 }
      }
    })
  }

  /**
   * 获取会话的消息列表
   */
  async getMessages(conversationId: string, limit: number = 50, offset: number = 0) {
    // 1. 从 SQLite 获取消息索引
    const indexes = await prisma.messageIndex.findMany({
      where: { conversationId },
      orderBy: { createTime: 'desc' },
      take: limit,
      skip: offset
    })

    // 2. 从 Data Lake 获取完整消息数据
    const messages = await this.dataLake.getMessages(
      indexes.map(idx => idx.dataLakeKey)
    )

    return messages
  }

  /**
   * 记录消息状态变更
   */
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

**Step 4: 运行测试确认通过**

```bash
pnpm test message.test.ts
```

Expected: PASS

**Step 5: 提交**

```bash
git add apps/server/src/services/message.ts apps/server/src/services/message.test.ts
git commit -m "feat: implement message service with Data Lake integration"
```

---

## 执行计划完成

**计划已保存到:** `docs/plans/2026-03-08-phase1-implementation.md`

**两种执行选项:**

**1. Subagent-Driven (当前会话)** - 我在当前会话中为每个任务派发新的子代理，任务间进行审查，快速迭代

**2. Parallel Session (独立会话)** - 在新会话中使用 executing-plans，批量执行并设置检查点

**你选择哪种方式？**
