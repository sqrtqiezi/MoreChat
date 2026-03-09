#!/bin/bash
set -e

echo "=== MoreChat VPS Setup ==="

# 检测操作系统
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS=$ID
else
  echo "Error: Cannot detect OS"
  exit 1
fi

# 1. 安装 Node.js 20
if ! command -v node &> /dev/null; then
  echo "Installing Node.js 20..."
  if [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  elif [[ "$OS" == "rocky" || "$OS" == "centos" || "$OS" == "rhel" || "$OS" == "fedora" ]]; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
    sudo dnf install -y nodejs
  else
    echo "Error: Unsupported OS: $OS"
    exit 1
  fi
fi
echo "Node: $(node -v)"

# 2. 安装 pnpm
if ! command -v pnpm &> /dev/null; then
  echo "Installing pnpm..."
  sudo npm install -g pnpm
fi
echo "pnpm: $(pnpm -v)"

# 3. 安装 PM2
if ! command -v pm2 &> /dev/null; then
  echo "Installing PM2..."
  sudo npm install -g pm2
fi
echo "PM2: $(pm2 -v)"

# 4. 安装 Nginx
if ! command -v nginx &> /dev/null; then
  echo "Installing Nginx..."
  if [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
    sudo apt-get update
    sudo apt-get install -y nginx
  elif [[ "$OS" == "rocky" || "$OS" == "centos" || "$OS" == "rhel" || "$OS" == "fedora" ]]; then
    sudo dnf install -y nginx
  fi
fi
echo "Nginx: $(nginx -v 2>&1)"

# 5. 配置 Nginx
echo "Configuring Nginx..."
if [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
  # Debian 系使用 sites-available/sites-enabled
  sudo cp deploy/nginx.conf /etc/nginx/sites-available/morechat
  sudo ln -sf /etc/nginx/sites-available/morechat /etc/nginx/sites-enabled/morechat
  sudo rm -f /etc/nginx/sites-enabled/default
elif [[ "$OS" == "rocky" || "$OS" == "centos" || "$OS" == "rhel" || "$OS" == "fedora" ]]; then
  # RHEL 系直接放到 conf.d
  sudo cp deploy/nginx.conf /etc/nginx/conf.d/morechat.conf
  # 禁用默认 server
  sudo sed -i 's/^[^#]*listen\s\+80/# &/' /etc/nginx/nginx.conf 2>/dev/null || true
fi
sudo nginx -t
sudo systemctl enable nginx
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
echo ""
echo "Next steps:"
echo "1. 配置环境变量（二选一）："
echo "   a) 使用配置助手: bash deploy/configure.sh"
echo "   b) 手动创建: cp apps/server/.env.example apps/server/.env && nano apps/server/.env"
echo ""
echo "2. 启动服务: bash deploy/update.sh"
echo ""
echo "3. 验证部署: curl http://localhost:3100/health"
echo ""
echo "详细配置说明请查看: docs/deployment-config-guide.md"
