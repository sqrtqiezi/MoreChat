import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RateLimiter } from './rateLimiter.js'

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should allow first request immediately', async () => {
    const limiter = new RateLimiter(3000)
    const start = Date.now()
    await limiter.acquire()
    expect(Date.now() - start).toBeLessThan(100)
  })

  it('should delay second request by minIntervalMs', async () => {
    const limiter = new RateLimiter(3000)
    await limiter.acquire()

    const promise = limiter.acquire()
    vi.advanceTimersByTime(3000)
    await promise
    // Should resolve after advancing timers
  })

  it('should queue multiple requests sequentially', async () => {
    const limiter = new RateLimiter(1000)
    const order: number[] = []

    await limiter.acquire()
    order.push(1)

    const p2 = limiter.acquire().then(() => order.push(2))
    const p3 = limiter.acquire().then(() => order.push(3))

    vi.advanceTimersByTime(1000)
    await p2
    vi.advanceTimersByTime(1000)
    await p3

    expect(order).toEqual([1, 2, 3])
  })
})
