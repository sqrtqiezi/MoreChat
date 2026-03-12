/**
 * 归档服务
 *
 * 负责将 hot/ JSONL 归档为 Parquet，并清理过期 hot/ 文件。
 *
 * 归档策略：
 * - 每日 1:00 AM：hot/ → daily/ Parquet，删除 3 天前的 hot/ 文件
 * - 每月 1 号 1:00 AM：daily/ → monthly/ Parquet，删除已合并的 daily/ 文件
 */

import fs from 'fs/promises'
import path from 'path'
import { existsSync } from 'fs'
import { parquetWriteFile } from 'hyparquet-writer'
import { asyncBufferFromFile, parquetReadObjects } from 'hyparquet'
import { logger } from '../lib/logger.js'
import { formatLocalDate, formatLocalMonth } from '../lib/date.js'

export interface ArchiveConfig {
  lakePath: string
  hotRetentionDays?: number  // hot/ 保留天数，默认 3
}

const MESSAGE_COLUMNS = [
  'msg_id', 'from_username', 'to_username', 'content', 'create_time',
  'msg_type', 'chatroom_sender', 'desc', 'is_chatroom_msg', 'chatroom', 'source',
] as const

export class ArchiveService {
  private config: ArchiveConfig
  private dailyTimer?: NodeJS.Timeout
  private monthlyTimer?: NodeJS.Timeout

  constructor(config: ArchiveConfig) {
    this.config = {
      hotRetentionDays: 3,
      ...config
    }
  }

  start() {
    logger.info('Starting archive scheduler')
    this.scheduleDailyArchive()
    this.scheduleMonthlyArchive()
  }

  stop() {
    if (this.dailyTimer) {
      clearTimeout(this.dailyTimer)
      this.dailyTimer = undefined
    }
    if (this.monthlyTimer) {
      clearTimeout(this.monthlyTimer)
      this.monthlyTimer = undefined
    }
    logger.info('Archive scheduler stopped')
  }

  private scheduleDailyArchive() {
    const now = new Date()
    const next = new Date(now)
    next.setHours(1, 0, 0, 0)
    if (next <= now) next.setDate(next.getDate() + 1)

    const delay = next.getTime() - now.getTime()
    logger.info({ nextRun: next.toISOString() }, 'Daily archive scheduled')

    this.dailyTimer = setTimeout(async () => {
      try {
        await this.runDailyArchive()
      } catch (err) {
        logger.error({ err }, 'Daily archive failed')
      }
      this.scheduleDailyArchive()
    }, delay)
  }

  private scheduleMonthlyArchive() {
    const now = new Date()
    const next = new Date(now)
    next.setDate(1)
    next.setHours(1, 30, 0, 0)
    if (next <= now) next.setMonth(next.getMonth() + 1)

    const delay = next.getTime() - now.getTime()
    logger.info({ nextRun: next.toISOString() }, 'Monthly archive scheduled')

    this.monthlyTimer = setTimeout(async () => {
      try {
        await this.runMonthlyArchive()
      } catch (err) {
        logger.error({ err }, 'Monthly archive failed')
      }
      this.scheduleMonthlyArchive()
    }, delay)
  }

  /**
   * 每日归档：hot/ → daily/ Parquet + 清理过期 hot/
   */
  async runDailyArchive() {
    logger.info('Running daily archive')

    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const dateStr = formatLocalDate(yesterday)

    await this.archiveHotToDaily(dateStr)

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - this.config.hotRetentionDays!)
    await this.cleanupHotFiles(formatLocalDate(cutoff))

