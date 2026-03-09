# Phase 1 功能整合设计方案

**日期**: 2026-03-09
**版本**: 1.0
**状态**: 已批准

## 概述

本设计方案描述如何整合 Phase 1 已实现的功能，包括环境变量管理、Prisma 单例、WebSocket 服务器，以及将所有服务通过依赖注入方式组织起来。

## 目标

- 完成 Phase 1 剩余功能的实现
- 整合现有的独立服务（Database, DataLake, Message, JuhexbotAdapter）
- 实现 WebSocket 实时通信能力
- 建立清晰的依赖注入架构
- 提供完整的服务生命周期管理

## 整体架构

### 架构图

```
┌─────────────────────────────────────────────────────┐
│                   index.ts (入口)                    │
│  - 加载环境变量                                       │
│  - 初始化所有服务（依赖注入）                          │
│  - 启动 HTTP + WebSocket 服务器                      │
└─────────────────────────────────────────────────────┘
                          ↓
        ┌─────────────────┴─────────────────┐
        ↓                                   ↓
┌──────────────────┐              ┌──────────────────┐
│   HTTP Server    │              │  WebSocket Server│
│   (Hono App)     │              │                  │
│  - REST API      │              │  - 实时消息推送   │
│  - Webhook       │              │  - 客户端连接管理 │
└──────────────────┘              └──────────────────┘
        ↓                                   ↓
┌─────────────────────────────────────────────────────┐
│              业务服务层（依赖注入）                    │
│  - MessageService (消息服务)                         │
│  - JuhexbotAdapter (API 适配器)                     │
│  - DatabaseService (数据库服务)                      │
│  - DataLakeService (数据湖服务)                      │
└─────────────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────────────┐
│              基础设施层                               │
│  - Prisma Client (数据库连接)                        │
│  - 文件系统 (Data Lake 存储)                         │
└─────────────────────────────────────────────────────┘
```

### 依赖关系

**服务依赖链：**
- `DataLakeService` → 文件系统
- `DatabaseService` → Prisma Client
- `MessageService` → DataLakeService + DatabaseService
- `JuhexbotAdapter` → 独立（HTTP 客户端）
- `Hono App` → JuhexbotAdapter + MessageService
- `WebSocketService` → MessageService（用于推送消息）

**初始化顺序：**
1. 加载环境变量（`env.ts`）
2. 创建 Prisma Client 单例（`prisma.ts`）
3. 创建 DataLakeService
4. 创建 DatabaseService
5. 创建 MessageService
6. 创建 JuhexbotAdapter
7. 创建 Hono App
8. 启动 HTTP 服务器
9. 创建 WebSocketService（共享 HTTP 服务器）

## 核心组件设计

### 1. 环境变量管理 (`lib/env.ts`)

**职责：**
- 使用 `dotenv` 加载 `.env` 文件
- 验证所有必需的环境变量
- 提供类型安全的配置对象
- 在应用启动时立即失败（fail-fast）

**配置项：**
```typescript
interface EnvConfig {
  // 数据库
  DATABASE_URL: string

  // Data Lake
  DATA_LAKE_TYPE: 'filesystem' | 's3' | 'minio'
  DATA_LAKE_PATH: string

  // 服务器
  PORT: string
  NODE_ENV: 'development' | 'production' | 'test'

  // juhexbot API
  JUHEXBOT_API_URL: string
}
```

**设计原则：**
- 所有配置集中管理
- 启动时验证，避免运行时错误
- 提供清晰的错误信息
- 支持默认值（非必需配置）

### 2. Prisma 客户端单例 (`lib/prisma.ts`)

**职责：**
- 导出全局唯一的 Prisma Client 实例
- 处理开发模式下的热重载（避免多个实例）
- 提供优雅关闭方法

**实现要点：**
```typescript
// 开发模式：使用 global 对象缓存实例
// 生产模式：直接创建实例
// 导出 disconnect 方法用于优雅关闭
```

**为什么需要单例：**
- Prisma Client 内部维护连接池
- 多个实例会导致连接数过多
- 开发模式下热重载会创建新实例

### 3. WebSocket 服务 (`services/websocket.ts`)

**职责：**
- 管理 WebSocket 连接
- 客户端连接映射（clientId → WebSocket）
- 处理客户端事件
- 推送消息给客户端

**核心功能：**

1. **连接管理**
   - 接受 WebSocket 连接
   - 客户端通过 `client:connect` 事件注册 clientId
   - 维护 `Map<clientId, WebSocket>` 映射
   - 连接断开时自动清理

2. **事件处理**
   - `client:connect` - 客户端连接并注册 ID
   - `message:send` - 客户端发送消息（未来）
   - `typing:start` / `typing:stop` - 输入状态（未来）
   - `message:read` - 标记已读（未来）

