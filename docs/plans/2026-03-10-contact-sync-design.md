# 联系人/群组信息同步 + Chat 界面完善

**日期**: 2026-03-10
**状态**: 已批准

## 概述

完善联系人、群组名称、群成员数据的获取，并在 Chat 界面正确显示真实昵称、头像、群成员数等信息。采用混合策略：按需懒加载 + 后台低频补全。

## 核心约束

- **频控安全**：全局速率限制器，每 3 秒最多 1 次 juhexbot API 请求
- **后台补全保守**：单次扫描最多 20 条，每次请求间隔 5 秒
- **缓存 TTL 24h**：已同步的数据 24 小时内不重复查询
- **优雅降级**：API 失败时保留占位数据，不影响消息收发

## 数据流

```
按需同步（即时触发）：
  收到消息 → ensureContact() 创建占位记录
           → 异步触发 ContactSyncService.syncContact(username)
           → getContact API → 更新 DB（nickname, avatar, remark）
           → WebSocket 推送 'contact:updated'
           → 前端 invalidate 会话列表

打开群会话：
  前端 GET /api/conversations/:id
  → 后端检查 Group.lastSyncAt
  → 超过 TTL → 触发 syncGroup(roomUsername)
             → getChatroomDetail API → 更新 DB（name, avatar, memberCount）
             → getChatroomMemberDetail API → 更新 GroupMember 表
             → WebSocket 推送 'group:updated'

后台补全任务（每 30 分钟）：
  → 扫描 Contact 中 nickname = username 的占位记录（limit 20）
  → 扫描 Group 中 name = roomUsername 的占位记录（limit 20）
  → 逐个查询，间隔 5 秒
  → 更新 DB + WebSocket 推送
```

## 后端改动

### 1. JuhexbotAdapter 扩展

新增 3 个 API 方法：

```typescript
// POST /contact/get_contact
async getContact(usernameList: string[]): Promise<ContactInfo[]>
// 参数: { guid, username_list }

// POST /room/get_chatroom_detail
async getChatroomDetail(roomUsername: string): Promise<GroupInfo>
// 参数: { guid, room_username }

// POST /room/get_chatroom_member_detail
async getChatroomMemberDetail(roomUsername: string, version?: number): Promise<MemberListInfo>
// 参数: { guid, room_username, version }
```

### 2. ContactSyncService（新增）

```typescript
class ContactSyncService {
  constructor(
    private db: DatabaseService,
    private adapter: JuhexbotAdapter,
    private wsService: WebSocketService,
    private rateLimiter: RateLimiter
  )

  // 按需同步单个联系人
  async syncContact(username: string): Promise<void>

  // 按需同步群组 + 群成员
  async syncGroup(roomUsername: string): Promise<void>

  // 后台补全任务（定时调用）
  async runBackfillTask(): Promise<void>

  // 启动定时任务
  startBackfillScheduler(): void

  // 停止定时任务
  stopBackfillScheduler(): void
}
```

### 3. RateLimiter（新增工具类）

简单的令牌桶或固定窗口限制器，确保全局每 3 秒最多 1 次 juhexbot API 请求。

```typescript
class RateLimiter {
  constructor(minIntervalMs: number) // 3000
  async acquire(): Promise<void>     // 等待直到可以发起请求
}
```

### 4. 数据库 Schema 变更

```prisma
model Contact {
  // 新增
  lastSyncAt  DateTime?
}

model Group {
  // 新增
  lastSyncAt  DateTime?
  // version 字段已有
}
```

### 5. MessageService 集成

`handleIncomingMessage()` 中 `ensureContact()` 后异步触发同步：

```typescript
// 不 await，异步执行，不阻塞消息处理
this.contactSyncService.syncContact(username).catch(err => logger.warn(err))
```

### 6. WebSocket 事件

```typescript
{ event: 'contact:updated', data: { username, nickname, avatar, remark } }
{ event: 'group:updated', data: { roomUsername, name, avatar, memberCount } }
```

### 7. 依赖注入

`index.ts` 中新增 `ContactSyncService` 的创建和注入，传入 `RateLimiter` 实例。

## 前端改动

### 1. WebSocket 事件监听

在 useMessages hook 或独立 hook 中监听 `contact:updated` / `group:updated`，触发 TanStack Query invalidate 刷新会话列表。

### 2. ConversationItem 改进

- 有 avatar URL 时显示真实头像图片
- fallback 为当前的首字母渐变色头像
- 群聊在名称旁显示成员数量

### 3. ChatHeader 改进

- 显示联系人备注优先，其次昵称
- 群聊显示群名 + 成员数（如 "开发群 (42)"）
- 移除硬编码的"在线"状态指示器

### 4. 群聊消息发送者名称

群聊消息中 `chatroomSender` 的真实昵称通过 contactNameCache 获取，API 返回时应包含群成员的昵称映射。

## 测试策略

### 单元测试
- ContactSyncService: syncContact(), syncGroup(), runBackfillTask()
- RateLimiter: acquire() 间隔控制
- JuhexbotAdapter: getContact(), getChatroomDetail(), getChatroomMemberDetail()

### 路由测试
- 会话详情返回完善的联系人/群组信息

### 集成测试
- 消息到达 → 联系人信息异步同步 → DB 更新
