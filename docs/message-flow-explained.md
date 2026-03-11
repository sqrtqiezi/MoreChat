# MoreChat 消息处理完整流程

## 1. 消息接收流程（Webhook → 存储）

### 1.1 Webhook 入口
**文件：** `apps/server/src/app.ts:50-85`

```
juhexbot 发送 webhook → POST /webhook
  ↓
接收 payload (JSON)
  ↓
JuhexbotAdapter.parseWebhookPayload(payload)
  ↓
返回 ParsedWebhookPayload {
  guid: "7092457f-...",
  notifyType: 1010,
  message: {
    msgId, msgType, fromUsername, toUsername,
    chatroomSender, chatroom, content, ...
  }
}
```

### 1.2 确定会话 ID
**文件：** `apps/server/src/services/juhexbotAdapter.ts:85-103`

```typescript
getConversationId(parsed: ParsedWebhookPayload): string {
  // 群聊：返回群 ID
  if (parsed.message.isChatroomMsg) {
    return parsed.message.chatroom  // 例如 "38733837988@chatroom"
  }

  // 私聊：判断消息方向
  const selfIdentifier = this.config.clientUsername || this.config.clientGuid
  // selfIdentifier = "njin_cool" (登录用户的微信用户名)

  if (parsed.message.fromUsername === selfIdentifier) {
    // 自己发的消息 → 返回对方 username
    return parsed.message.toUsername  // 例如 "weixin", "gh_xxx"
  }

  // 别人发的消息 → 返回发送者 username
  return parsed.message.fromUsername  // 例如 "wxid_abw19y0lhwkt12"
}
```

**关键逻辑：**
- 群聊：会话 ID = 群 ID
- 私聊（自己发）：会话 ID = 对方 username
- 私聊（别人发）：会话 ID = 发送者 username

**结果：** 每个私聊会话用对方的 username 标识，确保一对一映射。

### 1.3 处理消息
**文件：** `apps/server/src/services/message.ts:32-103`

```
MessageService.handleIncomingMessage(parsed)
  ↓
1. 确保联系人存在
   ensureContact(fromUsername)
   ensureContact(toUsername)
  ↓
2. 获取会话 ID
   conversationId = adapter.getConversationId(parsed)
   // 例如：私聊 njin_cool → weixin，conversationId = "weixin"
  ↓
3. 确保会话存在
   conversation = ensureConversation(clientGuid, conversationId, isChatroomMsg)
   // 查找或创建 Conversation 记录
  ↓
4. 保存原始消息到 DataLake
   dataLakeKey = dataLake.saveMessage(conversation.id, chatMessage)
   // 路径：conversations/{conversation.id}/messages/{timestamp}_{msgId}.json
  ↓
5. 创建消息索引
   db.createMessageIndex({
     conversationId: conversation.id,
     msgId, msgType, fromUsername, toUsername,
     chatroomSender, createTime, dataLakeKey
   })
  ↓
6. 更新会话最后消息时间
   db.updateConversationLastMessage(conversation.id, new Date(createTime * 1000))
  ↓
7. 广播 WebSocket 事件
   wsService.broadcast('message:new', { conversationId, message })
```

### 1.4 会话查找/创建逻辑
**文件：** `apps/server/src/services/database.ts:254-274`

```typescript
async findConversation(clientId: string, peerId: string) {
  // peerId 是 username，例如 "weixin", "gh_xxx", "njin_cool"

  // 1. 查找 contact
  const contact = await prisma.contact.findUnique({ where: { username: peerId } })
  if (contact) {
    // 2. 查找关联的会话
    const conv = await prisma.conversation.findFirst({
      where: { clientId, contactId: contact.id }
    })
    if (conv) return conv
  }

  // 3. 如果是群聊，按 groupId 查找
  const group = await prisma.group.findUnique({ where: { roomUsername: peerId } })
  if (group) {
    const conv = await prisma.conversation.findFirst({
      where: { clientId, groupId: group.id }
    })
    if (conv) return conv
  }

  return null
}
```

**关键：** 通过 `peerId` (username) 找到 contact/group，再找到关联的 conversation。

---

## 2. 消息发送流程（用户 → juhexbot）

### 2.1 前端发起
**文件：** `apps/web/src/hooks/useMessages.ts`

```
用户输入消息 → MessageInput 组件
  ↓
useSendMessage() mutation
  ↓
chatApi.sendMessage(conversationId, content)
  ↓
POST /api/messages/send
  body: { conversationId, content }
```

