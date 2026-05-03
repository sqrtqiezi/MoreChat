# MoreChat E2E 测试运行指南

本文档说明如何在本地准备、运行和排查 MoreChat 的 E2E 测试。

`docs/e2e-testing-spec.md` 是唯一的规范文档；本文只覆盖“如何执行当前测试体系”，不重复规范细节。

## 当前测试体系

- 默认 E2E 方案：Cucumber + Playwright + TypeScript
- 默认测试目录：`apps/web/tests/`
- 默认运行命令：`cd apps/web && pnpm test:cucumber`
- 遗留目录：`apps/web/e2e/` 中仍有旧版 Playwright 直测文件，仅作迁移参考，不作为当前主流程

## 前置要求

- Node.js >= 20
- pnpm >= 9
- 已安装项目依赖
- 本地可启动 `apps/server` 与 `apps/web`
- `apps/server/.env` 配置可用于本地测试

## Messaging E2E 边界

- `messaging.feature` 现在走真实 MoreChat `/api/*`、真实数据库、真实 data lake、真实 `/webhook` 和 WebSocket。
- 消息链路 E2E 不再使用浏览器侧 route 拦截或前端 API 假响应。
- 唯一允许替换的是服务端聚合 Bot 边界；本地通过 `E2E_BOT_MODE` 启用离线 Bot 适配器。

## 快速开始

### 1. 检查测试环境

在项目根目录运行：

```bash
bash scripts/setup-test-env.sh
```

该脚本会检查：

- Node.js 与 pnpm 版本
- 依赖是否已安装
- `apps/server/.env` 是否存在
- 数据库目录与数据库文件
- Playwright Chromium 浏览器

注意：脚本最后打印的测试命令仍是旧的 `pnpm test:e2e`，实际应以本文和 `apps/web/package.json` 为准，使用 `pnpm test:cucumber`。

### 2. 准备服务端环境

确认 `apps/server/.env` 至少包含当前测试所需的核心配置，例如：

```bash
DATABASE_URL="file:../data/morechat.db"
DATA_LAKE_PATH="./data/lake"
PORT=3100
NODE_ENV="development"
AUTH_PASSWORD_HASH="$2b$10$xhaDIjVx7SyJJlulTxfLvuiqdo5cOeJqLvZlDJdwiQgjCVOgqNuh."
AUTH_JWT_SECRET="dev-jwt-secret-change-in-production"
EMBEDDING_ENABLED=false
```

如果要运行消息链路 E2E，还需要显式设置：

```bash
E2E_BOT_MODE=true
JUHEXBOT_CLIENT_GUID="guid-e2e-messaging"
WEBHOOK_URL="http://localhost:3100/webhook"
```

说明：

- `E2E_BOT_MODE=true` 会让服务端改用离线 Bot 适配器，避免访问真实 juhexbot 网络。
- `JUHEXBOT_CLIENT_GUID` 必须与 seed 数据中的客户端 GUID 对齐；当前消息场景使用 `guid-e2e-messaging`。
- `WEBHOOK_URL` 与 `CORS_ORIGIN` 在 E2E Bot 模式下都必须指向本机地址。

如果数据库尚未初始化，先执行迁移：

```bash
cd apps/server
npx prisma migrate dev
```

### 3. 重置并写入消息场景测试数据

消息场景在运行前应先清理并重建固定数据：

```bash
cd apps/server
pnpm exec tsx scripts/reset-e2e-messaging.ts
pnpm exec tsx scripts/seed-test-data.ts --scenario messaging
```

这组脚本会准备：

- `guid-e2e-messaging` 对应的 E2E 登录客户端
- `E2E Messaging Peer` 联系人
- 一条私聊会话
- 一条初始文本消息

推荐在每次运行 `messaging.feature` 前执行一次，避免上次测试残留数据影响结果。

### 4. 运行测试

推荐直接从 `apps/web` 执行：

```bash
cd apps/web
pnpm test:cucumber
```

当前 Hooks 会在测试开始时检查 `3000` 和 `3100` 端口：

- 如果前后端服务已启动，则复用现有服务
- 如果未启动，则自动拉起本地前后端服务
- 测试结束后，会关闭由测试进程启动的服务

