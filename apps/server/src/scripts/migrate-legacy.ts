/**
 * 历史数据迁移脚本
 *
 * 将旧格式 JSON 文件迁移到新的 raw/ + hot/ JSONL 格式，并更新 MessageIndex.dataLakeKey。
 *
 * 旧格式有两种：
 * 1. {convId}/msg_{ts}_{msgId}.json — camelCase 字段，缺少部分字段
 * 2. conversations/{convId}/messages/{ts}_{msgId}.json — snake_case 字段，完整
 *
 * 用法：npx tsx src/scripts/migrate-legacy.ts
 */

import fs from 'fs/promises'
import path from 'path'
import { existsSync } from 'fs'
import { PrismaClient } from '@prisma/client'

// 加载环境变量
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '../../.env') })

const prisma = new PrismaClient()
const lakePath = process.env.DATA_LAKE_PATH!

interface ChatMessage {
  msg_id: string
  from_username: string
  to_username: string
  content: string
  create_time: number
  msg_type: number
  chatroom_sender: string
  desc: string
  is_chatroom_msg: number
  chatroom: string
  source: string
}

/**
 * 将旧格式 camelCase 消息转换为 snake_case ChatMessage
 */
function normalizeLegacyMessage(raw: any): ChatMessage {
  // 已经是 snake_case 格式
  if (raw.msg_id) {
    return {
      msg_id: raw.msg_id,
      from_username: raw.from_username,
      to_username: raw.to_username,
      content: raw.content || '',
      create_time: raw.create_time,
      msg_type: raw.msg_type,
      chatroom_sender: raw.chatroom_sender || '',
      desc: raw.desc || '',
      is_chatroom_msg: raw.is_chatroom_msg || 0,
      chatroom: raw.chatroom || '',
      source: raw.source || ''
    }
  }

  // camelCase 格式，需要转换
  return {
    msg_id: raw.msgId,
    from_username: raw.fromUsername,
    to_username: raw.toUsername,
    content: raw.content || '',
    create_time: raw.createTime,
    msg_type: raw.msgType,
    chatroom_sender: raw.chatroomSender || '',
    desc: raw.desc || '',
    is_chatroom_msg: raw.isChatroomMsg ? 1 : 0,
    chatroom: raw.chatroom || '',
    source: raw.source || ''
  }
}

/**
 * 根据消息内容计算正确的会话 ID
 */
function getCorrectConversationId(msg: ChatMessage, clientUsername: string): string {
  // 群聊
  if (msg.chatroom && msg.chatroom.endsWith('@chatroom')) {
    return msg.chatroom
  }
  if (msg.to_username && msg.to_username.endsWith('@chatroom')) {
    return msg.to_username
  }
  if (msg.is_chatroom_msg) {
    return msg.chatroom || msg.to_username
  }

  // 私聊：取对方的 username
  if (msg.from_username === clientUsername) {
    return msg.to_username
  }
  return msg.from_username
}

/**
 * 追加消息到 JSONL 文件
 */
async function appendToJsonl(filePath: string, message: ChatMessage): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.appendFile(filePath, JSON.stringify(message) + '\n', 'utf-8')
}

/**
 * 扫描旧格式文件
 */
async function findLegacyFiles(): Promise<{ path: string; format: 1 | 2 }[]> {
  const results: { path: string; format: 1 | 2 }[] = []

  const entries = await fs.readdir(lakePath, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    if (entry.name === 'raw' || entry.name === 'hot' || entry.name === 'daily' ||
        entry.name === 'monthly' || entry.name === 'legacy' || entry.name === 'export') {
      continue
    }

    if (entry.name === 'conversations') {
      // 格式 2: conversations/{convId}/messages/*.json
      const convDirs = await fs.readdir(path.join(lakePath, 'conversations'), { withFileTypes: true })
      for (const convDir of convDirs) {
        if (!convDir.isDirectory()) continue
        const msgsDir = path.join(lakePath, 'conversations', convDir.name, 'messages')
        if (!existsSync(msgsDir)) continue
        const files = await fs.readdir(msgsDir)
        for (const file of files) {
          if (file.endsWith('.json')) {
            results.push({
              path: `conversations/${convDir.name}/messages/${file}`,
              format: 2
            })
          }
        }
      }
    } else {
      // 格式 1: {convId}/msg_*.json
      const files = await fs.readdir(path.join(lakePath, entry.name))
      for (const file of files) {
        if (file.startsWith('msg_') && file.endsWith('.json')) {
          results.push({
            path: `${entry.name}/${file}`,
            format: 1
          })
        }
      }
    }
  }

  return results
}

