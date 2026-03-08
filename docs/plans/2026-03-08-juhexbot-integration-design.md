# MoreChat - juhexbot API 集成设计方案

**日期**: 2026-03-08
**版本**: 1.0
**状态**: 已批准

## 概述

本设计方案描述如何在 MoreChat 项目中集成 juhexbot API，实现完整的聊天系统功能，包括客户端管理、消息收发、联系人和群组管理。

## 目标

- 接入 juhexbot API 实现类似微信的聊天能力
- 使用 WebSocket 实现实时双向通信
- 构建可扩展的架构，便于未来接入其他第三方聊天服务
- 提供流畅的用户体验和可靠的消息传输

## 整体架构

### 三层架构设计

**1. 表现层（Frontend）**
- React + TypeScript + Vite
- WebSocket 客户端
- Zustand 状态管理
- shadcn/ui 组件库

**2. 业务逻辑层（Backend API）**
- Hono Web 框架
- WebSocket 服务器
- 业务逻辑处理
- 会话管理和消息路由

**3. 适配器层（Adapter）**
- juhexbot API 封装
- 统一的接口抽象
- 错误处理和重试逻辑

### 数据流

```
用户操作 → React UI → WebSocket/HTTP → Hono Server → juhexbot Adapter → juhexbot API
                                            ↓
                                      Prisma ORM
                                            ↓
                                        Database
```

### 技术选型理由

- **分层架构 + 适配器模式**：解耦第三方 API，便于未来扩展和维护
- **WebSocket**：实现真正的实时双向通信，提供最佳用户体验
- **Prisma**：类型安全的 ORM，简化数据库操作
- **Zustand**：轻量级状态管理，避免 Redux 的复杂性

## 数据库选型

### 混合存储架构：SQLite + Data Lake

本项目采用**混合存储架构**，将数据按照访问模式和修改频率分层存储：

**SQLite（索引和元数据层）**
- 存储消息索引和元数据
- 存储状态变更记录
- 存储联系人目录
- 存储配置类信息
- 提供快速查询和检索能力

**Data Lake（原始数据层）**
- 存储所有原始消息数据（只增不改）
- 消息数据不可变（Immutable）
- 通过 SQLite 索引定位数据
- 支持长期归档和历史回溯

### 架构设计原理

```
┌─────────────────────────────────────────────────────────┐
│                    应用层（Hono Server）                  │
└─────────────────────────────────────────────────────────┘
                          ↓
        ┌─────────────────┴─────────────────┐
        ↓                                   ↓
┌──────────────────┐              ┌──────────────────┐
│  SQLite (Prisma) │              │   Data Lake      │
│  ─────────────── │              │   ────────────   │
│  • 消息索引       │←────关联────→│  • 原始消息数据   │
│  • 状态变更记录   │              │  • 只增不改       │
│  • 联系人目录     │              │  • 长期归档       │
│  • 配置信息       │              │                  │
└──────────────────┘              └──────────────────┘
```

### 数据分层策略

**SQLite 存储内容：**

1. **消息索引表（MessageIndex）**
   - msgId（消息 ID）
   - conversationId（会话 ID）
   - createTime（创建时间）
   - msgType（消息类型）
   - fromUsername / toUsername
   - dataLakeKey（Data Lake 中的存储路径）
   - 用于快速检索和定位消息

2. **状态变更记录表（MessageStateChange）**
   - msgId（消息 ID）
   - changeType（变更类型：revoke/delete/edit）
   - changeTime（变更时间）
   - changeData（变更详情）
   - 记录消息撤回、删除等状态变化

3. **联系人目录表（Contact）**
   - username（用户名）
   - nickname（昵称）
   - remark（备注）
   - avatar（头像）
   - 频繁变动，需要支持更新

4. **群组目录表（Group）**
   - roomUsername（群 ID）
   - name（群名）
   - memberCount（成员数）
   - version（版本号）

5. **会话表（Conversation）**
   - 会话列表
   - 未读数
   - 最后消息时间

6. **配置表（Config）**
   - 客户端配置
   - 用户偏好设置
   - 系统参数

**Data Lake 存储内容：**

