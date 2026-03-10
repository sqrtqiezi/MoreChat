# 联系人/群组信息同步 实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现联系人/群组真实信息的按需同步和后台补全，并在 Chat 界面正确显示真实昵称、头像、群成员数。

**Architecture:** 后端新增 ContactSyncService 负责混合同步策略（按需 + 后台补全），通过 RateLimiter 控制 juhexbot API 请求频率。同步结果通过 WebSocket 推送给前端刷新 UI。前端监听 contact/group 更新事件，invalidate TanStack Query 缓存。

**Tech Stack:** Node.js, TypeScript, Hono, Prisma (SQLite), WebSocket (ws), Vitest, React, TanStack Query

---

## Task 1: Prisma Schema 添加 lastSyncAt 字段

**Files:**
- Modify: `apps/server/prisma/schema.prisma`
- Modify: `apps/server/src/services/database.ts`

**Step 1: 修改 Prisma Schema**

在 `apps/server/prisma/schema.prisma` 中，给 Contact 和 Group 模型添加 `lastSyncAt` 字段：

```prisma
model Contact {
  id         String    @id @default(cuid())
  username   String    @unique
  nickname   String
  remark     String?
  avatar     String?
  type       String
  lastSyncAt DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  conversations Conversation[]
  groupMembers  GroupMember[]

  @@index([nickname])
}

model Group {
  id           String    @id @default(cuid())
  roomUsername  String    @unique
  name         String
  avatar       String?
  memberCount  Int       @default(0)
  version      Int?
  lastSyncAt   DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  conversations Conversation[]
  members       GroupMember[]

  @@index([name])
}
```

**Step 2: 更新 database.ts 的 pushSchema**

在 `apps/server/src/services/database.ts` 的 `pushSchema()` 方法中，Contact 和 Group 表的 CREATE TABLE 语句添加 `lastSyncAt` 列：

Contact 表中，在 `"type" TEXT NOT NULL,` 之后添加：
```sql
"lastSyncAt" DATETIME,
```

Group 表中，在 `"version" INTEGER,` 之后添加：
```sql
"lastSyncAt" DATETIME,
```

**Step 3: 添加 updateContact 和 updateGroup 方法**

在 `apps/server/src/services/database.ts` 中添加：

```typescript
async updateContact(username: string, data: { nickname?: string; remark?: string; avatar?: string; lastSyncAt?: Date }) {
  return this.prisma.contact.update({
    where: { username },
    data: { ...data, updatedAt: new Date() }
  })
}

async updateGroup(roomUsername: string, data: { name?: string; avatar?: string; memberCount?: number; version?: number; lastSyncAt?: Date }) {
  return this.prisma.group.update({
    where: { roomUsername },
    data: { ...data, updatedAt: new Date() }
  })
}

async findStaleContacts(limit: number) {
  return this.prisma.contact.findMany({
    where: {
      type: 'friend',
      lastSyncAt: null,
    },
    take: limit,
    orderBy: { createdAt: 'asc' }
  })
}

async findStaleGroups(limit: number) {
  return this.prisma.group.findMany({
    where: {
      lastSyncAt: null,
    },
    take: limit,
    orderBy: { createdAt: 'asc' }
  })
}

async upsertGroupMember(data: { groupId: string; username: string; nickname?: string; role?: string }) {
  return this.prisma.groupMember.upsert({
    where: {
      groupId_username: { groupId: data.groupId, username: data.username }
    },
    update: { nickname: data.nickname, role: data.role, updatedAt: new Date() },
    create: { ...data, updatedAt: new Date() }
  })
}
```

**Step 4: 生成 Prisma Client**

Run: `cd apps/server && npx prisma generate`
Expected: Prisma Client 重新生成成功

**Step 5: 运行现有测试确保不破坏**

Run: `cd apps/server && npx vitest run src/services/database.test.ts`
Expected: 所有现有测试通过

**Step 6: Commit**

```bash
git add apps/server/prisma/schema.prisma apps/server/src/services/database.ts
git commit -m "feat: Contact/Group 添加 lastSyncAt 字段和 sync 相关 DB 方法"
```