async function main() {
  console.log('=== 历史数据迁移开始 ===')
  console.log(`Data Lake 路径: ${lakePath}`)

  // 获取 clientUsername：从 MessageIndex 推断
  const fromUsers = await prisma.messageIndex.findMany({ select: { fromUsername: true }, distinct: ['fromUsername'] })
  const toUsers = await prisma.messageIndex.findMany({ select: { toUsername: true }, distinct: ['toUsername'] })
  const fromSet = new Set(fromUsers.map(u => u.fromUsername))
  const toSet = new Set(toUsers.map(u => u.toUsername))

  // clientUsername 是既发过消息又收过消息、且不是群聊地址的用户
  const candidates = [...fromSet].filter(u => toSet.has(u) && !u.endsWith('@chatroom'))
  if (candidates.length === 0) {
    console.error('无法推断 clientUsername')
    process.exit(1)
  }
  const clientUsername = candidates[0]
  console.log(`推断 clientUsername: ${clientUsername}`)

  // 扫描旧格式文件
  const legacyFiles = await findLegacyFiles()
  console.log(`发现旧格式文件: ${legacyFiles.filter(f => f.format === 1).length} (格式1) + ${legacyFiles.filter(f => f.format === 2).length} (格式2) = ${legacyFiles.length}`)

  if (legacyFiles.length === 0) {
    console.log('没有需要迁移的文件')
    await prisma.$disconnect()
    return
  }

  let migrated = 0
  let errors = 0

  for (const file of legacyFiles) {
    try {
      const fullPath = path.join(lakePath, file.path)
      const raw = JSON.parse(await fs.readFile(fullPath, 'utf-8'))
      const msg = normalizeLegacyMessage(raw)

      const date = new Date(msg.create_time * 1000).toISOString().slice(0, 10)
      const convId = getCorrectConversationId(msg, clientUsername)

      // 1. 追加到 raw/{date}.jsonl
      await appendToJsonl(path.join(lakePath, 'raw', `${date}.jsonl`), msg)

      // 2. 追加到 hot/{convId}/{date}.jsonl
      await appendToJsonl(path.join(lakePath, 'hot', convId, `${date}.jsonl`), msg)

      // 3. 更新 MessageIndex.dataLakeKey
      const newKey = `hot/${convId}/${date}.jsonl:${msg.msg_id}`
      await prisma.messageIndex.updateMany({
        where: { msgId: msg.msg_id },
        data: { dataLakeKey: newKey }
      })

      migrated++
    } catch (err) {
      console.error(`迁移失败: ${file.path}`, err)
      errors++
    }
  }

  console.log(`\n迁移完成: ${migrated} 成功, ${errors} 失败`)

  // 验证
  const hotKeys = await prisma.messageIndex.count({
    where: { dataLakeKey: { startsWith: 'hot/' } }
  })
  const totalKeys = await prisma.messageIndex.count()
  console.log(`MessageIndex: ${hotKeys}/${totalKeys} 已迁移到新格式`)

  // 移动旧文件到 legacy/
  const legacyDir = path.join(lakePath, 'legacy')
  await fs.mkdir(legacyDir, { recursive: true })

  // 收集需要移动的目录
  const dirsToMove = new Set<string>()
  for (const file of legacyFiles) {
    if (file.format === 1) {
      dirsToMove.add(file.path.split('/')[0])
    }
  }

  for (const dir of dirsToMove) {
    const src = path.join(lakePath, dir)
    const dest = path.join(legacyDir, dir)
    if (existsSync(src) && !existsSync(dest)) {
      await fs.rename(src, dest)
      console.log(`移动: ${dir} → legacy/${dir}`)
    }
  }

  // 移动 conversations/ 目录
  const convDir = path.join(lakePath, 'conversations')
  const convDest = path.join(legacyDir, 'conversations')
  if (existsSync(convDir) && !existsSync(convDest)) {
    await fs.rename(convDir, convDest)
    console.log(`移动: conversations/ → legacy/conversations/`)
  }

  await prisma.$disconnect()
  console.log('\n=== 迁移完成 ===')
}

main().catch(err => {
  console.error('迁移脚本异常:', err)
  process.exit(1)
})
