import { describe, it, expect, vi } from 'vitest'
import { retryWithBackoff } from './retry.js'

describe('retryWithBackoff', () => {
  it('should return result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await retryWithBackoff(fn)
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('should retry on failure and succeed', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('ok')
    const result = await retryWithBackoff(fn, { maxRetries: 3, initialDelayMs: 10 })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('should throw after all retries exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fail'))
    await expect(
      retryWithBackoff(fn, { maxRetries: 2, initialDelayMs: 10 })
    ).rejects.toThrow('always fail')
    expect(fn).toHaveBeenCalledTimes(3) // 1 initial + 2 retries
  })

  it('should use exponential backoff delays', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok')
    const startTime = Date.now()
    await retryWithBackoff(fn, { maxRetries: 1, initialDelayMs: 50 })
    const elapsed = Date.now() - startTime
    expect(elapsed).toBeGreaterThanOrEqual(40) // at least ~50ms delay
  })
})
