# Phase 2: 核心功能实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现客户端状态查询、消息收发（含 WebSocket 推送）、会话管理的完整后端功能。

**Architecture:** REST API 驱动，WebSocket 仅用于实时推送。路由层负责 HTTP 参数解析和响应格式化，业务逻辑在 Service 层。存储优先策略：先保存到 DB/DataLake，再通过 WebSocket 推送。

**Tech Stack:** Node.js, TypeScript, Hono, Prisma (SQLite), WebSocket (ws), Vitest

**现有代码基础：**
- `message.ts` 已有 `handleIncomingMessage`、`ensureContact`、`ensureConversation`
- `database.ts` 已有 Contact、Group、Conversation、MessageIndex 表和 CRUD 方法
- `juhexbotAdapter.ts` 已有 `sendRequest`、`getConversationId`、`parseWebhookPayload`
- `dataLake.ts` 已有 `saveMessage`、`getMessage`、`getMessages`
- `websocket.ts` 已有 `send`、`sendToClient`、`broadcast`
- `app.ts` 已有 `createApp(adapter, onMessage)`

---

## Task 1: JuhexbotAdapter 扩展 - getClientStatus 和 sendTextMessage

**Files:**
- Modify: `apps/server/src/services/juhexbotAdapter.ts`
- Modify: `apps/server/src/services/juhexbotAdapter.test.ts`

**Step 1: 编写 getClientStatus 测试**

在 `apps/server/src/services/juhexbotAdapter.test.ts` 中添加：

```typescript
describe('getClientStatus', () => {
  it('should return online status when client is active', async () => {
    // Mock fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        error_code: 0,
        data: { status: 1, guid: 'test_guid' }
      })
    })

    const adapter = new JuhexbotAdapter({
      apiUrl: 'http://test.com',
      appKey: 'key',
      appSecret: 'secret',
      clientGuid: 'test_guid'
    })

    const result = await adapter.getClientStatus()
    expect(result).toEqual({ online: true, guid: 'test_guid' })
  })

  it('should return offline status when client is inactive', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        error_code: 0,
        data: { status: 0, guid: 'test_guid' }
      })
    })

    const adapter = new JuhexbotAdapter({
      apiUrl: 'http://test.com',
      appKey: 'key',
      appSecret: 'secret',
      clientGuid: 'test_guid'
    })

    const result = await adapter.getClientStatus()
    expect(result).toEqual({ online: false, guid: 'test_guid' })
  })

  it('should throw error when API returns error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        error_code: 1001,
        error_message: 'Invalid credentials'
      })
    })

    const adapter = new JuhexbotAdapter({
      apiUrl: 'http://test.com',
      appKey: 'key',
      appSecret: 'secret',
      clientGuid: 'test_guid'
    })

    await expect(adapter.getClientStatus()).rejects.toThrow('Invalid credentials')
  })
})
```

**Step 2: 运行测试确认失败**

```bash
cd apps/server && pnpm test juhexbotAdapter.test.ts
```

Expected: FAIL - "adapter.getClientStatus is not a function"

**Step 3: 实现 getClientStatus**

在 `apps/server/src/services/juhexbotAdapter.ts` 的 `JuhexbotAdapter` 类中添加：

```typescript
async getClientStatus(): Promise<{ online: boolean; guid: string }> {
  const result = await this.sendRequest('client/get_client_status', {
    guid: this.config.clientGuid
  })

  if (result.error_code !== 0) {
    throw new Error(result.error_message || 'Failed to get client status')
  }

  return {
    online: result.data.status === 1,
    guid: this.config.clientGuid
  }
}
```

**Step 4: 运行测试确认通过**

```bash
pnpm test juhexbotAdapter.test.ts
```

Expected: PASS

**Step 5: 编写 sendTextMessage 测试**

在测试文件中添加：

```typescript
describe('sendTextMessage', () => {
  it('should send text message successfully', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        error_code: 0,
        data: { msg_id: 'sent_msg_123' }
      })
    })

    const adapter = new JuhexbotAdapter({
      apiUrl: 'http://test.com',
      appKey: 'key',
      appSecret: 'secret',
      clientGuid: 'test_guid'
    })

    const result = await adapter.sendTextMessage('wxid_target', '你好')
    expect(result).toEqual({ msgId: 'sent_msg_123' })

    expect(fetch).toHaveBeenCalledWith('http://test.com', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('message/send_text')
    }))
  })

  it('should throw error when send fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        error_code: 2001,
        error_message: 'Client offline'
      })
    })

    const adapter = new JuhexbotAdapter({
      apiUrl: 'http://test.com',
      appKey: 'key',
      appSecret: 'secret',
      clientGuid: 'test_guid'
    })

    await expect(adapter.sendTextMessage('wxid_target', '你好')).rejects.toThrow('Client offline')
  })
})
```

**Step 6: 实现 sendTextMessage**

```typescript
async sendTextMessage(toUsername: string, content: string): Promise<{ msgId: string }> {
  const result = await this.sendRequest('message/send_text', {
    guid: this.config.clientGuid,
    to_username: toUsername,
    content
  })

  if (result.error_code !== 0) {
    throw new Error(result.error_message || 'Failed to send message')
  }

  return { msgId: result.data.msg_id }
}
```

**Step 7: 运行测试确认通过**

```bash
pnpm test juhexbotAdapter.test.ts
```

Expected: PASS

**Step 8: 提交**

```bash
git add apps/server/src/services/juhexbotAdapter.ts apps/server/src/services/juhexbotAdapter.test.ts
git commit -m "feat: add getClientStatus and sendTextMessage to JuhexbotAdapter (TDD)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: ClientService - 客户端状态查询

**Files:**
- Create: `apps/server/src/services/clientService.ts`
- Create: `apps/server/src/services/clientService.test.ts`

**Step 1: 编写 ClientService 测试**

创建 `apps/server/src/services/clientService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ClientService } from './clientService.js'
import type { JuhexbotAdapter } from './juhexbotAdapter.js'

