# VPS 部署设计方案

## 概述

将 MoreChat 部署到 VPS，验证消息接收 MVP。采用 Nginx + PM2 + GitHub Actions CI/CD 方案。

## 架构

```
GitHub (push to main)
    ↓
GitHub Actions (SSH)
    ↓
VPS
    ├── Nginx (:80) → Node.js (:3100)
    │                    ├── /api/*     API 路由
    │                    ├── /webhook   juhexbot 回调
    │                    ├── /health    健康检查
    │                    └── /*         前端静态文件 (SPA)
    └── WebSocket upgrade (/ws) → Node.js (:3100)
```

## 一、代码改动

### 1. 后端添加静态文件服务

- `apps/server/src/app.ts` 用 `@hono/node-server/serve-static` serve `apps/web/dist/`
- 非 API/webhook 路径 fallback 到 `index.html`（SPA 路由）
- 仅生产环境启用

### 2. 后端添加 CORS 中间件

- 用 `hono/cors`，origin 从 `CORS_ORIGIN` 环境变量读取

### 3. 创建 Prisma 初始迁移

- `prisma migrate dev --name init`
- 生产环境用 `prisma migrate deploy`

### 4. 前端 WebSocket URL 适配

- 同源部署下从 `window.location` 推导 ws/wss URL
- `VITE_WS_URL` 作为可选覆盖

## 二、部署配置文件

### 5. PM2 配置 — `ecosystem.config.cjs`

- name: "morechat"
- cwd: apps/server
- script: dist/index.js

### 6. Nginx 配置 — `deploy/nginx.conf`

- 监听 80 端口
- 反代到 127.0.0.1:3100
- WebSocket upgrade 支持

### 7. 部署脚本

- `deploy/setup.sh` — VPS 首次初始化（Node 20、pnpm、PM2、Nginx、clone 仓库）
- `deploy/update.sh` — 更新部署（pull、install、build、migrate、restart）

## 三、GitHub Actions CI/CD

### 8. `.github/workflows/deploy.yml`

- 触发：push to main
- SSH 到 VPS 执行 `deploy/update.sh`
- GitHub Secrets：`VPS_HOST`、`VPS_USER`、`VPS_SSH_KEY`、`VPS_PORT`

## 四、VPS 环境变量

`apps/server/.env`：

```
DATABASE_URL="file:../data/morechat.db"
DATA_LAKE_TYPE="filesystem"
DATA_LAKE_PATH="./data/lake"
PORT=3100
NODE_ENV="production"
JUHEXBOT_API_URL / APP_KEY / APP_SECRET / CLIENT_GUID
AUTH_PASSWORD_HASH / AUTH_JWT_SECRET
```

## 文件变更清单

| 文件 | 类型 |
|------|------|
| `apps/server/src/app.ts` | 修改 — 静态文件服务 + CORS |
| `apps/web/src/api/websocket.ts` | 修改 — WebSocket URL 自动推导 |
| `apps/server/prisma/migrations/` | 新增 — 初始迁移 |
| `ecosystem.config.cjs` | 新增 — PM2 配置 |
| `deploy/nginx.conf` | 新增 — Nginx 配置模板 |
| `deploy/setup.sh` | 新增 — 首次部署脚本 |
| `deploy/update.sh` | 新增 — 更新部署脚本 |
| `.github/workflows/deploy.yml` | 新增 — CI/CD 流水线 |
