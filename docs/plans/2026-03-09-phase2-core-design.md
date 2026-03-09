# Phase 2: 核心功能设计方案

**日期**: 2026-03-09
**版本**: 1.0
**状态**: 已批准

## 概述

本设计方案描述 MoreChat Phase 2 的核心功能实现，包括客户端管理、消息收发和会话管理。

## 核心约束

- **单客户端模式**：只有一个 juhexbot 客户端实例，配置在 .env 中
- **存储优先**：先保存到 DB/DataLake，再通过 WebSocket 推送给前端
- **仅文本消息**：Phase 2 只支持文本消息的收发
- **自动创建会话**：收到新消息时，如果会话不存在则自动创建
- **REST API 驱动**：业务操作通过 REST API，WebSocket 仅用于实时推送

## 整体架构

### 数据流

```
接收消息：
juhexbot webhook → POST /webhook → 解析消息
    → 查找/创建 Conversation（自动创建）
    → 保存到 DataLake（原始数据）+ MessageIndex（索引）
    → 更新 Conversation.lastMessageAt + unreadCount
    → WebSocket 推送 'message:new' 给前端

发送消息：
前端 → POST /api/messages/send
    → MessageService.sendMessage()
        → JuhexbotAdapter.sendTextMessage()
        → 保存到 DataLake + MessageIndex
        → 返回 HTTP 200

查询消息：
前端 → GET /api/conversations/:id/messages
    → MessageService.getMessages()
        → 查询 MessageIndex → 从 DataLake 读取
        → 返回分页结果
```

### 模块划分

```
apps/server/src/
├── routes/
│   ├── client.ts              # 客户端管理路由
│   ├── conversations.ts       # 会话管理路由
│   └── messages.ts            # 消息操作路由
├── services/
│   ├── clientService.ts       # 客户端业务逻辑（新增）
│   ├── conversationService.ts # 会话业务逻辑（新增）
│   ├── message.ts             # 消息业务逻辑（扩展）
│   ├── juhexbotAdapter.ts     # API 适配器（扩展）
│   ├── database.ts            # 数据库服务（扩展）
│   ├── dataLake.ts            # 数据湖（已有）
│   └── websocket.ts           # WebSocket（已有）
├── app.ts                     # Hono App（扩展，挂载路由）
└── index.ts                   # 主入口（已有）
```

## 客户端管理

juhexbot 独立管理微信登录并保持登录状态。MoreChat 只需确认 juhexbot 实例在线即可。

### REST API

```
GET /api/client/status    确认 juhexbot 实例状态
```

### ClientService

```typescript
class ClientService {
  async getStatus(): Promise<{ online: boolean; guid: string }>
}
```

### 工作流程

```
1. 服务器启动 → 调用 getStatus() 确认 juhexbot 在线
2. 前端连接 → 调用 GET /api/client/status 获取状态
3. 在线 → 正常使用
4. 离线 → 前端提示 juhexbot 未连接
```

## 消息收发

### 接收消息（webhook）

```
juhexbot → POST /webhook → 解析消息
    → 查找/创建 Conversation（自动创建）
    → 保存到 DataLake + MessageIndex
    → 更新 Conversation.lastMessageAt + unreadCount
    → WebSocket 推送 'message:new' 给前端
```

### 自动创建会话逻辑

```typescript
if (message.isChatroomMsg) {
  // 群聊：通过 toUsername（群 ID）查找会话
  conversation = await findOrCreateGroupConversation(clientId, message.toUsername)
} else {
  // 私聊：通过 fromUsername 查找会话
  conversation = await findOrCreatePrivateConversation(clientId, message.fromUsername)
}
```

### 发送消息

```
POST /api/messages/send
Body: { conversationId, content }

→ MessageService.sendMessage()
    → 确定接收者（从 Conversation 获取 username/roomUsername）
    → JuhexbotAdapter.sendTextMessage(toUsername, content)
    → 保存到 DataLake + MessageIndex
    → 返回 { success: true, msgId }
```

### REST API

```
POST /api/messages/send                    发送文本消息
GET  /api/conversations/:id/messages       获取消息历史（分页）
```

### 消息历史查询

```
GET /api/conversations/:id/messages?limit=50&before=<timestamp>

→ 查询 MessageIndex（按 createTime 倒序）
→ 从 DataLake 批量读取消息内容
→ 返回 { messages: [...], hasMore: boolean }
```

### WebSocket 推送事件

```typescript
{ event: 'message:new', data: { conversationId, message } }
```

## 会话管理

### REST API

```
GET    /api/conversations              获取会话列表（按 lastMessageAt 倒序）
GET    /api/conversations/:id          获取会话详情
PUT    /api/conversations/:id/read     标记会话已读（清零 unreadCount）
```

### ConversationService

