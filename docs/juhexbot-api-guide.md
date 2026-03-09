# juhexbot API 调用指南

## API 基本信息

**统一请求地址：** `http://chat-api.juhebot.com/open/GuidRequest`

**请求方式：** POST

**Content-Type：** application/json

## 请求格式

所有 API 请求都使用统一的网关格式：

```json
{
  "app_key": "your_app_key",
  "app_secret": "your_app_secret",
  "path": "/specific/api/path",
  "data": {
    // 具体接口的参数
  }
}
```

### 参数说明

- `app_key`: 应用密钥（必填）
- `app_secret`: 应用密钥（必填）
- `path`: 具体的 API 路径（必填）
- `data`: 具体接口所需的参数（必填）

## 常用 API 示例

### 1. 设置通知地址

设置 webhook 回调地址，用于接收消息推送。

**Path:** `/client/set_notify_url`

**请求示例：**
```json
{
  "app_key": "******",
  "app_secret": "******",
  "path": "/client/set_notify_url",
  "data": {
    "guid": "your-client-guid",
    "notify_url": "https://your-domain.com/webhook"
  }
}
```

**cURL 示例：**
```bash
curl -X POST "http://chat-api.juhebot.com/open/GuidRequest" \
  -H "Content-Type: application/json" \
  -d '{
    "app_key": "your_app_key",
    "app_secret": "your_app_secret",
    "path": "/client/set_notify_url",
    "data": {
      "guid": "your-client-guid",
      "notify_url": "https://your-domain.com/webhook"
    }
  }'
```

### 2. 发送文本消息

**Path:** `/msg/send_text`

**请求示例：**
```json
{
  "app_key": "******",
  "app_secret": "******",
  "path": "/msg/send_text",
  "data": {
    "guid": "your-client-guid",
    "conversation_id": "5:1xxxx",
    "content": "hello world"
  }
}
```

### 3. 恢复客户端实例

**Path:** `/client/restore_client`

**请求示例：**
```json
{
  "app_key": "******",
  "app_secret": "******",
  "path": "/client/restore_client",
  "data": {
    "guid": "your-client-guid",
    "proxy": "",
    "is_login_proxy": false,
    "bridge": "",
    "sync_history_msg": true,
    "auto_start": true
  }
}
```

### 4. 获取客户端状态

**Path:** `/client/get_client_status`

**请求示例：**
```json
{
  "app_key": "******",
  "app_secret": "******",
  "path": "/client/get_client_status",
  "data": {
    "guid": "your-client-guid"
  }
}
```

### 5. 同步联系人

**Path:** `/contact/init_contact`

**请求示例：**
```json
{
  "app_key": "******",
  "app_secret": "******",
  "path": "/contact/init_contact",
  "data": {
    "guid": "your-client-guid"
  }
}
```

## Webhook 回调

当设置了 `notify_url` 后，juhexbot 会将消息推送到指定的地址。

**回调格式：**

推送的消息格式为 `ChatMsgModel`：

```json
{
  "from_username": "user123",
  "to_username": "me",
  "chatroom_sender": "",
  "create_time": 1234567890,
  "desc": "",
  "msg_id": "msg_001",
  "msg_type": 1,
  "chatroom": "",
  "source": "",
  "content": "Hello"
}
```

### 消息类型（msg_type）

- `1` - 文本消息
- `3` - 图片消息
- `34` - 语音消息
- `43` - 视频消息
- `47` - 表情消息
- `49` - 应用消息/链接/文件
- `51` - 语音/视频通话
- `10000` - 系统消息
- `10002` - 消息撤回

## 环境变量配置

在 `.env` 文件中配置：

```bash
# juhexbot API 配置
JUHEXBOT_API_URL="http://chat-api.juhebot.com/open/GuidRequest"
JUHEXBOT_APP_KEY="your_app_key"
JUHEXBOT_APP_SECRET="your_app_secret"
JUHEXBOT_CLIENT_GUID="your_client_guid"
```

## 注意事项

1. **统一网关模式**：所有请求都发送到同一个 URL，通过 `path` 参数区分不同的接口
2. **认证方式**：每个请求都需要携带 `app_key` 和 `app_secret`
3. **GUID**：客户端唯一标识符，用于标识具体的微信客户端实例
4. **Webhook 地址**：必须是公网可访问的 HTTPS 地址（开发环境可使用 ngrok）

## 开发环境设置

### 使用 ngrok 暴露本地服务

```bash
# 启动本地服务
cd tools
pnpm capture

# 在新终端启动 ngrok
ngrok http 3100

# 设置 notify_url
curl -X POST "http://chat-api.juhebot.com/open/GuidRequest" \
  -H "Content-Type: application/json" \
  -d '{
    "app_key": "your_app_key",
    "app_secret": "your_app_secret",
    "path": "/client/set_notify_url",
    "data": {
      "guid": "your_client_guid",
      "notify_url": "https://your-ngrok-url.ngrok.io/webhook"
    }
  }'
```

## 错误处理

常见错误码：

- `401` - 认证失败（app_key 或 app_secret 错误）
- `404` - 路径不存在（path 参数错误）
- `422` - 参数验证失败
- `500` - 服务器内部错误

## 参考文档

- 完整 API 文档：`docs/juhexbot.md`
- 数据采集工具：`tools/capture-webhook.ts`
- 实现计划：`docs/plans/2026-03-09-phase0-data-validation.md`