---

## Task 2: RateLimiter 工具类

**Files:**
- Create: `apps/server/src/lib/rateLimiter.ts`
- Create: `apps/server/src/lib/rateLimiter.test.ts`

**Step 1: 编写 RateLimiter 测试**

创建 `apps/server/src/lib/rateLimiter.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RateLimiter } from './rateLimiter.js'

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should allow first request immediately', async () => {
    const limiter = new RateLimiter(3000)
    const start = Date.now()
    await limiter.acquire()
    expect(Date.now() - start).toBeLessThan(100)
  })

  it('should delay second request by minIntervalMs', async () => {
    const limiter = new RateLimiter(3000)
    await limiter.acquire()

    const promise = limiter.acquire()
    vi.advanceTimersByTime(3000)
    await promise
    // Should resolve after advancing timers
  })

  it('should queue multiple requests sequentially', async () => {
    const limiter = new RateLimiter(1000)
    const order: number[] = []

    await limiter.acquire()
    order.push(1)

    const p2 = limiter.acquire().then(() => order.push(2))
    const p3 = limiter.acquire().then(() => order.push(3))

    vi.advanceTimersByTime(1000)
    await p2
    vi.advanceTimersByTime(1000)
    await p3

    expect(order).toEqual([1, 2, 3])
  })
})
```

**Step 2: 运行测试确认失败**

Run: `cd apps/server && npx vitest run src/lib/rateLimiter.test.ts`
Expected: FAIL — 模块不存在

**Step 3: 实现 RateLimiter**

创建 `apps/server/src/lib/rateLimiter.ts`：

```typescript
export class RateLimiter {
  private lastRequestTime = 0
  private queue: Array<() => void> = []
  private processing = false

  constructor(private minIntervalMs: number) {}

  async acquire(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.queue.push(resolve)
      if (!this.processing) {
        this.processQueue()
      }
    })
  }

  private processQueue() {
    if (this.queue.length === 0) {
      this.processing = false
      return
    }

    this.processing = true
    const resolve = this.queue.shift()!
    const now = Date.now()
    const elapsed = now - this.lastRequestTime
    const delay = Math.max(0, this.minIntervalMs - elapsed)

    if (delay === 0) {
      this.lastRequestTime = now
      resolve()
      this.processQueue()
    } else {
      setTimeout(() => {
        this.lastRequestTime = Date.now()
        resolve()
        this.processQueue()
      }, delay)
    }
  }
}
```

**Step 4: 运行测试确认通过**

Run: `cd apps/server && npx vitest run src/lib/rateLimiter.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/server/src/lib/rateLimiter.ts apps/server/src/lib/rateLimiter.test.ts
git commit -m "feat: 添加 RateLimiter 工具类，控制 API 请求频率"
```

---

## Task 3: JuhexbotAdapter 扩展 — 联系人/群组 API

**Files:**
- Modify: `apps/server/src/services/juhexbotAdapter.ts`
- Modify: `apps/server/src/services/juhexbotAdapter.test.ts`

**Step 1: 编写 getContact 测试**

在 `apps/server/src/services/juhexbotAdapter.test.ts` 中添加新的 describe 块：