3. **消息推送**
   - `send(ws, event, data)` - 发送给指定 WebSocket
   - `broadcast(event, data)` - 广播给所有客户端
   - `sendToClient(clientId, event, data)` - 发送给指定客户端 ID

4. **心跳检测**
   - 定期发送 ping 消息
   - 检测僵尸连接
   - 自动清理断开的连接

**WebSocket 事件协议：**

```typescript
// 客户端 → 服务器
{
  event: 'client:connect',
  data: { guid: 'client_123' }
}

// 服务器 → 客户端
{
  event: 'message:new',
  data: {
    conversationId: 'conv_123',
    message: { ... }
  }
}
```

### 4. 主入口整合 (`index.ts`)

**职责：**
- 应用启动入口
- 集中式服务初始化
- 依赖注入
- HTTP + WebSocket 服务器启动
- 优雅关闭处理

**启动流程：**

```typescript
1. 加载环境变量 (env.ts)
2. 创建服务实例（按依赖顺序）：
   a. DataLakeService
   b. DatabaseService (使用 prisma 单例)
   c. MessageService (注入 dataLake + database)
   d. JuhexbotAdapter
3. 创建消息处理器 (messageHandler)
   - 接收 webhook 消息
   - 调用 MessageService 保存
   - 通过 WebSocket 推送
4. 创建 Hono App (注入 adapter + messageHandler)
5. 启动 HTTP 服务器
6. 创建 WebSocket 服务 (共享 HTTP 服务器)
7. 注册优雅关闭处理
```

**优雅关闭：**
```typescript
process.on('SIGTERM', async () => {
  // 1. 停止接受新连接
  // 2. 关闭 WebSocket 连接
  // 3. 等待正在处理的请求完成
  // 4. 关闭数据库连接
  // 5. 退出进程
})
```

## 消息流设计

### 接收消息流程

```
juhexbot webhook
    ↓
Hono App (/webhook endpoint)
    ↓
parseWebhookPayload (JuhexbotAdapter)
    ↓
messageHandler
    ↓
MessageService.saveMessage
    ↓
├─→ DataLake.saveMessage (保存原始数据)
└─→ Database.createMessageIndex (保存索引)
    ↓
WebSocketService.sendToClient (推送给前端)
```

### 发送消息流程（未来实现）

```
前端 WebSocket
    ↓
WebSocketService (message:send event)
    ↓
JuhexbotAdapter.sendMessage
    ↓
juhexbot API
    ↓
MessageService.saveMessage (保存发送的消息)
```

## 文件结构

### 新增文件

```
apps/server/src/
├── lib/
│   ├── env.ts              # 环境变量加载和验证
│   └── prisma.ts           # Prisma Client 单例
├── services/
│   └── websocket.ts        # WebSocket 服务
└── index.ts                # 主入口（重构）
```

### 现有文件（保持不变）

```
apps/server/src/
├── services/
│   ├── dataLake.ts         # Data Lake 服务
│   ├── database.ts         # 数据库服务
│   ├── message.ts          # 消息服务
│   └── juhexbotAdapter.ts  # juhexbot 适配器
├── app.ts                  # Hono App 工厂函数
└── types/
    └── juhexbot.ts         # juhexbot 类型定义
```

## 关键设计决策

### 1. 为什么使用依赖注入？

**优点：**
- 依赖关系显式声明，易于理解
- 便于单元测试（可以注入 mock）
- 符合 SOLID 原则（依赖倒置）
- 避免循环依赖

**实现方式：**
- 构造函数注入（推荐）
- 工厂函数（如 `createApp`）

### 2. 为什么 WebSocket 与 HTTP 共享端口？

**优点：**
- 客户端只需连接一个端口
- 简化部署和防火墙配置
- 符合标准实践（WebSocket 通过 HTTP Upgrade）

**实现方式：**
- 使用 `@hono/node-server` 的 `serve` 返回 HTTP Server
- 将 HTTP Server 传递给 `WebSocketServer`

### 3. 环境变量验证策略

**原则：**
- Fail-fast：启动时立即验证
- 清晰的错误信息
- 类型安全

**实现：**
```typescript
// 缺少必需配置时抛出错误
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required')
}
```

### 4. 服务生命周期管理

**启动顺序：**
基础设施 → 业务服务 → HTTP/WebSocket 服务器

**关闭顺序：**
服务器 → 业务服务 → 数据库连接

**原因：**
- 确保依赖的服务已就绪
- 优雅关闭，避免数据丢失

## 错误处理

### Webhook 错误处理

```typescript
try {
  const payload = await c.req.json()
  const parsed = adapter.parseWebhookPayload(payload)
  await onMessage(parsed)
  return c.json({ success: true })
} catch (error) {
  console.error('Webhook error:', error)
  return c.json({ success: false, error: 'Internal error' }, 500)
}
```