1. **原始消息数据**
   - 完整的 juhexbot ChatMsgModel 数据
   - 消息内容（content）
   - 消息来源（source）
   - 所有原始字段
   - 存储格式：JSON Lines 或 Parquet

2. **存储路径设计**
   ```
   /messages/{year}/{month}/{day}/{conversationId}/{msgId}.json
   例如：/messages/2026/03/08/conv_123/msg_456.json
   ```

3. **数据特性**
   - 只增不改（Append-only）
   - 不支持删除（逻辑删除通过状态变更记录）
   - 支持批量写入
   - 支持长期归档

### 数据流设计

**消息接收流程：**
```
1. juhexbot API 推送消息
2. 后端接收消息数据
3. 写入 Data Lake（原始数据）
4. 写入 SQLite MessageIndex（索引）
5. 通过 WebSocket 推送给前端
```

**消息查询流程：**
```
1. 前端请求消息列表
2. 查询 SQLite MessageIndex（获取索引）
3. 根据 dataLakeKey 从 Data Lake 读取原始数据
4. 返回给前端
```

**状态变更流程：**
```
1. 接收到消息撤回通知
2. 写入 SQLite MessageStateChange 表
3. 不修改 Data Lake 中的原始数据
4. 查询时根据状态变更记录过滤
```

### 索引设计

**MessageIndex 表索引：**
- `msgId` - UNIQUE 索引
- `conversationId` - 普通索引
- `createTime` - 普通索引
- 复合索引：`(conversationId, createTime)` - 优化消息历史查询
- `fromUsername` - 普通索引
- `toUsername` - 普通索引

**MessageStateChange 表索引：**
- `msgId` - 普通索引（一个消息可能有多次状态变更）
- `changeTime` - 普通索引
- 复合索引：`(msgId, changeTime)` - 获取消息的最新状态

**Contact 表索引：**
- `username` - UNIQUE 索引
- `nickname` - 普通索引（用于搜索）

**Conversation 表索引：**
- `clientId` - 普通索引
- `lastMessageAt` - 普通索引
- 复合索引：`(clientId, lastMessageAt)` - 优化会话列表查询

### Data Lake 实现方案

**方案选择：**

1. **本地文件系统（推荐用于开发和小规模部署）**
   - 使用本地目录存储 JSON 文件
   - 简单、无依赖
   - 适合单机部署

2. **对象存储（推荐用于生产环境）**
   - AWS S3 / MinIO / 阿里云 OSS
   - 支持大规模存储
   - 高可用、高可靠

3. **DuckDB（可选，用于分析查询）**
   - 可以直接查询 Parquet 文件
   - 支持 SQL 分析
   - 适合数据分析场景

**存储格式：**
- JSON Lines（.jsonl）- 简单、易读、易调试
- Parquet（可选）- 压缩率高、查询性能好

### 数据库连接配置

**Prisma 配置：**

```prisma
// prisma/schema.prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}
```

**环境变量配置：**

```bash
# SQLite 数据库路径
DATABASE_URL="file:./data/morechat.db"

# Data Lake 配置
DATA_LAKE_TYPE="filesystem"  # filesystem / s3 / minio
DATA_LAKE_PATH="./data/lake"  # 本地路径
# DATA_LAKE_BUCKET="morechat-messages"  # S3/MinIO bucket
# DATA_LAKE_ENDPOINT="http://localhost:9000"  # MinIO endpoint
```

### 数据备份策略

**SQLite 备份：**
- 定期备份 SQLite 数据库文件（每日）
- 使用 SQLite 的 VACUUM INTO 命令创建备份
- 保留最近 30 天的备份

**Data Lake 备份：**
- Data Lake 本身就是归档存储
- 如果使用对象存储，启用版本控制
- 定期同步到异地存储（可选）

### 优势分析

**性能优势：**
- SQLite 提供快速的索引查询
- Data Lake 避免了数据库膨胀
- 消息数据不可变，无需事务锁

**成本优势：**
- Data Lake 存储成本低
- SQLite 无需额外的数据库服务
- 易于扩展和迁移

**可靠性优势：**
- 消息数据不可变，避免误删
- 状态变更有完整记录
- 支持历史回溯和审计