运行 `messaging.feature` 前，不要把“端口上正好有服务”视为充分条件；应确认当前本地前后端实例已经加载 `E2E_BOT_MODE`、`JUHEXBOT_CLIENT_GUID` 和最新 reset/seed 后的数据。

## 常用命令

在 `apps/web` 目录下执行：

| 命令 | 说明 |
|------|------|
| `pnpm test:cucumber` | 运行全部 E2E 测试 |
| `pnpm test:cucumber:parallel` | 并发执行（当前脚本传入 `--parallel 4`） |
| `pnpm test:cucumber:smoke` | 运行 `@smoke` 标签场景 |
| `pnpm test:cucumber:debug` | 关闭无头模式，便于观察执行过程 |

也可以直接指定 feature 或标签：

```bash
cd apps/web
pnpm test:cucumber tests/features/auth.feature
pnpm test:cucumber tests/features/messaging.feature
pnpm test:cucumber --tags "@smoke"
```

## 当前目录结构

以 `docs/e2e-testing-spec.md` 为准，当前仓库中的相关目录如下：

```text
apps/web/
├── cucumber.cjs
├── tests/
│   ├── features/
│   ├── hooks/
│   ├── pages/
│   ├── steps/
│   └── support/
├── reports/
│   ├── cucumber-report.html
│   ├── cucumber-report.json
│   └── screenshots/
└── e2e/                  # 旧版 Playwright 直测，待迁移/清理
```

## 报告与调试

- HTML 报告：`apps/web/reports/cucumber-report.html`
- JSON 报告：`apps/web/reports/cucumber-report.json`
- 失败截图：`apps/web/reports/screenshots/`

当前 Hooks 实现包含以下行为：

- `BeforeAll`：准备报告目录，必要时自动启动前后端服务
- `Before`：为每个场景初始化浏览器上下文
- `After`：失败时截图，并回收浏览器资源
- `AfterAll`：关闭测试期间拉起的服务进程

## 常见问题

### 1. 端口被占用

如果 `3000` 或 `3100` 被其他进程占用，测试可能会连接到错误服务实例。

```bash
lsof -i :3000
lsof -i :3100
```

确认目标进程后再决定是否停止。

### 2. 数据库未初始化或数据不符合预期

先确认：

- `apps/server/.env` 中的 `DATABASE_URL` 是否正确
- `apps/server/data/morechat.db` 是否存在
- 是否已执行 `npx prisma migrate dev`
- 对消息场景是否已执行 `pnpm exec tsx scripts/reset-e2e-messaging.ts`
- 对消息场景是否已执行 `pnpm exec tsx scripts/seed-test-data.ts --scenario messaging`

### 3. Playwright 浏览器未安装

```bash
cd apps/web
npx playwright install chromium
```

### 4. 测试运行方式混淆

如果你看到 `pnpm test:e2e`、`playwright.config.ts` 或 `apps/web/e2e/*.spec.ts` 的描述，那是旧资料或遗留文件。当前主流程以 `pnpm test:cucumber`、`apps/web/cucumber.cjs` 和 `apps/web/tests/` 为准。

### 5. 服务启动超时

当前 Hooks 会等待本地前后端服务就绪；如果启动较慢，优先排查：

- `apps/server` 是否能正常启动
- `apps/web` 是否能正常启动
- `http://localhost:3100/health` 是否可访问
- 是否存在本地环境变量导致服务卡住

### 6. 消息链路场景连到错误环境

如果 `messaging.feature` 没有看到 `E2E Messaging Peer` 会话，优先排查：

- `apps/server/.env` 是否启用了 `E2E_BOT_MODE=true`
- `JUHEXBOT_CLIENT_GUID` 是否为 `guid-e2e-messaging`
- 是否刚执行过 reset/seed 命令
- `WEBHOOK_URL`、`CORS_ORIGIN` 是否仍指向本机
- 当前 `3100` 端口是否是你预期的本地 server，而不是另一个残留实例

## 文档边界

- 规范、目录约定、Step / Page Object / Hooks 编写要求：见 `docs/e2e-testing-spec.md`
- 当前覆盖范围、遗留问题、后续待办：见 `docs/e2e-test-plan.md`
