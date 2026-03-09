/**
 * 测试数据生成脚本
 * 用于在本地数据库中创建测试数据，以便验证前端 MVP 功能
 */

import { PrismaClient } from '@prisma/client'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const prisma = new PrismaClient()

// 当前用户（模拟登录用户）
const CURRENT_USER = 'wxid_test_user'

async function main() {
  console.log('🌱 开始生成测试数据...')

  // 1. 创建客户端
  console.log('📱 创建客户端...')
  const client = await prisma.client.upsert({
    where: { guid: 'test-client-guid' },
    update: {
      loginStatus: 'online',
      isActive: true,
    },
    create: {
      guid: 'test-client-guid',
      loginStatus: 'online',
      isActive: true,
      autoStart: true,
      syncHistoryMsg: true,
    },
  })
  console.log(`✅ 客户端创建成功: ${client.id}`)

  // 2. 创建联系人
  console.log('👥 创建联系人...')
  const contacts = [
    { username: CURRENT_USER, nickname: '我', type: 'user' },
    { username: 'wxid_alice', nickname: '张小美', type: 'user' },
    { username: 'wxid_bob', nickname: '李明', type: 'user' },
    { username: 'wxid_charlie', nickname: '王强', type: 'user' },
    { username: 'wxid_david', nickname: '赵敏', type: 'user' },
    { username: 'wxid_eve', nickname: '孙悟空', type: 'user' },
  ]

  for (const contact of contacts) {
    await prisma.contact.upsert({
      where: { username: contact.username },
      update: contact,
      create: contact,
    })
  }
  console.log(`✅ 创建了 ${contacts.length} 个联系人`)

  // 3. 创建群组
  console.log('👨‍👩‍👧‍👦 创建群组...')
  const groups = [
    { roomUsername: 'chatroom_001@chatroom', name: '技术交流群', memberCount: 5 },
    { roomUsername: 'chatroom_002@chatroom', name: '周末爬山群', memberCount: 8 },
  ]

  for (const group of groups) {
    await prisma.group.upsert({
      where: { roomUsername: group.roomUsername },
      update: group,
      create: group,
    })
  }
  console.log(`✅ 创建了 ${groups.length} 个群组`)

  // 4. 创建私聊会话
  console.log('💬 创建私聊会话...')
  const privateConversations = [
    {
      clientId: client.id,
      type: 'private',
      contactUsername: 'wxid_alice',
      unreadCount: 3,
      lastMessageAt: new Date(Date.now() - 5 * 60 * 1000), // 5分钟前
    },
    {
      clientId: client.id,
      type: 'private',
      contactUsername: 'wxid_bob',
      unreadCount: 0,
      lastMessageAt: new Date(Date.now() - 30 * 60 * 1000), // 30分钟前
    },
    {
      clientId: client.id,
      type: 'private',
      contactUsername: 'wxid_charlie',
      unreadCount: 1,
      lastMessageAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2小时前
    },
    {
      clientId: client.id,
      type: 'private',
      contactUsername: 'wxid_david',
      unreadCount: 0,
      lastMessageAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1天前
    },
  ]

  const conversationMap = new Map<string, string>()

  for (const conv of privateConversations) {
    const contact = await prisma.contact.findUnique({
      where: { username: conv.contactUsername },
    })

    if (!contact) continue

    const conversation = await prisma.conversation.create({
      data: {
        clientId: conv.clientId,
        type: conv.type,
        contactId: contact.id,
        unreadCount: conv.unreadCount,
        lastMessageAt: conv.lastMessageAt,
      },
    })

    conversationMap.set(conv.contactUsername, conversation.id)
  }
  console.log(`✅ 创建了 ${privateConversations.length} 个私聊会话`)

  // 5. 创建群聊会话
  console.log('👥 创建群聊会话...')
  const groupConversations = [
    {
      clientId: client.id,
      type: 'group',
      roomUsername: 'chatroom_001@chatroom',
      unreadCount: 5,
      lastMessageAt: new Date(Date.now() - 10 * 60 * 1000), // 10分钟前
    },
    {
      clientId: client.id,
      type: 'group',
      roomUsername: 'chatroom_002@chatroom',
      unreadCount: 0,
      lastMessageAt: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3小时前
    },
  ]

  for (const conv of groupConversations) {
    const group = await prisma.group.findUnique({
      where: { roomUsername: conv.roomUsername },
    })

    if (!group) continue

    const conversation = await prisma.conversation.create({
      data: {
        clientId: conv.clientId,
        type: conv.type,
        groupId: group.id,
        unreadCount: conv.unreadCount,
        lastMessageAt: conv.lastMessageAt,
      },
    })

    conversationMap.set(conv.roomUsername, conversation.id)
  }
  console.log(`✅ 创建了 ${groupConversations.length} 个群聊会话`)

  // 6. 创建消息数据（存储在 DataLake）
  console.log('📝 创建消息数据...')
  const dataLakePath = join(process.cwd(), 'data', 'lake')
  mkdirSync(dataLakePath, { recursive: true })

  // 为每个会话创建消息
  const messageData = [
    {
      conversationKey: 'wxid_alice',
      messages: [
        {
          fromUsername: 'wxid_alice',
          toUsername: CURRENT_USER,
          content: '你好！周末有空吗？',
          createTime: Date.now() - 20 * 60 * 1000,
        },
        {
          fromUsername: CURRENT_USER,
          toUsername: 'wxid_alice',
          content: '有空啊，什么事？',
          createTime: Date.now() - 18 * 60 * 1000,
        },
        {
          fromUsername: 'wxid_alice',
          toUsername: CURRENT_USER,
          content: '一起去爬山吧！',
          createTime: Date.now() - 15 * 60 * 1000,
        },
        {
          fromUsername: CURRENT_USER,
          toUsername: 'wxid_alice',
          content: '好啊，几点出发？',
          createTime: Date.now() - 10 * 60 * 1000,
        },
        {
          fromUsername: 'wxid_alice',
          toUsername: CURRENT_USER,
          content: '早上8点，老地方集合',
          createTime: Date.now() - 5 * 60 * 1000,
        },
      ],
    },
    {
      conversationKey: 'wxid_bob',
      messages: [
        {
          fromUsername: 'wxid_bob',
          toUsername: CURRENT_USER,
          content: '今天的会议改到下午3点了',
          createTime: Date.now() - 35 * 60 * 1000,
        },
        {
          fromUsername: CURRENT_USER,
          toUsername: 'wxid_bob',
          content: '收到，谢谢通知',
          createTime: Date.now() - 30 * 60 * 1000,
        },
      ],
    },
    {
      conversationKey: 'wxid_charlie',
      messages: [
        {
          fromUsername: 'wxid_charlie',
          toUsername: CURRENT_USER,
          content: '代码审查通过了吗？',
          createTime: Date.now() - 2 * 60 * 60 * 1000,
        },
      ],
    },
    {
      conversationKey: 'wxid_david',
      messages: [
        {
          fromUsername: CURRENT_USER,
          toUsername: 'wxid_david',
          content: '项目文档已经更新了',
          createTime: Date.now() - 25 * 60 * 60 * 1000,
        },
        {
          fromUsername: 'wxid_david',
          toUsername: CURRENT_USER,
          content: '好的，我看看',
          createTime: Date.now() - 24 * 60 * 60 * 1000,
        },
      ],
    },
    {
      conversationKey: 'chatroom_001@chatroom',
      messages: [
        {
          fromUsername: 'wxid_alice',
          toUsername: 'chatroom_001@chatroom',
          content: '大家好，有人在吗？',
          createTime: Date.now() - 30 * 60 * 1000,
          chatroomSender: 'wxid_alice',
        },
        {
          fromUsername: 'wxid_bob',
          toUsername: 'chatroom_001@chatroom',
          content: '在的在的',
          createTime: Date.now() - 25 * 60 * 1000,
          chatroomSender: 'wxid_bob',
        },
        {
          fromUsername: CURRENT_USER,
          toUsername: 'chatroom_001@chatroom',
          content: '我也在',
          createTime: Date.now() - 20 * 60 * 1000,
          chatroomSender: CURRENT_USER,
        },
        {
          fromUsername: 'wxid_charlie',
          toUsername: 'chatroom_001@chatroom',
          content: '今天讨论什么技术话题？',
          createTime: Date.now() - 15 * 60 * 1000,
          chatroomSender: 'wxid_charlie',
        },
        {
          fromUsername: 'wxid_alice',
          toUsername: 'chatroom_001@chatroom',
          content: '聊聊 React 19 的新特性吧',
          createTime: Date.now() - 10 * 60 * 1000,
          chatroomSender: 'wxid_alice',
        },
      ],
    },
    {
      conversationKey: 'chatroom_002@chatroom',
      messages: [
        {
          fromUsername: 'wxid_eve',
          toUsername: 'chatroom_002@chatroom',
          content: '这周末爬哪座山？',
          createTime: Date.now() - 4 * 60 * 60 * 1000,
          chatroomSender: 'wxid_eve',
        },
        {
          fromUsername: CURRENT_USER,
          toUsername: 'chatroom_002@chatroom',
          content: '香山怎么样？',
          createTime: Date.now() - 3 * 60 * 60 * 1000,
          chatroomSender: CURRENT_USER,
        },
      ],
    },
  ]

  let totalMessages = 0
  for (const data of messageData) {
    const conversationId = conversationMap.get(data.conversationKey)
    if (!conversationId) continue

    for (const msg of data.messages) {
      const msgId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const dataLakeKey = `${conversationId}/${msgId}.json`
      const dataLakeFilePath = join(dataLakePath, dataLakeKey)

      // 创建消息内容文件
      const messageContent = {
        msgId,
        msgType: 1, // 文本消息
        fromUsername: msg.fromUsername,
        toUsername: msg.toUsername,
        content: msg.content,
        createTime: Math.floor(msg.createTime / 1000),
        chatroomSender: msg.chatroomSender,
      }

      mkdirSync(join(dataLakePath, conversationId), { recursive: true })
      writeFileSync(dataLakeFilePath, JSON.stringify(messageContent, null, 2))

      // 创建消息索引
      await prisma.messageIndex.create({
        data: {
          conversationId,
          msgId,
          msgType: 1,
          fromUsername: msg.fromUsername,
          toUsername: msg.toUsername,
          chatroomSender: msg.chatroomSender,
          createTime: Math.floor(msg.createTime / 1000),
          dataLakeKey,
        },
      })

      totalMessages++
    }
  }
  console.log(`✅ 创建了 ${totalMessages} 条消息`)

  console.log('🎉 测试数据生成完成！')
  console.log('\n📊 数据统计：')
  console.log(`  - 客户端: 1`)
  console.log(`  - 联系人: ${contacts.length}`)
  console.log(`  - 群组: ${groups.length}`)
  console.log(`  - 会话: ${conversationMap.size}`)
  console.log(`  - 消息: ${totalMessages}`)
  console.log('\n✨ 现在可以启动前端测试 MVP 功能了！')
}

main()
  .catch((e) => {
    console.error('❌ 生成测试数据失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
