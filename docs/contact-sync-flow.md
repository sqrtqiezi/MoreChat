# 联系人与群组成员同步流程

## 1. 概述

系统采用三层同步策略，在保证消息处理实时性的同时逐步补全联系人信息：

| 层级 | 策略 | 触发时机 | 目的 |
|------|------|----------|------|
| 即时占位 | `ensureContact` | Webhook 消息处理时 | 确保消息关联的联系人记录存在，使用 username 作为临时昵称 |
| 异步补全 | `syncContact` / `syncGroup` | Webhook 响应后异步触发 | 从 juhexbot API 拉取真实昵称、头像等信息 |
| 定期回填 | `runBackfillTask` | 每 30 分钟定时执行 | 补全尚未同步过的联系人和群组 |

## 2. 数据模型

### Contact（联系人）
**文件：** `apps/server/prisma/schema.prisma:30-45`

| 字段 | 类型 | 说明 |
|------|------|------|
| `username` | String (unique) | 微信用户名，如 `wxid_xxx` |
| `nickname` | String | 昵称（初始为 username，同步后更新为真实昵称） |
| `remark` | String? | 备注名 |
| `avatar` | String? | 头像 URL |
| `type` | String | `'friend'` 或 `'group'` |
| `lastSyncAt` | DateTime? | 最后同步时间，用于 TTL 判断 |

### Group（群组）
**文件：** `apps/server/prisma/schema.prisma:48-63`

| 字段 | 类型 | 说明 |
|------|------|------|
| `roomUsername` | String (unique) | 群聊用户名，如 `xxx@chatroom` |
| `name` | String | 群名称 |
| `avatar` | String? | 群头像 URL |
| `memberCount` | Int | 成员数 |
| `version` | Int? | 成员列表版本号，用于增量同步 |
| `lastSyncAt` | DateTime? | 最后同步时间 |

### GroupMember（群成员）
**文件：** `apps/server/prisma/schema.prisma:66-82`

| 字段 | 类型 | 说明 |
|------|------|------|
| `groupId` | String | 群组外键（级联删除） |
| `username` | String | 成员用户名（外键关联 `Contact.username`） |
| `nickname` | String? | 群内昵称（displayName） |
| `role` | String | 角色，默认 `'member'` |

复合唯一约束：`(groupId, username)`

## 3. 同步触发时机

### 3.1 即时占位 — Webhook 消息处理
**文件：** `apps/server/src/services/message.ts:42-49`

收到 webhook 消息时，`handleIncomingMessage` 对消息涉及的所有用户名调用 `ensureContact`：

```
webhook 消息到达
  ↓
ensureContact(fromUsername)        — 发送者
ensureContact(toUsername)          — 接收者（如有）
ensureContact(chatroomSender)     — 群聊实际发送者（如有）
```

`ensureContact` 逻辑（`message.ts:120-135`）：
- 查找联系人记录，如果不存在则创建
- 昵称暂用 username 占位
- 类型根据 `username.endsWith('@chatroom')` 判断
- 忽略 P2002（unique constraint）并发冲突

### 3.2 异步补全 — Webhook 响应后
**文件：** `apps/server/src/app.ts:70-81`

消息处理完成、WebSocket 广播后，异步触发同步（不阻塞 webhook 响应）：

```
群聊消息:
  syncGroup(msg.chatroom)              — 同步群信息 + 全部成员
  syncContact(msg.chatroomSender)      — 同步实际发送者

私聊消息:
  syncContact(msg.fromUsername)        — 同步发送者
```

所有调用均 `.catch(() => {})` 静默失败，不影响消息处理。

### 3.3 定期回填 — 后台定时任务
**文件：** `apps/server/src/services/contactSyncService.ts:148-153`

服务启动时调用 `startBackfillScheduler()`，每 30 分钟执行 `runBackfillTask()`：

```
查找 lastSyncAt IS NULL 的 friend 类型联系人（最多 20 条）
  → 逐个 syncContact，间隔 5 秒
查找 lastSyncAt IS NULL 的群组（最多 20 条）
  → 逐个 syncGroup，间隔 5 秒
```

## 4. 联系人同步流程

**方法：** `ContactSyncService.syncContact(username)`
**文件：** `apps/server/src/services/contactSyncService.ts:22-52`

```
syncContact(username)
  │
  ├─ 查找联系人记录 → 不存在则返回
  │
  ├─ TTL 检查：lastSyncAt 距今 < 24h → 跳过
  │
  ├─ 获取速率限制（3 秒间隔）
  │
  ├─ 调用 adapter.getContact([username])
  │     请求: POST /contact/get_contact
  │     响应: contactList[0] → { userName, nickName, remark, bigHeadImgUrl }
  │
  ├─ 更新数据库:
  │     nickname = info.nickname || 保留原值
  │     remark, avatar, lastSyncAt = now()
  │
  └─ 广播 WebSocket 事件 contact:updated
```

## 5. 群组及成员同步流程