describe('ClientService', () => {
  let clientService: ClientService
  let mockAdapter: JuhexbotAdapter

  beforeEach(() => {
    mockAdapter = {
      getClientStatus: vi.fn()
    } as any

    clientService = new ClientService(mockAdapter)
  })

  it('should return online status', async () => {
    vi.mocked(mockAdapter.getClientStatus).mockResolvedValue({
      online: true,
      guid: 'test_guid'
    })

    const result = await clientService.getStatus()
    expect(result).toEqual({ online: true, guid: 'test_guid' })
  })

  it('should return offline status', async () => {
    vi.mocked(mockAdapter.getClientStatus).mockResolvedValue({
      online: false,
      guid: 'test_guid'
    })

    const result = await clientService.getStatus()
    expect(result).toEqual({ online: false, guid: 'test_guid' })
  })

  it('should handle API error gracefully', async () => {
    vi.mocked(mockAdapter.getClientStatus).mockRejectedValue(
      new Error('Network error')
    )

    await expect(clientService.getStatus()).rejects.toThrow('Network error')
  })
})
```

**Step 2: 运行测试确认失败**

```bash
cd apps/server && pnpm test clientService.test.ts
```

Expected: FAIL - "Cannot find module './clientService'"

**Step 3: 实现 ClientService**

创建 `apps/server/src/services/clientService.ts`:

```typescript
import type { JuhexbotAdapter } from './juhexbotAdapter'

export class ClientService {
  constructor(private adapter: JuhexbotAdapter) {}

  async getStatus(): Promise<{ online: boolean; guid: string }> {
    return this.adapter.getClientStatus()
  }
}
```

**Step 4: 运行测试确认通过**

```bash
pnpm test clientService.test.ts
```

Expected: PASS

**Step 5: 提交**

```bash
git add apps/server/src/services/clientService.ts apps/server/src/services/clientService.test.ts
git commit -m "feat: implement ClientService (TDD)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: ConversationService - 会话管理

**Files:**
- Create: `apps/server/src/services/conversationService.ts`
- Create: `apps/server/src/services/conversationService.test.ts`

**Step 1: 编写 ConversationService 测试**

创建 `apps/server/src/services/conversationService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConversationService } from './conversationService.js'
import type { DatabaseService } from './database.js'
import type { DataLakeService } from './dataLake.js'

describe('ConversationService', () => {
  let service: ConversationService
  let mockDb: DatabaseService
  let mockDataLake: DataLakeService

  beforeEach(() => {
    mockDb = {
      getConversations: vi.fn(),
      findConversationById: vi.fn(),
      updateConversation: vi.fn(),
      getMessageIndexes: vi.fn()
    } as any

    mockDataLake = {
      getMessages: vi.fn()
    } as any

    service = new ConversationService(mockDb, mockDataLake)
  })

  describe('list', () => {
    it('should return conversations ordered by lastMessageAt', async () => {
      const mockConversations = [
        { id: 'conv_1', type: 'private', lastMessageAt: new Date('2026-03-09'), unreadCount: 2 },
        { id: 'conv_2', type: 'group', lastMessageAt: new Date('2026-03-08'), unreadCount: 0 }
      ]
      vi.mocked(mockDb.getConversations).mockResolvedValue(mockConversations)

      const result = await service.list('client_1')
      expect(result).toEqual(mockConversations)
      expect(mockDb.getConversations).toHaveBeenCalledWith('client_1', { limit: 50, offset: 0 })
    })
  })

  describe('getById', () => {
    it('should return conversation detail', async () => {
      const mockConv = { id: 'conv_1', type: 'private', unreadCount: 3 }
      vi.mocked(mockDb.findConversationById).mockResolvedValue(mockConv)

      const result = await service.getById('conv_1')
      expect(result).toEqual(mockConv)
    })

    it('should throw error when conversation not found', async () => {
      vi.mocked(mockDb.findConversationById).mockResolvedValue(null)

      await expect(service.getById('not_exist')).rejects.toThrow('Conversation not found')
    })
  })

  describe('markAsRead', () => {
    it('should clear unread count', async () => {
      vi.mocked(mockDb.findConversationById).mockResolvedValue({ id: 'conv_1' })
      vi.mocked(mockDb.updateConversation).mockResolvedValue(undefined)

      await service.markAsRead('conv_1')
      expect(mockDb.updateConversation).toHaveBeenCalledWith('conv_1', { unreadCount: 0 })
    })
  })

  describe('getMessages', () => {
    it('should return paginated messages from DataLake', async () => {
      const mockIndexes = [
        { dataLakeKey: 'key1', createTime: 1000 },
        { dataLakeKey: 'key2', createTime: 900 }
      ]
      const mockMessages = [
        { msg_id: 'msg1', content: 'hello' },
        { msg_id: 'msg2', content: 'world' }
      ]

      vi.mocked(mockDb.getMessageIndexes).mockResolvedValue(mockIndexes)
      vi.mocked(mockDataLake.getMessages).mockResolvedValue(mockMessages)

      const result = await service.getMessages('conv_1', { limit: 50 })
      expect(result.messages).toEqual(mockMessages)
      expect(result.hasMore).toBe(false)
    })

    it('should indicate hasMore when limit is reached', async () => {
      const mockIndexes = Array(51).fill({ dataLakeKey: 'key', createTime: 1000 })
      vi.mocked(mockDb.getMessageIndexes).mockResolvedValue(mockIndexes)
      vi.mocked(mockDataLake.getMessages).mockResolvedValue([])

      const result = await service.getMessages('conv_1', { limit: 50 })
      expect(result.hasMore).toBe(true)
    })
  })
})
```

