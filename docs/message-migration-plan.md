# 消息数据迁移方案

## 问题

修复前的消息使用错误的 `conversationId`，导致：
- 自己发给别人的消息都归到了 `njin_cool` 会话
- 需要重新处理所有历史消息，按正确的会话归属重建索引

## 方案：全量重置消息索引

### 核心思路

1. **保留 DataLake 原始数据**（不动）
2. **清空 MessageIndex 表**
3. **重新扫描 DataLake**，用修复后的逻辑重建索引
4. **重新计算会话的 lastMessageAt**

### 实现步骤

#### Step 1: 创建迁移脚本

**文件：** `apps/server/src/scripts/migrate-messages.ts`

```typescript
import { PrismaClient } from '@prisma/client'
import { DataLakeService } from '../services/dataLake.js'
import { JuhexbotAdapter } from '../services/juhexbotAdapter.js'
import { env } from '../lib/env.js'
import { logger } from '../lib/logger.js'
import fs from 'fs/promises'
import path from 'path'

async function main() {
  const prisma = new PrismaClient()
  const dataLake = new DataLakeService({
    type: env.DATA_LAKE_TYPE as 'filesystem',
    path: env.DATA_LAKE_PATH
  })

  // 获取 clientUsername
  const juhexbotAdapter = new JuhexbotAdapter({
    apiUrl: env.JUHEXBOT_API_URL,
    appKey: env.JUHEXBOT_APP_KEY,
    appSecret: env.JUHEXBOT_APP_SECRET,
    clientGuid: env.JUHEXBOT_CLIENT_GUID
  })
  const userProfile = await juhexbotAdapter.getProfile()
  const clientUsername = userProfile.username
  logger.info({ clientUsername }, 'Client username fetched')

  // 获取 client
  const client = await prisma.client.findUnique({
    where: { guid: env.JUHEXBOT_CLIENT_GUID }
  })
  if (!client) throw new Error('Client not found')

  logger.info('Starting migration...')

  // Step 1: 清空 MessageIndex
  const deletedCount = await prisma.messageIndex.deleteMany({})
  logger.info({ count: deletedCount.count }, 'Deleted all message indexes')

  // Step 2: 扫描 DataLake 所有消息文件
  const lakePath = path.resolve(env.DATA_LAKE_PATH)
  const conversationsDir = path.join(lakePath, 'conversations')

  const conversationDirs = await fs.readdir(conversationsDir)
  logger.info({ count: conversationDirs.length }, 'Found conversation directories')

  let totalMessages = 0
  let migratedMessages = 0
  const conversationLastMessageMap = new Map<string, number>()

  for (const convDirName of conversationDirs) {
    const messagesDir = path.join(conversationsDir, convDirName, 'messages')
    try {
      const messageFiles = await fs.readdir(messagesDir)
      totalMessages += messageFiles.length

      for (const messageFile of messageFiles) {
        const filePath = path.join(messagesDir, messageFile)
        const content = await fs.readFile(filePath, 'utf-8')
        const rawMessage = JSON.parse(content)

        // 重新计算正确的 conversationId
        const correctConversationId = getCorrectConversationId(
          rawMessage,
          clientUsername
        )

        // 查找或创建正确的会话
        const conversation = await ensureConversation(
          prisma,
          client.id,
          correctConversationId,
          rawMessage.is_chatroom_msg === 1
        )

        // 计算新的 dataLakeKey
        const timestamp = rawMessage.create_time
        const msgId = rawMessage.msg_id
        const newDataLakeKey = `conversations/${conversation.id}/messages/${timestamp}_${msgId}.json`

        // 创建新的 MessageIndex
        await prisma.messageIndex.create({
          data: {
            conversationId: conversation.id,
            msgId: rawMessage.msg_id,
            msgType: rawMessage.msg_type,
            fromUsername: rawMessage.from_username,
            toUsername: rawMessage.to_username,
            chatroomSender: rawMessage.chatroom_sender || undefined,
            createTime: rawMessage.create_time,
            dataLakeKey: newDataLakeKey
          }
        })

        // 移动 DataLake 文件到正确位置（如果需要）
        if (convDirName !== conversation.id) {
          const newFilePath = path.join(lakePath, newDataLakeKey)
          const newDir = path.dirname(newFilePath)
          await fs.mkdir(newDir, { recursive: true })
          await fs.rename(filePath, newFilePath)
        }

        // 记录最新消息时间
        const currentMax = conversationLastMessageMap.get(conversation.id) || 0
        if (rawMessage.create_time > currentMax) {
          conversationLastMessageMap.set(conversation.id, rawMessage.create_time)
        }

        migratedMessages++
        if (migratedMessages % 100 === 0) {
          logger.info({ migratedMessages, totalMessages }, 'Migration progress')
        }
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        logger.error({ convDirName, error }, 'Error processing conversation')
      }
    }
  }

  // Step 3: 更新所有会话的 lastMessageAt
  for (const [conversationId, lastMessageTime] of conversationLastMessageMap) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: new Date(lastMessageTime * 1000),
        updatedAt: new Date()
      }
    })
  }

  // Step 4: 清理空的会话目录
  for (const convDirName of conversationDirs) {
    const messagesDir = path.join(conversationsDir, convDirName, 'messages')
    try {
      const files = await fs.readdir(messagesDir)
      if (files.length === 0) {
        await fs.rm(path.join(conversationsDir, convDirName), { recursive: true })
        logger.info({ convDirName }, 'Removed empty conversation directory')
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        logger.error({ convDirName, error }, 'Error cleaning up directory')
      }
    }
  }

  logger.info({ totalMessages, migratedMessages }, 'Migration completed')
  await prisma.$disconnect()
}

function getCorrectConversationId(
  rawMessage: any,
  clientUsername: string
): string {
  // 群聊
  if (rawMessage.is_chatroom_msg === 1) {
    return rawMessage.chatroom
  }

  // 私聊：判断方向
  if (rawMessage.from_username === clientUsername) {
    // 自己发的 → 对方 username
    return rawMessage.to_username
  }

  // 别人发的 → 发送者 username
  return rawMessage.from_username
}

async function ensureConversation(
  prisma: PrismaClient,
  clientId: string,
  peerId: string,
  isChatroom: boolean
) {
  // 查找已有会话
  if (isChatroom) {
    const group = await prisma.group.findUnique({ where: { roomUsername: peerId } })
    if (group) {
      const conv = await prisma.conversation.findFirst({
        where: { clientId, groupId: group.id }
      })
      if (conv) return conv
    }

    // 创建群组和会话
    const newGroup = await prisma.group.upsert({
      where: { roomUsername: peerId },
      create: { roomUsername: peerId, name: peerId },
      update: {}
    })
    return await prisma.conversation.upsert({
      where: {
        clientId_groupId: { clientId, groupId: newGroup.id }
      },
      create: {
        clientId,
        type: 'group',
        groupId: newGroup.id
      },
      update: {}
    })
  } else {
    // 私聊
    const contact = await prisma.contact.findUnique({ where: { username: peerId } })
    if (contact) {
      const conv = await prisma.conversation.findFirst({
        where: { clientId, contactId: contact.id }
      })
      if (conv) return conv
    }

    // 创建联系人和会话
    const newContact = await prisma.contact.upsert({
      where: { username: peerId },
      create: {
        username: peerId,
        nickname: peerId,
        type: peerId.endsWith('@chatroom') ? 'group' : 'friend'
      },
      update: {}
    })
    return await prisma.conversation.upsert({
      where: {
        clientId_contactId: { clientId, contactId: newContact.id }
      },
      create: {
        clientId,
        type: 'private',
        contactId: newContact.id
      },
      update: {}
    })
  }
}

main().catch((error) => {
  logger.error({ error }, 'Migration failed')
  process.exit(1)
})
```

