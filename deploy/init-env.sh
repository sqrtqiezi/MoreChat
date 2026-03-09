#!/bin/bash
# 从环境变量生成 apps/server/.env 文件
# 用于 CI/CD 自动化部署

set -e

# 如果脚本在 deploy/ 目录下，PROJECT_DIR 是上一级
# 如果脚本在根目录，PROJECT_DIR 就是当前目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ "$(basename "$SCRIPT_DIR")" = "deploy" ]; then
  PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
else
  PROJECT_DIR="$SCRIPT_DIR"
fi
ENV_FILE="$PROJECT_DIR/apps/server/.env"

echo "Generating $ENV_FILE from environment variables..."

cat > "$ENV_FILE" << EOF
# Database
DATABASE_URL="${DATABASE_URL:-file:../data/morechat.db}"

# Data Lake
DATA_LAKE_TYPE="${DATA_LAKE_TYPE:-filesystem}"
DATA_LAKE_PATH="${DATA_LAKE_PATH:-./data/lake}"

# Server
PORT=${PORT:-3100}
NODE_ENV="${NODE_ENV:-production}"
CORS_ORIGIN="${CORS_ORIGIN:-}"

# juhexbot API
JUHEXBOT_API_URL="${JUHEXBOT_API_URL:-http://chat-api.juhebot.com/open/GuidRequest}"
JUHEXBOT_APP_KEY="${JUHEXBOT_APP_KEY}"
JUHEXBOT_APP_SECRET="${JUHEXBOT_APP_SECRET}"
JUHEXBOT_CLIENT_GUID="${JUHEXBOT_CLIENT_GUID}"

# Webhook
WEBHOOK_URL="${WEBHOOK_URL:-}"

# Log
LOG_LEVEL="${LOG_LEVEL:-info}"

# Auth
AUTH_PASSWORD_HASH="${AUTH_PASSWORD_HASH}"
AUTH_JWT_SECRET="${AUTH_JWT_SECRET}"
EOF

echo "✅ .env file generated"