```typescript
describe('getContact', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return contact info for username list', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        errcode: 0,
        data: [
          {
            username: 'wxid_test1',
            nickname: '张三',
            remark: '张三备注',
            avatar: 'https://wx.qlogo.cn/test1.jpg',
          }
        ]
      })
    })

    const result = await adapter.getContact(['wxid_test1'])
    expect(result).toEqual([
      {
        username: 'wxid_test1',
        nickname: '张三',
        remark: '张三备注',
        avatar: 'https://wx.qlogo.cn/test1.jpg',
      }
    ])
  })

  it('should throw error when API fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        errcode: 1001,
        err_msg: 'Request failed'
      })
    })

    await expect(adapter.getContact(['wxid_test1'])).rejects.toThrow('Request failed')
  })
})

describe('getChatroomDetail', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return chatroom detail', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        errcode: 0,
        data: {
          room_username: 'room@chatroom',
          name: '开发群',
          avatar: 'https://wx.qlogo.cn/room.jpg',
          member_count: 42,
        }
      })
    })

    const result = await adapter.getChatroomDetail('room@chatroom')
    expect(result).toEqual({
      roomUsername: 'room@chatroom',
      name: '开发群',
      avatar: 'https://wx.qlogo.cn/room.jpg',
      memberCount: 42,
    })
  })

  it('should throw error when API fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        errcode: 1001,
        err_msg: 'Room not found'
      })
    })

    await expect(adapter.getChatroomDetail('room@chatroom')).rejects.toThrow('Room not found')
  })
})

describe('getChatroomMemberDetail', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return chatroom member list', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        errcode: 0,
        data: {
          version: 5,
          members: [
            { username: 'wxid_a', nickname: '成员A' },
            { username: 'wxid_b', nickname: '成员B' },
          ]
        }
      })
    })

    const result = await adapter.getChatroomMemberDetail('room@chatroom', 0)
    expect(result).toEqual({
      version: 5,
      members: [
        { username: 'wxid_a', nickname: '成员A' },
        { username: 'wxid_b', nickname: '成员B' },
      ]
    })
  })

  it('should throw error when API fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        errcode: 1001,
        err_msg: 'Failed to get members'
      })
    })

    await expect(adapter.getChatroomMemberDetail('room@chatroom')).rejects.toThrow('Failed to get members')
  })
})
```

**Step 2: 运行测试确认失败**

Run: `cd apps/server && npx vitest run src/services/juhexbotAdapter.test.ts`
Expected: FAIL — 方法不存在

**Step 3: 实现 adapter 方法**

在 `apps/server/src/services/juhexbotAdapter.ts` 中，`setNotifyUrl` 方法之后添加：

```typescript
export interface ContactInfo {
  username: string
  nickname: string
  remark?: string
  avatar?: string
}

export interface GroupDetailInfo {
  roomUsername: string
  name: string
  avatar?: string
  memberCount: number
}

export interface ChatroomMemberInfo {
  version: number
  members: Array<{ username: string; nickname: string }>
}
```

然后在 JuhexbotAdapter 类中添加方法：

```typescript
async getContact(usernameList: string[]): Promise<ContactInfo[]> {
  const result = await this.sendRequest('/contact/get_contact', {
    guid: this.config.clientGuid,
    username_list: usernameList
  })

  if (result.errcode !== 0) {
    throw new Error(result.errmsg || 'Failed to get contact')
  }

  const contacts = Array.isArray(result.data) ? result.data : [result.data]
  return contacts.map((c: any) => ({
    username: c.username,
    nickname: c.nickname || '',
    remark: c.remark || undefined,
    avatar: c.avatar || c.big_head_img || c.small_head_img || undefined,
  }))
}

async getChatroomDetail(roomUsername: string): Promise<GroupDetailInfo> {
  const result = await this.sendRequest('/room/get_chatroom_detail', {
    guid: this.config.clientGuid,
    room_username: roomUsername
  })

  if (result.errcode !== 0) {
    throw new Error(result.errmsg || 'Failed to get chatroom detail')
  }

  return {
    roomUsername: result.data.room_username || roomUsername,
    name: result.data.name || result.data.nickname || roomUsername,
    avatar: result.data.avatar || result.data.big_head_img || result.data.small_head_img || undefined,
    memberCount: result.data.member_count || 0,
  }
}

async getChatroomMemberDetail(roomUsername: string, version?: number): Promise<ChatroomMemberInfo> {
  const result = await this.sendRequest('/room/get_chatroom_member_detail', {
    guid: this.config.clientGuid,
    room_username: roomUsername,
    version: version || 0
  })

  if (result.errcode !== 0) {
    throw new Error(result.errmsg || 'Failed to get chatroom members')
  }

  return {
    version: result.data.version || 0,
    members: (result.data.members || []).map((m: any) => ({
      username: m.username,
      nickname: m.nickname || m.display_name || '',
    }))
  }
}
```

