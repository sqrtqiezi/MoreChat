#!/bin/bash
# ABOUTME: 设置本地测试环境
# ABOUTME: 检查依赖、数据库、配置文件等

set -e

echo "🔍 检查测试环境..."

# 检查 Node.js 版本
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Node.js 版本过低，需要 >= 20.0.0"
    exit 1
fi
echo "✅ Node.js 版本: $(node -v)"

# 检查 pnpm
if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm 未安装"
    exit 1
fi
echo "✅ pnpm 版本: $(pnpm -v)"

# 检查项目根目录
if [ ! -f "package.json" ]; then
    echo "❌ 请在项目根目录运行此脚本"
    exit 1
fi

# 检查依赖是否已安装
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    pnpm install
else
    echo "✅ 依赖已安装"
fi

NEEDS_MANUAL_ENV_CONFIG=0

# 检查 server .env 文件
if [ ! -f "apps/server/.env" ]; then
    echo "⚠️  apps/server/.env 不存在，从示例文件复制..."
    cp apps/server/.env.example apps/server/.env
    echo "⚠️  请编辑 apps/server/.env 配置必要的环境变量"
    NEEDS_MANUAL_ENV_CONFIG=1
fi
echo "✅ Server 配置文件存在"

# 检查数据库目录
if [ ! -d "apps/server/data" ]; then
    echo "📁 创建数据库目录..."
    mkdir -p apps/server/data
fi
echo "✅ 数据库目录存在"

# 检查数据库文件
if [ ! -f "apps/server/data/morechat.db" ]; then
    echo "⚠️  数据库文件不存在，需要运行迁移..."
    echo "   运行: cd apps/server && npx prisma migrate dev"
else
    echo "✅ 数据库文件存在"
fi

# 检查 Playwright 浏览器
echo "🌐 检查 Playwright 浏览器..."
cd apps/web
if ! npx playwright --version &> /dev/null; then
    echo "❌ Playwright 未安装"
    exit 1
fi

# 检查 Chromium 浏览器是否已安装
CHROMIUM_PATH=$(node -e "const { chromium } = require('@playwright/test'); process.stdout.write(chromium.executablePath())")
if [ ! -x "$CHROMIUM_PATH" ]; then
    echo "📥 安装 Playwright 浏览器..."
    npx playwright install chromium
else
    echo "✅ Playwright 浏览器已安装"
fi

cd ../..

if [ "$NEEDS_MANUAL_ENV_CONFIG" -eq 1 ]; then
    echo ""
    echo "⚠️  测试环境尚未就绪：apps/server/.env 只是从示例复制，仍需手动配置后才能通过 E2E 测试。"
    exit 1
fi

echo ""
echo "✅ 测试环境准备完成！"
echo ""
echo "📝 下一步："
echo "   1. 确保 apps/server/.env 配置正确"
echo "   2. 运行数据库迁移: cd apps/server && npx prisma migrate dev"
echo "   3. 运行测试（Cucumber + Playwright）: cd apps/web && pnpm test:cucumber"
