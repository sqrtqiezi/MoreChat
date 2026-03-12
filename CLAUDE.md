# CLAUDE.md

本文件用于指导 Claude Code 在本仓库中进行开发。

---

## 语言

使用中文交流。

---

## 常用命令

```bash
pnpm install       # 安装依赖
pnpm dev           # 启动开发（前端 :3000 + 后端 :3100）
pnpm build         # 构建
pnpm lint          # 代码检查
pnpm type-check    # 类型检查
```

---

## 测试

后端测试使用 Vitest：

```bash
cd apps/server
npx vitest run                                # 运行全部
npx vitest run src/services/database.test.ts  # 运行单个文件
```

- 单元测试：mock 依赖服务
- 集成测试：需要 Prisma + SQLite

---

## 架构概览

Monorepo（Turborepo + pnpm workspace）

| 目录 | 技术栈 |
|------|--------|
| `apps/server` | Hono + Prisma + SQLite |
| `apps/web` | React + Vite + TanStack Query |
| `packages/types` | 共享 TypeScript 类型 |

---

## 消息存储架构

双层存储：

| 层 | 存储 | 说明 |
|----|------|------|
| MessageIndex | SQLite (Prisma) | 消息元数据索引，含 `dataLakeKey` 指针 |
| DataLake | 文件系统 JSON | 完整原始消息 |

DataLake 路径格式：`conversations/{id}/messages/{timestamp}_{msgId}.json`

消息类型：1=文本, 3=图片, 49=应用/链接/文件, 51=通话, 10002=撤回。非文本消息的 `content` 字段是 XML。

---

## API 约定

| 位置 | 命名风格 |
|------|----------|
| 后端 / DataLake | snake_case |
| 前端 / API 返回 | camelCase |

转换位置：`apps/web/src/api/chatApi.ts`

---

## 数据库

Prisma schema 是数据库结构唯一来源。

```bash
cd apps/server
npx prisma migrate dev   # 创建/应用迁移
npx prisma generate      # 重新生成 Prisma Client
npx prisma studio        # 数据库 GUI
```

禁止直接修改数据库。

---

## 外部接口开发规则

涉及 juhexbot 等外部接口的新功能开发：

1. 必须先通过日志或调试记录 webhook 原始 payload
2. 确认真实字段结构后再进行代码设计
3. 禁止假设字段名和数据格式

---

## 重要约定

- 所有改动必须保证测试通过
- DataLake 使用 snake_case，API 返回 camelCase
- 服务依赖注入：`index.ts` 手动组装，构造函数注入
- 环境变量配置在 `apps/server/.env`，必填项见 `apps/server/src/lib/env.ts`
- 任何关于 juhexbot 接口的新功能开发，*必须* 验证数据格式后再进行设计
- 如果需要登录服务器查看日志的话，可以尝试使用 `ssh diting-server` 命令登录
- 如果需要去服务器登录检查内容，首先需要去 .github 确认部署的配置