    logger.info({ date: dateStr }, 'Daily archive completed')
  }

  /**
   * 每月归档：daily/ → monthly/ Parquet
   */
  async runMonthlyArchive() {
    logger.info('Running monthly archive')

    const lastMonth = new Date()
    lastMonth.setMonth(lastMonth.getMonth() - 1)
    const monthStr = formatLocalMonth(lastMonth)

    await this.archiveDailyToMonthly(monthStr)

    logger.info({ month: monthStr }, 'Monthly archive completed')
  }

  /**
   * 将指定日期的 hot/ JSONL 转为 daily/ Parquet
   */
  private async archiveHotToDaily(date: string) {
    const hotDir = path.join(this.config.lakePath, 'hot')
    if (!existsSync(hotDir)) return

    const convDirs = await fs.readdir(hotDir, { withFileTypes: true })

    for (const convDir of convDirs) {
      if (!convDir.isDirectory()) continue

      const convId = convDir.name
      const hotFile = path.join(hotDir, convId, `${date}.jsonl`)
      if (!existsSync(hotFile)) continue

      const dailyFile = path.join(this.config.lakePath, 'daily', convId, `${date}.parquet`)
      await fs.mkdir(path.dirname(dailyFile), { recursive: true })

      const messages = await this.readJsonl(hotFile)
      if (messages.length === 0) continue

      await this.writeParquet(dailyFile, messages)
      logger.debug({ convId, date, count: messages.length }, 'Archived hot to daily')
    }
  }

  /**
   * 将指定月份的 daily/ Parquet 合并为 monthly/ Parquet
   */
  private async archiveDailyToMonthly(month: string) {
    const dailyDir = path.join(this.config.lakePath, 'daily')
    if (!existsSync(dailyDir)) return

    const convDirs = await fs.readdir(dailyDir, { withFileTypes: true })

    for (const convDir of convDirs) {
      if (!convDir.isDirectory()) continue

      const convId = convDir.name
      const convPath = path.join(dailyDir, convId)
      const files = (await fs.readdir(convPath))
        .filter(f => f.startsWith(`${month}-`) && f.endsWith('.parquet'))

      if (files.length === 0) continue

      // 读取所有日归档并合并
      const allMessages: Record<string, unknown>[] = []
      for (const file of files) {
        const filePath = path.join(convPath, file)
        const messages = await this.readParquet(filePath)
        allMessages.push(...messages)
      }

      if (allMessages.length === 0) continue

      const monthlyFile = path.join(this.config.lakePath, 'monthly', convId, `${month}.parquet`)
      await fs.mkdir(path.dirname(monthlyFile), { recursive: true })
      await this.writeParquet(monthlyFile, allMessages)

      // 删除已合并的日归档
      for (const file of files) {
        await fs.unlink(path.join(convPath, file))
      }

      logger.debug({ convId, month, filesCount: files.length, totalMessages: allMessages.length }, 'Archived daily to monthly')
    }
  }

  /**
   * 清理过期 hot/ 文件
   */
  private async cleanupHotFiles(cutoffDate: string) {
    const hotDir = path.join(this.config.lakePath, 'hot')
    if (!existsSync(hotDir)) return

    const convDirs = await fs.readdir(hotDir, { withFileTypes: true })
    let cleaned = 0

    for (const convDir of convDirs) {
      if (!convDir.isDirectory()) continue

      const convPath = path.join(hotDir, convDir.name)
      const files = await fs.readdir(convPath)

      for (const file of files) {
        if (!file.endsWith('.jsonl')) continue
        const date = file.replace('.jsonl', '')
        if (date < cutoffDate) {
          await fs.unlink(path.join(convPath, file))
          cleaned++
        }
      }

      // 空目录清理
      const remaining = await fs.readdir(convPath)
      if (remaining.length === 0) {
        await fs.rmdir(convPath)
      }
    }

    logger.info({ cutoffDate, cleaned }, 'Cleaned up hot files')
  }

  /**
   * 读取 JSONL 文件
   */
  private async readJsonl(filePath: string): Promise<Record<string, unknown>[]> {
    const content = await fs.readFile(filePath, 'utf-8')
    const messages: Record<string, unknown>[] = []

    for (const line of content.split('\n')) {
      if (!line.trim()) continue
      try {
        messages.push(JSON.parse(line))
      } catch {
        logger.warn({ filePath }, 'Skipping corrupted JSONL line')
      }
    }

    return messages
  }

  /**
   * 写入 Parquet 文件（列式）
   */
  private async writeParquet(filePath: string, messages: Record<string, unknown>[]) {
    const columnData = MESSAGE_COLUMNS.map(col => {
      const isNumeric = col === 'create_time' || col === 'msg_type' || col === 'is_chatroom_msg'
      return {
        name: col,
        data: messages.map(m => isNumeric ? BigInt(Number(m[col] ?? 0)) : String(m[col] ?? '')),
        type: isNumeric ? 'INT64' as const : 'STRING' as const,
      }
    })

    await parquetWriteFile({ filename: filePath, columnData })
  }

  /**
   * 读取 Parquet 文件
   */
  private async readParquet(filePath: string): Promise<Record<string, unknown>[]> {
    const file = await asyncBufferFromFile(filePath)
    return await parquetReadObjects({ file }) as Record<string, unknown>[]
  }

  /**
   * 手动触发归档（用于测试和脚本）
   */
  async manualArchive(date?: string) {
    const targetDate = date || formatLocalDate(new Date(Date.now() - 86400000))
    await this.archiveHotToDaily(targetDate)
  }

  async manualCleanup(cutoffDate?: string) {
    const targetDate = cutoffDate || formatLocalDate(new Date(Date.now() - 3 * 86400000))
    await this.cleanupHotFiles(targetDate)
  }
}
