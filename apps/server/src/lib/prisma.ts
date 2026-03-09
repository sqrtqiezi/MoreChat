import pkg from '@prisma/client'
const { PrismaClient } = pkg
type PrismaClientType = InstanceType<typeof PrismaClient>

// 全局类型声明
declare global {
  var __morechatPrismaClient: PrismaClientType | undefined
}

// 创建 Prisma Client 实例的工厂函数
export function createPrismaClient(datasourceUrl?: string) {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    ...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {})
  })
}

// 创建 Prisma Client 单例（仅在非测试环境使用）
export const prisma =
  process.env.NODE_ENV === 'test'
    ? createPrismaClient() // 测试环境不使用全局单例
    : (global.__morechatPrismaClient || createPrismaClient())

// 开发模式下缓存实例，避免热重载时创建多个连接
if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
  global.__morechatPrismaClient = prisma
}

// 优雅关闭
export async function disconnectPrisma() {
  try {
    await prisma.$disconnect()
  } catch (error) {
    console.error('Failed to disconnect Prisma client:', error)
    throw error
  }
}
