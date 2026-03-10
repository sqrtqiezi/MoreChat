import type { DatabaseService } from './database.js'
import type { JuhexbotAdapter } from './juhexbotAdapter.js'
import type { WebSocketService } from './websocket.js'
import { RateLimiter } from '../lib/rateLimiter.js'
import { logger } from '../lib/logger.js'

const SYNC_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const BACKFILL_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes
const BACKFILL_BATCH_SIZE = 20
const BACKFILL_DELAY_MS = 5000 // 5 seconds between each backfill request

export class ContactSyncService {
  private rateLimiter = new RateLimiter(3000)
  private backfillTimer: ReturnType<typeof setInterval> | null = null

  constructor(
    private db: DatabaseService,
    private adapter: JuhexbotAdapter,
    private wsService: WebSocketService
  ) {}

  async syncContact(username: string): Promise<void> {
    try {
      const contact = await this.db.findContactByUsername(username)
      if (!contact) return

      // TTL check
      if (contact.lastSyncAt && Date.now() - new Date(contact.lastSyncAt).getTime() < SYNC_TTL_MS) {
        return
      }

      await this.rateLimiter.acquire()
      const [info] = await this.adapter.getContact([username])
      if (!info) return

      await this.db.updateContact(username, {
        nickname: info.nickname || contact.nickname,
        remark: info.remark,
        avatar: info.avatar,
        lastSyncAt: new Date()
      })

      this.wsService.broadcast('contact:updated', {
        username: info.username,
        nickname: info.nickname,
        remark: info.remark,
        avatar: info.avatar
      })
    } catch (error) {
      logger.warn({ err: error, username }, 'Failed to sync contact')
    }
  }

  async syncGroup(roomUsername: string): Promise<void> {
    try {
      const group = await this.db.findGroupByRoomUsername(roomUsername)
      if (!group) return

      // TTL check
      if (group.lastSyncAt && Date.now() - new Date(group.lastSyncAt).getTime() < SYNC_TTL_MS) {
        return
      }

      // Sync group detail
      await this.rateLimiter.acquire()
      const detail = await this.adapter.getChatroomDetail(roomUsername)

      await this.db.updateGroup(roomUsername, {
        name: detail.name || group.name,
        avatar: detail.avatar,
        memberCount: detail.memberCount,
        lastSyncAt: new Date()
      })

      // Sync group members
      await this.rateLimiter.acquire()
      const memberResult = await this.adapter.getChatroomMemberDetail(roomUsername, group.version || 0)

      if (memberResult.members.length > 0) {
        for (const member of memberResult.members) {
          // Ensure contact record exists for each member
          const existingContact = await this.db.findContactByUsername(member.username)
          if (!existingContact) {
            try {
              await this.db.createContact({
                username: member.username,
                nickname: member.nickname || member.username,
                type: 'friend'
              })
            } catch (error: any) {
              if (error?.code !== 'P2002') throw error
            }
          }

          await this.db.upsertGroupMember({
            groupId: group.id,
            username: member.username,
            nickname: member.nickname
          })
        }

        // Update version for incremental sync
        await this.db.updateGroup(roomUsername, {
          version: memberResult.version
        })
      }

      this.wsService.broadcast('group:updated', {
        roomUsername,
        name: detail.name,
        avatar: detail.avatar,
        memberCount: detail.memberCount
      })
    } catch (error) {
      logger.warn({ err: error, roomUsername }, 'Failed to sync group')
    }
  }

  async runBackfillTask(): Promise<void> {
    try {
      logger.debug('Running contact backfill task')

      // Backfill stale contacts
      const staleContacts = await this.db.findStaleContacts(BACKFILL_BATCH_SIZE)
      for (const contact of staleContacts) {
        await this.syncContact(contact.username)
        await this.delay(BACKFILL_DELAY_MS)
      }

      // Backfill stale groups
      const staleGroups = await this.db.findStaleGroups(BACKFILL_BATCH_SIZE)
      for (const group of staleGroups) {
        await this.syncGroup(group.roomUsername)
        await this.delay(BACKFILL_DELAY_MS)
      }

      logger.debug({ contacts: staleContacts.length, groups: staleGroups.length }, 'Backfill task completed')
    } catch (error) {
      logger.warn({ err: error }, 'Backfill task failed')
    }
  }

  startBackfillScheduler(): void {
    this.backfillTimer = setInterval(() => {
      this.runBackfillTask()
    }, BACKFILL_INTERVAL_MS)
    logger.info('Contact backfill scheduler started')
  }

  stopBackfillScheduler(): void {
    if (this.backfillTimer) {
      clearInterval(this.backfillTimer)
      this.backfillTimer = null
      logger.info('Contact backfill scheduler stopped')
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