**扩展性优势：**
- Data Lake 可以无限扩展
- 支持多种存储后端
- 便于数据分析和挖掘

## 数据模型设计

### 核心实体

**Client（客户端实例）**
```typescript
model Client {
  id              String   @id @default(cuid())
  guid            String   @unique         // juhexbot 客户端 GUID
  proxy           String?                  // 代理配置（支持 http/socks4/socks5）
  isLoginProxy    Boolean  @default(false) // 是否登录代理
  bridge          String?                  // 桥接配置
  syncHistoryMsg  Boolean  @default(true)  // 是否同步历史消息
  autoStart       Boolean  @default(true)  // 是否自动启动
  isActive        Boolean  @default(true)  // 是否激活
  loginStatus     String   @default("offline") // offline/online/logging_in
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  conversations Conversation[]
}
```

**Contact（联系人）**
```typescript
model Contact {
  id        String   @id @default(cuid())
  username  String   @unique  // juhexbot username（微信 ID）
  nickname  String              // 昵称
  remark    String?             // 备注名
  avatar    String?             // 头像 URL
  type      String              // friend/official/stranger
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  conversations Conversation[]
  groupMembers  GroupMember[]

  @@index([nickname])
}
```

**Group（群组）**
```typescript
model Group {
  id          String   @id @default(cuid())
  roomUsername String  @unique  // juhexbot room_username（群 ID）
  name        String              // 群名称
  avatar      String?             // 群头像
  memberCount Int      @default(0)
  version     Int?                // 群成员版本号
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  conversations Conversation[]
  members       GroupMember[]

  @@index([name])
}
```

**Conversation（会话）**
```typescript
model Conversation {
  id            String   @id @default(cuid())
  clientId      String
  type          String              // private/group
  contactId     String?
  groupId       String?
  unreadCount   Int      @default(0)
  lastMessageAt DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  client        Client         @relation(fields: [clientId], references: [id])
  contact       Contact?       @relation(fields: [contactId], references: [id])
  group         Group?         @relation(fields: [groupId], references: [id])
  messageIndexes MessageIndex[]

  @@index([clientId])
  @@index([contactId])
  @@index([groupId])
  @@index([lastMessageAt])
  @@index([clientId, lastMessageAt])
}
```

**MessageIndex（消息索引）**
```typescript
model MessageIndex {
  id             String   @id @default(cuid())
  conversationId String
  msgId          String   @unique  // juhexbot msg_id
  msgType        Int                  // juhexbot msg_type（消息类型代码）
  fromUsername   String              // 发送者 username
  toUsername     String              // 接收者 username
  chatroomSender String?             // 群聊发送者（群消息时使用）
  createTime     Int                 // juhexbot create_time（时间戳）
  dataLakeKey    String              // Data Lake 存储路径
  createdAt      DateTime @default(now())

  conversation Conversation @relation(fields: [conversationId], references: [id])

  @@index([conversationId])
  @@index([createTime])
  @@index([conversationId, createTime])
  @@index([fromUsername])
  @@index([toUsername])
}
```

**MessageStateChange（消息状态变更）**
```typescript
model MessageStateChange {
  id         String   @id @default(cuid())
  msgId      String              // 关联的消息 ID
  changeType String              // revoke/delete/edit/read
  changeTime Int                 // 变更时间（时间戳）
  changeData String?  @db.Text   // 变更详情（JSON 格式）
  createdAt  DateTime @default(now())

  @@index([msgId])
  @@index([changeTime])
  @@index([msgId, changeTime])
}
```

**GroupMember（群成员）**
```typescript
model GroupMember {
  id        String   @id @default(cuid())
  groupId   String
  username  String              // 成员 username
  nickname  String?             // 群内昵称
  role      String   @default("member") // owner/admin/member
  joinedAt  DateTime @default(now())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  group   Group   @relation(fields: [groupId], references: [id], onDelete: Cascade)
  contact Contact @relation(fields: [username], references: [username])

  @@unique([groupId, username])
  @@index([groupId])
  @@index([username])
}
```

### 关系说明