```typescript
class ConversationService {
  async list(clientId: string, limit?: number, offset?: number): Promise<Conversation[]>
  async getById(id: string): Promise<ConversationDetail>
  async markAsRead(id: string): Promise<void>
  async findOrCreatePrivate(clientId: string, username: string): Promise<Conversation>
  async findOrCreateGroup(clientId: string, roomUsername: string): Promise<Conversation>
}
```

### 会话列表响应

```typescript
{
  conversations: [
    {
      id: 'conv_123',
      type: 'private',
      name: '张三',
      avatar: null,
      lastMessage: {
        content: '你好',
        createTime: 1709913600,
        fromUsername: 'wxid_xxx'
      },
      unreadCount: 3,
      lastMessageAt: '2026-03-09T12:00:00Z'
    }
  ],
  total: 15,
  hasMore: false
}
```

### 设计决策

- 会话只通过消息自动创建，不提供手动创建 API
- 暂不支持删除会话、置顶、免打扰（YAGNI）
- 会话名称从 Contact/Group 表获取，不存在则显示 username
- 标记已读只清零 unreadCount，不同步到 juhexbot

## 数据库 Schema 扩展

### 新增表

```sql
-- Contact 表
CREATE TABLE IF NOT EXISTS "Contact" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "username" TEXT NOT NULL UNIQUE,
  "nickname" TEXT NOT NULL,
  "remark" TEXT,
  "avatar" TEXT,
  "type" TEXT NOT NULL DEFAULT 'friend',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Group 表
CREATE TABLE IF NOT EXISTS "Group" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "roomUsername" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "avatar" TEXT,
  "memberCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### Contact/Group 创建时机

- 收到私聊消息时：如果 Contact 不存在，创建基础记录（nickname 暂用 username）
- 收到群聊消息时：如果 Group 不存在，创建基础记录（name 暂用 roomUsername）
- 后续可通过 juhexbot API 同步完整信息（Phase 3）

## JuhexbotAdapter 扩展

### 新增方法

```typescript
class JuhexbotAdapter {
  // 已有
  parseWebhookPayload(payload: any): ParsedWebhookPayload

  // 新增
  async getClientStatus(): Promise<{ online: boolean; guid: string }>
  async sendTextMessage(toUsername: string, content: string): Promise<{ msgId: string }>
}
```

### 统一网关请求

```typescript
private async gatewayRequest<T>(action: string, data?: any): Promise<T> {
  const response = await fetch(this.config.apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_key: this.config.appKey,
      app_secret: this.config.appSecret,
      guid: this.config.clientGuid,
      action,
      data: data || {}
    })
  })
  return response.json()
}
```

## App 路由整合

### createApp 签名变更

```typescript
interface AppDependencies {
  clientService: ClientService
  conversationService: ConversationService
  messageService: MessageService
  juhexbotAdapter: JuhexbotAdapter
  wsService: WebSocketService
}

export function createApp(deps: AppDependencies) {
  const app = new Hono()

  app.use('*', cors())
  app.use('*', logger())

  app.get('/health', ...)
  app.post('/webhook', ...)

  app.route('/api/client', clientRoutes(deps))
  app.route('/api/conversations', conversationRoutes(deps))
  app.route('/api/messages', messageRoutes(deps))

  return app
}
```

### 统一响应格式

```typescript
// 错误响应
{ success: false, error: { code: string, message: string } }

// 成功响应
{ success: true, data: { ... } }
```

## 测试策略

### 单元测试

```
clientService.test.ts
  - getStatus() 返回在线/离线状态
  - getStatus() 处理 API 错误

conversationService.test.ts
  - list() 返回会话列表
  - getById() 返回会话详情
  - markAsRead() 清零 unreadCount
  - findOrCreatePrivate() 创建/返回私聊会话
  - findOrCreateGroup() 创建/返回群聊会话

messageService.test.ts（扩展）
  - handleIncomingMessage() 私聊/群聊 → 自动创建会话 + 保存 + 推送
  - sendMessage() 发送文本消息
  - getMessages() 分页查询

juhexbotAdapter.test.ts（扩展）
  - gatewayRequest() 统一网关请求
  - getClientStatus() 在线/离线
  - sendTextMessage() 成功/失败
```

### 路由测试

```
routes/client.test.ts
  - GET /api/client/status → 200

routes/conversations.test.ts
  - GET /api/conversations → 200
  - GET /api/conversations/:id → 200 / 404
  - PUT /api/conversations/:id/read → 200

routes/messages.test.ts
  - POST /api/messages/send → 200 / 400
  - GET /api/conversations/:id/messages → 200
```

### 集成测试（扩展）

```
integration.test.ts
  - 完整流程：webhook → 自动创建会话 → WebSocket 推送
  - 发送消息 → 查询消息历史
```

### 测试原则

- Service 测试使用 mock
- 路由测试使用 Hono 的 app.request()
- 集成测试使用真实 SQLite + DataLake
- TDD 流程
