import { PrismaClient } from '@prisma/client'
import { prisma as globalPrisma, createPrismaClient } from '../lib/prisma'

export class DatabaseService {
  private prisma: PrismaClient

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

  async getMessageIndexes(conversationId: string, options: { limit?: number; before?: number } = {}) {
    const { limit = 50, before } = options
    return this.prisma.messageIndex.findMany({
      where: {
        conversationId,
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
}
