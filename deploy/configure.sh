#!/bin/bash
# VPS 环境变量配置助手

set -e

ENV_FILE="apps/server/.env"

echo "=== MoreChat 环境变量配置助手 ==="
echo ""

# 检查是否已存在 .env 文件
if [ -f "$ENV_FILE" ]; then
  echo "⚠️  检测到已存在的 .env 文件"
  read -p "是否覆盖？(y/N): " overwrite
  if [ "$overwrite" != "y" ] && [ "$overwrite" != "Y" ]; then
    echo "已取消配置"
    exit 0
  fi
  echo ""
fi

# 从 .env.example 复制
cp apps/server/.env.example "$ENV_FILE"
echo "✅ 已创建 $ENV_FILE"
echo ""

# 交互式配置
echo "请输入以下配置信息（按 Enter 使用默认值）："
echo ""

# juhexbot 配置
echo "--- juhexbot API 配置 ---"
read -p "JUHEXBOT_APP_KEY: " app_key
read -p "JUHEXBOT_APP_SECRET: " app_secret
read -p "JUHEXBOT_CLIENT_GUID: " client_guid
echo ""

# 认证配置
echo "--- 认证配置 ---"
echo "生成密码哈希..."
echo "请输入登录密码："
cd apps/server
password_hash=$(pnpm --silent hash-password 2>/dev/null || echo "")
cd ../..

if [ -z "$password_hash" ]; then
  echo "⚠️  密码哈希生成失败，请手动运行: cd apps/server && pnpm hash-password"
  read -p "AUTH_PASSWORD_HASH (留空稍后手动设置): " password_hash
fi

echo ""
echo "生成 JWT 密钥..."
jwt_secret=$(openssl rand -base64 32 2>/dev/null || node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
echo "✅ JWT 密钥已生成"
echo ""

# 写入配置
if [ -n "$app_key" ]; then
  sed -i.bak "s|JUHEXBOT_APP_KEY=\"\"|JUHEXBOT_APP_KEY=\"$app_key\"|g" "$ENV_FILE"
fi

if [ -n "$app_secret" ]; then
  sed -i.bak "s|JUHEXBOT_APP_SECRET=\"\"|JUHEXBOT_APP_SECRET=\"$app_secret\"|g" "$ENV_FILE"
fi

if [ -n "$client_guid" ]; then
  sed -i.bak "s|JUHEXBOT_CLIENT_GUID=\"\"|JUHEXBOT_CLIENT_GUID=\"$client_guid\"|g" "$ENV_FILE"
fi

if [ -n "$password_hash" ]; then
  # 转义特殊字符
  password_hash_escaped=$(echo "$password_hash" | sed 's/[\/&]/\\&/g')
  sed -i.bak "s|AUTH_PASSWORD_HASH=\"\"|AUTH_PASSWORD_HASH=\"$password_hash_escaped\"|g" "$ENV_FILE"
fi

if [ -n "$jwt_secret" ]; then
  sed -i.bak "s|AUTH_JWT_SECRET=\"\"|AUTH_JWT_SECRET=\"$jwt_secret\"|g" "$ENV_FILE"
fi

# 清理备份文件
rm -f "$ENV_FILE.bak"

echo "=== 配置完成 ==="
echo ""
echo "配置文件已保存到: $ENV_FILE"
echo ""
echo "请检查配置："
echo "  cat $ENV_FILE"
echo ""
echo "如需修改，请编辑："
echo "  nano $ENV_FILE"
echo ""
echo "配置完成后，运行部署："
echo "  bash deploy/update.sh"
