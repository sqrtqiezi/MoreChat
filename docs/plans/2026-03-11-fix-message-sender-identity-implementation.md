# 修复消息发送者身份识别 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复消息发送者身份识别，让自己发的消息正确显示在右侧

**Architecture:** 服务启动时调用 juhexbot `/user/get_profile` API 获取登录用户的微信用户名（`njin_cool`），存储到 config 和数据库。后端使用 `clientUsername` 替代 UUID 进行消息方向判断和存储。前端通过 `/api/me` 获取真实用户标识用于 `isMine` 判断。

**Tech Stack:** Hono, Prisma, juhexbot API, React, TanStack Query

---

### Task 1: JuhexbotAdapter 新增 getProfile() 方法

**Files:**
- Modify: `apps/server/src/services/juhexbotAdapter.ts:8-8` (添加接口)
- Modify: `apps/server/src/services/juhexbotAdapter.ts:230-230` (添加方法)
- Test: `apps/server/src/services/juhexbotAdapter.test.ts:319-319`

**Step 1: 写失败测试**

在 `apps/server/src/services/juhexbotAdapter.test.ts` 文件末尾添加：

```typescript
  describe('getProfile', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should return user profile with username and nickname', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          baseResponse: { ret: 0 },
          userInfo: {
            userName: { string: 'njin_cool' },
            nickName: { string: '牛晋' },
            smallHeadImgUrl: 'https://wx.qlogo.cn/test.jpg',
          }
        })
      })

      const result = await adapter.getProfile()
      expect(result).toEqual({
        username: 'njin_cool',
        nickname: '牛晋',
        avatar: 'https://wx.qlogo.cn/test.jpg',
      })
    })

    it('should throw error when API fails', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          baseResponse: { ret: 1001 },
          errMsg: 'Failed to get profile'
        })
      })

      await expect(adapter.getProfile()).rejects.toThrow('Failed to get profile')
    })
  })
```

**Step 2: 运行测试验证失败**

```bash
cd apps/server
npx vitest run src/services/juhexbotAdapter.test.ts -t "getProfile"
```

Expected: FAIL with "adapter.getProfile is not a function"

**Step 3: 添加 UserProfile 接口**

在 `apps/server/src/services/juhexbotAdapter.ts` 第 8 行后添加：

```typescript
export interface UserProfile {
  username: string
  nickname: string
  avatar?: string
}
```

**Step 4: 实现 getProfile() 方法**

在 `apps/server/src/services/juhexbotAdapter.ts` 文件末尾（第 230 行后）添加：

```typescript
  async getProfile(): Promise<UserProfile> {
    const result = await this.sendRequest('/user/get_profile', {
      guid: this.config.clientGuid
    })

    if (result.errcode !== 0) {
      throw new Error(result.errmsg || 'Failed to get profile')
    }

    const userInfo = result.data.userInfo || result.data
    return {
      username: userInfo.userName?.string || userInfo.username || '',
      nickname: userInfo.nickName?.string || userInfo.nickname || '',
      avatar: userInfo.smallHeadImgUrl || userInfo.bigHeadImgUrl || userInfo.avatar || undefined,
    }
  }
```

**Step 5: 运行测试验证通过**

```bash
npx vitest run src/services/juhexbotAdapter.test.ts -t "getProfile"
```

Expected: PASS (2 tests)

**Step 6: 提交**

```bash
git add src/services/juhexbotAdapter.ts src/services/juhexbotAdapter.test.ts
git commit -m "feat: JuhexbotAdapter 新增 getProfile() 方法

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: JuhexbotConfig 添加 clientUsername 字段

**Files:**
- Modify: `apps/server/src/services/juhexbotAdapter.ts:3-8`
- Modify: `apps/server/src/services/juhexbotAdapter.ts:90-93`

**Step 1: 修改 JuhexbotConfig 接口**

在 `apps/server/src/services/juhexbotAdapter.ts` 修改接口定义：

```typescript
export interface JuhexbotConfig {
  apiUrl: string
  appKey: string
  appSecret: string
  clientGuid: string
  clientUsername?: string  // 新增：登录用户的微信用户名
}
```

**Step 2: 修改 getConversationId() 使用 clientUsername**

在 `apps/server/src/services/juhexbotAdapter.ts` 修改 `getConversationId()` 方法（第 85-94 行）：

```typescript
  getConversationId(parsed: ParsedWebhookPayload): string {
    if (parsed.message.isChatroomMsg) {
      return parsed.message.chatroom
    }
    // 私聊：取对方的 username
    // 优先用 clientUsername，fallback 到 clientGuid（向后兼容）
    const selfIdentifier = this.config.clientUsername || this.config.clientGuid
    if (parsed.message.fromUsername === selfIdentifier) {
      return parsed.message.toUsername
    }
    return parsed.message.fromUsername
  }