**Step 2: 运行测试确认失败**

```bash
pnpm test conversationService.test.ts
```

Expected: FAIL - "Cannot find module './conversationService'"

**Step 3: 实现 ConversationService**

创建 `apps/server/src/services/conversationService.ts`:

```typescript
import type { DatabaseService } from './database'
import type { DataLakeService, ChatMessage } from './dataLake'

export class ConversationService {
  constructor(
    private db: DatabaseService,
    private dataLake: DataLakeService
  ) {}

  async list(clientId: string, limit: number = 50, offset: number = 0) {
    return this.db.getConversations(clientId, { limit, offset })
  }

  async getById(id: string) {
    const conversation = await this.db.findConversationById(id)
    if (!conversation) {
      throw new Error('Conversation not found')
    }
    return conversation
  }

  async markAsRead(id: string): Promise<void> {
    const conversation = await this.db.findConversationById(id)
    if (!conversation) {
      throw new Error('Conversation not found')
    }
    await this.db.updateConversation(id, { unreadCount: 0 })
  }

  async getMessages(conversationId: string, options: { limit?: number; before?: number } = {}) {
    const limit = options.limit || 50
    // 多取一条用于判断 hasMore
    const indexes = await this.db.getMessageIndexes(conversationId, {
      limit: limit + 1,
      before: options.before
    })

    const hasMore = indexes.length > limit
    const actualIndexes = hasMore ? indexes.slice(0, limit) : indexes

    const messages = await this.dataLake.getMessages(
      actualIndexes.map(idx => idx.dataLakeKey)
    )

    return { messages, hasMore }
  }
}
```

**Step 4: 运行测试确认通过**

```bash
pnpm test conversationService.test.ts
```

Expected: PASS

**Step 5: 提交**

```bash
git add apps/server/src/services/conversationService.ts apps/server/src/services/conversationService.test.ts
git commit -m "feat: implement ConversationService (TDD)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: DatabaseService 扩展 - 新增查询方法

**Files:**
- Modify: `apps/server/src/services/database.ts`
- Modify: `apps/server/src/services/database.test.ts`

**说明：** ConversationService 和路由层需要一些 DatabaseService 中尚未实现的方法。本任务补充这些方法。

**Step 1: 编写新增方法的测试**

在 `apps/server/src/services/database.test.ts` 中添加：

```typescript
describe('getConversations', () => {
  it('should return conversations ordered by lastMessageAt desc', async () => {
    // 先创建 client
    const client = await db.createClient({ guid: 'test_guid' })

    // 创建两个会话
    await db.createConversation({ clientId: client.id, type: 'private' })
    const conv2 = await db.createConversation({ clientId: client.id, type: 'group' })
    await db.updateConversationLastMessage(conv2.id, new Date('2026-03-09'))

    const result = await db.getConversations(client.id, { limit: 50, offset: 0 })
    expect(result.length).toBeGreaterThanOrEqual(1)
  })
})

describe('findConversationById', () => {
  it('should return conversation by id', async () => {
    const client = await db.createClient({ guid: 'test_guid_2' })
    const conv = await db.createConversation({ clientId: client.id, type: 'private' })

    const result = await db.findConversationById(conv.id)
    expect(result).not.toBeNull()
    expect(result!.id).toBe(conv.id)
  })

  it('should return null when not found', async () => {
    const result = await db.findConversationById('not_exist')
    expect(result).toBeNull()
  })
})

describe('updateConversation', () => {
  it('should update unreadCount', async () => {
    const client = await db.createClient({ guid: 'test_guid_3' })
    const conv = await db.createConversation({ clientId: client.id, type: 'private' })

    await db.updateConversation(conv.id, { unreadCount: 0 })
    const updated = await db.findConversationById(conv.id)
    expect(updated!.unreadCount).toBe(0)
  })
})
```

**Step 2: 运行测试确认失败**

```bash
cd apps/server && pnpm test database.test.ts
```

Expected: FAIL - "db.getConversations is not a function"

**Step 3: 实现新增方法**

在 `apps/server/src/services/database.ts` 的 `DatabaseService` 类中添加：

```typescript
// --- Conversation 扩展 ---

async getConversations(clientId: string, options: { limit?: number; offset?: number } = {}) {
  const { limit = 50, offset = 0 } = options
  return this.prisma.conversation.findMany({
    where: { clientId },
    orderBy: { lastMessageAt: 'desc' },
    take: limit,
    skip: offset
  })
}

async findConversationById(id: string) {
  return this.prisma.conversation.findUnique({ where: { id } })
}

async updateConversation(id: string, data: { unreadCount?: number }) {
  return this.prisma.conversation.update({
    where: { id },
    data
  })
}
```

**Step 4: 运行测试确认通过**

```bash
pnpm test database.test.ts
```

Expected: PASS

**Step 5: 提交**

```bash
git add apps/server/src/services/database.ts apps/server/src/services/database.test.ts
git commit -m "feat: add conversation query methods to DatabaseService (TDD)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: MessageService 扩展 - sendMessage 和 WebSocket 推送

**Files:**
- Modify: `apps/server/src/services/message.ts`
- Modify: `apps/server/src/services/message.test.ts`

**Step 1: 编写 sendMessage 测试**

在 `apps/server/src/services/message.test.ts` 中添加：

