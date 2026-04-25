// ABOUTME: 测试 EntityExtractorService 的实体提取功能
// ABOUTME: 使用 mock DatabaseService 验证 5 种实体类型的提取

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EntityExtractorService } from './entityExtractorService.js'
import type { DatabaseService } from './database.js'

describe('EntityExtractorService', () => {
  let service: EntityExtractorService
  let mockDb: DatabaseService

  beforeEach(async () => {
    mockDb = {
      prisma: {
        contact: {
          findMany: vi.fn().mockResolvedValue([
            { username: 'user1', nickname: '张三', remark: '老张' },
            { username: 'user2', nickname: '李四', remark: null },
            { username: 'user3', nickname: 'Alice', remark: '小爱' },
          ]),
        },
      },
    } as any

    service = new EntityExtractorService(mockDb)
    await service.refreshContacts()
  })

  describe('person extraction', () => {
    it('should extract @mentions', async () => {
      const result = await service.extract('@张三 @李四 请帮忙处理')
      const persons = result.filter(e => e.type === 'person')
      expect(persons.map(e => e.value)).toContain('张三')
      expect(persons.map(e => e.value)).toContain('李四')
    })

    it('should match contact nicknames in text', async () => {
      const result = await service.extract('今天和张三开了个会')
      const persons = result.filter(e => e.type === 'person')
      expect(persons.map(e => e.value)).toContain('张三')
    })

    it('should match contact remarks in text', async () => {
      const result = await service.extract('老张说明天要提交报告')
      const persons = result.filter(e => e.type === 'person')
      expect(persons.map(e => e.value)).toContain('老张')
    })

    it('should deduplicate persons', async () => {
      const result = await service.extract('@张三 张三 请处理')
      const persons = result.filter(e => e.type === 'person')
      const zhangsan = persons.filter(e => e.value === '张三')
      expect(zhangsan).toHaveLength(1)
    })
  })

  describe('project extraction', () => {
    it('should extract 「」quoted phrases', async () => {
      const result = await service.extract('关于「超级马里奥」项目的进展')
      const projects = result.filter(e => e.type === 'project')
      expect(projects.map(e => e.value)).toContain('超级马里奥')
    })

    it('should extract 《》and【】quoted phrases', async () => {
      const result = await service.extract('《年度报告》和【Q4计划】需要审核')
      const projects = result.filter(e => e.type === 'project')
      expect(projects.map(e => e.value)).toContain('年度报告')
      expect(projects.map(e => e.value)).toContain('Q4计划')
    })
  })

  describe('date extraction', () => {
    it('should extract Chinese dates', async () => {
      const result = await service.extract('4月25日下午开会')
      const dates = result.filter(e => e.type === 'date')
      expect(dates.map(e => e.value)).toContain('4月25日')
    })

    it('should extract relative dates', async () => {
      const result = await service.extract('今天完成，明天提交，下周回顾')
      const dates = result.filter(e => e.type === 'date')
      const values = dates.map(e => e.value)
      expect(values).toContain('今天')
      expect(values).toContain('明天')
      expect(values).toContain('下周')
    })

    it('should extract ISO dates', async () => {
      const result = await service.extract('截止日期是 2026-04-30')
      const dates = result.filter(e => e.type === 'date')
      expect(dates.map(e => e.value)).toContain('2026-04-30')
    })
  })

  describe('amount extraction', () => {
    it('should extract CNY amounts', async () => {
      const result = await service.extract('预算500元，追加¥1,200，总计1.5万')
      const amounts = result.filter(e => e.type === 'amount')
      const values = amounts.map(e => e.value)
      expect(values).toContain('500元')
      expect(values).toContain('¥1,200')
      expect(values).toContain('1.5万')
    })
  })

  describe('action_item extraction', () => {
    it('should extract imperative lines', async () => {
      const result = await service.extract('请尽快提交报告\n记得明天开会\n麻烦帮我看一下')
      const actions = result.filter(e => e.type === 'action_item')
      const values = actions.map(e => e.value)
      expect(values.some(v => v.includes('请尽快提交报告'))).toBe(true)
      expect(values.some(v => v.includes('记得明天开会'))).toBe(true)
      expect(values.some(v => v.includes('麻烦帮我看一下'))).toBe(true)
    })
  })
})
