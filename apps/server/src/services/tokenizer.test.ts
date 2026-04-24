import { describe, it, expect } from 'vitest'
import { Tokenizer } from './tokenizer.js'

describe('Tokenizer', () => {
  const tokenizer = new Tokenizer()

  it('should tokenize Chinese text', () => {
    const text = '我们讨论项目预算'
    const tokens = tokenizer.tokenize(text)

    expect(tokens).toContain('我们')
    expect(tokens).toContain('讨论')
    expect(tokens).toContain('项目')
    expect(tokens).toContain('预算')
  })

  it('should handle empty string', () => {
    const tokens = tokenizer.tokenize('')
    expect(tokens).toEqual([])
  })

  it('should handle mixed Chinese and English', () => {
    const text = '使用DuckDB进行搜索'
    const tokens = tokenizer.tokenize(text)

    expect(tokens.length).toBeGreaterThan(0)
    expect(tokens).toContain('使用')
    expect(tokens).toContain('进行')
    expect(tokens).toContain('搜索')
  })

  it('should join tokens with space', () => {
    const text = '全文检索功能'
    const joined = tokenizer.tokenizeAndJoin(text)

    expect(joined).toContain(' ')
    expect(joined.split(' ').length).toBeGreaterThan(1)
  })
})
