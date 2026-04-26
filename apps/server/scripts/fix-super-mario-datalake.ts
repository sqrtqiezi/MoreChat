#!/usr/bin/env tsx
// ABOUTME: 修复 Super Mario 对话的 DataLake 文件
// ABOUTME: 从 raw 日志重建 hot 数据并更新数据库中的 dataLakeKey

import { PrismaClient } from '@prisma/client'
import fs from 'fs/promises'
import path from 'path'

const CONVERSATION_ID = 'cmmjahoq5004w21d1vf1bxzx0'
const SUPER_MARIO_USERNAME = 'wxid_abw19y0lhwkt12'
const DATA_LAKE_PATH = process.env.DATA_LAKE_PATH || './data/lake'

interface RawMessage {
  msg_id: string
  from_username: string
  to_username: string
  create_time: number
  [key: string]: unknown
}

async function main() {
  const prisma = new PrismaClient()

  try {
    console.log('🔍 开始修复 Super Mario 对话的 DataLake...')

    // 1. 从数据库获取所有消息记录
    const messageIndexes = await prisma.messageIndex.findMany({
      where: { conversationId: CONVERSATION_ID },
      orderBy: { createTime: 'asc' }
    })

    console.log(`📊 数据库中有 ${messageIndexes.length} 条消息记录`)

    // 2. 读取所有 raw 日志文件
    const rawDir = path.join(DATA_LAKE_PATH, 'raw')
    const rawFiles = await fs.readdir(rawDir)
    const jsonlFiles = rawFiles.filter(f => f.endsWith('.jsonl')).sort()

    console.log(`📁 找到 ${jsonlFiles.length} 个 raw 日志文件`)

    // 3. 从 raw 日志中提取 Super Mario 的消息
    const messagesByDate = new Map<string, RawMessage[]>()
    let foundCount = 0

    for (const file of jsonlFiles) {
      const filePath = path.join(rawDir, file)
      const content = await fs.readFile(filePath, 'utf-8')
      const lines = content.split('\n').filter(Boolean)

      for (const line of lines) {
        try {
          const msg = JSON.parse(line) as RawMessage
          // 检查是否是 Super Mario 的消息
          if (msg.from_username === SUPER_MARIO_USERNAME || msg.to_username === SUPER_MARIO_USERNAME) {
            const date = file.replace('.jsonl', '')
            if (!messagesByDate.has(date)) {
              messagesByDate.set(date, [])
            }
            messagesByDate.get(date)!.push(msg)
            foundCount++
          }
        } catch (e) {
          // 跳过损坏的行
        }
      }
    }

    console.log(`✅ 从 raw 日志中找到 ${foundCount} 条 Super Mario 的消息`)

    // 4. 重建 hot 数据
    const hotDir = path.join(DATA_LAKE_PATH, 'hot', CONVERSATION_ID)
    await fs.mkdir(hotDir, { recursive: true })

    for (const [date, messages] of messagesByDate) {
      const hotFile = path.join(hotDir, `${date}.jsonl`)
      const content = messages.map(m => JSON.stringify(m)).join('\n') + '\n'
      await fs.writeFile(hotFile, content, 'utf-8')
      console.log(`📝 写入 ${hotFile}: ${messages.length} 条消息`)
    }

    // 5. 更新数据库中的 dataLakeKey
    let updatedCount = 0
    for (const index of messageIndexes) {
      const msgId = index.msgId
      const createTime = index.createTime
      const date = new Date(createTime * 1000).toISOString().split('T')[0]
      const newKey = `hot/${CONVERSATION_ID}/${date}.jsonl:${msgId}`

      await prisma.messageIndex.update({
        where: { id: index.id },
        data: { dataLakeKey: newKey }
      })
      updatedCount++
    }

    console.log(`🔄 更新了 ${updatedCount} 条数据库记录`)
    console.log('✨ 修复完成！')

  } catch (error) {
    console.error('❌ 修复失败:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

main()
