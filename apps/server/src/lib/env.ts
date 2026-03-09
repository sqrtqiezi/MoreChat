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
}

function loadEnv(): EnvConfig {
  const required = [
    'DATABASE_URL',
    'DATA_LAKE_TYPE',
    'DATA_LAKE_PATH',
    'PORT',
    'NODE_ENV',
    'JUHEXBOT_API_URL'
  ]

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`${key} is required in environment variables`)
    }
  }

  return {
    DATABASE_URL: process.env.DATABASE_URL!,
    DATA_LAKE_TYPE: process.env.DATA_LAKE_TYPE as any,
    DATA_LAKE_PATH: process.env.DATA_LAKE_PATH!,
    PORT: process.env.PORT!,
    NODE_ENV: process.env.NODE_ENV as any,
    JUHEXBOT_API_URL: process.env.JUHEXBOT_API_URL!
  }
}

export const env = loadEnv()
