# MoreChat 开发环境设置

## Phase 0 数据采集总结

### 采集的消息类型

通过 ngrok + webhook 采集工具，我们成功采集了 13 个真实消息样本，涵盖以下类型：

| 消息类型 | msg_type | 样本数量 | 说明 |
|---------|----------|---------|------|
| 文本消息 | 1 | 5 | 普通文本消息 |
| 图片消息 | 3 | 1 | 图片消息，content 为 XML 格式 |
| 应用消息 | 49 | 1 | 链接/文件/小程序等，content 为 XML 格式 |
| 语音/视频通话 | 51 | 5 | 通话相关消息 |
| 消息撤回 | 10002 | 1 | 撤回消息通知 |

### 发现的格式差异

#### 1. 统一网关模式

juhexbot API 使用统一网关模式，与原始文档描述不同：

**实际格式：**
```json
{
  "app_key": "your_app_key",
  "app_secret": "your_app_secret",
  "path": "/client/set_notify_url",
  "data": {
    // 具体接口参数
  }
}
```

**统一请求地址：** `http://chat-api.juhebot.com/open/GuidRequest`

所有 API 请求都发送到同一个 URL，通过 `path` 参数区分不同的接口。

#### 2. Webhook 回调格式

Webhook 推送的消息格式为嵌套结构：

```json
{
  "guid": "client-guid",
  "notify_type": 1010,
  "data": {
    "from_username": "sender",
    "to_username": "receiver",
    "msg_type": 1,
    "content": "message content",
    // ... 其他字段
  }
}
```

**关键发现：**
- 外层包含 `guid` 和 `notify_type`
- 实际消息数据在 `data` 字段中
- `msg_type` 位于 `data.msg_type`，不是顶层字段

#### 3. 消息类型补充

发现了文档中未明确说明的消息类型：

- **msg_type 51**：语音/视频通话消息
- **msg_type 10002**：消息撤回通知

### 特殊字段说明

#### 1. source 字段

所有消息都包含 `source` 字段，为 XML 格式的元数据：

```xml
<msgsource>
  <signature>N0_V1_9/dbMQa/|v1_9jE9m+eJ</signature>
  <tmp_node>
    <publisher-id></publisher-id>
  </tmp_node>
</msgsource>
```

#### 2. content 字段

不同消息类型的 content 格式不同：

- **文本消息 (type 1)**：纯文本
- **图片消息 (type 3)**：XML 格式，包含图片 URL、尺寸、加密信息
- **应用消息 (type 49)**：XML 格式，包含链接、小程序等信息
- **消息撤回 (type 10002)**：XML 格式，包含被撤回的消息 ID

#### 3. 群消息标识

群消息通过以下字段识别：

- `is_chatroom_msg`: 1 表示群消息
- `chatroom`: 群 ID，格式为 `数字@chatroom`
- `chatroom_sender`: 群内发送者的 username

## 开发工具

### 1. 数据采集工具

**位置：** `tools/capture-webhook.ts`

**功能：**
- 启动 HTTP 服务器监听 webhook 回调
- 自动保存消息样本到 `tools/samples/` 目录
- 提供健康检查接口

**使用方法：**
```bash
cd tools
pnpm capture
```

### 2. 数据分析工具

**位置：** `tools/analyze-samples.ts`

**功能：**
- 分析采集的消息样本
- 统计消息类型分布
- 生成格式化的分析报告

**使用方法：**
```bash
cd tools
pnpm tsx analyze-samples.ts
```

### 3. ngrok 本地开发

**安装：**
```bash
brew install ngrok
```

**配置：**
```bash
ngrok config add-authtoken YOUR_TOKEN
```

**启动：**
```bash
ngrok http 3100
```

**设置 webhook：**
```bash
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

## 类型定义

**位置：** `apps/server/src/types/juhexbot.ts`

包含完整的 TypeScript 类型定义：

- `GatewayRequest<T>` - 统一网关请求格式
- `GatewayResponse<T>` - 统一网关响应格式
- `WebhookPayload` - Webhook 回调格式
- `Message` - 消息联合类型
- 各种具体消息类型接口

## 测试数据

**位置：** `tests/fixtures/messages.ts`

包含所有消息类型的测试 fixtures，可用于单元测试。

## 环境变量

在 `.env` 文件中配置：

```bash
# juhexbot API 配置
JUHEXBOT_API_URL="http://chat-api.juhebot.com/open/GuidRequest"
JUHEXBOT_APP_KEY="your_app_key"
JUHEXBOT_APP_SECRET="your_app_secret"
JUHEXBOT_CLIENT_GUID="your_client_guid"
```

## 下一步

Phase 0 完成后，可以开始 Phase 1：

1. 实现 SQLite 数据库模型
2. 实现 webhook 接收服务
3. 实现消息解析和存储逻辑
4. 编写单元测试

详见：`docs/plans/phase1-implementation-plan.md`