- Client 1:N Conversation（一个客户端有多个会话）
- Conversation 1:N MessageIndex（一个会话有多条消息索引）
- Contact 1:N Conversation（一个联系人可以有多个会话，但通常是一个）
- Group 1:N Conversation（一个群组对应一个会话）
- Group N:N Contact（通过 GroupMember 中间表）

### 数据存储说明

**SQLite 存储的表：**
- Client - 客户端配置
- Contact - 联系人目录
- Group - 群组目录
- GroupMember - 群成员关系
- Conversation - 会话列表
- MessageIndex - 消息索引（不包含消息内容）
- MessageStateChange - 消息状态变更记录

**Data Lake 存储的数据：**
- 完整的消息原始数据（ChatMsgModel）
- 存储路径由 MessageIndex.dataLakeKey 指定
- 只增不改，不支持删除

### juhexbot API 字段映射说明

为了与 juhexbot API 保持一致，我们的数据模型直接使用了 juhexbot 的字段命名：

**Client 模型映射：**
- `guid` - juhexbot 客户端唯一标识符
- `proxy` - 代理配置（支持 http://、socks4://、socks5:// 格式）
- `isLoginProxy` - 对应 juhexbot 的 `is_login_proxy`
- `syncHistoryMsg` - 对应 juhexbot 的 `sync_history_msg`
- `autoStart` - 对应 juhexbot 的 `auto_start`

**Contact 模型映射：**
- `username` - juhexbot 的用户标识符（对应微信 ID）
- 注意：juhexbot 使用 `username` 而不是 `wxid`

**Group 模型映射：**
- `roomUsername` - juhexbot 的群组标识符（对应 `room_username`）
- `version` - 群成员版本号，用于增量同步

**MessageIndex 模型映射：**
- `msgId` - 对应 juhexbot 的 `msg_id`
- `msgType` - 对应 juhexbot 的 `msg_type`（整数类型，如 1=文本、3=图片等）
- `fromUsername` - 对应 juhexbot 的 `from_username`
- `toUsername` - 对应 juhexbot 的 `to_username`
- `chatroomSender` - 对应 juhexbot 的 `chatroom_sender`（群消息时标识实际发送者）
- `createTime` - 对应 juhexbot 的 `create_time`（Unix 时间戳）
- `dataLakeKey` - Data Lake 中的存储路径（例如：`/messages/2026/03/08/conv_123/msg_456.json`）

**MessageStateChange 模型说明：**
- `changeType` - 状态变更类型：
  - `revoke` - 消息撤回
  - `delete` - 消息删除
  - `edit` - 消息编辑（如果支持）
  - `read` - 消息已读
- `changeData` - 变更详情，JSON 格式存储额外信息

**消息类型代码（msgType）：**
- 1 - 文本消息
- 3 - 图片消息
- 34 - 语音消息
- 43 - 视频消息
- 47 - 表情消息
- 49 - 分享链接/小程序/文件等
- 更多类型需参考 juhexbot 文档

## 后端 API 设计

### RESTful API 端点

**客户端管理**
```
POST   /api/client/restore          恢复客户端实例
POST   /api/client/create           创建新客户端
GET    /api/client/status           获取客户端状态
DELETE /api/client/:guid            删除客户端
GET    /api/client/qrcode           获取登录二维码
```

**消息操作**
```
POST   /api/messages/send           发送消息（文本/图片/文件）
GET    /api/messages/:conversationId 获取会话消息历史（分页）
POST   /api/messages/mark-read      标记消息已读
POST   /api/messages/recall         撤回消息
```

**联系人管理**
```
GET    /api/contacts                获取联系人列表
GET    /api/contacts/:id            获取联系人详情
POST   /api/contacts/sync           同步联系人
PUT    /api/contacts/:id/remark     修改备注名
```

**群组管理**
```
GET    /api/groups                  获取群组列表
GET    /api/groups/:id              获取群组详情
GET    /api/groups/:id/members      获取群成员列表
POST   /api/groups/:id/members      添加群成员
DELETE /api/groups/:id/members/:memberId 移除群成员
```

