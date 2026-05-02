import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// 加载 .env 文件（测试环境中跳过，使用测试设置的环境变量）
if (process.env.NODE_ENV !== 'test' || !process.env.VITEST) {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = dirname(__filename)
  dotenv.config({ path: join(__dirname, '../../.env') })
}

interface EnvConfig {
  DATABASE_URL: string
  DATA_LAKE_TYPE: 'filesystem' | 's3' | 'minio'
  DATA_LAKE_PATH: string
  PORT: string
  NODE_ENV: 'development' | 'production' | 'test'
  JUHEXBOT_API_URL: string
  JUHEXBOT_APP_KEY: string
  JUHEXBOT_APP_SECRET: string
  JUHEXBOT_CLIENT_GUID: string
  JUHEXBOT_CLOUD_API_URL: string
  WEBHOOK_URL?: string
  LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error'
  AUTH_PASSWORD_HASH: string
  AUTH_JWT_SECRET: string
  CORS_ORIGIN?: string
  alicloudOssRegion: string
  alicloudOssBucket: string
  alicloudOssAccessKeyId: string
  alicloudOssAccessKeySecret: string
  alicloudOssEndpoint: string
  EMBEDDING_ENABLED: boolean
  EMBEDDING_MODEL_PATH?: string
  LLM_BASE_URL?: string
  LLM_API_KEY?: string
  LLM_MODEL?: string
  DIGEST_ENABLED: boolean
  E2E_BOT_MODE: boolean
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

function parseBooleanFlag(value: string | undefined): boolean {
  if (!value) {
    return false
  }

  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

function requireEnv(keys: string[]): void {
  for (const key of keys) {
    if (!process.env[key]) {
      throw new Error(`${key} is required in environment variables`)
    }
  }
}

function isLocalUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return LOCAL_HOSTS.has(parsed.hostname)
  } catch {
    return false
  }
}

function assertSafeE2EBotMode(nodeEnv: string): void {
  if (nodeEnv === 'production') {
    throw new Error('E2E_BOT_MODE is not allowed when NODE_ENV=production')
  }

  if (process.env.WEBHOOK_URL && !isLocalUrl(process.env.WEBHOOK_URL)) {
    throw new Error('E2E_BOT_MODE requires WEBHOOK_URL to target localhost only')
  }

  if (process.env.CORS_ORIGIN) {
    const origins = process.env.CORS_ORIGIN
      .split(',')
      .map(origin => origin.trim())
      .filter(Boolean)

    if (origins.some(origin => !isLocalUrl(origin))) {
      throw new Error('E2E_BOT_MODE requires CORS_ORIGIN to target localhost only')
    }
  }
}

function loadEnv(): EnvConfig {
  const baseRequired = [
    'DATABASE_URL',
    'DATA_LAKE_TYPE',
    'DATA_LAKE_PATH',
    'PORT',
    'NODE_ENV',
    'AUTH_PASSWORD_HASH',
    'AUTH_JWT_SECRET',
    'ALICLOUD_OSS_REGION',
    'ALICLOUD_OSS_BUCKET',
    'ALICLOUD_OSS_ACCESS_KEY_ID',
    'ALICLOUD_OSS_ACCESS_KEY_SECRET',
    'ALICLOUD_OSS_ENDPOINT'
  ]
  requireEnv(baseRequired)

  // 验证枚举值
  const dataLakeType = process.env.DATA_LAKE_TYPE
  if (!['filesystem', 's3', 'minio'].includes(dataLakeType!)) {
    throw new Error(`DATA_LAKE_TYPE must be one of: filesystem, s3, minio`)
  }

  const nodeEnv = process.env.NODE_ENV
  if (!['development', 'production', 'test'].includes(nodeEnv!)) {
    throw new Error(`NODE_ENV must be one of: development, production, test`)
  }

  const embeddingEnabled = process.env.EMBEDDING_ENABLED !== 'false'
  const digestEnabled = process.env.DIGEST_ENABLED !== 'false'
  // Local E2E only. Default off so non-test startup keeps the real bot adapter.
  const e2eBotMode = parseBooleanFlag(process.env.E2E_BOT_MODE)

  if (e2eBotMode) {
    assertSafeE2EBotMode(nodeEnv!)
    requireEnv(['JUHEXBOT_CLIENT_GUID'])
  } else {
    requireEnv([
      'JUHEXBOT_API_URL',
      'JUHEXBOT_APP_KEY',
      'JUHEXBOT_APP_SECRET',
      'JUHEXBOT_CLIENT_GUID',
      'JUHEXBOT_CLOUD_API_URL',
    ])
  }

  const juhexbotClientGuid = process.env.JUHEXBOT_CLIENT_GUID!
  const juhexbotApiUrl = process.env.JUHEXBOT_API_URL || 'http://127.0.0.1:9/e2e-offline'
  const juhexbotAppKey = process.env.JUHEXBOT_APP_KEY || 'e2e-offline-app-key'
  const juhexbotAppSecret = process.env.JUHEXBOT_APP_SECRET || 'e2e-offline-app-secret'
  const juhexbotCloudApiUrl = process.env.JUHEXBOT_CLOUD_API_URL || 'http://127.0.0.1:9/e2e-offline-cloud'

  return {
    DATABASE_URL: process.env.DATABASE_URL!,
    DATA_LAKE_TYPE: dataLakeType as 'filesystem' | 's3' | 'minio',
    DATA_LAKE_PATH: process.env.DATA_LAKE_PATH!,
    PORT: process.env.PORT!,
    NODE_ENV: nodeEnv as 'development' | 'production' | 'test',
    JUHEXBOT_API_URL: juhexbotApiUrl,
    JUHEXBOT_APP_KEY: juhexbotAppKey,
    JUHEXBOT_APP_SECRET: juhexbotAppSecret,
    JUHEXBOT_CLIENT_GUID: juhexbotClientGuid,
    JUHEXBOT_CLOUD_API_URL: juhexbotCloudApiUrl,
    WEBHOOK_URL: process.env.WEBHOOK_URL,
    LOG_LEVEL: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
    AUTH_PASSWORD_HASH: process.env.AUTH_PASSWORD_HASH!,
    AUTH_JWT_SECRET: process.env.AUTH_JWT_SECRET!,
    CORS_ORIGIN: process.env.CORS_ORIGIN,
    alicloudOssRegion: process.env.ALICLOUD_OSS_REGION!,
    alicloudOssBucket: process.env.ALICLOUD_OSS_BUCKET!,
    alicloudOssAccessKeyId: process.env.ALICLOUD_OSS_ACCESS_KEY_ID!,
    alicloudOssAccessKeySecret: process.env.ALICLOUD_OSS_ACCESS_KEY_SECRET!,
    alicloudOssEndpoint: process.env.ALICLOUD_OSS_ENDPOINT!,
    EMBEDDING_ENABLED: embeddingEnabled,
    EMBEDDING_MODEL_PATH: process.env.EMBEDDING_MODEL_PATH,
    LLM_BASE_URL: process.env.LLM_BASE_URL,
    LLM_API_KEY: process.env.LLM_API_KEY,
    LLM_MODEL: process.env.LLM_MODEL,
    DIGEST_ENABLED: digestEnabled,
    E2E_BOT_MODE: e2eBotMode
  }
}

export const env = loadEnv()
