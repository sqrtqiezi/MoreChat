import { PrismaClient } from '@prisma/client'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

export const E2E_MESSAGING_CLIENT_ID = 'client_e2e_messaging'
export const E2E_MESSAGING_CLIENT_GUID = 'guid-e2e-messaging'
export const E2E_MESSAGING_SELF_CONTACT_ID = 'contact_e2e_messaging_self'
export const E2E_MESSAGING_SELF_USERNAME = 'wxid_e2e_messaging_user'
export const E2E_MESSAGING_SELF_NICKNAME = 'E2E Messaging User'
export const E2E_MESSAGING_CONTACT_ID = 'contact_e2e_messaging_peer'
export const E2E_MESSAGING_CONTACT_USERNAME = 'wxid_e2e_messaging_peer'
export const E2E_MESSAGING_CONTACT_NICKNAME = 'E2E Messaging Peer'
export const E2E_MESSAGING_CONVERSATION_ID = 'conv_e2e_messaging_private'
export const E2E_MESSAGING_INITIAL_MESSAGE_INDEX_ID = 'msgidx_e2e_messaging_initial'
export const E2E_MESSAGING_INITIAL_MESSAGE_ID = 'msg_e2e_messaging_initial'
export const E2E_MESSAGING_INITIAL_MESSAGE_CONTENT = 'E2E baseline message: hello from the seeded contact.'
export function getRecentMessagingSeedTimestamp(now: Date = new Date()) {
  const localNoon = new Date(now)
  localNoon.setHours(12, 0, 0, 0)

  if (localNoon.getTime() > now.getTime()) {
    localNoon.setDate(localNoon.getDate() - 1)
  }

  return Math.floor(localNoon.getTime() / 1000)
}

const prisma = new PrismaClient()

interface ResetOptions {
  prisma: PrismaClient
  dataLakePath: string
  quiet?: boolean
}

async function removeIfExists(targetPath: string) {
  await fs.rm(targetPath, { recursive: true, force: true })
}

function isMessagingE2EMessage(raw: string, msgIds: Set<string>) {
  try {
    const parsed = JSON.parse(raw) as {
      msg_id?: string
      from_username?: string
      to_username?: string
      chatroom?: string
      chatroom_sender?: string
    }

    if (parsed.msg_id && msgIds.has(parsed.msg_id)) {
      return true
    }

    if (parsed.chatroom || parsed.chatroom_sender) {
      return false
    }

    const participants = new Set([parsed.from_username, parsed.to_username])
    return (
      participants.has(E2E_MESSAGING_SELF_USERNAME) &&
      participants.has(E2E_MESSAGING_CONTACT_USERNAME)
    )
  } catch {
    return false
  }
}

async function pruneRawLakeFiles(dataLakePath: string, msgIds: Set<string>) {
  const rawDir = path.join(dataLakePath, 'raw')

  let entries: string[]
  try {
    entries = await fs.readdir(rawDir)
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return 0
    }
    throw error
  }

  let touchedFiles = 0

  for (const entry of entries) {
    if (!entry.endsWith('.jsonl')) {
      continue
    }

    const filePath = path.join(rawDir, entry)
    const content = await fs.readFile(filePath, 'utf-8')
    const lines = content.split('\n').filter(Boolean)
    const filteredLines = lines.filter((line) => !isMessagingE2EMessage(line, msgIds))

    if (filteredLines.length === lines.length) {
      continue
    }

    touchedFiles += 1

    if (filteredLines.length === 0) {
      await fs.rm(filePath, { force: true })
      continue
    }

    await fs.writeFile(filePath, `${filteredLines.join('\n')}\n`, 'utf-8')
  }

  return touchedFiles
}

export async function resetMessagingE2EState({ prisma, dataLakePath, quiet = false }: ResetOptions) {
  const e2eClient = await prisma.client.findUnique({
    where: { guid: E2E_MESSAGING_CLIENT_GUID },
    select: { id: true },
  })

  const e2eContact = await prisma.contact.findUnique({
    where: { username: E2E_MESSAGING_CONTACT_USERNAME },
    select: { id: true },
  })

  const conversations = await prisma.conversation.findMany({
    where: {
      OR: [
        { id: E2E_MESSAGING_CONVERSATION_ID },
        ...(e2eClient
          ? [{ clientId: e2eClient.id }]
          : []),
        ...(e2eClient && e2eContact
          ? [{ clientId: e2eClient.id, contactId: e2eContact.id }]
          : []),
      ],
    },
    select: { id: true },
  })

  const conversationIds = Array.from(
    new Set([E2E_MESSAGING_CONVERSATION_ID, ...conversations.map((conversation) => conversation.id)])
  )

  const messageIndexes = await prisma.messageIndex.findMany({
    where: {
      OR: [
        { msgId: E2E_MESSAGING_INITIAL_MESSAGE_ID },
        { conversationId: { in: conversationIds } },
      ],
    },
    select: { msgId: true },
  })
  const msgIds = Array.from(new Set(messageIndexes.map((messageIndex) => messageIndex.msgId)))
  const msgIdSet = new Set(msgIds)

  await prisma.$transaction(async (tx) => {
    if (msgIds.length > 0) {
      await tx.messageEntity.deleteMany({ where: { msgId: { in: msgIds } } })
      await tx.messageTag.deleteMany({ where: { msgId: { in: msgIds } } })
      await tx.messageStateChange.deleteMany({ where: { msgId: { in: msgIds } } })
      await tx.imageCache.deleteMany({ where: { msgId: { in: msgIds } } })
      await tx.fileCache.deleteMany({ where: { msgId: { in: msgIds } } })
    }

    await tx.messageIndex.deleteMany({
      where: {
        OR: [
          { msgId: E2E_MESSAGING_INITIAL_MESSAGE_ID },
          { conversationId: { in: conversationIds } },
        ],
      },
    })

    await tx.digestEntry.deleteMany({
      where: {
        conversationId: { in: conversationIds },
      },
    })

    await tx.conversation.deleteMany({
      where: {
        id: { in: conversationIds },
      },
    })

    await tx.contact.deleteMany({
      where: {
        username: {
          in: [E2E_MESSAGING_SELF_USERNAME, E2E_MESSAGING_CONTACT_USERNAME],
        },
      },
    })

    await tx.client.deleteMany({
      where: {
        guid: E2E_MESSAGING_CLIENT_GUID,
      },
    })
  })

  for (const conversationId of conversationIds) {
    await removeIfExists(path.join(dataLakePath, 'hot', conversationId))
    await removeIfExists(path.join(dataLakePath, conversationId))
    await removeIfExists(path.join(dataLakePath, 'conversations', conversationId))
  }

  const touchedRawFiles = await pruneRawLakeFiles(dataLakePath, msgIdSet)

  if (!quiet) {
    console.log('🧹 Reset messaging E2E state complete')
    console.log(`   clientGuid: ${E2E_MESSAGING_CLIENT_GUID}`)
    console.log(`   conversationIds cleared: ${conversationIds.join(', ')}`)
    console.log(`   raw lake files pruned: ${touchedRawFiles}`)
  }
}

async function main() {
  const dataLakePath = path.resolve(process.cwd(), process.env.DATA_LAKE_PATH || './data/lake')
  await resetMessagingE2EState({ prisma, dataLakePath })
}

const isDirectRun =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  main()
    .catch((error) => {
      console.error('❌ Failed to reset messaging E2E state:', error)
      process.exit(1)
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}
