import { logger } from './logger.js'

export interface RetryOptions {
  maxRetries?: number
  initialDelayMs?: number
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3
  const initialDelayMs = options?.initialDelayMs ?? 2000

  let lastError: Error | undefined
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt < maxRetries) {
        const delay = initialDelayMs * Math.pow(2, attempt)
        logger.warn({ attempt: attempt + 1, maxRetries, delay, err: lastError }, 'Retry after failure')
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }
  throw lastError!
}