```

**Step 3: 运行现有测试确保不破坏**

```bash
npx vitest run src/services/juhexbotAdapter.test.ts
```

Expected: PASS (所有测试通过)

**Step 4: 提交**

```bash
git add src/services/juhexbotAdapter.ts
git commit -m "feat: JuhexbotConfig 添加 clientUsername 字段并用于会话 ID 判断

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: MessageService 使用 clientUsername 作为 from_username

**Files:**
- Modify: `apps/server/src/services/message.ts:25-30`
- Modify: `apps/server/src/services/message.ts:196-251`

**Step 1: MessageService 构造函数添加 clientUsername 参数**

在 `apps/server/src/services/message.ts` 修改构造函数（第 25-30 行）：

```typescript
export class MessageService {
  constructor(
    private db: DatabaseService,
    private dataLake: DataLakeService,
    private adapter: JuhexbotAdapter,
    private clientUsername: string
  ) {}
```

**Step 2: 修改 sendMessage() 填充真实 from_username**

在 `apps/server/src/services/message.ts` 修改 `sendMessage()` 方法（第 218-232 行）：

```typescript
    // 4. 保存到 DataLake
    const createTime = Math.floor(Date.now() / 1000)
    const chatMessage: ChatMessage = {
      msg_id: msgId,
      from_username: this.clientUsername,  // 修改：使用真实用户名
      to_username: toUsername,
      content,
      create_time: createTime,
      msg_type: 1,
      chatroom_sender: '',
      desc: '',
      is_chatroom_msg: conversation.type === 'group' ? 1 : 0,
      chatroom: conversation.type === 'group' ? toUsername : '',
      source: ''
    }
```

**Step 3: 修改 createMessageIndex 调用**

在 `apps/server/src/services/message.ts` 修改第 237-245 行：

```typescript
    // 5. 创建消息索引
    await this.db.createMessageIndex({
      conversationId,
      msgId,
      msgType: 1,
      fromUsername: this.clientUsername,  // 修改：使用真实用户名
      toUsername,
      createTime,
      dataLakeKey
    })
```

**Step 4: 更新测试 mock**

在 `apps/server/src/services/message.test.ts` 修改第 38 行：

```typescript
    messageService = new MessageService(db, dataLake, adapter, 'test-guid-123')
```

**Step 5: 运行测试**

```bash
npx vitest run src/services/message.test.ts
```

Expected: PASS (所有测试通过)

**Step 6: 提交**

```bash
git add src/services/message.ts src/services/message.test.ts
git commit -m "feat: MessageService 使用 clientUsername 作为发送消息的 from_username

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: index.ts 启动时获取 clientUsername

**Files:**
- Modify: `apps/server/src/index.ts:19-50`

**Step 1: 在服务启动时调用 getProfile()**

在 `apps/server/src/index.ts` 修改第 38-49 行：

```typescript
    const juhexbotAdapter = new JuhexbotAdapter({
      apiUrl: env.JUHEXBOT_API_URL,
      appKey: env.JUHEXBOT_APP_KEY,
      appSecret: env.JUHEXBOT_APP_SECRET,
      clientGuid: env.JUHEXBOT_CLIENT_GUID
    })

    // 获取登录用户信息
    logger.info('Fetching user profile...')
    const userProfile = await juhexbotAdapter.getProfile()
    logger.info({ username: userProfile.username, nickname: userProfile.nickname }, 'User profile fetched')

    // 更新 adapter config
    juhexbotAdapter['config'].clientUsername = userProfile.username

    // 2. 业务服务层
    const clientService = new ClientService(juhexbotAdapter)
    const conversationService = new ConversationService(databaseService, dataLakeService)
    const messageService = new MessageService(databaseService, dataLakeService, juhexbotAdapter, userProfile.username)
```

**Step 2: 手动测试启动**

```bash
cd apps/server
pnpm build
node dist/index.js
```

Expected: 日志输出 "User profile fetched" 并显示 username 和 nickname

**Step 3: 停止服务并提交**

```bash
# Ctrl+C 停止服务
git add src/index.ts
git commit -m "feat: 服务启动时获取并使用 clientUsername

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: 新增 /api/me 路由

**Files:**
- Create: `apps/server/src/routes/me.ts`
- Modify: `apps/server/src/app.ts:20-102`

**Step 1: 创建 me route 文件**

创建 `apps/server/src/routes/me.ts`：

