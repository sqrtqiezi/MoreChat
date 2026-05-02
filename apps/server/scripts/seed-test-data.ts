import { PrismaClient } from '@prisma/client'
import path from 'path'
import { DataLakeService, type ChatMessage } from '../src/services/dataLake.js'
import {
  E2E_MESSAGING_CLIENT_GUID,
  E2E_MESSAGING_CLIENT_ID,
  E2E_MESSAGING_CONTACT_ID,
  E2E_MESSAGING_CONTACT_NICKNAME,
  E2E_MESSAGING_CONTACT_USERNAME,
  E2E_MESSAGING_CONVERSATION_ID,
  E2E_MESSAGING_INITIAL_MESSAGE_CONTENT,
  E2E_MESSAGING_INITIAL_MESSAGE_ID,
  E2E_MESSAGING_INITIAL_MESSAGE_INDEX_ID,
  E2E_MESSAGING_INITIAL_MESSAGE_TIMESTAMP,
  E2E_MESSAGING_SELF_CONTACT_ID,
  E2E_MESSAGING_SELF_NICKNAME,
  E2E_MESSAGING_SELF_USERNAME,
  resetMessagingE2EState,
} from './reset-e2e-messaging.js'

const prisma = new PrismaClient()

type Scenario = 'messaging'

function parseScenario(argv: string[]): Scenario {
  const scenarioFlagIndex = argv.findIndex((arg) => arg === '--scenario')
  const scenarioValue = scenarioFlagIndex >= 0 ? argv[scenarioFlagIndex + 1] : undefined
  const scenario = scenarioValue ?? 'messaging'

  if (scenario !== 'messaging') {
    throw new Error(`Unsupported scenario "${scenario}". Supported scenarios: messaging`)
  }

  return scenario
}

function getDataLakePath() {
  return path.resolve(process.cwd(), process.env.DATA_LAKE_PATH || './data/lake')
}

async function seedMessagingScenario() {
  console.log('🌱 Seeding messaging E2E baseline...')

  const dataLakePath = getDataLakePath()
  await resetMessagingE2EState({ prisma, dataLakePath, quiet: true })

  const client = await prisma.client.create({
    data: {
      id: E2E_MESSAGING_CLIENT_ID,
      guid: E2E_MESSAGING_CLIENT_GUID,
      loginStatus: 'online',
      isActive: true,
      autoStart: false,
      syncHistoryMsg: true,
    },
  })

  await prisma.contact.createMany({
    data: [
      {
        id: E2E_MESSAGING_SELF_CONTACT_ID,
        username: E2E_MESSAGING_SELF_USERNAME,
        nickname: E2E_MESSAGING_SELF_NICKNAME,
        type: 'friend',
      },
      {
        id: E2E_MESSAGING_CONTACT_ID,
        username: E2E_MESSAGING_CONTACT_USERNAME,
        nickname: E2E_MESSAGING_CONTACT_NICKNAME,
        type: 'friend',
      },
    ],
  })

  const conversation = await prisma.conversation.create({
    data: {
      id: E2E_MESSAGING_CONVERSATION_ID,
      clientId: client.id,
      type: 'private',
      contactId: E2E_MESSAGING_CONTACT_ID,
      unreadCount: 0,
      lastMessageAt: new Date(E2E_MESSAGING_INITIAL_MESSAGE_TIMESTAMP * 1000),
    },
  })

  const dataLake = new DataLakeService({
    type: 'filesystem',
    path: dataLakePath,
  })

  const initialMessage: ChatMessage = {
    msg_id: E2E_MESSAGING_INITIAL_MESSAGE_ID,
    from_username: E2E_MESSAGING_CONTACT_USERNAME,
    to_username: E2E_MESSAGING_SELF_USERNAME,
    content: E2E_MESSAGING_INITIAL_MESSAGE_CONTENT,
    create_time: E2E_MESSAGING_INITIAL_MESSAGE_TIMESTAMP,
    msg_type: 1,
    chatroom_sender: '',
    desc: '',
    is_chatroom_msg: 0,
    chatroom: '',
    source: 'seed:e2e-messaging',
  }

  const dataLakeKey = await dataLake.saveMessage(conversation.id, initialMessage)

  await prisma.messageIndex.create({
    data: {
      id: E2E_MESSAGING_INITIAL_MESSAGE_INDEX_ID,
      conversationId: conversation.id,
      msgId: initialMessage.msg_id,
      msgType: initialMessage.msg_type,
      fromUsername: initialMessage.from_username,
      toUsername: initialMessage.to_username,
      chatroomSender: undefined,
      createTime: initialMessage.create_time,
      dataLakeKey,
    },
  })

  console.log('✅ Messaging E2E baseline ready')
  console.log(`   clientGuid: ${client.guid}`)
  console.log(`   loginUser: ${E2E_MESSAGING_SELF_USERNAME}`)
  console.log(`   contact: ${E2E_MESSAGING_CONTACT_USERNAME} (${E2E_MESSAGING_CONTACT_NICKNAME})`)
  console.log(`   conversationId: ${conversation.id}`)
  console.log(`   messageId: ${initialMessage.msg_id}`)
}

async function main() {
  const scenario = parseScenario(process.argv.slice(2))

  if (scenario === 'messaging') {
    await seedMessagingScenario()
  }
}

main()
  .catch((error) => {
    console.error('❌ Failed to seed test data:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
