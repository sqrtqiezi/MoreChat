import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ArchiveService } from './archiveService.js'
import { asyncBufferFromFile, parquetReadObjects } from 'hyparquet'
import fs from 'fs/promises'
import path from 'path'
import { existsSync } from 'fs'

describe('ArchiveService', () => {
  const testLakePath = './test-archive-lake'
  let archiveService: ArchiveService
  let mockPrisma: any

  beforeEach(async () => {
    mockPrisma = {
      imageCache: {
        findMany: vi.fn().mockResolvedValue([])
      }
    }
    archiveService = new ArchiveService({ lakePath: testLakePath, hotRetentionDays: 3, prisma: mockPrisma })
  })

  afterEach(async () => {
    await fs.rm(testLakePath, { recursive: true, force: true })
  })

  async function writeHotFile(convId: string, date: string, messages: any[]) {
    const hotFile = path.join(testLakePath, 'hot', convId, `${date}.jsonl`)
    await fs.mkdir(path.dirname(hotFile), { recursive: true })
    await fs.writeFile(hotFile, messages.map(m => JSON.stringify(m)).join('\n') + '\n', 'utf-8')
  }

  function makeMessage(id: string, createTime: number) {
    return {
      msg_id: id,
      from_username: 'user1',
      to_username: 'user2',
      content: `Message ${id}`,
      create_time: createTime,
      msg_type: 1,
      chatroom_sender: '',
      desc: '',
      is_chatroom_msg: 0,
      chatroom: '',
      source: ''
    }
  }

  describe('hot → daily Parquet 归档', () => {
    it('should archive hot JSONL to daily Parquet', async () => {
      const date = '2026-03-10'
      await writeHotFile('conv_a', date, [
        makeMessage('msg_1', 1741564800),
        makeMessage('msg_2', 1741564801),
      ])

      await archiveService.manualArchive(date)

      const parquetFile = path.join(testLakePath, 'daily', 'conv_a', `${date}.parquet`)
      expect(existsSync(parquetFile)).toBe(true)

      // 验证 Parquet 内容
      const file = await asyncBufferFromFile(parquetFile)
      const rows = await parquetReadObjects({ file }) as any[]

      expect(rows).toHaveLength(2)
      expect(rows[0].msg_id).toBe('msg_1')
      expect(rows[1].msg_id).toBe('msg_2')
    })

    it('should archive multiple conversations', async () => {
      const date = '2026-03-10'
      await writeHotFile('conv_a', date, [makeMessage('msg_a', 1741564800)])
      await writeHotFile('conv_b', date, [makeMessage('msg_b', 1741564801)])

      await archiveService.manualArchive(date)

      expect(existsSync(path.join(testLakePath, 'daily', 'conv_a', `${date}.parquet`))).toBe(true)
      expect(existsSync(path.join(testLakePath, 'daily', 'conv_b', `${date}.parquet`))).toBe(true)
    })
  })

  describe('daily → monthly Parquet 归档', () => {
    it('should merge daily Parquet into monthly', async () => {
      // 先创建 hot 文件并归档为 daily
      await writeHotFile('conv_a', '2026-02-01', [makeMessage('msg_1', 1738368000)])
      await writeHotFile('conv_a', '2026-02-02', [makeMessage('msg_2', 1738454400)])
      await archiveService.manualArchive('2026-02-01')
      await archiveService.manualArchive('2026-02-02')

      // 验证 daily 文件存在
      expect(existsSync(path.join(testLakePath, 'daily', 'conv_a', '2026-02-01.parquet'))).toBe(true)
      expect(existsSync(path.join(testLakePath, 'daily', 'conv_a', '2026-02-02.parquet'))).toBe(true)

      // 执行月归档
      await archiveService.runMonthlyArchive()

      // 验证月归档文件存在
      const monthlyFile = path.join(testLakePath, 'monthly', 'conv_a', '2026-02.parquet')
      expect(existsSync(monthlyFile)).toBe(true)

      // 验证日归档已删除
      expect(existsSync(path.join(testLakePath, 'daily', 'conv_a', '2026-02-01.parquet'))).toBe(false)
      expect(existsSync(path.join(testLakePath, 'daily', 'conv_a', '2026-02-02.parquet'))).toBe(false)

      // 验证月归档内容
      const file = await asyncBufferFromFile(monthlyFile)
      const rows = await parquetReadObjects({ file }) as any[]

      expect(rows).toHaveLength(2)
    })
  })

  describe('hot 清理', () => {
    it('should delete hot files older than cutoff date', async () => {
      await writeHotFile('conv_a', '2026-03-01', [makeMessage('old', 1740787200)])
      await writeHotFile('conv_a', '2026-03-10', [makeMessage('new', 1741564800)])

      await archiveService.manualCleanup('2026-03-05')

      expect(existsSync(path.join(testLakePath, 'hot', 'conv_a', '2026-03-01.jsonl'))).toBe(false)
      expect(existsSync(path.join(testLakePath, 'hot', 'conv_a', '2026-03-10.jsonl'))).toBe(true)
    })

    it('should remove empty conversation directories', async () => {
      await writeHotFile('conv_empty', '2026-03-01', [makeMessage('old', 1740787200)])

      await archiveService.manualCleanup('2026-03-05')

      expect(existsSync(path.join(testLakePath, 'hot', 'conv_empty'))).toBe(false)
    })
  })

  describe('runDailyArchive 时区处理', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('should archive yesterday in Asia/Shanghai, not UTC', async () => {
      // 模拟 2026-03-12 01:00:00 CST = 2026-03-11 17:00:00 UTC
      // 归档任务在凌晨 1:00 CST 执行，应归档 2026-03-11（CST 的昨天）
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-03-11T17:00:00Z'))

      // 准备 2026-03-11 的 hot 数据（CST 日期）
      await writeHotFile('conv_tz', '2026-03-11', [
        makeMessage('msg_tz', 1741564800),
      ])

      await archiveService.runDailyArchive()

      // 应该归档 2026-03-11 的数据
      const parquetFile = path.join(testLakePath, 'daily', 'conv_tz', '2026-03-11.parquet')
      expect(existsSync(parquetFile)).toBe(true)
    })
  })
})
