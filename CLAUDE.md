# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 语言

使用中文进行交流。

## 常用命令

```bash
pnpm install          # 安装依赖
pnpm dev              # 启动前端 (:3000) + 后端 (:3100) 开发服务器
pnpm build            # 全量构建
pnpm lint             # 代码检查
pnpm type-check       # 类型检查

# 后端测试 (Vitest)
cd apps/server
npx vitest run                                    # 运行所有测试
npx vitest run src/services/database.test.ts      # 运行单个测试文件
npx vitest run src/services/database.test.ts -t "test name"  # 运行单个测试

# 数据库
cd apps/server
npx prisma migrate dev      # 创建/应用迁移
npx prisma db push          # 推送 schema 到数据库（无迁移）
npx prisma studio           # 数据库 GUI
npx prisma generate         # 重新生成 Prisma Client
```

## 架构

Turborepo monorepo，pnpm workspace。

### apps/server — Hono + Prisma + SQLite

消息通过 juhexbot webhook (`POST /webhook`) 进入系统，经 `JuhexbotAdapter` 解析后由 `MessageService` 处理。

**双层存储架构：**
- **MessageIndex** (Prisma/SQLite)：消息元数据索引，含 `dataLakeKey` 指针
- **DataLake** (文件系统 JSON)：完整原始消息，路径格式 `conversations/{id}/messages/{timestamp}_{msgId}.json`

读取消息时 `ConversationService.getMessages()` 先查索引再从 DataLake 取原始数据，然后通过 `messageContentProcessor` 根据 `msgType` 解析 XML 内容生成 `displayType`/`displayContent`。

**服务依赖注入：** `index.ts` 手动组装所有服务，通过构造函数注入传给 `createApp()`。

**消息类型：** 1=文本, 3=图片, 49=应用/链接/文件, 51=通话, 10002=撤回。非文本消息的 `content` 字段是 XML。

### apps/web — React + Vite + TanStack Query

`chatApi.ts` 是 API 层，负责 snake_case→camelCase 转换和 `displayContent` 映射。`MessageItem` 根据 `displayType` 区分渲染样式。使用 `@tanstack/react-virtual` 做消息列表虚拟滚动。

### packages/

- `types/` — 共享 TypeScript 接口
- `utils/` — 工具函数（formatDate, generateId, truncateText）
- `ui/` — UI 组件库

## 关键约定
- *严禁* 测试与失败跟本次改动无关的话术，确保所有变更之后，所有的测试都是可以通过的
- 后端 DataLake 存储使用 snake_case 字段名，API 返回时转为 camelCase
- 后端测试使用 Vitest，mock 注入的服务依赖
- 集成测试需要数据库连接（Prisma），纯单元测试不需要
- 环境变量配置在 `apps/server/.env`，必填项见 `apps/server/src/lib/env.ts`
