# MoreChat

> **Small is boring**

一个通过接入第三方接口实现类似微信聊天能力的 Web Chat 工具。

## 技术栈

### 前端
- React 18 + TypeScript
- Vite
- Tailwind CSS + shadcn/ui
- Zustand (状态管理)
- React Hook Form + Zod (表单验证)
- TanStack Query (数据获取)

### 后端
- Node.js + TypeScript
- Hono (Web 框架)
- Prisma (ORM)
- WebSocket (实时通信)

### 开发工具
- pnpm (包管理)
- Turborepo (Monorepo)
- ESLint + Prettier

## 项目结构

```
morechat/
├── apps/
│   ├── web/          # 前端应用
│   └── server/       # 后端服务
├── packages/
│   ├── ui/           # UI 组件库
│   ├── types/        # 共享类型
│   └── utils/        # 工具函数
└── turbo.json        # Turborepo 配置
```

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

```bash
cp apps/server/.env.example apps/server/.env
```

编辑 `.env` 文件，配置必要的参数。

### 启动开发服务器

```bash
pnpm install
pnpm dev
```

服务器将在 http://localhost:3100 启动。

### 测试

```bash
# 运行所有测试
pnpm test

# 运行特定测试
pnpm test database.test.ts

# 测试 UI
pnpm test:ui
```

## 开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建
pnpm build

# 类型检查
pnpm type-check

# 代码检查
pnpm lint
```
