#!/bin/bash
set -e

echo "=== MoreChat Update ==="

# 1. 拉取最新代码
echo "Pulling latest code..."
git pull origin main

# 2. 安装依赖
echo "Installing dependencies..."
pnpm install

# 3. 构建
echo "Building..."
pnpm build

# 4. 数据库迁移
echo "Running database migration..."
cd apps/server
pnpm db:migrate:deploy
cd ../..

# 5. 重启服务
echo "Restarting service..."
pm2 restart ecosystem.config.cjs || pm2 start ecosystem.config.cjs

echo "=== Update complete ==="
echo "Health check: curl http://localhost:3100/health"
