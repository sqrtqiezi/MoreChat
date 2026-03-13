import { PrismaClient } from '@prisma/client'
import fs from 'fs/promises'
import path from 'path'

type BackupRecord = {
  id: string
  username: string
  oldType: string
  oldUpdatedAt: string
}

interface Args {
  apply: boolean
  rollbackFile?: string
  help: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, help: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--apply') args.apply = true
    if (arg === '--help' || arg === '-h') args.help = true
    if (arg === '--rollback-file') args.rollbackFile = argv[i + 1]
  }
  return args
}

function usage() {
  console.log(`
Cleanup member-only contacts (production-safe)

Default mode is DRY RUN and will not mutate data.

Usage:
  pnpm tsx scripts/cleanup-member-only-contacts.ts
  pnpm tsx scripts/cleanup-member-only-contacts.ts --apply
  pnpm tsx scripts/cleanup-member-only-contacts.ts --rollback-file ./data/cleanup-backups/contact-type-cleanup-<timestamp>.json

What this cleans:
  Contact.type = 'friend'
  AND exists GroupMember by username
  AND has no private Conversation
`)
}

async function ensureBackupDir(): Promise<string> {
  const backupDir = path.resolve(process.cwd(), 'data', 'cleanup-backups')
  await fs.mkdir(backupDir, { recursive: true })
  return backupDir
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size))
  }
  return result
}

async function rollback(prisma: PrismaClient, rollbackFile: string) {
  const resolvedPath = path.resolve(process.cwd(), rollbackFile)
  const raw = await fs.readFile(resolvedPath, 'utf8')
  const payload = JSON.parse(raw) as { records: BackupRecord[] }
  const records = payload.records || []

  console.log(`Rollback file: ${resolvedPath}`)
  console.log(`Rows to rollback: ${records.length}`)

  if (records.length === 0) {
    console.log('No rows to rollback, exiting.')
    return
  }

  const groupsByType = new Map<string, string[]>()
  for (const record of records) {
    if (!groupsByType.has(record.oldType)) {
      groupsByType.set(record.oldType, [])
    }
    groupsByType.get(record.oldType)!.push(record.id)
  }

  let updated = 0
  for (const [oldType, ids] of groupsByType.entries()) {
    for (const batch of chunk(ids, 500)) {
      const result = await prisma.contact.updateMany({
        where: { id: { in: batch } },
        data: { type: oldType, updatedAt: new Date() },
      })
      updated += result.count
    }
  }

  console.log(`Rollback completed. Updated rows: ${updated}`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    return
  }

  const prisma = new PrismaClient()

  try {
    if (args.rollbackFile) {
      await rollback(prisma, args.rollbackFile)
      return
    }

    const typeStats = await prisma.contact.groupBy({
      by: ['type'],
      _count: { _all: true },
    })
    const totalContacts = await prisma.contact.count()

    const candidates = await prisma.contact.findMany({
      where: {
        type: 'friend',
        groupMembers: { some: {} },
        conversations: { none: { type: 'private' } },
      },
      select: {
        id: true,
        username: true,
        type: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    })

    const sample = candidates.slice(0, 20).map((item) => ({
      id: item.id,
      username: item.username,
      oldType: item.type,
      updatedAt: item.updatedAt.toISOString(),
    }))

    console.log('--- Current Contact Stats ---')
    console.log(JSON.stringify({ totalContacts, typeStats }, null, 2))
    console.log('--- Cleanup Candidate Stats ---')
    console.log(JSON.stringify({
      candidateCount: candidates.length,
      sample,
    }, null, 2))

    if (!args.apply) {
      console.log('Dry-run only. Re-run with --apply to perform cleanup.')
      return
    }

    const backupDir = await ensureBackupDir()
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = path.join(backupDir, `contact-type-cleanup-${timestamp}.json`)
    const backupPayload = {
      createdAt: new Date().toISOString(),
      description: 'Backup for member-only friend -> group_member cleanup',
      records: candidates.map((item) => ({
        id: item.id,
        username: item.username,
        oldType: item.type,
        oldUpdatedAt: item.updatedAt.toISOString(),
      })),
    }
    await fs.writeFile(backupPath, JSON.stringify(backupPayload, null, 2), 'utf8')

    let updated = 0
    const ids = candidates.map((item) => item.id)
    for (const batch of chunk(ids, 500)) {
      const result = await prisma.contact.updateMany({
        where: {
          id: { in: batch },
          type: 'friend',
        },
        data: {
          type: 'group_member',
          updatedAt: new Date(),
        },
      })
      updated += result.count
    }

    const typeStatsAfter = await prisma.contact.groupBy({
      by: ['type'],
      _count: { _all: true },
    })
    const friendAfter = await prisma.contact.count({ where: { type: 'friend' } })
    const groupMemberAfter = await prisma.contact.count({ where: { type: 'group_member' } })

    console.log('Cleanup applied successfully.')
    console.log(JSON.stringify({
      backupPath,
      updatedRows: updated,
      friendAfter,
      groupMemberAfter,
      typeStatsAfter,
      rollbackCommand: `pnpm tsx scripts/cleanup-member-only-contacts.ts --rollback-file ${backupPath}`,
    }, null, 2))
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