```typescript
import { Hono } from 'hono'

export interface MeRouteDeps {
  username: string
  nickname: string
  avatar?: string
}

export function meRoutes(deps: MeRouteDeps) {
  const router = new Hono()

  // GET /api/me - 获取当前登录用户信息
  router.get('/', (c) => {
    return c.json({
      success: true,
      data: {
        username: deps.username,
        nickname: deps.nickname,
        avatar: deps.avatar
      }
    })
  })

  return router
}
```

**Step 2: 在 app.ts 中挂载 me route**

在 `apps/server/src/app.ts` 第 11 行后添加 import：

```typescript
import { meRoutes } from './routes/me.js'
```

在 `apps/server/src/app.ts` 修改 AppDependencies 接口（第 20-34 行）：

```typescript
export interface AppDependencies {
  clientService: ClientService
  conversationService: ConversationService
  messageService: MessageService
  contactSyncService: ContactSyncService
  juhexbotAdapter: JuhexbotAdapter
  wsService: WebSocketService
  clientGuid: string
  userProfile: {  // 新增
    username: string
    nickname: string
    avatar?: string
  }
  auth: {
    passwordHash: string
    jwtSecret: string
  }
  corsOrigin?: string
  nodeEnv?: string
}
```

在 `apps/server/src/app.ts` 第 102 行后添加：

```typescript
  app.route('/api/messages', messageRoutes({ messageService: deps.messageService }))
  app.route('/api/me', meRoutes(deps.userProfile))  // 新增
```

**Step 3: 更新 index.ts 传入 userProfile**

在 `apps/server/src/index.ts` 修改 createApp 调用（第 62-76 行）：

```typescript
    const app = createApp({
      clientService,
      conversationService,
      messageService,
      contactSyncService,
      juhexbotAdapter,
      get wsService() { return wsService },
      clientGuid: env.JUHEXBOT_CLIENT_GUID,
      userProfile: {  // 新增
        username: userProfile.username,
        nickname: userProfile.nickname,
        avatar: userProfile.avatar
      },
      auth: {
        passwordHash: env.AUTH_PASSWORD_HASH,
        jwtSecret: env.AUTH_JWT_SECRET,
      },
      corsOrigin: env.CORS_ORIGIN,
      nodeEnv: env.NODE_ENV,
    } as any)
```

**Step 4: 手动测试 API**

```bash
cd apps/server
pnpm build
node dist/index.js &
# 等待服务启动
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" http://localhost:3100/api/me
```

Expected: 返回 `{"success":true,"data":{"username":"njin_cool","nickname":"牛晋","avatar":"..."}}`

**Step 5: 停止服务并提交**

```bash
pkill -f "node dist/index.js"
git add src/routes/me.ts src/app.ts src/index.ts
git commit -m "feat: 新增 /api/me 接口返回当前用户信息

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 6: 前端获取真实用户标识

**Files:**
- Modify: `apps/web/src/api/chat.ts:1-91`

**Step 1: 添加 getCurrentUser API**

在 `apps/web/src/api/chat.ts` 第 48 行后添加：

```typescript
interface CurrentUserResponse {
  username: string
  nickname: string
  avatar?: string
}

// 全局存储当前用户信息
let currentUser: CurrentUserResponse | null = null

// 获取当前用户信息
export async function getCurrentUser(): Promise<CurrentUserResponse> {
  if (currentUser) {
    return currentUser
  }

  const response = await client.get<ApiResponse<CurrentUserResponse>>('/me')
  if (!response.data.success || !response.data.data) {
    throw new Error('Failed to get current user')
  }

  currentUser = response.data.data
  return currentUser
}
```

**Step 2: 修改 CURRENT_USER 为动态获取**

在 `apps/web/src/api/chat.ts` 删除第 51 行的硬编码：

```typescript
// 删除这行
// const CURRENT_USER = 'wxid_test_user';
```

**Step 3: 修改 mapMessage 使用动态 username**

在 `apps/web/src/api/chat.ts` 修改 `mapMessage` 函数（第 76-91 行）：

```typescript
export function mapMessage(raw: ApiMessage, conversationId: string, contactNameMap: Map<string, string>): Message {
  // 使用全局 currentUser，如果未初始化则 isMine 为 false
  const isMine = currentUser ? raw.fromUsername === currentUser.username : false

  return {
    id: raw.msgId,
    conversationId,
    senderId: raw.fromUsername,
    senderName: isMine ? '我' : (contactNameMap.get(raw.fromUsername) || raw.fromUsername),
    content: raw.displayContent ?? raw.content,
    timestamp: new Date(raw.createTime * 1000).toISOString(),
    status: 'sent',
    isMine,
    msgType: raw.msgType,
    displayType: raw.displayType as Message['displayType'],
  };
}
```

**Step 4: 在 App 启动时调用 getCurrentUser**

在 `apps/web/src/App.tsx` 添加初始化逻辑。找到 App 组件，在 return 前添加：

```typescript
import { useEffect } from 'react'
import { getCurrentUser } from './api/chat'

