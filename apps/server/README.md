# MoreChat Server

后端服务器，提供 HTTP API 和 WebSocket 实时通信。

## 架构

### 服务层次

```
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
```

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
| JUHEXBOT_API_URL | juhexbot API 地址 | http://chat-api.juhebot.com/open/GuidRequest |
| JUHEXBOT_APP_KEY | juhexbot 应用密钥 | your_app_key |
| JUHEXBOT_APP_SECRET | juhexbot 应用密钥 | your_app_secret |
| JUHEXBOT_CLIENT_GUID | juhexbot 客户端 GUID | your_client_guid |

## 开发

### 启动开发服务器

```bash
pnpm dev
```

### 运行测试

```bash
# 所有测试
pnpm test

# 监听模式
pnpm test --watch

# 测试 UI
pnpm test:ui
```

### 数据库操作

```bash
# 生成 Prisma Client
pnpm db:generate

# 推送 schema 到数据库
pnpm db:push

# 打开 Prisma Studio
pnpm db:studio
```

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

```bash
pnpm build
```

### 启动生产服务器

```bash
pnpm start
```

### 使用 PM2

```bash
pm2 start dist/index.js --name morechat-server
```