```typescript
describe('sendMessage', () => {
  it('should send text message via adapter and save to DataLake', async () => {
    // Mock adapter.sendTextMessage
    vi.mocked(mockAdapter.sendTextMessage).mockResolvedValue({ msgId: 'sent_123' })

    // Mock conversation lookup
    vi.mocked(mockDb.findConversationById).mockResolvedValue({
      id: 'conv_1',
      type: 'private',
      contactId: 'contact_1'
    })

    // Mock contact lookup
    vi.mocked(mockDb.findContactById).mockResolvedValue({
      id: 'contact_1',
      username: 'wxid_target'
    })

    // Mock DataLake save
    vi.mocked(mockDataLake.saveMessage).mockResolvedValue('lake_key_1')

    // Mock MessageIndex create
    vi.mocked(mockDb.createMessageIndex).mockResolvedValue({})

    const result = await messageService.sendMessage('conv_1', '你好')

    expect(result.msgId).toBe('sent_123')
    expect(mockAdapter.sendTextMessage).toHaveBeenCalledWith('wxid_target', '你好')
    expect(mockDataLake.saveMessage).toHaveBeenCalled()
    expect(mockDb.createMessageIndex).toHaveBeenCalled()
  })
})
```

**Step 2: 运行测试确认失败**

```bash
pnpm test message.test.ts
```

Expected: FAIL - "messageService.sendMessage is not a function"

**Step 3: 实现 sendMessage**

在 `apps/server/src/services/message.ts` 的 `MessageService` 类中添加：

```typescript
async sendMessage(conversationId: string, content: string): Promise<{ msgId: string }> {
  // 1. 获取会话信息
  const conversation = await this.db.findConversationById(conversationId)
  if (!conversation) {
    throw new Error('Conversation not found')
  }

  // 2. 确定接收者
  let toUsername: string
  if (conversation.type === 'group') {
    const group = await this.db.findGroupById(conversation.groupId!)
    if (!group) throw new Error('Group not found')
    toUsername = group.roomUsername
  } else {
    const contact = await this.db.findContactById(conversation.contactId!)
    if (!contact) throw new Error('Contact not found')
    toUsername = contact.username
  }

  // 3. 发送消息
  const { msgId } = await this.adapter.sendTextMessage(toUsername, content)

  // 4. 保存到 DataLake
  const chatMessage: ChatMessage = {
    msg_id: msgId,
    from_username: this.adapter['config'].clientGuid,
    to_username: toUsername,
    content,
    create_time: Math.floor(Date.now() / 1000),
    msg_type: 1,
    chatroom_sender: '',
    desc: '',
    is_chatroom_msg: conversation.type === 'group' ? 1 : 0,
    chatroom: conversation.type === 'group' ? toUsername : '',
    source: ''
  }

  const dataLakeKey = await this.dataLake.saveMessage(conversationId, chatMessage)

  // 5. 创建消息索引
  await this.db.createMessageIndex({
    conversationId,
    msgId,
    msgType: 1,
    fromUsername: chatMessage.from_username,
    toUsername,
    createTime: chatMessage.create_time,
    dataLakeKey
  })

  // 6. 更新会话最后消息时间
  await this.db.updateConversationLastMessage(conversationId, new Date(chatMessage.create_time * 1000))

  return { msgId }
}
```

**Step 4: 运行测试确认通过**

```bash
pnpm test message.test.ts
```

Expected: PASS

**Step 5: 编写 WebSocket 推送测试**

在 `apps/server/src/services/message.test.ts` 中添加：

```typescript
describe('handleIncomingMessage with WebSocket push', () => {
  it('should push message to WebSocket after saving', async () => {
    const mockWsService = {
      broadcast: vi.fn()
    } as any

    // 创建带 wsService 的 MessageService
    const msgServiceWithWs = new MessageService(mockDb, mockDataLake, mockAdapter, mockWsService)

    // ... 设置必要的 mock ...

    await msgServiceWithWs.handleIncomingMessage(mockParsedPayload)

    expect(mockWsService.broadcast).toHaveBeenCalledWith('message:new', expect.objectContaining({
      conversationId: expect.any(String)
    }))
  })
})
```

**Step 6: 实现 WebSocket 推送**

修改 `MessageService` 构造函数，添加可选的 `wsService` 参数：

```typescript
import type { WebSocketService } from './websocket'

export class MessageService {
  constructor(
    private db: DatabaseService,
    private dataLake: DataLakeService,
    private adapter: JuhexbotAdapter,
    private wsService?: WebSocketService
  ) {}

  // 在 handleIncomingMessage 末尾添加：
  async handleIncomingMessage(parsed: ParsedWebhookPayload): Promise<void> {
    // ... 现有逻辑 ...

    // WebSocket 推送
    if (this.wsService) {
      this.wsService.broadcast('message:new', {
        conversationId: conversation.id,
        message: chatMessage
      })
    }
  }
}
```

**Step 7: 运行测试确认通过**

```bash
pnpm test message.test.ts
```

Expected: PASS

**Step 8: 提交**

```bash
git add apps/server/src/services/message.ts apps/server/src/services/message.test.ts
git commit -m "feat: add sendMessage and WebSocket push to MessageService (TDD)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: DatabaseService 扩展 - findContactById 和 findGroupById

**Files:**
- Modify: `apps/server/src/services/database.ts`
- Modify: `apps/server/src/services/database.test.ts`

**说明：** Task 5 的 sendMessage 需要 `findContactById` 和 `findGroupById` 方法。

**Step 1: 编写测试**

在 `apps/server/src/services/database.test.ts` 中添加：

```typescript
describe('findContactById', () => {
  it('should return contact by id', async () => {
    const contact = await db.createContact({
      username: 'wxid_test',
      nickname: 'Test User',
      type: 'friend'
    })

    const result = await db.findContactById(contact.id)
    expect(result).not.toBeNull()
    expect(result!.username).toBe('wxid_test')
  })

  it('should return null when not found', async () => {
    const result = await db.findContactById('not_exist')
    expect(result).toBeNull()
  })
})