**策略：**
- 捕获所有错误，避免服务崩溃
- 记录详细日志
- 返回通用错误信息（不暴露内部细节）

### WebSocket 错误处理

```typescript
ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString())
    this.handleMessage(ws, message)
  } catch (error) {
    console.error('Failed to parse WebSocket message:', error)
    // 不关闭连接，只记录错误
  }
})
```

**策略：**
- 解析错误不关闭连接
- 记录错误日志
- 可选：发送错误事件给客户端

## 测试策略

### 单元测试

**已有测试（保持）：**
- `dataLake.test.ts`
- `database.test.ts`
- `message.test.ts`
- `juhexbotAdapter.test.ts`
- `app.test.ts`

**新增测试：**
- `lib/env.test.ts` - 环境变量验证
- `services/websocket.test.ts` - WebSocket 服务

### 集成测试

**测试场景：**
1. 完整的消息接收流程
   - Webhook → 保存 → WebSocket 推送
2. WebSocket 连接管理
   - 连接、注册、断开
3. 服务启动和关闭
   - 优雅关闭流程

### Mock 策略

- Mock juhexbot API（使用 MSW 或 nock）
- Mock WebSocket 客户端
- 使用测试数据库（SQLite in-memory）

## 性能考虑

### WebSocket 连接数

**限制：**
- Node.js 默认最大连接数：约 65535
- 实际限制取决于系统资源

**优化：**
- 心跳检测清理僵尸连接
- 连接超时机制
- 连接数监控

### 消息推送性能

**策略：**
- 异步推送，不阻塞主流程
- 批量推送（如果需要）
- 消息队列（未来可选）

### 数据库连接池

**Prisma 默认配置：**
- 连接池大小：根据 CPU 核心数自动调整
- 连接超时：10 秒

**优化：**
- 使用单例避免多个连接池
- 监控连接池使用情况

## 部署考虑

### 环境变量

**开发环境：**
```bash
DATABASE_URL="file:./data/morechat.db"
DATA_LAKE_TYPE="filesystem"
DATA_LAKE_PATH="./data/lake"
PORT=3100
NODE_ENV="development"
JUHEXBOT_API_URL="http://localhost:8000"
```

**生产环境：**
```bash
DATABASE_URL="file:/var/lib/morechat/morechat.db"
DATA_LAKE_TYPE="s3"
DATA_LAKE_BUCKET="morechat-messages"
PORT=3100
NODE_ENV="production"
JUHEXBOT_API_URL="https://api.juhexbot.com"
```

### 进程管理

**推荐工具：**
- PM2（Node.js 进程管理器）
- systemd（Linux 系统服务）
- Docker（容器化部署）

**配置示例（PM2）：**
```json
{
  "apps": [{
    "name": "morechat-server",
    "script": "dist/index.js",
    "instances": 1,
    "exec_mode": "cluster",
    "env": {
      "NODE_ENV": "production"
    }
  }]
}
```

### 日志管理

**策略：**
- 使用结构化日志（JSON 格式）
- 日志级别：error, warn, info, debug
- 日志轮转（避免磁盘占满）

**推荐工具：**
- pino（高性能日志库）
- winston（功能丰富的日志库）

## 安全考虑

### WebSocket 认证

**当前：**
- 客户端通过 `client:connect` 事件提供 guid
- 无认证机制（开发阶段）

**未来：**
- JWT 令牌认证
- 连接时验证令牌
- 定期刷新令牌

### Webhook 安全

**当前：**
- 无签名验证（开发阶段）

**未来：**
- 验证 webhook 签名
- IP 白名单
- 请求频率限制

### 环境变量安全

**原则：**
- 不提交 `.env` 文件到 git
- 生产环境使用密钥管理服务
- 敏感信息加密存储

## 监控和可观测性

### 关键指标

**服务健康：**
- HTTP 服务器状态
- WebSocket 连接数
- 数据库连接池状态

**业务指标：**
- 消息接收速率
- 消息推送延迟
- 错误率

**系统指标：**
- CPU 使用率
- 内存使用率
- 磁盘 I/O

### 健康检查端点

```typescript
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: Date.now(),
    uptime: process.uptime(),
    connections: wsService.getConnectionCount()
  })
})
```

## 总结

本设计方案完成了 Phase 1 的所有剩余功能，建立了清晰的依赖注入架构，实现了 HTTP 和 WebSocket 的整合。核心优势包括：

1. **清晰的架构**：依赖关系显式声明，易于理解和维护
2. **可测试性**：依赖注入便于单元测试
3. **实时通信**：WebSocket 支持实时消息推送
4. **可靠性**：完善的错误处理和优雅关闭
5. **可扩展性**：为 Phase 2 功能预留接口

下一步将基于此设计创建详细的实现计划。
