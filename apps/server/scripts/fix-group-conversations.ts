import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Starting migration: fix group conversations...')

  // 1. 找到所有 type='group' 但 groupId=null 的会话
  const brokenConversations = await prisma.conversation.findMany({
    where: {
      type: 'group',
      groupId: null
    },
    include: {
      messageIndexes: {
        take: 1,
        orderBy: { createTime: 'asc' }
      }
    }
  })

  console.log(`Found ${brokenConversations.length} conversations without groupId`)

  let fixed = 0
  let errors = 0

  for (const conv of brokenConversations) {
    try {
      // 从消息索引中获取群聊 roomUsername
      const firstMessage = conv.messageIndexes[0]
      if (!firstMessage) {
        console.log(`  Skipping conversation ${conv.id}: no messages`)
        continue
      }

      // 群聊消息的 toUsername 或 fromUsername 中包含 @chatroom
      const roomUsername = firstMessage.toUsername.endsWith('@chatroom')
        ? firstMessage.toUsername
        : firstMessage.fromUsername.endsWith('@chatroom')
        ? firstMessage.fromUsername
        : null

      if (!roomUsername) {
        console.log(`  Skipping conversation ${conv.id}: cannot determine roomUsername`)
        continue
      }

      // 查找或创建 Group
      let group = await prisma.group.findUnique({
        where: { roomUsername }
      })

      if (!group) {
        group = await prisma.group.create({
          data: {
            roomUsername,
            name: roomUsername
          }
        })
        console.log(`  Created group: ${roomUsername}`)
      }

      // 更新会话的 groupId
      await prisma.conversation.update({
        where: { id: conv.id },
        data: { groupId: group.id }
      })

      fixed++
      if (fixed % 50 === 0) {
        console.log(`  Progress: ${fixed}/${brokenConversations.length}`)
      }
    } catch (error: any) {
      errors++
      console.error(`  Error fixing conversation ${conv.id}:`, error.message)
    }
  }

  console.log(`\nMigration complete:`)
  console.log(`  Fixed: ${fixed}`)
  console.log(`  Errors: ${errors}`)
  console.log(`  Total: ${brokenConversations.length}`)
}

main()
  .catch((e) => {
    console.error('Migration failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
