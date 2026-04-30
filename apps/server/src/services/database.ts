import type { PrismaClient as PrismaClientClass } from '@prisma/client'
type PrismaClientType = InstanceType<typeof PrismaClientClass>
import { prisma as globalPrisma, createPrismaClient } from '../lib/prisma.js'

export class DatabaseService {
  readonly prisma: PrismaClientType

  constructor(url?: string) {
    // 测试环境：为每个实例创建独立的 Prisma Client
    // 生产/开发环境：使用全局单例（忽略 url 参数）
    if (process.env.NODE_ENV === 'test' && url) {
      this.prisma = createPrismaClient(url)
    } else {
      this.prisma = globalPrisma
    }
  }

  async connect() {
    await this.prisma.$connect()
    await this.pushSchema()
  }

  private async hasColumn(tableName: string, columnName: string): Promise<boolean> {
    const columns = await this.prisma.$queryRawUnsafe(
      `PRAGMA table_info("${tableName}")`
    ) as Array<{ name: string }>
    return columns.some((column: { name: string }) => column.name === columnName)
  }

  private async pushSchema() {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Client" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "guid" TEXT NOT NULL,
        "proxy" TEXT,
        "isLoginProxy" BOOLEAN NOT NULL DEFAULT false,
        "bridge" TEXT,
        "syncHistoryMsg" BOOLEAN NOT NULL DEFAULT true,
        "autoStart" BOOLEAN NOT NULL DEFAULT true,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "loginStatus" TEXT NOT NULL DEFAULT 'offline',
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL
      )
    `)
    await this.prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Client_guid_key" ON "Client"("guid")`)

    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Contact" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "username" TEXT NOT NULL,
        "nickname" TEXT NOT NULL,
        "remark" TEXT,
        "avatar" TEXT,
        "type" TEXT NOT NULL,
        "lastSyncAt" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL
      )
    `)
    await this.prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Contact_username_key" ON "Contact"("username")`)

    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Group" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "roomUsername" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "avatar" TEXT,
        "memberCount" INTEGER NOT NULL DEFAULT 0,
        "version" INTEGER,
        "lastSyncAt" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL
      )
    `)
    await this.prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Group_roomUsername_key" ON "Group"("roomUsername")`)

    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "GroupMember" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "groupId" TEXT NOT NULL,
        "username" TEXT NOT NULL,
        "nickname" TEXT,
        "role" TEXT NOT NULL DEFAULT 'member',
        "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE,
        CONSTRAINT "GroupMember_username_fkey" FOREIGN KEY ("username") REFERENCES "Contact" ("username")
      )
    `)
    await this.prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "GroupMember_groupId_username_key" ON "GroupMember"("groupId", "username")`)

    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Conversation" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "clientId" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "contactId" TEXT,
        "groupId" TEXT,
        "unreadCount" INTEGER NOT NULL DEFAULT 0,
        "lastMessageAt" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "Conversation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id"),
        CONSTRAINT "Conversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id"),
        CONSTRAINT "Conversation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id")
      )
    `)

    await this.prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_clientId_groupId_key" ON "Conversation"("clientId", "groupId") WHERE "groupId" IS NOT NULL`)
    await this.prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_clientId_contactId_key" ON "Conversation"("clientId", "contactId") WHERE "contactId" IS NOT NULL`)

    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MessageIndex" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "conversationId" TEXT NOT NULL,
        "msgId" TEXT NOT NULL,
        "msgType" INTEGER NOT NULL,
        "fromUsername" TEXT NOT NULL,
        "toUsername" TEXT NOT NULL,
        "chatroomSender" TEXT,
        "createTime" INTEGER NOT NULL,
        "dataLakeKey" TEXT NOT NULL,
        "isRecalled" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "MessageIndex_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id")
      )
    `)
    await this.prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "MessageIndex_msgId_key" ON "MessageIndex"("msgId")`)

    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MessageStateChange" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "msgId" TEXT NOT NULL,
        "changeType" TEXT NOT NULL,
        "changeTime" INTEGER NOT NULL,
        "changeData" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MessageTag" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "msgId" TEXT NOT NULL,
        "tag" TEXT NOT NULL,
        "source" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MessageEntity" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "msgId" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "value" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DigestEntry" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "conversationId" TEXT NOT NULL,
        "startTime" INTEGER NOT NULL,
        "endTime" INTEGER NOT NULL,
        "summary" TEXT NOT NULL,
        "messageCount" INTEGER NOT NULL,
        "sourceKind" TEXT NOT NULL DEFAULT 'manual',
        "triggerMsgId" TEXT,
        "status" TEXT NOT NULL DEFAULT 'ready',
        "errorMessage" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "KnowledgeCard" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "digestEntryId" TEXT NOT NULL,
        "conversationId" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "summary" TEXT NOT NULL,
        "decisions" TEXT NOT NULL,
        "actionItems" TEXT NOT NULL,
        "risks" TEXT NOT NULL,
        "participants" TEXT NOT NULL,
        "timeAnchors" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "KnowledgeCard_digestEntryId_fkey" FOREIGN KEY ("digestEntryId") REFERENCES "DigestEntry" ("id") ON DELETE CASCADE
      )
    `)

    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Topic" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "kind" TEXT NOT NULL DEFAULT 'window',
        "status" TEXT NOT NULL DEFAULT 'active',
        "title" TEXT NOT NULL,
        "summary" TEXT NOT NULL DEFAULT '',
        "description" TEXT,
        "keywords" TEXT NOT NULL DEFAULT '[]',
        "messageCount" INTEGER NOT NULL DEFAULT 0,
        "participantCount" INTEGER NOT NULL DEFAULT 0,
        "sourceCardCount" INTEGER NOT NULL DEFAULT 0,
        "clusterKey" TEXT,
        "firstSeenAt" INTEGER NOT NULL,
        "lastSeenAt" INTEGER NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL
      )
    `)

    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "TopicMessage" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "topicId" TEXT NOT NULL,
        "msgId" TEXT NOT NULL,
        CONSTRAINT "TopicMessage_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE
      )
    `)

    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "TopicKnowledgeCard" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "topicId" TEXT NOT NULL,
        "knowledgeCardId" TEXT NOT NULL,
        "score" REAL NOT NULL,
        "rank" INTEGER NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "TopicKnowledgeCard_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE
      )
    `)

    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ImportanceRule" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "type" TEXT NOT NULL,
        "value" TEXT NOT NULL,
        "priority" INTEGER NOT NULL DEFAULT 0,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Migrations: add lastSyncAt columns if not exist
    if (!(await this.hasColumn('Contact', 'lastSyncAt'))) {
      await this.prisma.$executeRawUnsafe(`ALTER TABLE "Contact" ADD COLUMN "lastSyncAt" DATETIME`)
    }
    if (!(await this.hasColumn('Group', 'lastSyncAt'))) {
      await this.prisma.$executeRawUnsafe(`ALTER TABLE "Group" ADD COLUMN "lastSyncAt" DATETIME`)
    }
    if (!(await this.hasColumn('MessageIndex', 'isRecalled'))) {
      await this.prisma.$executeRawUnsafe(`ALTER TABLE "MessageIndex" ADD COLUMN "isRecalled" BOOLEAN NOT NULL DEFAULT false`)
    }
    if (!(await this.hasColumn('DigestEntry', 'sourceKind'))) {
      await this.prisma.$executeRawUnsafe(`ALTER TABLE "DigestEntry" ADD COLUMN "sourceKind" TEXT NOT NULL DEFAULT 'manual'`)
    }
    if (!(await this.hasColumn('DigestEntry', 'triggerMsgId'))) {
      await this.prisma.$executeRawUnsafe(`ALTER TABLE "DigestEntry" ADD COLUMN "triggerMsgId" TEXT`)
    }
    if (!(await this.hasColumn('DigestEntry', 'status'))) {
      await this.prisma.$executeRawUnsafe(`ALTER TABLE "DigestEntry" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ready'`)
    }
    if (!(await this.hasColumn('DigestEntry', 'errorMessage'))) {
      await this.prisma.$executeRawUnsafe(`ALTER TABLE "DigestEntry" ADD COLUMN "errorMessage" TEXT`)
    }
    if (!(await this.hasColumn('DigestEntry', 'updatedAt'))) {
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "DigestEntry" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`
      )
    }
    if (!(await this.hasColumn('Topic', 'kind'))) {
      await this.prisma.$executeRawUnsafe(`ALTER TABLE "Topic" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'window'`)
    }
    if (!(await this.hasColumn('Topic', 'status'))) {
      await this.prisma.$executeRawUnsafe(`ALTER TABLE "Topic" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active'`)
    }
    if (!(await this.hasColumn('Topic', 'summary'))) {
      await this.prisma.$executeRawUnsafe(`ALTER TABLE "Topic" ADD COLUMN "summary" TEXT NOT NULL DEFAULT ''`)
    }
    if (!(await this.hasColumn('Topic', 'keywords'))) {
      await this.prisma.$executeRawUnsafe(`ALTER TABLE "Topic" ADD COLUMN "keywords" TEXT NOT NULL DEFAULT '[]'`)
    }
    if (!(await this.hasColumn('Topic', 'participantCount'))) {
      await this.prisma.$executeRawUnsafe(`ALTER TABLE "Topic" ADD COLUMN "participantCount" INTEGER NOT NULL DEFAULT 0`)
    }
    if (!(await this.hasColumn('Topic', 'sourceCardCount'))) {
      await this.prisma.$executeRawUnsafe(`ALTER TABLE "Topic" ADD COLUMN "sourceCardCount" INTEGER NOT NULL DEFAULT 0`)
    }
    if (!(await this.hasColumn('Topic', 'clusterKey'))) {
      await this.prisma.$executeRawUnsafe(`ALTER TABLE "Topic" ADD COLUMN "clusterKey" TEXT`)
    }

    // FileCache table
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "file_cache" (
        "msg_id" TEXT NOT NULL PRIMARY KEY,
        "file_name" TEXT NOT NULL,
        "file_ext" TEXT NOT NULL,
        "file_size" INTEGER NOT NULL,
        "aes_key" TEXT NOT NULL,
        "cdn_file_id" TEXT NOT NULL,
        "md5" TEXT,
        "oss_url" TEXT,
        "status" TEXT NOT NULL DEFAULT 'pending',
        "error_message" TEXT,
        "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "downloaded_at" DATETIME
      )
    `)
    await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "file_cache_status_idx" ON "file_cache"("status")`)
    await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MessageTag_msgId_idx" ON "MessageTag"("msgId")`)
    await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MessageTag_tag_idx" ON "MessageTag"("tag")`)
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "MessageTag_msgId_tag_source_key" ON "MessageTag"("msgId", "tag", "source")`
    )
    await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MessageEntity_msgId_idx" ON "MessageEntity"("msgId")`)
    await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MessageEntity_type_idx" ON "MessageEntity"("type")`)
    await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MessageEntity_value_idx" ON "MessageEntity"("value")`)
    await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DigestEntry_conversationId_idx" ON "DigestEntry"("conversationId")`)
    await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DigestEntry_startTime_idx" ON "DigestEntry"("startTime")`)
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "DigestEntry_conversationId_startTime_endTime_sourceKind_key" ON "DigestEntry"("conversationId", "startTime", "endTime", "sourceKind")`
    )
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "KnowledgeCard_digestEntryId_key" ON "KnowledgeCard"("digestEntryId")`
    )
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "KnowledgeCard_conversationId_idx" ON "KnowledgeCard"("conversationId")`
    )
    await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Topic_lastSeenAt_idx" ON "Topic"("lastSeenAt")`)
    await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Topic_status_lastSeenAt_idx" ON "Topic"("status", "lastSeenAt")`)
    await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TopicMessage_topicId_idx" ON "TopicMessage"("topicId")`)
    await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TopicMessage_msgId_idx" ON "TopicMessage"("msgId")`)
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "TopicMessage_topicId_msgId_key" ON "TopicMessage"("topicId", "msgId")`
    )
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "TopicKnowledgeCard_topicId_knowledgeCardId_key" ON "TopicKnowledgeCard"("topicId", "knowledgeCardId")`
    )
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "TopicKnowledgeCard_topicId_idx" ON "TopicKnowledgeCard"("topicId")`
    )
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "TopicKnowledgeCard_knowledgeCardId_idx" ON "TopicKnowledgeCard"("knowledgeCardId")`
    )
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "ImportanceRule_type_isActive_idx" ON "ImportanceRule"("type", "isActive")`
    )
  }

  async disconnect() {
    await this.prisma.$disconnect()
  }

  // --- Client ---

  async createClient(data: { guid: string }) {
    return this.prisma.client.create({
      data: {
        ...data,
        updatedAt: new Date()
      }
    })
  }

  async findClientByGuid(guid: string) {
    return this.prisma.client.findUnique({ where: { guid } })
  }

  // --- Contact ---

  async createContact(data: { username: string; nickname: string; type: string; remark?: string; avatar?: string }) {
    return this.prisma.contact.create({
      data: {
        ...data,
        updatedAt: new Date()
      }
    })
  }

  async findContactByUsername(username: string) {
    return this.prisma.contact.findUnique({ where: { username } })
  }

  async findContactById(id: string) {
    return this.prisma.contact.findUnique({ where: { id } })
  }

  async findContactsByUsernames(usernames: string[]) {
    if (usernames.length === 0) return []
    return this.prisma.contact.findMany({
      where: { username: { in: usernames } },
      select: { username: true, nickname: true, remark: true }
    })
  }

  async updateContact(username: string, data: { nickname?: string; remark?: string; avatar?: string; lastSyncAt?: Date }) {
    return this.prisma.contact.update({
      where: { username },
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

  async getDirectoryContacts(clientId: string) {
    const [contacts, conversations] = await Promise.all([
      this.prisma.contact.findMany({
        where: {
          type: 'friend',
          OR: [
            {
              conversations: {
                some: {
                  clientId,
                  type: 'private',
                }
              },
            },
            {
              groupMembers: {
                none: {},
              },
            },
          ],
        },
      }),
      this.prisma.conversation.findMany({
        where: {
          clientId,
          contactId: { not: null },
        },
        select: {
          id: true,
          contactId: true,
        }
      }),
    ])

    const conversationIdByContactId = new Map<string, string>()
    for (const conversation of conversations) {
      if (conversation.contactId) {
        conversationIdByContactId.set(conversation.contactId, conversation.id)
      }
    }

    const contactsWithConversationIds = contacts.map((contact: Awaited<ReturnType<typeof this.prisma.contact.findMany>>[number]) => ({
      ...contact,
      conversationId: conversationIdByContactId.get(contact.id) ?? null,
    }))

    return contactsWithConversationIds.sort((left: typeof contactsWithConversationIds[number], right: typeof contactsWithConversationIds[number]) => {
      const leftKey = left.remark || left.nickname || left.username
      const rightKey = right.remark || right.nickname || right.username
      return leftKey.localeCompare(rightKey)
    })
  }

  // --- Group ---

  async createGroup(data: { roomUsername: string; name: string; avatar?: string }) {
    return this.prisma.group.create({
      data: {
        ...data,
        updatedAt: new Date()
      }
    })
  }

  async findGroupById(id: string) {
    return this.prisma.group.findUnique({ where: { id } })
  }

  async findGroupByRoomUsername(roomUsername: string) {
    return this.prisma.group.findUnique({ where: { roomUsername } })
  }

  async updateGroup(roomUsername: string, data: { name?: string; avatar?: string; memberCount?: number; version?: number; lastSyncAt?: Date }) {
    return this.prisma.group.update({
      where: { roomUsername },
      data: { ...data, updatedAt: new Date() }
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

  async getDirectoryGroups(clientId: string) {
    const [groups, conversations] = await Promise.all([
      this.prisma.group.findMany({
        orderBy: { name: 'asc' }
      }),
      this.prisma.conversation.findMany({
        where: {
          clientId,
          groupId: { not: null },
        },
        select: {
          id: true,
          groupId: true,
        }
      }),
    ])

    const conversationIdByGroupId = new Map<string, string>()
    for (const conversation of conversations) {
      if (conversation.groupId) {
        conversationIdByGroupId.set(conversation.groupId, conversation.id)
      }
    }

    return groups.map((group: Awaited<ReturnType<typeof this.prisma.group.findMany>>[number]) => ({
      ...group,
      conversationId: conversationIdByGroupId.get(group.id) ?? null,
    }))
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

  // --- Conversation ---

  async createConversation(data: { clientId: string; type: string; contactId?: string; groupId?: string }) {
    return this.prisma.conversation.create({
      data: {
        ...data,
        updatedAt: new Date()
      }
    })
  }

  async findConversation(clientId: string, peerId: string) {
    // 先按 contactId 查找私聊
    const contact = await this.prisma.contact.findUnique({ where: { username: peerId } })
    if (contact) {
      const conv = await this.prisma.conversation.findFirst({
        where: { clientId, contactId: contact.id }
      })
      if (conv) return conv
    }

    // 按 groupId 查找群聊
    const group = await this.prisma.group.findUnique({ where: { roomUsername: peerId } })
    if (group) {
      const conv = await this.prisma.conversation.findFirst({
        where: { clientId, groupId: group.id }
      })
      if (conv) return conv
    }

    return null
  }

  async updateConversationLastMessage(conversationId: string, lastMessageAt: Date) {
    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt, updatedAt: new Date() }
    })
  }

  async getConversations(clientGuid: string, options: { limit?: number; offset?: number } = {}) {
    const { limit = 50, offset = 0 } = options
    return this.prisma.conversation.findMany({
      where: { client: { guid: clientGuid } },
      include: { contact: true, group: true },
      orderBy: { lastMessageAt: 'desc' },
      take: limit,
      skip: offset
    })
  }

  async findConversationById(id: string) {
    return this.prisma.conversation.findUnique({
      where: { id },
      include: { contact: true, group: true }
    })
  }

  async updateConversation(id: string, data: { unreadCount?: number }) {
    return this.prisma.conversation.update({
      where: { id },
      data: { ...data, updatedAt: new Date() }
    })
  }

  // --- MessageIndex ---

  async createMessageIndex(data: {
    conversationId: string
    msgId: string
    msgType: number
    fromUsername: string
    toUsername: string
    chatroomSender?: string
    createTime: number
    dataLakeKey: string
  }) {
    return this.prisma.messageIndex.create({ data })
  }

  async findMessageIndexByMsgId(msgId: string) {
    return this.prisma.messageIndex.findUnique({
      where: { msgId }
    })
  }

  async findMessageIndexInConversation(conversationId: string, msgId: string) {
    return this.prisma.messageIndex.findFirst({
      where: {
        conversationId,
        msgId
      }
    })
  }

  async updateMessageIndex(msgId: string, data: { isRecalled: boolean }) {
    return this.prisma.messageIndex.update({
      where: { msgId },
      data
    })
  }

  async getMessageIndexes(conversationId: string, options: { limit?: number; before?: number } = {}) {
    const { limit = 50, before } = options
    return this.prisma.messageIndex.findMany({
      where: {
        conversationId,
        msgType: { not: 51 },
        ...(before ? { createTime: { lt: before } } : {})
      },
      orderBy: { createTime: 'desc' },
      take: limit
    })
  }

  // --- MessageStateChange ---

  async createMessageStateChange(data: {
    msgId: string
    changeType: string
    changeTime: number
    changeData?: string
  }) {
    return this.prisma.messageStateChange.create({ data })
  }

  async getMessageStateChanges(msgId: string) {
    return this.prisma.messageStateChange.findMany({
      where: { msgId },
      orderBy: { changeTime: 'asc' }
    })
  }

  // --- FileCache ---

  async createFileCache(data: {
    msgId: string
    fileName: string
    fileExt: string
    fileSize: number
    aesKey: string
    cdnFileId: string
    md5?: string
  }) {
    return this.prisma.fileCache.create({
      data: {
        msgId: data.msgId,
        fileName: data.fileName,
        fileExt: data.fileExt,
        fileSize: data.fileSize,
        aesKey: data.aesKey,
        cdnFileId: data.cdnFileId,
        md5: data.md5,
        status: 'pending'
      }
    })
  }

  async findFileCacheByMsgId(msgId: string) {
    return this.prisma.fileCache.findUnique({
      where: { msgId }
    })
  }

  async updateFileCache(msgId: string, data: {
    status?: string
    ossUrl?: string
    errorMessage?: string
    downloadedAt?: Date
  }) {
    return this.prisma.fileCache.update({
      where: { msgId },
      data
    })
  }
}