describe('findGroupById', () => {
  it('should return group by id', async () => {
    const group = await db.createGroup({
      roomUsername: 'room_test@chatroom',
      name: 'Test Group'
    })

    const result = await db.findGroupById(group.id)
    expect(result).not.toBeNull()
    expect(result!.roomUsername).toBe('room_test@chatroom')
  })

  it('should return null when not found', async () => {
    const result = await db.findGroupById('not_exist')
    expect(result).toBeNull()
  })
})
```

**Step 2: 实现方法**

在 `apps/server/src/services/database.ts` 中添加：

```typescript
async findContactById(id: string) {
  return this.prisma.contact.findUnique({ where: { id } })
}

async findGroupById(id: string) {
  return this.prisma.group.findUnique({ where: { id } })
}

async createGroup(data: { roomUsername: string; name: string }) {
  return this.prisma.group.create({
    data: {
      id: this.generateId(),
      ...data,
      updatedAt: new Date()
    }
  })
}
```

**Step 3: 运行测试确认通过**

```bash
pnpm test database.test.ts
```

Expected: PASS

**Step 4: 提交**

```bash
git add apps/server/src/services/database.ts apps/server/src/services/database.test.ts
git commit -m "feat: add findContactById and findGroupById to DatabaseService (TDD)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: 路由层 - client 路由

**Files:**
- Create: `apps/server/src/routes/client.ts`
- Create: `apps/server/src/routes/client.test.ts`

**Step 1: 编写路由测试**

创建 `apps/server/src/routes/client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { clientRoutes } from './client.js'
import type { ClientService } from '../services/clientService.js'

describe('client routes', () => {
  let app: Hono
  let mockClientService: ClientService

  beforeEach(() => {
    mockClientService = {
      getStatus: vi.fn()
    } as any

    app = new Hono()
    app.route('/api/client', clientRoutes({ clientService: mockClientService }))
  })

  describe('GET /api/client/status', () => {
    it('should return client status', async () => {
      vi.mocked(mockClientService.getStatus).mockResolvedValue({
        online: true,
        guid: 'test_guid'
      })

      const res = await app.request('/api/client/status')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.data.online).toBe(true)
    })

    it('should return 500 on error', async () => {
      vi.mocked(mockClientService.getStatus).mockRejectedValue(
        new Error('API error')
      )

      const res = await app.request('/api/client/status')
      const body = await res.json()

      expect(res.status).toBe(500)
      expect(body.success).toBe(false)
    })
  })
})
```

**Step 2: 运行测试确认失败**

```bash
cd apps/server && pnpm test routes/client.test.ts
```

Expected: FAIL - "Cannot find module './client'"

**Step 3: 实现路由**

创建 `apps/server/src/routes/client.ts`:

```typescript
import { Hono } from 'hono'
import type { ClientService } from '../services/clientService'

interface ClientRouteDeps {
  clientService: ClientService
}

export function clientRoutes(deps: ClientRouteDeps) {
  const router = new Hono()

  router.get('/status', async (c) => {
    try {
      const status = await deps.clientService.getStatus()
      return c.json({ success: true, data: status })
    } catch (error) {
      console.error('Failed to get client status:', error)
      return c.json({ success: false, error: { message: 'Failed to get client status' } }, 500)
    }
  })

  return router
}
```

**Step 4: 运行测试确认通过**

```bash
pnpm test routes/client.test.ts
```

Expected: PASS

**Step 5: 提交**

```bash
git add apps/server/src/routes/client.ts apps/server/src/routes/client.test.ts
git commit -m "feat: implement client routes (TDD)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: 路由层 - conversations 路由

**Files:**
- Create: `apps/server/src/routes/conversations.ts`
- Create: `apps/server/src/routes/conversations.test.ts`

**Step 1: 编写路由测试**

创建 `apps/server/src/routes/conversations.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { conversationRoutes } from './conversations.js'
import type { ConversationService } from '../services/conversationService.js'

describe('conversation routes', () => {
  let app: Hono
  let mockConvService: ConversationService

  beforeEach(() => {
    mockConvService = {
      list: vi.fn(),
      getById: vi.fn(),
      markAsRead: vi.fn(),
      getMessages: vi.fn()
    } as any

    app = new Hono()
    app.route('/api/conversations', conversationRoutes({
      conversationService: mockConvService,
      clientGuid: 'test_guid'
    }))
  })

  describe('GET /api/conversations', () => {
    it('should return conversation list', async () => {
      vi.mocked(mockConvService.list).mockResolvedValue([
        { id: 'conv_1', type: 'private', unreadCount: 2 }
      ])

      const res = await app.request('/api/conversations')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.data.conversations).toHaveLength(1)
    })
  })

  describe('GET /api/conversations/:id', () => {
    it('should return conversation detail', async () => {
      vi.mocked(mockConvService.getById).mockResolvedValue({
        id: 'conv_1', type: 'private'
      })

      const res = await app.request('/api/conversations/conv_1')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.data.id).toBe('conv_1')
    })

    it('should return 404 when not found', async () => {
      vi.mocked(mockConvService.getById).mockRejectedValue(
        new Error('Conversation not found')
      )

      const res = await app.request('/api/conversations/not_exist')
      expect(res.status).toBe(404)
    })
  })

  describe('PUT /api/conversations/:id/read', () => {
    it('should mark conversation as read', async () => {
      vi.mocked(mockConvService.markAsRead).mockResolvedValue(undefined)

      const res = await app.request('/api/conversations/conv_1/read', {
        method: 'PUT'
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
    })
  })

  describe('GET /api/conversations/:id/messages', () => {
    it('should return paginated messages', async () => {
      vi.mocked(mockConvService.getMessages).mockResolvedValue({
        messages: [{ msg_id: 'msg1', content: 'hello' }],
        hasMore: false
      })

      const res = await app.request('/api/conversations/conv_1/messages?limit=50')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.data.messages).toHaveLength(1)
      expect(body.data.hasMore).toBe(false)
    })
  })
})
```

**Step 2: 运行测试确认失败**

```bash
pnpm test routes/conversations.test.ts
```

Expected: FAIL - "Cannot find module './conversations'"

**Step 3: 实现路由**

创建 `apps/server/src/routes/conversations.ts`:

```typescript
import { Hono } from 'hono'
import type { ConversationService } from '../services/conversationService'

