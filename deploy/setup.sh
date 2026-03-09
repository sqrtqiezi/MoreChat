#!/bin/bash
set -e

echo "=== MoreChat VPS Setup ==="

# 1. 安装 Node.js 20
if ! command -v node &> /dev/null; then
  echo "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "Node: $(node -v)"

# 2. 安装 pnpm
if ! command -v pnpm &> /dev/null; then
  echo "Installing pnpm..."
  npm install -g pnpm
fi
echo "pnpm: $(pnpm -v)"

# 3. 安装 PM2
if ! command -v pm2 &> /dev/null; then
  echo "Installing PM2..."
  npm install -g pm2
fi
echo "PM2: $(pm2 -v)"

# 4. 安装 Nginx
if ! command -v nginx &> /dev/null; then
  echo "Installing Nginx..."
  sudo apt-get update
  sudo apt-get install -y nginx
fi
echo "Nginx: $(nginx -v 2>&1)"

# 5. 配置 Nginx
echo "Configuring Nginx..."
sudo cp deploy/nginx.conf /etc/nginx/sites-available/morechat
sudo ln -sf /etc/nginx/sites-available/morechat /etc/nginx/sites-enabled/morechat
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

# 6. 安装依赖并构建
echo "Installing dependencies..."
pnpm install

echo "Building..."
pnpm build

# 7. 数据库迁移
echo "Running database migration..."
cd apps/server
pnpm db:migrate:deploy
cd ../..

echo ""
echo "=== Setup complete ==="
echo "Next steps:"
echo "1. Create apps/server/.env with your configuration"
echo "2. Run: bash deploy/update.sh"
echo "3. Verify: curl http://localhost:3100/health"