**注意：** 接口类型 `ContactInfo`、`GroupDetailInfo`、`ChatroomMemberInfo` 放在文件顶部 export 出去，供 ContactSyncService 使用。

**Step 4: 运行测试确认通过**

Run: `cd apps/server && npx vitest run src/services/juhexbotAdapter.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/server/src/services/juhexbotAdapter.ts apps/server/src/services/juhexbotAdapter.test.ts
git commit -m "feat: JuhexbotAdapter 添加 getContact/getChatroomDetail/getChatroomMemberDetail"
```

---

## Task 4: ContactSyncService 实现

**Files:**
- Create: `apps/server/src/services/contactSyncService.ts`
- Create: `apps/server/src/services/contactSyncService.test.ts`

**Step 1: 编写 ContactSyncService 测试**

创建 `apps/server/src/services/contactSyncService.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ContactSyncService } from './contactSyncService.js'

function createMockDeps() {
  return {
    db: {
      findContactByUsername: vi.fn(),
      updateContact: vi.fn(),
      findGroupByRoomUsername: vi.fn(),
      updateGroup: vi.fn(),
      upsertGroupMember: vi.fn(),
      findStaleContacts: vi.fn().mockResolvedValue([]),
      findStaleGroups: vi.fn().mockResolvedValue([]),
      ensureContact: vi.fn(),
    } as any,
    adapter: {
      getContact: vi.fn(),
      getChatroomDetail: vi.fn(),
      getChatroomMemberDetail: vi.fn(),
    } as any,
    wsService: {
      broadcast: vi.fn(),
    } as any,
  }
}

describe('ContactSyncService', () => {
  let deps: ReturnType<typeof createMockDeps>
  let service: ContactSyncService

  beforeEach(() => {
    deps = createMockDeps()
    service = new ContactSyncService(deps.db, deps.adapter, deps.wsService)
  })

  describe('syncContact', () => {
    it('should fetch contact from API and update DB', async () => {
      deps.db.findContactByUsername.mockResolvedValue({
        username: 'wxid_test',
        nickname: 'wxid_test',
        lastSyncAt: null
      })
      deps.adapter.getContact.mockResolvedValue([{
        username: 'wxid_test',
        nickname: '张三',
        remark: '备注',
        avatar: 'https://avatar.jpg'
      }])

      await service.syncContact('wxid_test')

      expect(deps.adapter.getContact).toHaveBeenCalledWith(['wxid_test'])
      expect(deps.db.updateContact).toHaveBeenCalledWith('wxid_test', expect.objectContaining({
        nickname: '张三',
        remark: '备注',
        avatar: 'https://avatar.jpg',
        lastSyncAt: expect.any(Date)
      }))
      expect(deps.wsService.broadcast).toHaveBeenCalledWith('contact:updated', expect.objectContaining({
        username: 'wxid_test',
        nickname: '张三'
      }))
    })

    it('should skip if contact was synced within TTL', async () => {
      deps.db.findContactByUsername.mockResolvedValue({
        username: 'wxid_test',
        nickname: '张三',
        lastSyncAt: new Date() // just synced
      })

      await service.syncContact('wxid_test')

      expect(deps.adapter.getContact).not.toHaveBeenCalled()
    })

    it('should not throw on API failure', async () => {
      deps.db.findContactByUsername.mockResolvedValue({
        username: 'wxid_test',
        nickname: 'wxid_test',
        lastSyncAt: null
      })
      deps.adapter.getContact.mockRejectedValue(new Error('API error'))

      await expect(service.syncContact('wxid_test')).resolves.not.toThrow()
    })
  })

  describe('syncGroup', () => {
    it('should fetch group detail and members from API and update DB', async () => {
      deps.db.findGroupByRoomUsername.mockResolvedValue({
        id: 'group_1',
        roomUsername: 'room@chatroom',
        name: 'room@chatroom',
        lastSyncAt: null,
        version: 0
      })
      deps.adapter.getChatroomDetail.mockResolvedValue({
        roomUsername: 'room@chatroom',
        name: '开发群',
        avatar: 'https://group.jpg',
        memberCount: 2
      })
      deps.adapter.getChatroomMemberDetail.mockResolvedValue({
        version: 5,
        members: [
          { username: 'wxid_a', nickname: '成员A' },
          { username: 'wxid_b', nickname: '成员B' },
        ]
      })
      deps.db.findContactByUsername.mockResolvedValue(null)

      await service.syncGroup('room@chatroom')

      expect(deps.adapter.getChatroomDetail).toHaveBeenCalledWith('room@chatroom')
      expect(deps.db.updateGroup).toHaveBeenCalledWith('room@chatroom', expect.objectContaining({
        name: '开发群',
        avatar: 'https://group.jpg',
        memberCount: 2,
        lastSyncAt: expect.any(Date)
      }))
      expect(deps.wsService.broadcast).toHaveBeenCalledWith('group:updated', expect.objectContaining({
        roomUsername: 'room@chatroom',
        name: '开发群'
      }))
    })

    it('should skip if group was synced within TTL', async () => {
      deps.db.findGroupByRoomUsername.mockResolvedValue({
        id: 'group_1',
        roomUsername: 'room@chatroom',
        name: '开发群',
        lastSyncAt: new Date()
      })

      await service.syncGroup('room@chatroom')

      expect(deps.adapter.getChatroomDetail).not.toHaveBeenCalled()
    })
  })

  describe('runBackfillTask', () => {
    it('should sync stale contacts and groups', async () => {
      deps.db.findStaleContacts.mockResolvedValue([
        { username: 'wxid_stale1', nickname: 'wxid_stale1', lastSyncAt: null }
      ])
      deps.db.findStaleGroups.mockResolvedValue([
        { id: 'g1', roomUsername: 'stale@chatroom', name: 'stale@chatroom', lastSyncAt: null, version: 0 }
      ])
      deps.adapter.getContact.mockResolvedValue([{
        username: 'wxid_stale1',
        nickname: '补全联系人',
        avatar: null,
        remark: null
      }])
      deps.adapter.getChatroomDetail.mockResolvedValue({
        roomUsername: 'stale@chatroom',
        name: '补全群组',
        avatar: null,
        memberCount: 5
      })
      deps.adapter.getChatroomMemberDetail.mockResolvedValue({
        version: 1,
        members: []
      })

      await service.runBackfillTask()

      expect(deps.db.findStaleContacts).toHaveBeenCalledWith(20)
      expect(deps.db.findStaleGroups).toHaveBeenCalledWith(20)
      expect(deps.adapter.getContact).toHaveBeenCalled()
      expect(deps.adapter.getChatroomDetail).toHaveBeenCalled()
    })

    it('should handle empty stale list gracefully', async () => {
      deps.db.findStaleContacts.mockResolvedValue([])
      deps.db.findStaleGroups.mockResolvedValue([])

      await service.runBackfillTask()

      expect(deps.adapter.getContact).not.toHaveBeenCalled()
      expect(deps.adapter.getChatroomDetail).not.toHaveBeenCalled()
    })
  })
})
```