**会话管理**
```
GET    /api/conversations           获取会话列表
GET    /api/conversations/:id       获取会话详情
PUT    /api/conversations/:id       更新会话（置顶、免打扰等）
DELETE /api/conversations/:id       删除会话
```

### WebSocket 事件

**客户端 → 服务器**
```typescript
'client:connect'      // 建立连接，携带客户端 GUID
'message:send'        // 发送消息
'typing:start'        // 开始输入
'typing:stop'         // 停止输入
'message:read'        // 标记消息已读
```

**服务器 → 客户端**
```typescript
'connected'           // 连接成功确认
'message:new'         // 新消息到达
'message:status'      // 消息状态更新（已发送/已读）
'client:status'       // 客户端状态变化（在线/离线）
'contact:update'      // 联系人信息更新
'group:update'        // 群组信息更新
'typing:indicator'    // 对方正在输入
'error'               // 错误通知
```

## 前端组件设计

### 组件树结构

```
App
├── AuthGuard（认证守卫）
└── ChatLayout（聊天布局）
    ├── Sidebar（侧边栏）
    │   ├── ClientStatus（客户端状态）
    │   ├── ConversationList（会话列表）
    │   │   └── ConversationItem（会话项）
    │   └── SearchBar（搜索栏）
    ├── ChatWindow（聊天窗口）
    │   ├── ChatHeader（会话头部）
    │   ├── MessageList（消息列表）
    │   │   ├── MessageItem（消息项）
    │   │   └── VirtualScroller（虚拟滚动）
    │   └── MessageInput（消息输入）
    │       ├── TextInput（文本输入）
    │       ├── EmojiPicker（表情选择器）
    │       └── FileUpload（文件上传）
    └── ContactPanel（联系人面板，可折叠）
        ├── ContactList（联系人列表）
        └── GroupList（群组列表）
```

### 状态管理（Zustand）

**clientStore**
```typescript
interface ClientStore {
  client: Client | null
  connectionStatus: 'disconnected' | 'connecting' | 'connected'
  loginStatus: 'offline' | 'logging_in' | 'online'

  setClient: (client: Client) => void
  updateConnectionStatus: (status: string) => void
  updateLoginStatus: (status: string) => void
}
```

**conversationStore**
```typescript
interface ConversationStore {
  conversations: Conversation[]
  currentConversationId: string | null

  setConversations: (conversations: Conversation[]) => void
  setCurrentConversation: (id: string) => void
  updateConversation: (id: string, data: Partial<Conversation>) => void
  incrementUnreadCount: (id: string) => void
  clearUnreadCount: (id: string) => void
}
```

**messageStore**
```typescript
interface MessageStore {
  messages: Record<string, Message[]>  // conversationId -> messages
  sendQueue: Message[]

  addMessage: (conversationId: string, message: Message) => void
  updateMessageStatus: (messageId: string, status: string) => void
  loadMessages: (conversationId: string, messages: Message[]) => void
  queueMessage: (message: Message) => void
  dequeueMessage: (messageId: string) => void
}
```

**contactStore**
```typescript
interface ContactStore {
  contacts: Contact[]
  groups: Group[]

  setContacts: (contacts: Contact[]) => void
  setGroups: (groups: Group[]) => void
  updateContact: (id: string, data: Partial<Contact>) => void
  updateGroup: (id: string, data: Partial<Group>) => void
}
```

### WebSocket 连接管理

**连接管理器**
```typescript
class WebSocketManager {
  private ws: WebSocket | null
  private reconnectAttempts: number
  private maxReconnectAttempts: number = 5
  private reconnectDelay: number = 1000
  private heartbeatInterval: NodeJS.Timeout | null

  connect(clientGuid: string): void
  disconnect(): void
  send(event: string, data: any): void
  on(event: string, handler: Function): void
  private reconnect(): void
  private startHeartbeat(): void
  private stopHeartbeat(): void
}
```

**特性：**
- 自动重连（指数退避策略）
- 心跳检测（每 30 秒发送 ping）
- 离线消息队列
- 事件订阅机制

## 错误处理和容错机制

### 错误分类

**1. 网络错误**
- WebSocket 断连
- HTTP 请求超时
- DNS 解析失败

