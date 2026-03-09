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

### 开发环境

1. 安装依赖：

```bash
pnpm install
```

2. 配置环境变量：

```bash
cp apps/server/.env.example apps/server/.env
# 编辑 apps/server/.env 填入配置
```

3. 启动开发服务器：

```bash
pnpm dev
```

前端：http://localhost:3000
后端：http://localhost:3100

### 生产部署

详细部署配置说明请查看：[部署配置指南](docs/deployment-config-guide.md)

快速部署到 VPS：

```bash
# 1. SSH 到 VPS
ssh user@your-vps-ip

# 2. 克隆仓库
git clone https://github.com/your-username/MoreChat.git ~/morechat
cd ~/morechat

# 3. 运行初始化脚本
bash deploy/setup.sh

# 4. 配置环境变量（使用配置助手）
bash deploy/configure.sh

# 5. 启动服务
bash deploy/update.sh
```

配置 GitHub Actions 自动部署：

```bash
# 设置 GitHub Secrets
gh secret set VPS_HOST
gh secret set VPS_USER
gh secret set VPS_SSH_KEY < ~/.ssh/id_rsa

# 之后每次 push 到 main 会自动部署
git push origin main
```

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