**Step 2: 运行测试确认失败**

Run: `cd apps/server && npx vitest run src/services/contactSyncService.test.ts`
Expected: FAIL — 模块不存在

**Step 3: 实现 ContactSyncService**

创建 `apps/server/src/services/contactSyncService.ts`：

```typescript
import type { DatabaseService } from './database.js'
import type { JuhexbotAdapter } from './juhexbotAdapter.js'
import type { WebSocketService } from './websocket.js'
import { RateLimiter } from '../lib/rateLimiter.js'
import { logger } from '../lib/logger.js'

const SYNC_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const BACKFILL_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes
const BACKFILL_BATCH_SIZE = 20
const BACKFILL_DELAY_MS = 5000 // 5 seconds between each backfill request

export class ContactSyncService {
  private rateLimiter = new RateLimiter(3000)
  private backfillTimer: ReturnType<typeof setInterval> | null = null

  constructor(
    private db: DatabaseService,
    private adapter: JuhexbotAdapter,
    private wsService: WebSocketService
  ) {}

  async syncContact(username: string): Promise<void> {
    try {
      const contact = await this.db.findContactByUsername(username)
      if (!contact) return

      // TTL check
      if (contact.lastSyncAt && Date.now() - new Date(contact.lastSyncAt).getTime() < SYNC_TTL_MS) {
        return
      }

      await this.rateLimiter.acquire()
      const [info] = await this.adapter.getContact([username])
      if (!info) return

      await this.db.updateContact(username, {
        nickname: info.nickname || contact.nickname,
        remark: info.remark,
        avatar: info.avatar,
        lastSyncAt: new Date()
      })

      this.wsService.broadcast('contact:updated', {
        username: info.username,
        nickname: info.nickname,
        remark: info.remark,
        avatar: info.avatar
      })
    } catch (error) {
      logger.warn({ err: error, username }, 'Failed to sync contact')
    }
  }

  async syncGroup(roomUsername: string): Promise<void> {
    try {
      const group = await this.db.findGroupByRoomUsername(roomUsername)
      if (!group) return

      // TTL check
      if (group.lastSyncAt && Date.now() - new Date(group.lastSyncAt).getTime() < SYNC_TTL_MS) {
        return
      }

      // Sync group detail
      await this.rateLimiter.acquire()
      const detail = await this.adapter.getChatroomDetail(roomUsername)

      await this.db.updateGroup(roomUsername, {
        name: detail.name || group.name,
        avatar: detail.avatar,
        memberCount: detail.memberCount,
        lastSyncAt: new Date()
      })

      // Sync group members
      await this.rateLimiter.acquire()
      const memberResult = await this.adapter.getChatroomMemberDetail(roomUsername, group.version || 0)

      if (memberResult.members.length > 0) {
        for (const member of memberResult.members) {
          // Ensure contact record exists for each member
          const existingContact = await this.db.findContactByUsername(member.username)
          if (!existingContact) {
            try {
              await this.db.createContact({
                username: member.username,
                nickname: member.nickname || member.username,
                type: 'friend'
              })
            } catch (error: any) {
              if (error?.code !== 'P2002') throw error
            }
          }

          await this.db.upsertGroupMember({
            groupId: group.id,
            username: member.username,
            nickname: member.nickname
          })
        }

        // Update version for incremental sync
        await this.db.updateGroup(roomUsername, {
          version: memberResult.version
        })
      }

      this.wsService.broadcast('group:updated', {
        roomUsername,
        name: detail.name,
        avatar: detail.avatar,
        memberCount: detail.memberCount
      })
    } catch (error) {
      logger.warn({ err: error, roomUsername }, 'Failed to sync group')
    }
  }

  async runBackfillTask(): Promise<void> {
    try {
      logger.debug('Running contact backfill task')

      // Backfill stale contacts
      const staleContacts = await this.db.findStaleContacts(BACKFILL_BATCH_SIZE)
      for (const contact of staleContacts) {
        await this.syncContact(contact.username)
        await this.delay(BACKFILL_DELAY_MS)
      }

      // Backfill stale groups
      const staleGroups = await this.db.findStaleGroups(BACKFILL_BATCH_SIZE)
      for (const group of staleGroups) {
        await this.syncGroup(group.roomUsername)
        await this.delay(BACKFILL_DELAY_MS)
      }

      logger.debug({ contacts: staleContacts.length, groups: staleGroups.length }, 'Backfill task completed')
    } catch (error) {
      logger.warn({ err: error }, 'Backfill task failed')
    }
  }

  startBackfillScheduler(): void {
    this.backfillTimer = setInterval(() => {
      this.runBackfillTask()
    }, BACKFILL_INTERVAL_MS)
    logger.info('Contact backfill scheduler started')
  }

  stopBackfillScheduler(): void {
    if (this.backfillTimer) {
      clearInterval(this.backfillTimer)
      this.backfillTimer = null
      logger.info('Contact backfill scheduler stopped')
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
```