**方法：** `ContactSyncService.syncGroup(roomUsername)`
**文件：** `apps/server/src/services/contactSyncService.ts:54-122`

```
syncGroup(roomUsername)
  │
  ├─ 查找群组记录 → 不存在则返回
  │
  ├─ TTL 检查：lastSyncAt 距今 < 24h → 跳过
  │
  ├─ [步骤1] 同步群基本信息
  │     获取速率限制
  │     调用 adapter.getChatroomDetail(roomUsername)
  │       请求: POST /contact/get_contact（复用联系人接口）
  │       响应: contactList[0] → { nickName, bigHeadImgUrl, newChatroomData.memberCount }
  │     更新: name, avatar, memberCount
  │
  ├─ [步骤2] 同步群成员
  │     获取速率限制
  │     调用 adapter.getChatroomMemberDetail(roomUsername, version)
  │       请求: POST /room/get_chatroom_member_detail
  │       响应: { serverVersion, newChatroomData.chatRoomMember[] }
  │     │
  │     └─ 遍历每个成员:
  │           ├─ 查找联系人记录
  │           ├─ 不存在 → 创建 Contact（type='friend'，忽略 P2002）
  │           └─ upsertGroupMember（groupId + username 复合键）
  │
  ├─ 更新群版本号 version = memberResult.version
  │
  ├─ 更新 lastSyncAt = now()（放在最后，确保成员同步成功后才标记）
  │
  └─ 广播 WebSocket 事件 group:updated
```

## 6. 关键设计要点

### TTL 机制
- 同步间隔：24 小时（`SYNC_TTL_MS`）
- 判断依据：`lastSyncAt` 字段
- `lastSyncAt` 为 null 表示从未同步过，会被 backfill 任务捕获

### 速率限制
- 最小请求间隔：3 秒（`RateLimiter(3000)`）
- 队列式处理，所有 juhexbot API 调用共享同一限流器

### 增量同步
- `Group.version` 传给 `getChatroomMemberDetail` 的 `version` 参数
- API 返回 `serverVersion`，同步完成后更新到数据库
- 版本号由 juhexbot 服务端管理

### 并发安全
- 所有 `create` 操作均捕获 P2002（unique constraint violation）
- `ensureContact` 和 `syncGroup` 中的联系人创建都做了冲突处理
- `upsertGroupMember` 使用 Prisma upsert 原子操作

### 错误隔离
- `syncContact` / `syncGroup` 内部 try-catch，失败只记录 warn 日志
- webhook 中异步调用 `.catch(() => {})` 静默失败
- backfill 任务整体 try-catch，单次失败不影响下次执行

## 7. juhexbot API 字段映射参考

### `/contact/get_contact`
**文件：** `apps/server/src/services/juhexbotAdapter.ts:175-193`

| API 原始字段 | 映射到 | 说明 |
|-------------|--------|------|
| `userName.string` | `username` | 嵌套对象格式 `{ string: "wxid_xxx" }` |
| `nickName.string` | `nickname` | 嵌套对象格式 |
| `remark.string` | `remark` | 嵌套对象格式 |
| `bigHeadImgUrl` | `avatar` | 优先大头像，回退 `smallHeadImgUrl` |

### `/room/get_chatroom_member_detail`
**文件：** `apps/server/src/services/juhexbotAdapter.ts:220-241`

响应结构（commit 2b19649 修复后）：
```json
{
  "serverVersion": 5,
  "newChatroomData": {
    "chatRoomMember": [
      {
        "userName": "wxid_a",
        "nickName": "微信昵称",
        "displayName": "群内昵称"
      }
    ]
  }
}
```

| API 原始字段 | 映射到 | 说明 |
|-------------|--------|------|
| `data.serverVersion` | `version` | 非 `data.version` |
| `data.newChatroomData.chatRoomMember` | 成员数组 | 非 `data.members` |
| `m.userName` | `username` | 注意大小写 |
| `m.displayName` \|\| `m.nickName` | `nickname` | displayName 优先级最高 |

> **踩坑记录：** 最初代码假设响应路径为 `data.members`、字段名为小写 `username`/`nickname`，导致成员数据全部丢失。commit 2b19649 修复为实际返回格式。

## 8. 相关文件索引

| 文件 | 说明 |
|------|------|
| `apps/server/prisma/schema.prisma` | Contact / Group / GroupMember 模型定义 |
| `apps/server/src/services/contactSyncService.ts` | 同步核心逻辑 |
| `apps/server/src/services/message.ts` | `ensureContact` / `ensureConversation` |
| `apps/server/src/services/juhexbotAdapter.ts` | juhexbot API 封装和字段映射 |
| `apps/server/src/services/database.ts` | 数据库操作（CRUD、stale 查询、upsert） |
| `apps/server/src/app.ts` | Webhook 处理和异步同步触发 |
| `apps/server/src/index.ts` | 服务初始化和 backfill 调度启动 |
| `apps/server/src/lib/rateLimiter.ts` | 速率限制器实现 |