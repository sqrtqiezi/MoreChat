#!/bin/bash
# ABOUTME: 监控 GitHub Actions 部署直到成功或失败
# ABOUTME: 由 PostToolUse hook 在 git push 成功后自动调用

set -e

echo "⏳ 等待 GitHub Actions 启动..."
sleep 5

echo "📊 获取最新的部署任务..."
RUN_ID=$(gh run list --limit 1 --json databaseId --jq '.[0].databaseId')

if [ -z "$RUN_ID" ]; then
  echo "❌ 无法获取部署任务 ID"
  exit 1
fi

echo "🔍 监控部署任务 #$RUN_ID"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if gh run watch "$RUN_ID" --exit-status --interval 10; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "✅ 部署成功！"

  echo ""
  echo "📋 部署摘要:"
  gh run view "$RUN_ID" --json conclusion,status,createdAt,updatedAt,url \
    --jq '"状态: \(.conclusion)\n耗时: \((.updatedAt | fromdateiso8601) - (.createdAt | fromdateiso8601) | floor)秒\nURL: \(.url)"'

  exit 0
else
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "❌ 部署失败！"

  echo ""
  echo "📋 失败日志:"
  gh run view "$RUN_ID" --log-failed

  exit 1
fi