**处理策略：**
- 自动重试（指数退避，最多 3 次）
- UI 提示："连接中断，正在重连..."
- 离线消息存入本地队列

**2. API 错误**
- juhexbot API 返回 4xx/5xx
- 参数验证失败
- 权限不足

**处理策略：**
- 记录详细错误日志
- 向用户展示友好提示
- 消息发送失败标记为"发送失败"，允许重试

**3. 业务逻辑错误**
- 客户端未登录
- 会话不存在
- 联系人已删除

**处理策略：**
- 引导用户完成必要操作（如扫码登录）
- 清理无效数据
- 明确的操作指引

### 消息可靠性保证

**发送流程：**
```
1. 用户发送消息
2. 立即显示在 UI（状态：pending）
3. 加入发送队列
4. 调用 API 发送（状态：sending）
5. 收到服务器确认（状态：sent）
6. 收到对方已读回执（状态：read）
```

**失败处理：**
- 网络失败：自动重试 3 次
- API 失败：标记为 failed，显示重试按钮
- 离线时：存入本地队列，上线后自动发送

**消息去重：**
- 使用 messageId 去重
- 防止重连时重复接收消息

## 测试策略

### 后端测试

**单元测试**
- juhexbot 适配器的每个方法
- 消息处理逻辑
- 数据模型验证

**集成测试**
- API 端点完整流程
- WebSocket 连接和事件
- 数据库操作（使用测试数据库）

**Mock 策略**
- 使用 MSW 或自定义 Mock 服务模拟 juhexbot API
- Mock WebSocket 连接

### 前端测试

**组件测试**
- 使用 React Testing Library
- 测试核心组件的渲染和交互
- 测试状态管理逻辑

**E2E 测试**
- 使用 Playwright 或 Cypress
- 关键用户流程：
  - 登录流程
  - 发送消息
  - 查看历史消息
  - 切换会话

**WebSocket Mock**
- 模拟实时消息推送
- 测试重连逻辑

### 性能测试

**关键指标：**
- 消息列表渲染性能（1000+ 消息）
- 虚拟滚动性能
- WebSocket 连接稳定性
- 内存占用（长时间运行）

**优化策略：**
- 消息列表使用虚拟滚动
- 图片懒加载
- 消息分页加载
- 适当的缓存策略

## 实现优先级

### Phase 1: 基础架构（1-2 周）
- 数据库模型和 Prisma 配置
- juhexbot 适配器基础封装
- WebSocket 服务器搭建
- 前端基础组件和布局

### Phase 2: 核心功能（2-3 周）
- 客户端登录和管理
- 消息收发（文本消息）
- 会话列表和切换
- 联系人列表

### Phase 3: 增强功能（2-3 周）
- 多媒体消息（图片、文件）
- 群组管理
- 消息搜索
- 消息状态和已读回执

### Phase 4: 优化和测试（1-2 周）
- 性能优化
- 错误处理完善
- 测试覆盖
- 文档完善

## 技术风险和缓解措施

### 风险 1: juhexbot API 稳定性
**缓解措施：**
- 完善的错误处理和重试机制
- 适配器层隔离，便于切换其他服务
- 详细的日志记录

### 风险 2: WebSocket 连接稳定性
**缓解措施：**
- 自动重连机制
- 心跳检测
- 降级到轮询方案（备选）

### 风险 3: 消息丢失
**缓解措施：**
- 消息队列和持久化
- 消息状态追踪
- 定期同步机制

### 风险 4: 性能问题
**缓解措施：**
- 虚拟滚动
- 分页加载
- 适当的缓存策略
- 性能监控

## 总结

本设计方案采用分层架构和适配器模式，通过 WebSocket 实现实时通信，构建一个可扩展、可维护的聊天系统。核心优势包括：

1. **解耦设计**：适配器层隔离第三方 API，便于未来扩展
2. **实时体验**：WebSocket 双向通信提供流畅的用户体验
3. **可靠性**：完善的错误处理和消息可靠性保证
4. **可测试性**：清晰的分层便于单元测试和集成测试
5. **可扩展性**：为未来接入其他聊天服务预留空间

下一步将基于此设计创建详细的实现计划。
