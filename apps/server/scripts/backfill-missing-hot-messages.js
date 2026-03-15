#!/usr/bin/env node
import 'dotenv/config'
import fs from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { PrismaClient } from '@prisma/client'

function parseArgs(argv) {
  return {
    apply: argv.includes('--apply'),
  }
}

function parseHotKey(key) {
  const [filePart, msgId] = key.split(':')
  if (!filePart || !msgId) return null

  const matched = /^hot\/([^/]+)\/(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(filePart)
  if (!matched) return null

  return {
    filePart,
    msgId,
    date: matched[2],
  }
}

async function readJsonlIds(filePath) {
  if (!existsSync(filePath)) return new Set()
  const content = await fs.readFile(filePath, 'utf-8')
  const ids = new Set()

  for (const line of content.split('\n')) {
    if (!line) continue
    try {
      const obj = JSON.parse(line)
      if (obj?.msg_id) ids.add(obj.msg_id)
    } catch {
      // Ignore broken lines and continue recovery.
    }
  }

  return ids
}

async function readRawLookup(rawPath) {
  const lookup = new Map()
  if (!existsSync(rawPath)) return lookup

  const content = await fs.readFile(rawPath, 'utf-8')
  for (const line of content.split('\n')) {
    if (!line) continue
    try {
      const obj = JSON.parse(line)
      const msgId = obj?.msg_id
      if (msgId && !lookup.has(msgId)) {
        lookup.set(msgId, line)
      }
    } catch {
      // Ignore broken lines and continue recovery.
    }
  }

  return lookup
}

async function main() {
  const { apply } = parseArgs(process.argv.slice(2))
  const prisma = new PrismaClient()
  const lakeRoot = path.resolve(process.cwd(), process.env.DATA_LAKE_PATH || './data/lake')
  const rawLookupByDate = new Map()

  console.log(`[backfill] mode=${apply ? 'apply' : 'dry-run'} lakeRoot=${lakeRoot}`)

  const indexes = await prisma.messageIndex.findMany({
    where: {
      dataLakeKey: {
        startsWith: 'hot/',
      },
    },
    select: {
      msgId: true,
      dataLakeKey: true,
    },
    orderBy: {
      createTime: 'asc',
    },
  })

  const expectedByFile = new Map()
  for (const row of indexes) {
    const parsed = parseHotKey(row.dataLakeKey)
    if (!parsed) continue

    if (!expectedByFile.has(parsed.filePart)) {
      expectedByFile.set(parsed.filePart, {
        date: parsed.date,
        msgIds: new Set(),
      })
    }
    expectedByFile.get(parsed.filePart).msgIds.add(row.msgId)
  }

  let totalExpected = 0
  let totalMissing = 0
  let totalRecoverable = 0
  let totalApplied = 0
  const unresolved = []

  for (const [filePart, info] of expectedByFile) {
    const hotPath = path.join(lakeRoot, filePart)
    const expectedIds = info.msgIds
    totalExpected += expectedIds.size

    const existingIds = await readJsonlIds(hotPath)
    const missingIds = [...expectedIds].filter((msgId) => !existingIds.has(msgId))
    if (missingIds.length === 0) continue

    totalMissing += missingIds.length

    if (!rawLookupByDate.has(info.date)) {
      const rawPath = path.join(lakeRoot, 'raw', `${info.date}.jsonl`)
      rawLookupByDate.set(info.date, await readRawLookup(rawPath))
    }
    const rawLookup = rawLookupByDate.get(info.date)

    const linesToAppend = []
    for (const msgId of missingIds) {
      const line = rawLookup.get(msgId)
      if (line) {
        linesToAppend.push(line)
      } else {
        unresolved.push({ filePart, msgId, date: info.date })
      }
    }

    totalRecoverable += linesToAppend.length

    if (apply && linesToAppend.length > 0) {
      await fs.mkdir(path.dirname(hotPath), { recursive: true })
      await fs.appendFile(hotPath, `${linesToAppend.join('\n')}\n`, 'utf-8')
      totalApplied += linesToAppend.length
    }
  }

  console.log('[backfill] summary', JSON.stringify({
    expectedFiles: expectedByFile.size,
    totalExpected,
    totalMissing,
    totalRecoverable,
    totalApplied,
    unresolved: unresolved.length,
  }))

  if (unresolved.length > 0) {
    console.log('[backfill] unresolved-sample', JSON.stringify(unresolved.slice(0, 20), null, 2))
  }

  await prisma.$disconnect()
}

main().catch((error) => {
  console.error('[backfill] failed', error)
  process.exit(1)
})
