# VPS 部署实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 MoreChat 可部署到 VPS，通过 GitHub Actions CI/CD 自动化部署，验证消息接收 MVP。

**Architecture:** 后端 Hono 内置 serve 前端静态文件，Nginx 反代到 Node.js，PM2 管理进程。GitHub Actions push to main 触发 SSH 部署。

**Tech Stack:** Hono serve-static, PM2, Nginx, GitHub Actions, Prisma migrate

---

### Task 1: 后端添加 CORS 中间件

**Files:**
- Modify: `apps/server/src/app.ts:1-65`
- Modify: `apps/server/src/lib/env.ts:12-70`

**Step 1: 在 `apps/server/src/lib/env.ts` 添加 CORS_ORIGIN 为可选环境变量**

在 `EnvConfig` 接口中添加：

```typescript
interface EnvConfig {
  // ... 现有字段 ...
  CORS_ORIGIN?: string
}
```

在 `loadEnv()` 返回值中添加：

```typescript
return {
  // ... 现有字段 ...
  CORS_ORIGIN: process.env.CORS_ORIGIN
}
```

**Step 2: 在 `apps/server/src/app.ts` 添加 CORS 中间件**

在文件顶部添加 import：

```typescript
import { cors } from 'hono/cors'
```

在 `createApp` 函数中，`app.get('/health', ...)` 之前添加：

```typescript
// CORS
if (deps.corsOrigin) {
  app.use('*', cors({ origin: deps.corsOrigin }))
}
```

在 `AppDependencies` 接口中添加：

```typescript
corsOrigin?: string
```

**Step 3: 在 `apps/server/src/index.ts` 传入 corsOrigin**

在 `createApp` 调用中添加：

```typescript
const app = createApp({
  // ... 现有字段 ...
  corsOrigin: env.CORS_ORIGIN,
} as any)
```

**Step 4: 验证构建通过**

Run: `cd apps/server && pnpm type-check`
Expected: 无错误

**Step 5: Commit**

```bash
git add apps/server/src/app.ts apps/server/src/lib/env.ts apps/server/src/index.ts
git commit -m "feat: add CORS middleware support"
```

---

### Task 2: 后端添加静态文件服务

