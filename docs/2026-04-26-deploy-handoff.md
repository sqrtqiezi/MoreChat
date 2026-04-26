# 2026-04-26 Deploy Handoff

## 背景

本次处理目标是修复 `main` 分支 push 后 GitHub Actions `Deploy to VPS` 持续失败的问题，并将部署恢复到成功状态。

最终成功的 workflow:

- Run: `24927728645`
- Job: `73000400586`
- Workflow: `Deploy to VPS`

## 结果概览

本次修复覆盖了三类问题：

1. `apps/server` 的 TypeScript 构建错误，导致 CI 在构建阶段失败。
2. VPS 部署链路中的环境与数据漂移问题，包括 `onnxruntime-node`、`nodejieba`、Prisma 迁移历史漂移、PM2 状态和磁盘占用。
3. 服务启动阶段的运行时依赖问题，包括超大日志导致磁盘打满，以及 embedding 模型在线加载失败导致进程退出。

最终结果：

- CI 构建恢复正常
- VPS 自动部署恢复正常
- 服务在 embedding 不可用时可以降级启动，不再阻塞整个进程

## 提交清单

- `611d09e` `Fix server CI type errors`
- `0c0c1ca` `Fix entities route type inference in CI`
- `25d98e0` `Skip onnxruntime node download during deploy`
- `b002a1c` `Install build tools for native deploy deps`
- `87f3cdc` `Reconcile Prisma migration drift during deploy`
- `0c51057` `Recover failed Prisma migration state during deploy`
- `848154e` `Allow Prisma drift reconciliation during deploy`
- `4896558` `Rebuild missing knowledge tables during deploy recovery`
- `3d3e6ff` `Avoid heredoc parsing issues in deploy recovery`
- `90d1415` `Reduce deploy log pressure and recover startup`
- `c4aaeda` `Restart deploy target from a clean PM2 state`
- `da03778` `Degrade gracefully when embeddings are unavailable`

## 实际修改文件

- `.github/workflows/deploy.yml`
- `apps/server/src/index.ts`
- `apps/server/src/routes/entities.ts`
- `apps/server/src/services/duckdbService.ts`
- `apps/server/src/services/embeddingQueue.ts`
- `apps/server/src/services/embeddingService.ts`
- `apps/server/src/services/juhexbotAdapter.ts`
- `apps/server/src/services/knowledgeQueue.ts`
- `apps/server/src/services/message.ts`
- `apps/server/src/services/ruleEngine.test.ts`
- `apps/server/src/services/ruleEngine.ts`
- `apps/server/src/services/semanticImportanceService.ts`

## 按问题分组的修改内容

### 1. TypeScript / CI 构建修复

涉及文件：

- `apps/server/src/index.ts`
- `apps/server/src/routes/entities.ts`
- `apps/server/src/services/duckdbService.ts`
- `apps/server/src/services/embeddingQueue.ts`
- `apps/server/src/services/embeddingService.ts`
- `apps/server/src/services/knowledgeQueue.ts`
- `apps/server/src/services/message.ts`
- `apps/server/src/services/ruleEngine.ts`
- `apps/server/src/services/semanticImportanceService.ts`
- `apps/server/src/services/ruleEngine.test.ts`

主要修复：

- 修正多处 `pino` logger 调用签名，避免 `TS2769`
- 修正 `entities.ts` 中 `grouped.map(...)` 的隐式 `any`
- 规避 Prisma `createMany({ skipDuplicates: true })` 在当前 SQLite 配置下的类型问题
- 收紧少量严格类型错误和可空值问题

### 2. Deploy workflow 修复

涉及文件：

- `.github/workflows/deploy.yml`

主要修复：

- 为 VPS 安装生产依赖时注入 `ONNXRUNTIME_NODE_INSTALL="skip"`，避免 `onnxruntime-node` 在线下载失败
- 在缺少 `g++` 时自动安装原生编译工具，支撑 `nodejieba` fallback 编译
- 增加 Prisma 迁移恢复逻辑，处理 `20260424000000_add_knowledge_models` 在线上部分执行、失败记录残留、数据库漂移等情况
- 不再依赖 heredoc 执行恢复 SQL，改为临时文件方式，避免远端 shell 解析问题
- 在重启前清空 PM2 日志，缓解 `ENOSPC`
- 重启策略从 `restart` 改为 `pm2 delete morechat || true` 后重新 `start`，绕过脏 PM2 状态
- 健康检查改为重试轮询，而不是固定等待一次

