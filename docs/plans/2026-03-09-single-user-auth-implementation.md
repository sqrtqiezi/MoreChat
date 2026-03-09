# 单用户鉴权 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 MoreChat 实现基于密码 + JWT 的单用户鉴权系统。

**Architecture:** 密码 bcrypt 哈希存 `.env`，登录接口验证密码后签发 JWT（7天有效期），Hono 中间件校验所有 API 请求的 token，白名单放行 `/health`、`/webhook`、`/api/auth/login`。

**Tech Stack:** bcryptjs, hono/jwt (内置), vitest

---

### Task 1: 安装后端依赖

**Files:**
- Modify: `apps/server/package.json`

**Step 1: 安装 bcryptjs**

Run:
```bash
cd /Users/niujin/develop/MoreChat && pnpm --filter @morechat/server add bcryptjs && pnpm --filter @morechat/server add -D @types/bcryptjs
```

**Step 2: 确认依赖安装成功**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && pnpm list bcryptjs`
Expected: 显示 bcryptjs 版本

**Step 3: Commit**

```bash
cd /Users/niujin/develop/MoreChat && git add -A && git commit -m "chore: add bcryptjs dependency for auth"
```

---

### Task 2: 新增环境变量配置

**Files:**
- Modify: `apps/server/src/lib/env.ts`
- Modify: `apps/server/.env`
- Modify: `apps/server/.env.example`

**Step 1: 写 env.ts 的测试更新**

Modify `apps/server/src/lib/env.test.ts`，新增测试用例验证 `AUTH_PASSWORD_HASH` 和 `AUTH_JWT_SECRET` 是必需的：

```typescript
it('should throw if AUTH_PASSWORD_HASH is missing', () => {
  delete process.env.AUTH_PASSWORD_HASH
  expect(() => loadEnv()).toThrow('AUTH_PASSWORD_HASH is required')
})