#### Step 2: 添加 Prisma unique 约束

**文件：** `apps/server/prisma/schema.prisma`

在 `Conversation` model 中添加：

```prisma
model Conversation {
  // ... 现有字段

  @@unique([clientId, contactId])
  @@unique([clientId, groupId])
}
```

然后运行：
```bash
cd apps/server
npx prisma migrate dev --name add-conversation-unique-constraints
```

#### Step 3: 添加 npm script

**文件：** `apps/server/package.json`

```json
{
  "scripts": {
    "migrate:messages": "tsx src/scripts/migrate-messages.ts"
  }
}
```

#### Step 4: 执行迁移

**本地测试：**
```bash
cd apps/server
# 备份数据库
cp data/morechat.db data/morechat.db.backup

# 执行迁移
pnpm migrate:messages
```

**生产环境：**
```bash
ssh diting-server
cd /opt/morechat/apps/server

# 停止服务
pm2 stop morechat

# 备份数据库和 DataLake
cp data/morechat.db data/morechat.db.backup.$(date +%Y%m%d_%H%M%S)
tar -czf data/lake.backup.$(date +%Y%m%d_%H%M%S).tar.gz data/lake/

# 执行迁移
node dist/scripts/migrate-messages.js

# 重启服务
pm2 restart morechat
```

### 预期结果

1. **MessageIndex 表重建**：所有消息按正确的 conversationId 索引
2. **DataLake 文件重组**：消息文件移动到正确的会话目录
3. **会话 lastMessageAt 更新**：反映真实的最后消息时间
4. **空会话目录清理**：删除没有消息的旧会话目录

### 回滚方案

如果迁移失败：

```bash
# 恢复数据库
cp data/morechat.db.backup data/morechat.db

# 恢复 DataLake
rm -rf data/lake
tar -xzf data/lake.backup.YYYYMMDD_HHMMSS.tar.gz

# 重启服务
pm2 restart morechat
```

### 注意事项

1. **停机时间**：迁移期间服务不可用，预计 1000 条消息约需 1-2 分钟
2. **数据备份**：务必先备份数据库和 DataLake
3. **幂等性**：脚本使用 `upsert`，可重复执行
4. **日志监控**：观察迁移日志，确认无错误

### 验证

迁移完成后验证：

```bash
# 1. 检查 njin_cool 会话消息数
cd /opt/morechat/apps/server
node -e "
const { PrismaClient } = require('./node_modules/.prisma/client/index.js');
const p = new PrismaClient();
p.conversation.findFirst({
  where: { contact: { username: 'njin_cool' } },
  include: { _count: { select: { messageIndexes: true } } }
}).then(c => {
  console.log('njin_cool conversation messages:', c?._count.messageIndexes || 0);
  // 预期：只有自发自收消息（type 51），大幅减少
}).finally(() => p.\$disconnect());
"

# 2. 检查其他会话消息数
node -e "
const { PrismaClient } = require('./node_modules/.prisma/client/index.js');
const p = new PrismaClient();
p.conversation.findMany({
  where: { type: 'private', contact: { username: { not: 'njin_cool' } } },
  include: { contact: true, _count: { select: { messageIndexes: true } } },
  orderBy: { _count: { messageIndexes: 'desc' } },
  take: 10
}).then(convs => {
  console.log('Top conversations:');
  convs.forEach(c => console.log(c.contact.username, ':', c._count.messageIndexes));
  // 预期：weixin, gh_xxx 等会话有消息
}).finally(() => p.\$disconnect());
"

# 3. 前端验证
# 登录前端，检查会话列表和消息显示是否正确
```