### 2.2 后端处理
**文件：** `apps/server/src/services/message.ts:196-251`

```
MessageService.sendMessage(conversationId, content)
  ↓
1. 获取会话信息
   conversation = db.findConversationById(conversationId)
  ↓
2. 确定接收者
   if (conversation.type === 'group') {
     toUsername = group.roomUsername  // 群 ID
   } else {
     toUsername = contact.username    // 对方 username
   }
  ↓
3. 调用 juhexbot API 发送
   { msgId } = adapter.sendTextMessage(toUsername, content)
   // POST /message/send_text
  ↓
4. 保存到 DataLake
   chatMessage = {
     msg_id: msgId,
     from_username: this.clientUsername,  // "njin_cool"
     to_username: toUsername,             // 对方 username
     content,
     create_time: Math.floor(Date.now() / 1000),
     msg_type: 1,
     ...
   }
   dataLakeKey = dataLake.saveMessage(conversationId, chatMessage)
  ↓
5. 创建消息索引
   db.createMessageIndex({
     conversationId,
     msgId, msgType: 1,
     fromUsername: this.clientUsername,  // "njin_cool"
     toUsername,
     createTime, dataLakeKey
   })
  ↓
6. 更新会话最后消息时间
  ↓
7. 返回 msgId
```

**关键：** 发送的消息 `fromUsername` 填充为 `clientUsername` ("njin_cool")，而不是空字符串。

---

## 3. 消息读取流程（API → 前端）

### 3.1 前端请求
**文件：** `apps/web/src/hooks/useMessages.ts`

```
useMessages(conversationId)
  ↓
TanStack Query 自动调用
  ↓
chatApi.getMessages(conversationId, { limit: 20 })
  ↓
GET /api/conversations/:id/messages?limit=20
```

### 3.2 后端查询
**文件：** `apps/server/src/services/conversationService.ts:27-64`

```
ConversationService.getMessages(conversationId, { limit, before })
  ↓
1. 查询消息索引（按时间倒序）
   indexes = db.getMessageIndexes(conversationId, { limit, before })
   // 返回 MessageIndex[] 含 dataLakeKey
  ↓
2. 从 DataLake 批量获取原始消息
   rawMessages = dataLake.getMessages(indexes.map(i => i.dataLakeKey))
   // 读取 JSON 文件
  ↓
3. 转换字段名（snake_case → camelCase）
   messages = rawMessages.map(m => ({
     msgId: m.msg_id,
     fromUsername: m.from_username,
     toUsername: m.to_username,
     content: m.content,
     createTime: m.create_time,
     msgType: m.msg_type,
     ...
   }))
  ↓
4. 处理消息内容（XML 解析、displayType 生成）
   messages = messages.map(m => ({
     ...m,
     displayType: processMessageContent(m.msgType, m.content).displayType,
     displayContent: processMessageContent(m.msgType, m.content).displayContent
   }))
  ↓
5. 反转为升序（旧→新）
   messages.reverse()
  ↓
6. 返回 { messages, hasMore }
```

### 3.3 前端渲染
**文件：** `apps/web/src/api/chat.ts:76-91`

```
chatApi.getMessages() 返回 ApiMessage[]
  ↓
mapMessage(raw, conversationId, contactNameMap)
  ↓
判断 isMine
  const isMine = currentUser ? raw.fromUsername === currentUser.username : false
  // currentUser.username = "njin_cool"
  // 如果 raw.fromUsername === "njin_cool" → isMine = true
  ↓
返回 Message {
  id, conversationId, senderId, senderName,
  content, timestamp, status,
  isMine,  // 决定消息显示在左侧还是右侧
  msgType, displayType
}
  ↓
MessageList 虚拟滚动渲染
  ↓
MessageItem 根据 isMine 决定样式
  if (isMine) {
    // 右对齐，蓝色气泡
  } else {
    // 左对齐，灰色气泡，显示发送者名称
  }
```

---

## 4. 关键数据结构

### 4.1 数据库 Schema