### 3. 线上运行时稳定性修复

涉及文件：

- `apps/server/src/services/juhexbotAdapter.ts`
- `apps/server/src/services/embeddingService.ts`
- `apps/server/src/index.ts`

主要修复：

- 将 JuheXBot 请求/响应日志从整包输出改为摘要输出，避免把超大响应持续写入 PM2 日志
- `EmbeddingService.initialize()` 改为软失败；模型加载失败时记录错误但不抛出
- `index.ts` 中 embedding / semantic 相关组件改为按可用性启用
- 当 Hugging Face 模型在 VPS 上因联网超时无法下载时，服务仍可启动，只是禁用语义检索与语义重要性分析能力

## 关键故障链路回顾

本次 deploy 失败是逐层暴露的，不是单点问题：

1. 最初失败于 `apps/server` TypeScript 构建。
2. 构建通过后，VPS 上 `onnxruntime-node` `postinstall` 下载失败。
3. 之后暴露出 `nodejieba` 需要 `g++` 才能 fallback 编译。
4. 再之后暴露出线上 SQLite 与 Prisma migration history 漂移。
5. 迁移恢复后，服务启动时 JuheXBot 大日志写爆 PM2 日志，触发 `ENOSPC`。
6. 清理日志后，PM2 自身残留坏进程状态导致 `restart` 失败。
7. PM2 恢复后，embedding 模型在线加载超时，导致服务启动中断。
8. embedding 改为降级后，deploy 成功。

## 当前系统状态

当前线上状态可以认为是：

- 核心服务可正常部署
- SQLite / Prisma 当前状态已与线上环境 reconciled
- 搜索的关键词能力可用
- DuckDB 初始化可用
- embedding / semantic 能力在模型不可达时自动关闭，不再阻塞服务

## 剩余风险与后续建议

### 剩余风险

1. 线上 embedding 仍依赖远程模型下载。
2. HNSW 索引在持久化 DuckDB 上仍会打印 warning：
   `HNSW indexes can only be created in in-memory databases...`
3. 当前 `Deploy to VPS` 仍有若干 lint warning，但不阻塞部署。
4. `.github/workflows/deploy.yml` 中 Prisma 漂移恢复逻辑带有明显的线上历史兼容分支，后续如果 schema 再变化，需要重新审视。

### 建议后续动作

1. 将 embedding 模型改为随部署产物预置，或切换到显式关闭语义功能的生产配置。
2. 为语义功能增加环境开关，例如 `EMBEDDING_ENABLED=false`。
3. 处理 DuckDB HNSW persistence 配置，决定是启用实验持久化，还是在生产禁用该索引路径。
4. 整理并压缩 deploy workflow，把本次”救火兼容逻辑”抽成独立脚本，降低 YAML 复杂度。
5. 清理测试文件中的 lint warning，减少 CI 噪音。
6. 生产环境不再依赖 Hugging Face 在线下载 embedding 模型；部署阶段预置 `onnx-community/bge-small-zh-v1.5-ONNX` 到 `/opt/morechat/models/bge-small-zh-v1.5`。
7. 运行时必须优先使用 `EMBEDDING_MODEL_PATH`，并保留 `EMBEDDING_ENABLED=false` 的显式关闭能力。
8. 后续任何依赖远程模型/API 的功能都必须软失败，禁止阻塞主服务启动。

## 验证记录

本地执行通过：

- `pnpm --filter @morechat/server build`
- 早期修复阶段还执行过：
  - `pnpm --filter @morechat/server test -- run src/services/ruleEngine.test.ts`
  - `pnpm lint`
  - `pnpm build`

线上最终验证：

- GitHub Actions `Deploy to VPS` 成功
- Health check 通过

## 接手建议

如果后续需要继续收敛这次改动，优先顺序建议如下：

1. 将 `.github/workflows/deploy.yml` 中的迁移恢复逻辑提炼到独立 shell 脚本。
2. 给 embedding / semantic 功能补一个显式生产开关。
3. 重新梳理 `DatabaseService.pushSchema()` 与 Prisma migration 的职责边界，避免再次形成双轨 schema 管理。