**Files:**
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/lib/env.ts`

**Step 1: 在 `apps/server/src/app.ts` 添加静态文件服务**

在文件顶部添加 import：

```typescript
import { serveStatic } from '@hono/node-server/serve-static'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
```

在 `createApp` 函数末尾（所有 API 路由之后，`return app` 之前）添加：

```typescript
// 生产环境：serve 前端静态文件
if (deps.nodeEnv === 'production') {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  // 构建后路径: apps/server/dist/app.js → apps/web/dist/
  const webDistPath = path.resolve(__dirname, '../../web/dist')

  app.use('/*', serveStatic({ root: webDistPath }))

  // SPA fallback: 所有未匹配路由返回 index.html
  app.get('*', (c) => {
    const indexPath = path.join(webDistPath, 'index.html')
    const html = fs.readFileSync(indexPath, 'utf-8')
    return c.html(html)
  })
}
```

**Step 2: 在 `AppDependencies` 接口添加 nodeEnv**

```typescript
nodeEnv?: string
```

**Step 3: 在 `apps/server/src/index.ts` 传入 nodeEnv**

```typescript
const app = createApp({
  // ... 现有字段 ...
  nodeEnv: env.NODE_ENV,
} as any)
```

**Step 4: 验证构建通过**

Run: `cd apps/server && pnpm type-check`
Expected: 无错误

**Step 5: Commit**

```bash
git add apps/server/src/app.ts apps/server/src/lib/env.ts apps/server/src/index.ts
git commit -m "feat: serve frontend static files in production"
```

---

### Task 3: 前端 WebSocket URL 自动推导

**Files:**
- Modify: `apps/web/src/api/websocket.ts:132-135`

**Step 1: 修改 `getWebSocketUrl` 函数**

将现有的：

```typescript
const getWebSocketUrl = () => {
  return import.meta.env.VITE_WS_URL || 'ws://localhost:3100';
};
```

替换为：

```typescript
const getWebSocketUrl = () => {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }
  // 同源部署：从当前页面 URL 推导 WebSocket URL
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
};
```

**Step 2: 验证构建通过**

Run: `cd apps/web && pnpm type-check`
Expected: 无错误

**Step 3: Commit**

```bash
git add apps/web/src/api/websocket.ts
git commit -m "feat: auto-derive WebSocket URL from page location"
```

---

### Task 4: 创建 Prisma 初始迁移

**Files:**
- Create: `apps/server/prisma/migrations/` (由 prisma 自动生成)
- Modify: `apps/server/package.json` (添加 migrate 脚本)

**Step 1: 在 `apps/server/package.json` 添加 migrate 脚本**

在 scripts 中添加：

```json
"db:migrate": "prisma migrate dev",
"db:migrate:deploy": "prisma migrate deploy"
```

**Step 2: 生成初始迁移**

Run: `cd apps/server && pnpm db:migrate -- --name init`
Expected: 生成 `prisma/migrations/<timestamp>_init/migration.sql`

**Step 3: 验证迁移文件存在**

Run: `ls apps/server/prisma/migrations/`
Expected: 看到 `<timestamp>_init` 目录

**Step 4: Commit**

```bash
git add apps/server/prisma/migrations/ apps/server/package.json
git commit -m "feat: add initial Prisma migration"
```

---

### Task 5: 创建 PM2 配置

**Files:**
- Create: `ecosystem.config.cjs`

**Step 1: 创建 `ecosystem.config.cjs`**

```javascript
module.exports = {
  apps: [
    {
      name: 'morechat',
      cwd: './apps/server',
      script: 'dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
```

**Step 2: Commit**

```bash
git add ecosystem.config.cjs
git commit -m "chore: add PM2 ecosystem config"
```

---

### Task 6: 创建 Nginx 配置模板

**Files:**
- Create: `deploy/nginx.conf`

**Step 1: 创建 `deploy/nginx.conf`**

```nginx
server {
    listen 80;
    server_name _;

    # 反代到 Node.js
    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket 支持
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 300s;
    }
}
```

**Step 2: Commit**

```bash
git add deploy/nginx.conf
git commit -m "chore: add Nginx config template"
```

---

### Task 7: 创建 VPS 首次部署脚本

**Files:**
- Create: `deploy/setup.sh`

**Step 1: 创建 `deploy/setup.sh`**

```bash
#!/bin/bash
set -e

echo "=== MoreChat VPS Setup ==="

# 1. 安装 Node.js 20 (via NodeSource)
if ! command -v node &> /dev/null; then
  echo "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "Node: $(node -v)"

# 2. 安装 pnpm
if ! command -v pnpm &> /dev/null; then
  echo "Installing pnpm..."
  npm install -g pnpm@9
fi
echo "pnpm: $(pnpm -v)"

# 3. 安装 PM2
if ! command -v pm2 &> /dev/null; then
  echo "Installing PM2..."
  npm install -g pm2
  pm2 startup systemd -u "$USER" --hp "$HOME" || true
fi
echo "PM2: $(pm2 -v)"

# 4. 安装 Nginx
if ! command -v nginx &> /dev/null; then
  echo "Installing Nginx..."
  sudo apt-get update
  sudo apt-get install -y nginx
fi

# 5. 部署目录
DEPLOY_DIR="$HOME/morechat"
if [ ! -d "$DEPLOY_DIR" ]; then
  echo "Cloning repository..."
  git clone https://github.com/$(git remote get-url origin | sed 's/.*github.com[:/]\(.*\)\.git/\1/') "$DEPLOY_DIR"
fi

# 6. 配置 Nginx
echo "Configuring Nginx..."
sudo cp "$DEPLOY_DIR/deploy/nginx.conf" /etc/nginx/sites-available/morechat
sudo ln -sf /etc/nginx/sites-available/morechat /etc/nginx/sites-enabled/morechat
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# 7. 创建数据目录
mkdir -p "$DEPLOY_DIR/apps/server/data/lake"

echo ""
echo "=== Setup complete ==="
echo "Next steps:"
echo "  1. Create $DEPLOY_DIR/apps/server/.env (copy from .env.example)"
echo "  2. Run: cd $DEPLOY_DIR && bash deploy/update.sh"
```

**Step 2: 设置可执行权限并 commit**

```bash
chmod +x deploy/setup.sh
git add deploy/setup.sh
git commit -m "chore: add VPS initial setup script"
```

---

### Task 8: 创建更新部署脚本

**Files:**
- Create: `deploy/update.sh`

**Step 1: 创建 `deploy/update.sh`**

```bash
#!/bin/bash
set -e

DEPLOY_DIR="$HOME/morechat"
cd "$DEPLOY_DIR"

echo "=== MoreChat Deploy ==="

# 1. 拉取最新代码
echo "Pulling latest code..."
git pull origin main

# 2. 安装依赖
echo "Installing dependencies..."
pnpm install --frozen-lockfile

# 3. 构建
echo "Building..."
pnpm build

# 4. 数据库迁移
echo "Running database migrations..."
cd apps/server
pnpm db:migrate:deploy
cd "$DEPLOY_DIR"

# 5. 重启服务
echo "Restarting service..."
pm2 startOrRestart ecosystem.config.cjs --env production
pm2 save

echo "=== Deploy complete ==="
echo "Check status: pm2 status"
echo "Check logs: pm2 logs morechat"
```

**Step 2: 设置可执行权限并 commit**

```bash
chmod +x deploy/update.sh
git add deploy/update.sh
git commit -m "chore: add deployment update script"
```

---

### Task 9: 创建 GitHub Actions CI/CD

**Files:**
- Create: `.github/workflows/deploy.yml`

**Step 1: 创建 `.github/workflows/deploy.yml`**

```yaml
name: Deploy to VPS

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          port: ${{ secrets.VPS_PORT || 22 }}
          script: |
            cd ~/morechat
            bash deploy/update.sh
```

**Step 2: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: add GitHub Actions deploy workflow"
```

---

### Task 10: 更新环境变量示例文件

**Files:**
- Modify: `apps/server/.env.example`

**Step 1: 确保 `.env.example` 包含所有生产环境需要的变量**

```env
# Database
DATABASE_URL="file:../data/morechat.db"

# Data Lake
DATA_LAKE_TYPE="filesystem"
DATA_LAKE_PATH="./data/lake"

# Server
PORT=3100
NODE_ENV="production"
CORS_ORIGIN=""

# juhexbot
JUHEXBOT_API_URL="http://chat-api.juhebot.com/open/GuidRequest"
JUHEXBOT_APP_KEY=""
JUHEXBOT_APP_SECRET=""
JUHEXBOT_CLIENT_GUID=""

# Auth
AUTH_PASSWORD_HASH=""
AUTH_JWT_SECRET=""
```

**Step 2: Commit**

```bash
git add apps/server/.env.example
git commit -m "docs: update env example for production deployment"
```

---

### Task 11: 端到端验证

**Step 1: 本地完整构建测试**

Run: `pnpm build`
Expected: 前端和后端都构建成功

**Step 2: 验证后端能 serve 前端静态文件**

手动测试（可选）：
1. 设置 `NODE_ENV=production`
2. 启动后端 `cd apps/server && node dist/index.js`
3. 浏览器访问 `http://localhost:3100`
4. 应该看到前端登录页面

**Step 3: 最终 commit（如有修复）**

```bash
git add -A
git commit -m "fix: deployment adjustments"
```

---

## GitHub Secrets 配置指南

部署前需要在 GitHub 仓库设置以下 Secrets：

```
VPS_HOST     — 服务器 IP 地址
VPS_USER     — SSH 用户名
VPS_SSH_KEY  — SSH 私钥（完整内容）
VPS_PORT     — SSH 端口（可选，默认 22）
```

设置方式：`gh secret set <NAME>` 或 GitHub 仓库 Settings → Secrets and variables → Actions

## VPS 首次部署步骤

1. SSH 到 VPS
2. `git clone <repo> ~/morechat`
3. `cd ~/morechat && bash deploy/setup.sh`
4. 创建 `apps/server/.env`，填入真实配置
5. `bash deploy/update.sh`
6. 验证：`curl http://localhost:3100/health`