**Step 4: 运行测试确认通过**

Run: `cd apps/server && npx vitest run src/services/contactSyncService.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/server/src/services/contactSyncService.ts apps/server/src/services/contactSyncService.test.ts
git commit -m "feat: ContactSyncService 混合同步策略（按需 + 后台补全）"
```

---

## Task 5: 集成到 index.ts 和 app.ts

**Files:**
- Modify: `apps/server/src/index.ts`
- Modify: `apps/server/src/app.ts`

**Step 1: 修改 index.ts — 创建和注入 ContactSyncService**

在 `apps/server/src/index.ts` 中：

1. 添加 import：
```typescript
import { ContactSyncService } from './services/contactSyncService.js'
```

2. 在 `messageService` 创建之后，添加：
```typescript
// ContactSyncService 需要 wsService，使用 getter 延迟访问
const contactSyncService = new ContactSyncService(
  databaseService,
  juhexbotAdapter,
  { broadcast: (...args: any[]) => wsService.broadcast(...args) } as any
)
```

3. 在 `createApp` 调用中添加 `contactSyncService` 依赖：
```typescript
const app = createApp({
  clientService,
  conversationService,
  messageService,
  contactSyncService, // 新增
  juhexbotAdapter,
  get wsService() { return wsService },
  clientGuid: env.JUHEXBOT_CLIENT_GUID,
  auth: { ... },
  corsOrigin: env.CORS_ORIGIN,
  nodeEnv: env.NODE_ENV,
} as any)
```