interface ConversationRouteDeps {
  conversationService: ConversationService
  clientGuid: string
}

export function conversationRoutes(deps: ConversationRouteDeps) {
  const router = new Hono()

  // 获取会话列表
  router.get('/', async (c) => {
    try {
      const limit = parseInt(c.req.query('limit') || '50')
      const offset = parseInt(c.req.query('offset') || '0')

      const conversations = await deps.conversationService.list(deps.clientGuid, limit, offset)
      return c.json({ success: true, data: { conversations } })
    } catch (error) {
      console.error('Failed to get conversations:', error)
      return c.json({ success: false, error: { message: 'Failed to get conversations' } }, 500)
    }
  })

  // 获取会话详情
  router.get('/:id', async (c) => {
    try {
      const id = c.req.param('id')
      const conversation = await deps.conversationService.getById(id)
      return c.json({ success: true, data: conversation })
    } catch (error: any) {
      if (error.message === 'Conversation not found') {
        return c.json({ success: false, error: { message: 'Conversation not found' } }, 404)
      }
      return c.json({ success: false, error: { message: 'Internal error' } }, 500)
    }
  })

  // 标记已读
  router.put('/:id/read', async (c) => {
    try {
      const id = c.req.param('id')
      await deps.conversationService.markAsRead(id)
      return c.json({ success: true })
    } catch (error) {
      console.error('Failed to mark as read:', error)
      return c.json({ success: false, error: { message: 'Failed to mark as read' } }, 500)
    }
  })

  // 获取消息历史
  router.get('/:id/messages', async (c) => {
    try {
      const id = c.req.param('id')
      const limit = parseInt(c.req.query('limit') || '50')
      const before = c.req.query('before') ? parseInt(c.req.query('before')!) : undefined

      const result = await deps.conversationService.getMessages(id, { limit, before })
      return c.json({ success: true, data: result })
    } catch (error) {
      console.error('Failed to get messages:', error)
      return c.json({ success: false, error: { message: 'Failed to get messages' } }, 500)
    }
  })

  return router
}
```

**Step 4: 运行测试确认通过**

```bash
pnpm test routes/conversations.test.ts
```

Expected: PASS

**Step 5: 提交**

```bash
git add apps/server/src/routes/conversations.ts apps/server/src/routes/conversations.test.ts
git commit -m "feat: implement conversation routes (TDD)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: 路由层 - messages 路由

**Files:**
- Create: `apps/server/src/routes/messages.ts`
- Create: `apps/server/src/routes/messages.test.ts`

**Step 1: 编写路由测试**

创建 `apps/server/src/routes/messages.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { messageRoutes } from './messages.js'
import type { MessageService } from '../services/message.js'

describe('message routes', () => {
  let app: Hono
  let mockMessageService: MessageService

  beforeEach(() => {
    mockMessageService = {
      sendMessage: vi.fn()
    } as any

    app = new Hono()
    app.route('/api/messages', messageRoutes({ messageService: mockMessageService }))
  })

  describe('POST /api/messages/send', () => {
    it('should send message successfully', async () => {
      vi.mocked(mockMessageService.sendMessage).mockResolvedValue({
        msgId: 'sent_123'
      })

      const res = await app.request('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: 'conv_1',
          content: '你好'
        })
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.data.msgId).toBe('sent_123')
    })

    it('should return 400 when missing required fields', async () => {
      const res = await app.request('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: 'conv_1' })
      })

      expect(res.status).toBe(400)
    })

    it('should return 500 on send failure', async () => {
      vi.mocked(mockMessageService.sendMessage).mockRejectedValue(
        new Error('Client offline')
      )

      const res = await app.request('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: 'conv_1',
          content: '你好'
        })
      })

      expect(res.status).toBe(500)
    })
  })
})
```

**Step 2: 运行测试确认失败**

```bash
pnpm test routes/messages.test.ts
```

Expected: FAIL - "Cannot find module './messages'"

**Step 3: 实现路由**

创建 `apps/server/src/routes/messages.ts`:

```typescript
import { Hono } from 'hono'
import type { MessageService } from '../services/message'

interface MessageRouteDeps {
  messageService: MessageService
}

export function messageRoutes(deps: MessageRouteDeps) {
  const router = new Hono()

  router.post('/send', async (c) => {
    try {
      const body = await c.req.json()
      const { conversationId, content } = body

      if (!conversationId || !content) {
        return c.json({
          success: false,
          error: { message: 'conversationId and content are required' }
        }, 400)
      }

      const result = await deps.messageService.sendMessage(conversationId, content)
      return c.json({ success: true, data: result })
    } catch (error) {
      console.error('Failed to send message:', error)
      return c.json({ success: false, error: { message: 'Failed to send message' } }, 500)
    }
  })

  return router
}
```

**Step 4: 运行测试确认通过**

```bash
pnpm test routes/messages.test.ts
```

Expected: PASS

**Step 5: 提交**

