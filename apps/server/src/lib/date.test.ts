// ABOUTME: date.ts 的单元测试
// ABOUTME: 验证日期格式化函数固定使用 Asia/Shanghai 时区

import { describe, it, expect } from 'vitest'
import { formatLocalDate, formatLocalMonth } from './date.js'

describe('formatLocalDate', () => {
  it('should return Asia/Shanghai date at UTC/CST boundary', () => {
    // 2024-03-11 17:00:00 UTC = 2024-03-12 01:00:00 CST
    const date = new Date('2024-03-11T17:00:00Z')
    expect(formatLocalDate(date)).toBe('2024-03-12')
  })

  it('should return same date when UTC and CST agree', () => {
    // 2024-03-11 08:00:00 UTC = 2024-03-11 16:00:00 CST
    const date = new Date('2024-03-11T08:00:00Z')
    expect(formatLocalDate(date)).toBe('2024-03-11')
  })

  it('should zero-pad month and day', () => {
    // 2024-01-01 00:00:00 CST = 2023-12-31 16:00:00 UTC
    const date = new Date('2023-12-31T16:00:00Z')
    expect(formatLocalDate(date)).toBe('2024-01-01')
  })
})

describe('formatLocalMonth', () => {
  it('should return Asia/Shanghai month at UTC/CST boundary', () => {
    // 2024-02-29 17:00:00 UTC = 2024-03-01 01:00:00 CST
    const date = new Date('2024-02-29T17:00:00Z')
    expect(formatLocalMonth(date)).toBe('2024-03')
  })

  it('should return same month when UTC and CST agree', () => {
    const date = new Date('2024-03-15T08:00:00Z')
    expect(formatLocalMonth(date)).toBe('2024-03')
  })
})