4. 在 "Server is ready" 之前启动 backfill scheduler：
```typescript
contactSyncService.startBackfillScheduler()
```

5. 在 `gracefulShutdown` 函数中添加：
```typescript
contactSyncService.stopBackfillScheduler()
```

**Step 2: 修改 app.ts — webhook 中触发异步联系人同步**

1. 在 `AppDependencies` 接口中添加：
```typescript
import type { ContactSyncService } from './services/contactSyncService.js'

export interface AppDependencies {
  // ... 已有
  contactSyncService: ContactSyncService
}
```

2. 在 webhook handler 中，`result` 返回后添加异步同步触发：
```typescript
// 异步同步联系人信息（不阻塞 webhook 响应）
if (result) {
  const msg = parsed.message
  deps.contactSyncService.syncContact(msg.fromUsername).catch(() => {})
  if (msg.isChatroomMsg && msg.chatroom) {
    deps.contactSyncService.syncGroup(msg.chatroom).catch(() => {})
  }
}
```

**Step 3: 运行全部测试确保不破坏**

Run: `cd apps/server && npx vitest run`
Expected: 所有测试通过（app 相关的路由测试可能需要 mock contactSyncService）

**Step 4: 如果路由测试失败，修复 mock**

在 `apps/server/src/routes/` 下的测试文件中，如果 `createApp` 调用报错缺少 `contactSyncService`，添加 mock：
```typescript
contactSyncService: { syncContact: vi.fn(), syncGroup: vi.fn() }
```

**Step 5: Commit**

```bash
git add apps/server/src/index.ts apps/server/src/app.ts
git commit -m "feat: 集成 ContactSyncService 到 app 启动流程和 webhook"
```

---

## Task 6: 前端 — Conversation 类型扩展和 WebSocket 事件监听

**Files:**
- Modify: `apps/web/src/types/index.ts`
- Modify: `apps/web/src/api/chat.ts`
- Modify: `apps/web/src/pages/ChatPage.tsx`

**Step 1: 扩展 Conversation 类型**

在 `apps/web/src/types/index.ts` 中修改 Conversation：

```typescript
export interface Conversation {
  id: string;
  name: string;
  type: 'private' | 'group';
  avatar?: string;
  memberCount?: number;
  lastMessage?: string;
  unreadCount: number;
  updatedAt: string;
}
```

**Step 2: 修改 mapConversation 传递 avatar 和 memberCount**

在 `apps/web/src/api/chat.ts` 的 `mapConversation` 中：

