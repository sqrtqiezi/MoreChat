# Phase 0 执行清单

## 准备工作

- [ ] 确保你有 juhexbot API 的访问权限
- [ ] 确保你有一个可用的微信客户端 GUID
- [ ] 确保你可以通过微信发送测试消息

---

## Task 0.1: 创建数据采集工具（10 分钟）

### 1. 创建目录结构

```bash
cd /Users/niujin/develop/MoreChat
mkdir -p tools samples
touch samples/.gitkeep
```

### 2. 创建 tools/package.json

复制以下内容到 `tools/package.json`:

```json
{
  "name": "morechat-tools",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "capture": "tsx capture-webhook.ts"
  },
  "dependencies": {
    "hono": "^4.0.0",
    "@hono/node-server": "^1.8.0"
  },
  "devDependencies": {
    "tsx": "^4.7.0",
    "typescript": "^5.3.0"
  }
}
```

### 3. 安装依赖

```bash
cd tools
pnpm install
```

### 4. 创建 tools/capture-webhook.ts

从 `docs/plans/2026-03-09-phase0-data-validation.md` 复制完整代码

### 5. 测试运行

```bash
pnpm capture
```

应该看到：
```
🎣 MoreChat Webhook Capture Tool
📡 Server running on http://localhost:3100
Waiting for messages...
```

### 6. 测试健康检查

打开新终端：
```bash
curl http://localhost:3100/health
```

应该返回：`{"status":"ok","captured":0,...}`

✅ Task 0.1 完成

---

## Task 0.2: 配置 ngrok 并采集数据（30 分钟）

### 1. 安装 ngrok

```bash
# macOS
brew install ngrok

# 或访问 https://ngrok.com/download 下载
```

### 2. 注册并配置 authtoken

1. 访问 https://dashboard.ngrok.com/signup
2. 注册账号
3. 获取 authtoken: https://dashboard.ngrok.com/get-started/your-authtoken
4. 配置：
```bash
ngrok config add-authtoken YOUR_TOKEN_HERE
```

### 3. 启动采集工具

终端 1:
```bash
cd /Users/niujin/develop/MoreChat/tools
pnpm capture
```

### 4. 启动 ngrok

终端 2:
```bash
ngrok http 3100
```

记录显示的 HTTPS URL，例如：`https://abc123.ngrok.io`

### 5. 设置 juhexbot notify_url

**重要：替换以下变量为你的实际值**

```bash
# 设置变量
JUHEXBOT_API="http://your-juhexbot-api:8000"
CLIENT_GUID="your-client-guid"
NGROK_URL="https://abc123.ngrok.io"  # 从上一步获取

# 设置 notify_url
curl -X POST "${JUHEXBOT_API}/client/set_notify_url" \
  -H "Content-Type: application/json" \
  -d "{\"guid\":\"${CLIENT_GUID}\",\"notify_url\":\"${NGROK_URL}/webhook\"}"
```

### 6. 发送测试消息

通过微信客户端发送以下类型的消息：

- [ ] 文本消息："Hello, this is a test"
- [ ] 图片消息：发送一张图片
- [ ] 群消息：在群里发送消息
- [ ] @消息：在群里 @某人
- [ ] 撤回消息：发送后立即撤回
- [ ] 文件消息：发送一个文件（可选）
- [ ] 语音消息：发送语音（可选）
- [ ] 表情消息：发送表情（可选）

### 7. 验证数据采集

在终端 1 中应该看到消息被捕获：
```
✅ [1] Captured message: msg-1234567890-1.json
```

检查 samples 目录：
```bash
ls -lh samples/
cat samples/msg-*.json | head -50
```

### 8. 停止服务

- 终端 1: Ctrl+C
- 终端 2: Ctrl+C

✅ Task 0.2 完成

---

## Task 0.3: 分析数据并生成类型定义（30 分钟）

### 1. 创建 tools/analyze-samples.ts

从 `docs/plans/2026-03-09-phase0-data-validation.md` 复制完整代码

### 2. 运行分析工具

```bash
cd tools
pnpm tsx analyze-samples.ts > ../docs/juhexbot-message-formats.md
```

### 3. 查看分析结果

```bash
cat ../docs/juhexbot-message-formats.md
```

### 4. 手动创建类型定义

基于分析结果，创建 `apps/server/src/types/juhexbot.ts`

**重要：** 根据你实际采集的数据调整类型定义！

### 5. 创建测试 fixtures

创建 `tests/fixtures/messages.ts`，从 samples 中复制真实数据

### 6. 创建开发文档

创建 `docs/development-setup.md`，记录：
- 采集了哪些消息类型
- 发现的格式差异
- 特殊字段说明

### 7. 添加到 .gitignore

```bash
echo "samples/*.json" >> .gitignore
echo "!samples/.gitkeep" >> .gitignore
```

### 8. 提交代码

```bash
git add tools/ apps/server/src/types/ tests/fixtures/ docs/
git commit -m "feat: complete Phase 0 data validation

- 采集真实消息样本
- 生成类型定义
- 创建测试 fixtures"
```

✅ Task 0.3 完成

---

## 完成检查

Phase 0 完成后，你应该拥有：

- [ ] `tools/capture-webhook.ts` - 数据采集工具
- [ ] `samples/msg-*.json` - 至少 5-10 个消息样本
- [ ] `apps/server/src/types/juhexbot.ts` - 类型定义
- [ ] `tests/fixtures/messages.ts` - 测试数据
- [ ] `docs/juhexbot-message-formats.md` - 消息格式文档
- [ ] `docs/development-setup.md` - 开发设置文档

---

## 遇到问题？

### ngrok 连接失败
- 检查 authtoken 是否正确配置
- 检查端口 3100 是否被占用

### juhexbot 没有推送消息
- 检查 notify_url 是否设置成功
- 检查 ngrok URL 是否正确
- 检查采集工具是否在运行

### 采集工具报错
- 检查依赖是否安装完整
- 检查 samples 目录是否有写权限

---

## 完成后

请告诉我：

1. 采集了哪些类型的消息？
2. 消息格式与 juhexbot.md 文档有什么差异？
3. 有没有意外的字段或特殊情况？

然后我们可以：
- 审查你的类型定义
- 调整 Phase 1 计划
- 开始执行 Phase 1