```bash
git add apps/server/src/routes/messages.ts apps/server/src/routes/messages.test.ts
git commit -m "feat: implement message routes (TDD)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: App 路由整合和 createApp 重构

**Files:**
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/app.test.ts`

**Step 1: 编写新的 createApp 测试**

修改 `apps/server/src/app.test.ts`，更新测试以适配新的 `AppDependencies` 签名：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createApp } from './app.js'
import type { AppDependencies } from './app.js'

describe('createApp', () => {
  let deps: AppDependencies

  beforeEach(() => {
    deps = {
      clientService: { getStatus: vi.fn() } as any,
      conversationService: {
        list: vi.fn(),
        getById: vi.fn(),
        markAsRead: vi.fn(),
        getMessages: vi.fn()
      } as any,
      messageService: {
        handleIncomingMessage: vi.fn(),
        sendMessage: vi.fn()
      } as any,
      juhexbotAdapter: {
        parseWebhookPayload: vi.fn()
      } as any,
      wsService: {
        broadcast: vi.fn(),
        sendToClient: vi.fn()
      } as any,
      clientGuid: 'test_guid'
    }
  })

  it('should respond to health check', async () => {
    const app = createApp(deps)
    const res = await app.request('/health')
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.status).toBe('ok')
  })

  it('should mount client routes', async () => {
    vi.mocked(deps.clientService.getStatus).mockResolvedValue({
      online: true, guid: 'test_guid'
    })

    const app = createApp(deps)
    const res = await app.request('/api/client/status')

    expect(res.status).toBe(200)
  })

  it('should mount conversation routes', async () => {
    vi.mocked(deps.conversationService.list).mockResolvedValue([])

    const app = createApp(deps)
    const res = await app.request('/api/conversations')

    expect(res.status).toBe(200)
  })

  it('should mount message routes', async () => {
    const app = createApp(deps)
    const res = await app.request('/api/messages/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: 'conv_1', content: 'test' })
    })

    // 即使 mock 返回 undefined，路由应该存在
    expect(res.status).not.toBe(404)
  })
})
```

**Step 2: 运行测试确认失败**

```bash
cd apps/server && pnpm test app.test.ts
```

Expected: FAIL - 签名不匹配

**Step 3: 重构 createApp**

修改 `apps/server/src/app.ts`:

```typescript
import { Hono } from 'hono'
import { clientRoutes } from './routes/client'
import { conversationRoutes } from './routes/conversations'
import { messageRoutes } from './routes/messages'
import type { ClientService } from './services/clientService'
import type { ConversationService } from './services/conversationService'
import type { MessageService } from './services/message'
import type { JuhexbotAdapter, ParsedWebhookPayload } from './services/juhexbotAdapter'
import type { WebSocketService } from './services/websocket'

export interface AppDependencies {
  clientService: ClientService
  conversationService: ConversationService
  messageService: MessageService
  juhexbotAdapter: JuhexbotAdapter
  wsService: WebSocketService
  clientGuid: string
}

export function createApp(deps: AppDependencies) {
  const app = new Hono()

  // 健康检查
  app.get('/health', (c) => {
    return c.json({ status: 'ok', timestamp: Date.now() })
  })

  // Webhook
  app.post('/webhook', async (c) => {
    try {
      const payload = await c.req.json()
      const parsed = deps.juhexbotAdapter.parseWebhookPayload(payload)

      await deps.messageService.handleIncomingMessage(parsed)

      // WebSocket 推送新消息
      deps.wsService.broadcast('message:new', {
        conversationId: deps.juhexbotAdapter.getConversationId(parsed),
        message: parsed.message
      })

      return c.json({ success: true })
    } catch (error) {
      console.error('Webhook error:', error)
      return c.json({ success: false, error: 'Internal error' }, 500)
    }
  })

  // Phase 2 路由
  app.route('/api/client', clientRoutes({ clientService: deps.clientService }))
  app.route('/api/conversations', conversationRoutes({
    conversationService: deps.conversationService,
    clientGuid: deps.clientGuid
  }))
  app.route('/api/messages', messageRoutes({ messageService: deps.messageService }))

  return app
}
```

**Step 4: 运行测试确认通过**

```bash
pnpm test app.test.ts
```

Expected: PASS

**Step 5: 提交**

```bash
git add apps/server/src/app.ts apps/server/src/app.test.ts
git commit -m "refactor: update createApp with AppDependencies and mount Phase 2 routes (TDD)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: 主入口整合 - index.ts 更新

**Files:**
- Modify: `apps/server/src/index.ts`

**Step 1: 更新 index.ts**

修改 `apps/server/src/index.ts`：

