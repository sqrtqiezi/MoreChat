# Webhook 自动注册配置指南

## 概述

从当前版本开始，MoreChat 服务在启动时会自动将 webhook 地址注册到 juhexbot，无需手动调用 API。

## 配置步骤

### 1. 设置环境变量

在 `apps/server/.env` 文件中添加 `WEBHOOK_URL` 配置：

```bash
# Webhook URL (用于接收 juhexbot 推送的消息)
WEBHOOK_URL="https://your-domain.com/webhook"
```

**注意事项：**
- URL 必须是公网可访问的地址
- 必须使用 HTTPS（生产环境）
- 路径固定为 `/webhook`

### 2. 示例配置

**开发环境（使用 ngrok）：**
```bash
WEBHOOK_URL="https://abc123.ngrok.io/webhook"
```

**生产环境：**
```bash
WEBHOOK_URL="https://morechat.example.com/webhook"
```

### 3. 验证注册

服务启动后，查看日志输出：

```
✅ juhexbot client: online
🔗 Registering webhook: https://your-domain.com/webhook
✅ Webhook registered successfully
```

如果看到以上日志，说明 webhook 注册成功。

### 4. 故障排查

**问题：未配置 WEBHOOK_URL**
```
⚠️ WEBHOOK_URL not configured, skipping webhook registration
```
解决方案：在 `.env` 文件中添加 `WEBHOOK_URL` 配置。

**问题：注册失败**
```
⚠️ Could not register webhook: Error: Failed to set notify URL
```
可能原因：
- juhexbot API 不可用
- URL 格式不正确
- 网络连接问题

解决方案：
1. 检查 `WEBHOOK_URL` 格式是否正确
2. 确认 juhexbot 服务状态
3. 查看详细错误日志

## 工作原理

1. 服务启动时读取 `WEBHOOK_URL` 环境变量
2. 调用 juhexbot 的 `/client/set_notify_url` 接口
3. 注册成功后，juhexbot 会将消息推送到指定的 webhook 地址
4. 如果注册失败，记录警告但不影响服务启动

## 手动注册（可选）

如果需要手动注册 webhook，可以使用以下 curl 命令：

```bash
curl -X POST "http://chat-api.juhebot.com/open/GuidRequest" \
  -H "Content-Type: application/json" \
  -d '{
    "app_key": "your_app_key",
    "app_secret": "your_app_secret",
    "path": "/client/set_notify_url",
    "data": {
      "guid": "your_client_guid",
      "notify_url": "https://your-domain.com/webhook"
    }
  }'
```

## 相关文件

- `apps/server/src/services/juhexbotAdapter.ts` - 实现 `setNotifyUrl()` 方法
- `apps/server/src/index.ts` - 服务启动时调用注册逻辑
- `apps/server/src/lib/env.ts` - 环境变量配置
