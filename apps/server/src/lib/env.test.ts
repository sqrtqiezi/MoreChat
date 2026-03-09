import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('env', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('should load required environment variables', async () => {
    process.env.DATABASE_URL = 'file:./test.db'
    process.env.DATA_LAKE_TYPE = 'filesystem'
    process.env.DATA_LAKE_PATH = './test-lake'
    process.env.PORT = '3100'
    process.env.NODE_ENV = 'test'
    process.env.JUHEXBOT_API_URL = 'http://test.com'

    // 动态导入以重新加载环境变量
    const { env } = await import('./env.js')

    expect(env.DATABASE_URL).toBe('file:./test.db')
    expect(env.PORT).toBe('3100')
    expect(env.JUHEXBOT_API_URL).toBe('http://test.com')
  })

  it('should throw error when required variable is missing', async () => {
    process.env.DATA_LAKE_TYPE = 'filesystem'
    process.env.DATA_LAKE_PATH = './test-lake'
    process.env.PORT = '3100'
    process.env.NODE_ENV = 'test'
    process.env.JUHEXBOT_API_URL = 'http://test.com'
    delete process.env.DATABASE_URL

    await expect(async () => {
      await import('./env.js')
    }).rejects.toThrow('DATABASE_URL is required in environment variables')
  })

  it('should throw error for invalid DATA_LAKE_TYPE', async () => {
    process.env.DATABASE_URL = 'file:./test.db'
    process.env.DATA_LAKE_TYPE = 'invalid'
    process.env.DATA_LAKE_PATH = './test-lake'
    process.env.PORT = '3100'
    process.env.NODE_ENV = 'test'
    process.env.JUHEXBOT_API_URL = 'http://test.com'

    await expect(async () => {
      await import('./env.js')
    }).rejects.toThrow('DATA_LAKE_TYPE must be one of: filesystem, s3, minio')
  })

  it('should throw error for invalid NODE_ENV', async () => {
    process.env.DATABASE_URL = 'file:./test.db'
    process.env.DATA_LAKE_TYPE = 'filesystem'
    process.env.DATA_LAKE_PATH = './test-lake'
    process.env.PORT = '3100'
    process.env.NODE_ENV = 'invalid'
    process.env.JUHEXBOT_API_URL = 'http://test.com'

    await expect(async () => {
      await import('./env.js')
    }).rejects.toThrow('NODE_ENV must be one of: development, production, test')
  })
})