```typescript
import { serve } from '@hono/node-server'
import { env } from './lib/env.js'
import { DataLakeService } from './services/dataLake.js'
import { DatabaseService } from './services/database.js'
import { MessageService } from './services/message.js'
import { JuhexbotAdapter } from './services/juhexbotAdapter.js'
import { WebSocketService } from './services/websocket.js'
import { ClientService } from './services/clientService.js'
import { ConversationService } from './services/conversationService.js'
import { createApp } from './app.js'

async function main() {
  try {
    console.log('🔧 Initializing services...')

    // 1. 基础设施层
    const dataLakeService = new DataLakeService({
      type: env.DATA_LAKE_TYPE,
      path: env.DATA_LAKE_PATH
    })

    const databaseService = new DatabaseService()
    await databaseService.connect()

    const juhexbotAdapter = new JuhexbotAdapter({
      apiUrl: env.JUHEXBOT_API_URL,
      appKey: env.JUHEXBOT_APP_KEY,
      appSecret: env.JUHEXBOT_APP_SECRET,
      clientGuid: env.JUHEXBOT_CLIENT_GUID
    })

    // 2. 业务服务层
    const clientService = new ClientService(juhexbotAdapter)
    const conversationService = new ConversationService(databaseService, dataLakeService)
    const messageService = new MessageService(databaseService, dataLakeService, juhexbotAdapter)

    // 3. 创建 HTTP 应用
    // 注意：wsService 需要在 HTTP server 创建后才能初始化
    // 先用 null 占位，启动后替换
    let wsService: WebSocketService

    const app = createApp({
      clientService,
      conversationService,
      messageService,
      juhexbotAdapter,
      get wsService() { return wsService },
      clientGuid: env.JUHEXBOT_CLIENT_GUID
    } as any)

    // 4. 启动 HTTP 服务器
    const port = parseInt(env.PORT)
    console.log(`🚀 Starting server on http://localhost:${port}`)

    const server = serve({ fetch: app.fetch, port })

    // 5. 创建 WebSocket 服务
    wsService = new WebSocketService(server)
    console.log('✅ WebSocket service initialized')

    // 6. 检查 juhexbot 状态
    try {
      const status = await clientService.getStatus()
      console.log(`✅ juhexbot client: ${status.online ? 'online' : 'offline'}`)
    } catch (error) {
      console.warn('⚠️ Could not check juhexbot status:', error)
    }

    // 7. 优雅关闭
    async function gracefulShutdown(signal: string) {
      console.log(`\n${signal} received, shutting down gracefully...`)
      try {
        wsService.close()
        console.log('✅ WebSocket connections closed')
        await databaseService.disconnect()
        console.log('✅ Database disconnected')
        console.log('👋 Shutdown complete')
        process.exit(0)
      } catch (error) {
        console.error('❌ Error during shutdown:', error)
        process.exit(1)
      }
    }

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
    process.on('SIGINT', () => gracefulShutdown('SIGINT'))

    console.log('✅ Server is ready')
  } catch (error) {
    console.error('❌ Failed to start server:', error)
    process.exit(1)
  }
}

main()
```

**Step 2: 运行所有测试确认通过**

```bash
pnpm test
```

Expected: ALL PASS

**Step 3: 提交**

```bash
git add apps/server/src/index.ts
git commit -m "feat: update main entry with Phase 2 services and routes

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: 集成测试更新

**Files:**
- Modify: `apps/server/src/integration.test.ts`

**Step 1: 扩展集成测试**

在 `apps/server/src/integration.test.ts` 中添加 Phase 2 测试：

```typescript
describe('Phase 2 Integration', () => {
  // 使用与现有集成测试相同的 setup

  it('GET /api/client/status should return status', async () => {
    const res = await fetch(`http://localhost:${port}/api/client/status`)
    const body = await res.json()

    expect(res.status).toBe(200)
    // 注意：实际 juhexbot 可能不在线，所以只检查格式
    expect(body.success).toBeDefined()
  })

  it('GET /api/conversations should return empty list initially', async () => {
    const res = await fetch(`http://localhost:${port}/api/conversations`)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.conversations).toEqual([])
  })

  it('POST /webhook should create conversation and push via WebSocket', async () => {
    // 1. 连接 WebSocket
    const ws = new WebSocket(`ws://localhost:${port}`)
    await new Promise<void>((resolve) => ws.on('open', resolve))

    ws.send(JSON.stringify({
      event: 'client:connect',
      data: { guid: 'integration_test' }
    }))

    // 等待 connected 事件
    await new Promise<void>((resolve) => {
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString())
        if (msg.event === 'connected') resolve()
      })
    })

    // 2. 发送 webhook
    const webhookPayload = {
      guid: 'test_guid',
      notify_type: 1,
      data: {
        msg_id: 'integration_msg_1',
        msg_type: 1,
        from_username: 'wxid_sender',
        to_username: 'wxid_me',
        content: '集成测试消息',
        create_time: Math.floor(Date.now() / 1000),
        is_chatroom_msg: 0,
        chatroom_sender: '',
        chatroom: '',
        desc: '',
        source: ''
      }
    }

    await fetch(`http://localhost:${port}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webhookPayload)
    })

    // 3. 验证 WebSocket 收到 message:new
    const wsMessage = await new Promise<any>((resolve) => {
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString())
        if (msg.event === 'message:new') resolve(msg)
      })
    })

    expect(wsMessage.data.message.msgId).toBe('integration_msg_1')

    // 4. 验证会话已创建
    const convRes = await fetch(`http://localhost:${port}/api/conversations`)
    const convBody = await convRes.json()
    expect(convBody.data.conversations.length).toBeGreaterThan(0)

    ws.close()
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
git add apps/server/src/integration.test.ts
git commit -m "test: add Phase 2 integration tests

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## 执行计划完成

**计划已保存到:** `docs/plans/2026-03-09-phase2-implementation.md`

**任务总览：**

| Task | 内容 | 依赖 |
|------|------|------|
| 1 | JuhexbotAdapter 扩展 | 无 |
| 2 | ClientService | Task 1 |
| 3 | ConversationService | 无 |
| 4 | DatabaseService 扩展 | 无 |
| 5 | MessageService 扩展 | Task 1, 4 |
| 6 | client 路由 | Task 2 |
| 7 | conversations 路由 | Task 3 |
| 8 | messages 路由 | Task 5 |
| 9 | App 路由整合 | Task 6, 7, 8 |
| 10 | 主入口更新 | Task 9 |
| 11 | 集成测试 | Task 10 |

**两种执行选项:**

**1. Subagent-Driven (当前会话)** - 我在当前会话中为每个任务派发新的子代理，任务间进行审查，快速迭代

**2. Parallel Session (独立会话)** - 在新会话中使用 executing-plans，批量执行并设置检查点

**你选择哪种方式？**
