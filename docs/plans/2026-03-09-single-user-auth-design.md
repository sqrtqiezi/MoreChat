# 单用户鉴权设计

## 概述

为 MoreChat 实现轻量级单用户鉴权，仅需密码登录，使用 JWT 维持会话。

## 设计决策

- **仅密码，无用户名** — 单用户场景，用户名没有意义
- **密码哈希存环境变量** — 不改数据库 schema，部署时配置一次
- **JWT 无状态会话** — 7 天过期，不需要服务端存储

## 环境变量

```
AUTH_PASSWORD_HASH=<bcrypt hash>   # 密码的 bcrypt 哈希值
AUTH_JWT_SECRET=<random string>     # JWT 签名密钥
```

## 登录流程

```
前端输入密码 → POST /api/auth/login { password }
                    ↓
         后端 bcrypt.compare(password, AUTH_PASSWORD_HASH)
                    ↓
         通过 → 签发 JWT (7天有效期), 返回 { token }
         失败 → 401 { error: "密码错误" }
                    ↓
         前端存 token 到 localStorage
         后续请求: Authorization: Bearer {token}
```

## 接口保护

- Hono JWT 中间件校验所有 `/api/*` 请求
- 白名单：`POST /api/auth/login`、`POST /webhook`
- token 无效/过期 → 401
- 前端已有 401 拦截逻辑，清除 token 并跳转登录页

## CLI 工具

`pnpm hash-password` — 输入明文密码，输出 bcrypt 哈希值，用于配置 `.env`。

## 改动范围

### 后端 (apps/server)
- 新增依赖：`bcryptjs`、`hono/jwt`（Hono 内置）
- 新增 `src/routes/auth.ts` — 登录路由
- 新增 `src/middleware/auth.ts` — JWT 校验中间件
- 修改 `src/app.ts` — 挂载中间件和路由
- 修改 `src/lib/env.ts` — 新增环境变量校验
- 新增 `scripts/hash-password.ts` — 密码哈希工具

### 前端 (apps/web)
- 修改 `src/stores/authStore.ts` — 调用真实登录接口
- 修改 `src/components/auth/LoginForm.tsx` — 去掉用户名字段
- 修改 `src/api/chat.ts` — 新增 login API 调用

### 配置
- 更新 `.env.example` 和 `.env` — 新增 AUTH_* 变量