```typescript
function mapConversation(raw: ApiConversation): Conversation {
  const name = raw.type === 'group'
    ? (raw.group?.name || '未知群组')
    : (raw.contact?.remark || raw.contact?.nickname || '未知联系人');

  const avatar = raw.type === 'group'
    ? raw.group?.avatar
    : raw.contact?.avatar;

  return {
    id: raw.id,
    name,
    type: raw.type as 'private' | 'group',
    avatar: avatar || undefined,
    memberCount: raw.group?.memberCount,
    unreadCount: raw.unreadCount,
    updatedAt: raw.lastMessageAt || raw.updatedAt,
  };
}
```

**Step 3: 在 ChatPage 中监听 contact:updated 和 group:updated**

在 `apps/web/src/pages/ChatPage.tsx` 的 `handleWebSocketMessage` 中添加：

```typescript
if (data.event === 'contact:updated' || data.event === 'group:updated') {
  queryClient.invalidateQueries({ queryKey: ['conversations'] });
}
```

**Step 4: Commit**

```bash
git add apps/web/src/types/index.ts apps/web/src/api/chat.ts apps/web/src/pages/ChatPage.tsx
git commit -m "feat: 前端支持 contact/group 更新事件，扩展 Conversation 类型"
```

---

## Task 7: 前端 — UI 组件改进

**Files:**
- Modify: `apps/web/src/components/chat/ConversationItem.tsx`
- Modify: `apps/web/src/components/chat/ChatHeader.tsx`
- Modify: `apps/web/src/components/chat/ChatWindow.tsx`

**Step 1: ConversationItem 添加真实头像支持**

替换 `apps/web/src/components/chat/ConversationItem.tsx` 中的 Avatar 部分：

```tsx
{/* Avatar */}
{conversation.avatar ? (
  <img
    src={conversation.avatar}
    alt={conversation.name}
    className="w-12 h-12 rounded-full flex-shrink-0 object-cover"
    onError={(e) => {
      // fallback to letter avatar on error
      e.currentTarget.style.display = 'none';
      e.currentTarget.nextElementSibling?.classList.remove('hidden');
    }}
  />
) : null}
<div
  className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-lg flex-shrink-0 ${gradientClass} ${conversation.avatar ? 'hidden' : ''}`}
>
  {firstLetter}
</div>
```

**Step 2: ChatHeader 显示更多信息**

修改 `apps/web/src/components/chat/ChatHeader.tsx`：

```tsx
interface ChatHeaderProps {
  conversationName: string;
  conversationType?: 'private' | 'group';
  memberCount?: number;
}

export function ChatHeader({ conversationName, conversationType, memberCount }: ChatHeaderProps) {
  return (
    <div className="h-16 px-6 flex items-center border-b border-gray-200 bg-white">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold text-gray-900">{conversationName}</h2>
        {conversationType === 'group' && memberCount ? (
          <span className="text-sm text-gray-500">({memberCount})</span>
        ) : null}
      </div>
    </div>
  );
}
```

**Step 3: ChatWindow 传递新 props**

在 `apps/web/src/components/chat/ChatWindow.tsx` 中更新 ChatHeader 调用：

```tsx
<ChatHeader
  conversationName={selectedConversation.name}
  conversationType={selectedConversation.type}
  memberCount={selectedConversation.memberCount}
/>
```

**Step 4: Commit**

```bash
git add apps/web/src/components/chat/ConversationItem.tsx apps/web/src/components/chat/ChatHeader.tsx apps/web/src/components/chat/ChatWindow.tsx
git commit -m "feat: Chat UI 显示真实头像、群成员数，移除硬编码在线状态"
```

---

## Task 8: 运行全部测试 + 类型检查

**Step 1: 运行后端测试**

Run: `cd apps/server && npx vitest run`
Expected: 所有测试通过

**Step 2: 运行类型检查**

Run: `pnpm type-check`
Expected: 无类型错误

**Step 3: 运行 lint**

Run: `pnpm lint`
Expected: 无 lint 错误（或只有无关的已有警告）

**Step 4: 最终 commit（如果有修复）**

如果有测试/类型/lint 修复：
```bash
git add -A
git commit -m "fix: 修复类型检查和 lint 问题"
```
