export class RateLimiter {
  private lastRequestTime = 0
  private queue: Array<() => void> = []
  private processing = false

  constructor(private minIntervalMs: number) {}

  async acquire(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.queue.push(resolve)
      if (!this.processing) {
        this.processQueue()
      }
    })
  }

  private processQueue() {
    if (this.queue.length === 0) {
      this.processing = false
      return
    }

    this.processing = true
    const resolve = this.queue.shift()!
    const now = Date.now()
    const elapsed = now - this.lastRequestTime
    const delay = Math.max(0, this.minIntervalMs - elapsed)

    if (delay === 0) {
      this.lastRequestTime = now
      resolve()
      this.processQueue()
    } else {
      setTimeout(() => {
        this.lastRequestTime = Date.now()
        resolve()
        this.processQueue()
      }, delay)
    }
  }
}
