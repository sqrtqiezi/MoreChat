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
}

function loadEnv(): EnvConfig {
  const required = [
    'DATABASE_URL',
    'DATA_LAKE_TYPE',
    'DATA_LAKE_PATH',
    'PORT',
    'NODE_ENV',
    'JUHEXBOT_API_URL',
    'JUHEXBOT_APP_KEY',
    'JUHEXBOT_APP_SECRET',
    'JUHEXBOT_CLIENT_GUID',
    'JUHEXBOT_CLOUD_API_URL',
    'AUTH_PASSWORD_HASH',
    'AUTH_JWT_SECRET',
    'ALICLOUD_OSS_REGION',
    'ALICLOUD_OSS_BUCKET',
    'ALICLOUD_OSS_ACCESS_KEY_ID',
    'ALICLOUD_OSS_ACCESS_KEY_SECRET',
    'ALICLOUD_OSS_ENDPOINT'
  ]

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`${key} is required in environment variables`)
    }
  }

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

  return {
    DATABASE_URL: process.env.DATABASE_URL!,
    DATA_LAKE_TYPE: dataLakeType as 'filesystem' | 's3' | 'minio',
    DATA_LAKE_PATH: process.env.DATA_LAKE_PATH!,
    PORT: process.env.PORT!,
    NODE_ENV: nodeEnv as 'development' | 'production' | 'test',
    JUHEXBOT_API_URL: process.env.JUHEXBOT_API_URL!,
    JUHEXBOT_APP_KEY: process.env.JUHEXBOT_APP_KEY!,
    JUHEXBOT_APP_SECRET: process.env.JUHEXBOT_APP_SECRET!,
    JUHEXBOT_CLIENT_GUID: process.env.JUHEXBOT_CLIENT_GUID!,
    JUHEXBOT_CLOUD_API_URL: process.env.JUHEXBOT_CLOUD_API_URL!,
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
    EMBEDDING_MODEL_PATH: process.env.EMBEDDING_MODEL_PATH
  }
}

export const env = loadEnv()