```prisma
model Client {
  id            String         @id @default(cuid())
  guid          String         @unique  // juhexbot UUID
  conversations Conversation[]
}

model Contact {
  id            String         @id @default(cuid())
  username      String         @unique  // 微信用户名，例如 "njin_cool", "gh_xxx"
  nickname      String
  remark        String?
  avatar        String?
  type          String         // "friend" | "group"
  conversations Conversation[]
}

model Conversation {
  id              String         @id @default(cuid())
  clientId        String
  type            String         // "private" | "group"
  contactId       String?        // 私聊：指向 Contact
  groupId         String?        // 群聊：指向 Group
  unreadCount     Int            @default(0)
  lastMessageAt   DateTime?
  client          Client         @relation(...)
  contact         Contact?       @relation(...)
  group           Group?         @relation(...)
  messageIndexes  MessageIndex[]
}

model MessageIndex {
  id             String       @id @default(cuid())
  conversationId String
  msgId          String       @unique
  msgType        Int
  fromUsername   String       // 发送者微信用户名
  toUsername     String       // 接收者微信用户名
  chatroomSender String?      // 群聊中的实际发送者
  createTime     Int          // Unix 时间戳（秒）
  dataLakeKey    String       // DataLake 文件路径
  conversation   Conversation @relation(...)
}
```

### 4.2 DataLake 文件结构

```
data/lake/
└── conversations/
    ├── {conversationId}/
    │   └── messages/
    │       ├── {timestamp}_{msgId}.json
    │       ├── {timestamp}_{msgId}.json
    │       └── ...
    └── ...
```

**消息文件内容：**
```json
{
  "msg_id": "123456789",
  "from_username": "njin_cool",
  "to_username": "weixin",
  "content": "你好",
  "create_time": 1773199045,
  "msg_type": 1,
  "chatroom_sender": "",
  "desc": "",
  "is_chatroom_msg": 0,
  "chatroom": "",
  "source": "..."
}
```

---

## 5. 消息方向判断总结

### 5.1 接收消息（webhook）

| 场景 | fromUsername | toUsername | conversationId | 说明 |
|------|-------------|-----------|---------------|------|
| 别人发给我 | `wxid_abc` | `njin_cool` | `wxid_abc` | 会话归属对方 |
| 我发给别人 | `njin_cool` | `weixin` | `weixin` | 会话归属对方 |
| 我发给自己 | `njin_cool` | `njin_cool` | `njin_cool` | 会话归属自己 |
| 群聊消息 | `群ID@chatroom` | `njin_cool` | `群ID@chatroom` | 会话归属群 |

### 5.2 发送消息（API）

| 场景 | fromUsername | toUsername | conversationId | 说明 |
|------|-------------|-----------|---------------|------|
| 我发给别人 | `njin_cool` | `weixin` | `weixin` 对应的会话 ID | 存储时填充 clientUsername |
| 我发给群 | `njin_cool` | `群ID@chatroom` | 群会话 ID | 存储时填充 clientUsername |

### 5.3 前端显示

```typescript
const isMine = raw.fromUsername === currentUser.username
// currentUser.username = "njin_cool"

// 如果 fromUsername === "njin_cool" → 右侧蓝色气泡
// 如果 fromUsername !== "njin_cool" → 左侧灰色气泡
```

---

## 6. 修复前后对比

### 修复前（Bug）

```typescript
// getConversationId() 使用 clientGuid (UUID)
const selfIdentifier = this.config.clientGuid  // "7092457f-..."

if (parsed.message.fromUsername === selfIdentifier) {
  // njin_cool !== 7092457f-... → 永远 false
  return parsed.message.toUsername
}
return parsed.message.fromUsername  // 总是返回 "njin_cool"
```

**结果：** 所有自己发的消息都归到 `njin_cool` 会话。

### 修复后（正确）

```typescript
// getConversationId() 使用 clientUsername (微信用户名)
const selfIdentifier = this.config.clientUsername  // "njin_cool"

if (parsed.message.fromUsername === selfIdentifier) {
  // njin_cool === njin_cool → true
  return parsed.message.toUsername  // 返回对方 username
}
return parsed.message.fromUsername
```

**结果：** 自己发的消息归到对方会话，正确分离。

---

## 7. 数据迁移需求

**问题：** 修复前存储的 1104 条消息在 `njin_cool` 会话中，但其中很多应该在其他会话。

**解决方案：**
1. 读取 `njin_cool` 会话的所有消息
2. 对于 `fromUsername === "njin_cool" && toUsername !== "njin_cool"` 的消息：
   - 找到或创建 `toUsername` 对应的会话
   - 将消息索引的 `conversationId` 更新为正确的会话 ID
   - 移动 DataLake 文件到正确的会话目录
3. 更新各会话的 `lastMessageAt`

**注意：** 自发自收消息（`toUsername === "njin_cool"`）保留在 `njin_cool` 会话。
