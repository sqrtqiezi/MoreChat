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
    process.env.JUHEXBOT_APP_KEY = 'test_key'
    process.env.JUHEXBOT_APP_SECRET = 'test_secret'
    process.env.JUHEXBOT_CLIENT_GUID = 'test_guid'

    // 动态导入以重新加载环境变量
    const { env } = await import('./env.js')

    expect(env.DATABASE_URL).toBe('file:./test.db')
    expect(env.PORT).toBe('3100')
    expect(env.JUHEXBOT_APP_KEY).toBe('test_key')
  })

  it('should throw error when required variable is missing', async () => {
    process.env.DATA_LAKE_TYPE = 'filesystem'
    process.env.DATA_LAKE_PATH = './test-lake'
    process.env.PORT = '3100'
    process.env.NODE_ENV = 'test'
    process.env.JUHEXBOT_API_URL = 'http://test.com'
    process.env.JUHEXBOT_APP_KEY = 'test_key'
    process.env.JUHEXBOT_APP_SECRET = 'test_secret'
    process.env.JUHEXBOT_CLIENT_GUID = 'test_guid'
    delete process.env.DATABASE_URL

    await expect(async () => {
      await import('./env.js')
    }).rejects.toThrow('DATABASE_URL is required')
  })
})