it('should throw if AUTH_JWT_SECRET is missing', () => {
  delete process.env.AUTH_JWT_SECRET
  expect(() => loadEnv()).toThrow('AUTH_JWT_SECRET is required')
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && pnpm vitest run src/lib/env.test.ts`
Expected: FAIL — AUTH_PASSWORD_HASH 和 AUTH_JWT_SECRET 相关测试失败

**Step 3: 更新 env.ts**

修改 `apps/server/src/lib/env.ts`：

在 `EnvConfig` 接口中新增：
```typescript
AUTH_PASSWORD_HASH: string
AUTH_JWT_SECRET: string
```

在 `required` 数组中新增：
```typescript
'AUTH_PASSWORD_HASH',
'AUTH_JWT_SECRET'
```

在 `return` 对象中新增：
```typescript
AUTH_PASSWORD_HASH: process.env.AUTH_PASSWORD_HASH!,
AUTH_JWT_SECRET: process.env.AUTH_JWT_SECRET!,
```

**Step 4: 更新 .env 和 .env.example**

在 `apps/server/.env` 末尾追加：
```
# Auth
AUTH_PASSWORD_HASH="$2a$10$placeholder_hash_replace_me"
AUTH_JWT_SECRET="dev-jwt-secret-change-in-production"
```

在 `apps/server/.env.example` 末尾追加：
```
# Auth
AUTH_PASSWORD_HASH="<bcrypt hash of your password>"
AUTH_JWT_SECRET="<random string for JWT signing>"
```

**Step 5: 修复已有测试中的环境变量**

已有的 env.test.ts 测试需要在 `beforeEach` 中设置新的环境变量，否则会因缺少 AUTH_* 而失败。确保所有测试的 `process.env` mock 包含：
```typescript
process.env.AUTH_PASSWORD_HASH = '$2a$10$test_hash'
process.env.AUTH_JWT_SECRET = 'test-secret'
```

**Step 6: Run tests**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && pnpm vitest run src/lib/env.test.ts`
Expected: ALL PASS

**Step 7: Commit**

```bash
cd /Users/niujin/develop/MoreChat && git add -A && git commit -m "feat: add AUTH_PASSWORD_HASH and AUTH_JWT_SECRET env vars"
```

---

### Task 3: 实现登录路由

**Files:**
- Create: `apps/server/src/routes/auth.ts`
- Create: `apps/server/src/routes/auth.test.ts`

**Step 1: 写失败测试**

创建 `apps/server/src/routes/auth.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { authRoutes } from './auth'

// 真实密码 "test123" 的 bcrypt hash
const TEST_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'
const JWT_SECRET = 'test-jwt-secret'

describe('auth routes', () => {
  let app: Hono

  beforeEach(() => {
    app = new Hono()
    app.route('/api/auth', authRoutes({
      passwordHash: TEST_HASH,
      jwtSecret: JWT_SECRET,
    }))
  })

  describe('POST /api/auth/login', () => {
    it('should return token on correct password', async () => {
      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'test123' }),
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.data.token).toBeDefined()
      expect(typeof body.data.token).toBe('string')
    })

    it('should return 401 on wrong password', async () => {
      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'wrong' }),
      })
      const body = await res.json()

      expect(res.status).toBe(401)
      expect(body.success).toBe(false)
    })

    it('should return 400 if password is missing', async () => {
      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(400)
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && pnpm vitest run src/routes/auth.test.ts`
Expected: FAIL — module './auth' not found

**Step 3: 实现登录路由**

创建 `apps/server/src/routes/auth.ts`：

```typescript
import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { sign } from 'hono/jwt'

interface AuthDeps {
  passwordHash: string
  jwtSecret: string
}

export function authRoutes(deps: AuthDeps) {
  const router = new Hono()

  router.post('/login', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const { password } = body

    if (!password || typeof password !== 'string') {
      return c.json({ success: false, error: { message: '密码不能为空' } }, 400)
    }

    const valid = await bcrypt.compare(password, deps.passwordHash)
    if (!valid) {
      return c.json({ success: false, error: { message: '密码错误' } }, 401)
    }

    const now = Math.floor(Date.now() / 1000)
    const token = await sign(
      { iat: now, exp: now + 7 * 24 * 60 * 60 },
      deps.jwtSecret
    )

    return c.json({ success: true, data: { token } })
  })

  return router
}
```

**Step 4: Run tests**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && pnpm vitest run src/routes/auth.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
cd /Users/niujin/develop/MoreChat && git add -A && git commit -m "feat: implement login route with bcrypt + JWT"
```

---

### Task 4: 实现 JWT 鉴权中间件

**Files:**
- Create: `apps/server/src/middleware/auth.ts`
- Create: `apps/server/src/middleware/auth.test.ts`

**Step 1: 写失败测试**

创建 `apps/server/src/middleware/auth.test.ts`：

```typescript
import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { sign } from 'hono/jwt'
import { authMiddleware } from './auth'

const JWT_SECRET = 'test-jwt-secret'

describe('auth middleware', () => {
  let app: Hono

  beforeEach(() => {
    app = new Hono()
    app.use('/api/*', authMiddleware(JWT_SECRET))
    app.get('/api/test', (c) => c.json({ ok: true }))
    app.get('/health', (c) => c.json({ ok: true }))
  })

  it('should reject requests without token', async () => {
    const res = await app.request('/api/test')
    expect(res.status).toBe(401)
  })

  it('should reject requests with invalid token', async () => {
    const res = await app.request('/api/test', {
      headers: { Authorization: 'Bearer invalid-token' },
    })
    expect(res.status).toBe(401)
  })

  it('should accept requests with valid token', async () => {
    const now = Math.floor(Date.now() / 1000)
    const token = await sign({ iat: now, exp: now + 3600 }, JWT_SECRET)

    const res = await app.request('/api/test', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
  })

  it('should reject expired tokens', async () => {
    const now = Math.floor(Date.now() / 1000)
    const token = await sign({ iat: now - 7200, exp: now - 3600 }, JWT_SECRET)

    const res = await app.request('/api/test', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(401)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && pnpm vitest run src/middleware/auth.test.ts`
Expected: FAIL — module './auth' not found

**Step 3: 实现中间件**

创建 `apps/server/src/middleware/auth.ts`：

```typescript
import { jwt } from 'hono/jwt'
import type { MiddlewareHandler } from 'hono'

export function authMiddleware(secret: string): MiddlewareHandler {
  return jwt({ secret })
}
```

**Step 4: Run tests**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && pnpm vitest run src/middleware/auth.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
cd /Users/niujin/develop/MoreChat && git add -A && git commit -m "feat: implement JWT auth middleware"
```

---

### Task 5: 集成中间件和路由到 app.ts

**Files:**
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/app.test.ts`

**Step 1: 更新 app.test.ts**

在已有测试中新增鉴权相关测试：

```typescript
import { sign } from 'hono/jwt'

// 在 deps 中新增 auth 配置
const TEST_JWT_SECRET = 'test-jwt-secret'
const TEST_PASSWORD_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'

// 辅助函数：生成有效 token
async function validToken() {
  const now = Math.floor(Date.now() / 1000)
  return sign({ iat: now, exp: now + 3600 }, TEST_JWT_SECRET)
}
```

更新 `beforeEach` 中的 deps，新增：
```typescript
auth: {
  passwordHash: TEST_PASSWORD_HASH,
  jwtSecret: TEST_JWT_SECRET,
}
```

新增测试用例：
```typescript
it('should allow login without token', async () => {
  const app = createApp(deps)
  const res = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'test123' }),
  })
  expect(res.status).toBe(200)
})

it('should reject API requests without token', async () => {
  const app = createApp(deps)
  const res = await app.request('/api/client/status')
  expect(res.status).toBe(401)
})

it('should allow API requests with valid token', async () => {
  vi.mocked(deps.clientService.getStatus).mockResolvedValue({
    online: true, guid: 'test_guid'
  })

  const app = createApp(deps)
  const token = await validToken()
  const res = await app.request('/api/client/status', {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.status).toBe(200)
})

it('should allow health check without token', async () => {
  const app = createApp(deps)
  const res = await app.request('/health')
  expect(res.status).toBe(200)
})

it('should allow webhook without token', async () => {
  vi.mocked(deps.juhexbotAdapter.parseWebhookPayload).mockReturnValue({} as any)
  vi.mocked(deps.messageService.handleIncomingMessage).mockResolvedValue()

  const app = createApp(deps)
  const res = await app.request('/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'message' }),
  })
  expect(res.status).toBe(200)
})
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && pnpm vitest run src/app.test.ts`
Expected: FAIL — auth 相关测试失败

**Step 3: 更新 app.ts**

修改 `apps/server/src/app.ts`：

```typescript
import { Hono } from 'hono'
import { clientRoutes } from './routes/client'
import { conversationRoutes } from './routes/conversations'
import { messageRoutes } from './routes/messages'
import { authRoutes } from './routes/auth'
import { authMiddleware } from './middleware/auth'
import type { ClientService } from './services/clientService'
import type { ConversationService } from './services/conversationService'
import type { MessageService } from './services/message'
import type { JuhexbotAdapter } from './services/juhexbotAdapter'
import type { WebSocketService } from './services/websocket'

export interface AppDependencies {
  clientService: ClientService
  conversationService: ConversationService
  messageService: MessageService
  juhexbotAdapter: JuhexbotAdapter
  wsService: WebSocketService
  clientGuid: string
  auth: {
    passwordHash: string
    jwtSecret: string
  }
}

export function createApp(deps: AppDependencies) {
  const app = new Hono()

  // Health check (no auth)
  app.get('/health', (c) => {
    return c.json({ status: 'ok', timestamp: Date.now() })
  })

  // Webhook (no auth)
  app.post('/webhook', async (c) => {
    try {
      const payload = await c.req.json()
      const parsed = deps.juhexbotAdapter.parseWebhookPayload(payload)
      await deps.messageService.handleIncomingMessage(parsed)
      return c.json({ success: true })
    } catch (error) {
      console.error('Webhook error:', error)
      return c.json({ success: false, error: 'Internal error' }, 500)
    }
  })

  // Auth routes (no auth required)
  app.route('/api/auth', authRoutes({
    passwordHash: deps.auth.passwordHash,
    jwtSecret: deps.auth.jwtSecret,
  }))

  // JWT middleware for all /api/* routes (after auth routes)
  app.use('/api/*', authMiddleware(deps.auth.jwtSecret))

  // Protected routes
  app.route('/api/client', clientRoutes({ clientService: deps.clientService }))
  app.route('/api/conversations', conversationRoutes({
    conversationService: deps.conversationService,
    clientGuid: deps.clientGuid
  }))
  app.route('/api/messages', messageRoutes({ messageService: deps.messageService }))

  return app
}
```

**Step 4: Run tests**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && pnpm vitest run src/app.test.ts`
Expected: ALL PASS

**Step 5: 更新 index.ts 传入 auth 配置**

修改 `apps/server/src/index.ts`，在 `createApp` 调用中新增 auth 参数：
```typescript
auth: {
  passwordHash: env.AUTH_PASSWORD_HASH,
  jwtSecret: env.AUTH_JWT_SECRET,
}
```

**Step 6: 修复其他路由测试**

已有的路由测试（`client.test.ts`, `conversations.test.ts`, `messages.test.ts`）直接测试子路由，不经过中间件，所以不需要修改。但 `integration.test.ts` 如果通过 `createApp` 发请求，需要在请求中带上有效 token。检查并修复。

**Step 7: Run all tests**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && pnpm vitest run`
Expected: ALL PASS

**Step 8: Commit**

```bash
cd /Users/niujin/develop/MoreChat && git add -A && git commit -m "feat: integrate auth middleware and routes into app"
```

---

### Task 6: 密码哈希 CLI 工具

**Files:**
- Create: `apps/server/scripts/hash-password.ts`
- Modify: `apps/server/package.json`

**Step 1: 创建脚本**

创建 `apps/server/scripts/hash-password.ts`：

```typescript
import bcrypt from 'bcryptjs'
import { createInterface } from 'readline'

const rl = createInterface({ input: process.stdin, output: process.stdout })

rl.question('请输入密码: ', async (password) => {
  if (!password.trim()) {
    console.error('密码不能为空')
    process.exit(1)
  }
  const hash = await bcrypt.hash(password, 10)
  console.log(`\n将以下值设置到 .env 的 AUTH_PASSWORD_HASH:\n`)
  console.log(`AUTH_PASSWORD_HASH="${hash}"`)
  rl.close()
})
```

**Step 2: 在 package.json 中添加脚本**

在 `apps/server/package.json` 的 `scripts` 中新增：
```json
"hash-password": "tsx scripts/hash-password.ts"
```

**Step 3: 测试脚本运行**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && echo "test123" | pnpm hash-password`
Expected: 输出 bcrypt 哈希值

**Step 4: 用生成的哈希更新 .env**

用脚本输出的哈希值替换 `.env` 中的 `AUTH_PASSWORD_HASH` 占位符。

**Step 5: Commit**

```bash
cd /Users/niujin/develop/MoreChat && git add -A && git commit -m "feat: add hash-password CLI tool"
```

---

### Task 7: 前端 — 新增 auth API

**Files:**
- Modify: `apps/web/src/api/chat.ts`

**Step 1: 在 chat.ts 中新增 authApi**

在 `apps/web/src/api/chat.ts` 顶部新增：

```typescript
// Auth API
export const authApi = {
  async login(password: string): Promise<string> {
    const response = await client.post<ApiResponse<{ token: string }>>(
      '/auth/login',
      { password }
    )
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error?.message || '登录失败')
    }
    return response.data.data.token
  },
}
```

**Step 2: Commit**

```bash
cd /Users/niujin/develop/MoreChat && git add -A && git commit -m "feat: add auth API client"
```

---

### Task 8: 前端 — 更新 authStore

**Files:**
- Modify: `apps/web/src/stores/authStore.ts`
- Modify: `apps/web/src/types/index.ts`

**Step 1: 更新 types**

修改 `apps/web/src/types/index.ts`，删除 `User` 接口（不再需要用户名）。

**Step 2: 更新 authStore**

重写 `apps/web/src/stores/authStore.ts`：

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { authApi } from '../api/chat'

interface AuthState {
  isAuthenticated: boolean
  login: (password: string) => Promise<void>
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      login: async (password: string) => {
        const token = await authApi.login(password)
        localStorage.setItem('auth_token', token)
        set({ isAuthenticated: true })
      },
      logout: () => {
        localStorage.removeItem('auth_token')
        set({ isAuthenticated: false })
      },
    }),
    {
      name: 'auth-storage',
    }
  )
)
```

**Step 3: 检查 User 类型的其他引用**

搜索项目中所有引用 `User` 类型或 `user` 属性的地方，确保都已更新。主要检查：
- `authStore.ts` 中不再有 `user` 属性
- 其他组件如果引用了 `user.username`，需要移除

**Step 4: Commit**

```bash
cd /Users/niujin/develop/MoreChat && git add -A && git commit -m "feat: update authStore to use real login API"
```

---

### Task 9: 前端 — 更新 LoginForm

**Files:**
- Modify: `apps/web/src/components/auth/LoginForm.tsx`

**Step 1: 重写 LoginForm**

去掉用户名字段，只保留密码：

```tsx
import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@morechat/ui'
import { useAuthStore } from '../../stores/authStore'

export function LoginForm() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const login = useAuthStore((state) => state.login)
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (!password.trim()) {
      setError('密码不能为空')
      return
    }

    setIsLoading(true)
    try {
      await login(password)
      navigate('/chat')
    } catch {
      setError('密码错误')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
          密码
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isLoading}
          autoFocus
        />
      </div>

      {error && (
        <div role="alert" className="text-red-600 text-sm">
          {error}
        </div>
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="w-full"
        disabled={isLoading}
      >
        {isLoading ? '登录中...' : '登录'}
      </Button>
    </form>
  )
}
```

**Step 2: Commit**

```bash
cd /Users/niujin/develop/MoreChat && git add -A && git commit -m "feat: simplify LoginForm to password-only"
```

---

### Task 10: 更新 .env.example 文件和根目录配置

**Files:**
- Modify: `/.env.example`

**Step 1: 更新根目录 .env.example**

在根目录 `.env.example` 中追加：
```
# Auth
AUTH_PASSWORD_HASH="<run 'pnpm --filter @morechat/server hash-password' to generate>"
AUTH_JWT_SECRET="<random string>"
```

**Step 2: Commit**

```bash
cd /Users/niujin/develop/MoreChat && git add -A && git commit -m "docs: update env examples with auth vars"
```

---

### Task 11: 端到端验证

**Step 1: 运行所有后端测试**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && pnpm vitest run`
Expected: ALL PASS

**Step 2: 类型检查**

Run: `cd /Users/niujin/develop/MoreChat && pnpm type-check`
Expected: 无错误

**Step 3: 生成真实密码哈希并更新 .env**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && echo "your-password" | pnpm hash-password`
用输出的哈希值更新 `.env`

**Step 4: 手动测试（提示用户）**

提示用户手动启动 dev server 测试：
1. `pnpm dev`
2. 访问登录页，输入错误密码 → 应显示"密码错误"
3. 输入正确密码 → 应跳转到 /chat
4. 刷新页面 → 应保持登录状态
5. 清除 localStorage → 应跳转回登录页

**Step 5: Final commit**

```bash
cd /Users/niujin/develop/MoreChat && git add -A && git commit -m "feat: complete single-user auth implementation"
```