function App() {
  useEffect(() => {
    // 初始化当前用户信息
    getCurrentUser().catch(console.error)
  }, [])

  // ... 原有代码
}
```

**Step 5: 手动测试前端**

```bash
cd apps/web
pnpm dev
```

打开浏览器，登录后查看消息列表，自己发的消息应该显示在右侧。

**Step 6: 提交**

```bash
git add src/api/chat.ts src/App.tsx
git commit -m "feat: 前端动态获取当前用户标识用于 isMine 判断

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7: 集成测试

**Files:**
- Test: 手动测试完整流程

**Step 1: 启动后端**

```bash
cd apps/server
pnpm build
node dist/index.js
```

Expected: 日志显示 "User profile fetched" 和 username

**Step 2: 启动前端**

```bash
cd apps/web
pnpm dev
```

**Step 3: 测试发送消息**

1. 打开浏览器访问 http://localhost:3000
2. 登录
3. 选择任意会话
4. 发送一条消息
5. 验证消息显示在右侧（蓝色气泡）

**Step 4: 测试接收消息**

1. 用另一个微信账号给当前账号发消息
2. 验证消息显示在左侧（灰色气泡）

**Step 5: 检查数据库**

```bash
cd apps/server
npx prisma studio
```

查看 MessageIndex 表，验证：
- 自己发的消息 `fromUsername` 为 `njin_cool`
- 别人发的消息 `fromUsername` 为对方的 username

**Step 6: 测试通过后停止服务**

```bash
# 停止后端
pkill -f "node dist/index.js"
# 停止前端
# Ctrl+C
```

---

### Task 8: 更新测试 fixtures

**Files:**
- Modify: `tests/fixtures/messages.ts`

**Step 1: 更新 textMessage fixture**

在 `tests/fixtures/messages.ts` 中，确保 `textMessage` 的 `guid` 和 `from_username` 匹配测试场景。

如果测试中 `clientGuid` 是 `'test-guid-123'`，但 `from_username` 是 `'test_user'`，需要在测试中设置 `clientUsername`：

在 `apps/server/src/services/juhexbotAdapter.test.ts` 修改 adapter 初始化（第 6-11 行）：

```typescript
  const adapter = new JuhexbotAdapter({
    apiUrl: 'http://chat-api.juhebot.com/open/GuidRequest',
    appKey: 'test_key',
    appSecret: 'test_secret',
    clientGuid: 'test-guid-123',
    clientUsername: 'test_user'  // 新增：匹配 fixture 中的 from_username
  })
```

**Step 2: 运行所有测试**

```bash
cd apps/server
npx vitest run
```

Expected: PASS (所有测试通过)

**Step 3: 提交**

```bash
git add src/services/juhexbotAdapter.test.ts
git commit -m "test: 更新测试 fixtures 匹配 clientUsername

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 9: 最终验证和文档

**Files:**
- Modify: `docs/plans/2026-03-11-fix-message-sender-identity-design.md`

**Step 1: 运行完整测试套件**

```bash
cd apps/server
npx vitest run
pnpm type-check
pnpm lint
```

Expected: 所有检查通过

**Step 2: 部署到服务器测试**

```bash
git push origin main
# 等待 GitHub Actions 部署完成
ssh diting-server "cd ~/morechat && pm2 logs morechat --lines 50"
```

验证日志中有 "User profile fetched" 和正确的 username。

**Step 3: 在生产环境测试**

1. 访问生产环境 URL
2. 登录
3. 发送消息验证显示在右侧
4. 接收消息验证显示在左侧

**Step 4: 更新设计文档**

在 `docs/plans/2026-03-11-fix-message-sender-identity-design.md` 末尾添加：

```markdown
## 实现完成

- ✅ JuhexbotAdapter.getProfile() 方法
- ✅ JuhexbotConfig.clientUsername 字段
- ✅ MessageService 使用 clientUsername
- ✅ 服务启动时获取用户信息
- ✅ /api/me 接口
- ✅ 前端动态获取用户标识
- ✅ 集成测试通过
- ✅ 生产环境验证通过
```

**Step 5: 最终提交**

```bash
git add docs/plans/2026-03-11-fix-message-sender-identity-design.md
git commit -m "docs: 标记实现完成

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
git push origin main
```

---

## 完成

所有任务完成后，消息发送者身份识别问题已修复：
- 后端正确使用微信用户名而非 UUID 进行消息方向判断
- 发送的消息正确存储 `from_username`
- 前端动态获取真实用户标识
- 自己发的消息显示在右侧，别人发的消息显示在左侧
