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

脚本最后会打印当前正确的测试入口：`cd apps/web && pnpm test:cucumber`。

### 2. 准备服务端环境

确认 `apps/server/.env` 满足当前服务端真实启动要求。`apps/server/src/lib/env.ts` 目前除了数据库和认证外，还要求基础存储配置，例如 `DATA_LAKE_TYPE` 和 `ALICLOUD_OSS_*` 这些键；不要把下面的片段理解为完整可启动配置。

最少应对照 `apps/server/.env.example` 或当前 `env.ts` 的必填项补齐完整配置。下面只列出与本地 E2E 最直接相关的一部分示例：

```bash
DATABASE_URL="file:../data/morechat.db"
DATA_LAKE_TYPE="filesystem"
DATA_LAKE_PATH="./data/lake"
PORT=3100
NODE_ENV="development"
AUTH_PASSWORD_HASH="$2b$10$xhaDIjVx7SyJJlulTxfLvuiqdo5cOeJqLvZlDJdwiQgjCVOgqNuh."
AUTH_JWT_SECRET="dev-jwt-secret-change-in-production"
ALICLOUD_OSS_REGION="local"
ALICLOUD_OSS_BUCKET="local"
ALICLOUD_OSS_ACCESS_KEY_ID="local"
ALICLOUD_OSS_ACCESS_KEY_SECRET="local"
ALICLOUD_OSS_ENDPOINT="http://localhost"
EMBEDDING_ENABLED=false
```

如果不是消息专用 E2E Bot 模式，服务端启动还会继续要求 `JUHEXBOT_API_URL`、`JUHEXBOT_APP_KEY`、`JUHEXBOT_APP_SECRET`、`JUHEXBOT_CLIENT_GUID`、`JUHEXBOT_CLOUD_API_URL` 等 Bot 配置。

正常运行 `@messaging-e2e` 场景时，不需要手动在 `.env` 中写入消息专用测试变量；Hooks 会在启动自管 runtime 时自动注入：

```bash
E2E_BOT_MODE=true
JUHEXBOT_CLIENT_GUID="guid-e2e-messaging"
WEBHOOK_URL="http://localhost:3100/webhook"
```

说明：

- `E2E_BOT_MODE=true` 会让服务端改用离线 Bot 适配器，避免访问真实 juhexbot 网络。
- `JUHEXBOT_CLIENT_GUID` 必须与 seed 数据中的客户端 GUID 对齐；当前消息场景使用 `guid-e2e-messaging`。
- `WEBHOOK_URL` 与 `CORS_ORIGIN` 在 E2E Bot 模式下都必须指向本机地址。
- 这些值主要用于理解消息场景运行时边界，或在手动调试 server 脚本时复现 hook 行为。

如果数据库尚未初始化，先执行迁移：

```bash
cd apps/server
npx prisma migrate dev
```

### 3. 消息场景的自动准备行为

带有 `@messaging-e2e` 标签的场景会在每个 scenario 开始前由 Hooks 自动完成以下准备：

- 拒绝复用未知的 `3000` / `3100` 监听进程
- 要求这两个端口为空；如果被外部进程占用，消息场景会直接中止
- 在空端口上启动由 Hooks 自己持有的前后端 runtime
- 为后端注入 `E2E_BOT_MODE`、`JUHEXBOT_CLIENT_GUID`、`WEBHOOK_URL` 等消息专用环境变量
- 自动执行 reset/seed，确保每个消息 scenario 都有固定会话和初始消息

自动 reset/seed 使用的命令是：

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

只有在需要手动排查、脱离 Hooks 单独复现服务端状态时，才需要把这两条命令当作人工操作步骤。

### 4. 运行测试

推荐直接从 `apps/web` 执行：

```bash
cd apps/web
pnpm test:cucumber
```

当前 Hooks 对运行时的处理分两类：

- 非 messaging 场景：如果 `3000` 和 `3100` 上已有本地服务，Hooks 可以复用；如果没有，则自动拉起本地前后端服务。
- `@messaging-e2e` 场景：Hooks 不会复用未知监听进程。`3000` 和 `3100` 必须为空，否则测试直接失败；端口空闲后，Hooks 才会启动自管 runtime 并注入消息专用环境变量。
- 测试结束后，会关闭由测试进程启动并持有的服务。

运行 `messaging.feature` 时，不要预先启动未知的本地前后端实例占用 `3000` / `3100`；应让 Hooks 自己启动并持有这组消息测试 runtime。

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

- `BeforeAll`：只准备报告目录
- `Before`（`@messaging-e2e`）：启动 hook-owned messaging runtime，并自动执行 reset/seed
- `Before`（非 messaging）：按需复用或拉起通用前后端 runtime
- `Before`（所有场景）：初始化浏览器上下文
- `After`：失败时截图，并回收浏览器资源
- `AfterAll`：关闭测试期间拉起的服务进程

## 常见问题

### 1. 端口被占用

如果 `3000` 或 `3100` 被其他进程占用：

- 对非 messaging 场景，测试可能会复用该实例。
- 对 `@messaging-e2e` 场景，Hooks 会拒绝复用未知监听进程并直接报错。

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
- 如果你是绕过 Hooks 手动调试消息链路，是否已执行 reset/seed 命令

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

- 运行前 `3000` / `3100` 是否已被外部进程占用
- 是否让 Hooks 接管了消息 runtime，而不是手动预启动另一套前后端
- 如果是手动调试模式，是否注入了 `E2E_BOT_MODE=true`
- 如果是手动调试模式，`JUHEXBOT_CLIENT_GUID` 是否为 `guid-e2e-messaging`
- 如果是手动调试模式，是否刚执行过 reset/seed 命令

## 文档边界

- 规范、目录约定、Step / Page Object / Hooks 编写要求：见 `docs/e2e-testing-spec.md`
- 当前覆盖范围、遗留问题、后续待办：见 `docs/e2e-test-plan.md`
