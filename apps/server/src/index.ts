import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { serve } from '@hono/node-server'
import { env } from './lib/env'
import { DataLakeService } from './services/dataLake'
import { DatabaseService } from './services/database'
import { MessageService } from './services/message'
import { JuhexbotAdapter } from './services/juhexbotAdapter'
import { WebSocketService } from './services/websocket'
import type { ParsedWebhookPayload } from './services/juhexbotAdapter'

// ============================================================================
// 服务初始化
// ============================================================================

console.log('🔧 Initializing services...')

// 1. Data Lake Service
const dataLakeService = new DataLakeService({
  type: env.DATA_LAKE_TYPE,
  path: env.DATA_LAKE_PATH
})

// 2. Database Service
const databaseService = new DatabaseService()
await databaseService.connect()

// 3. Juhexbot Adapter
const juhexbotAdapter = new JuhexbotAdapter({
  apiUrl: env.JUHEXBOT_API_URL,
  appKey: process.env.JUHEXBOT_APP_KEY || '',
  appSecret: process.env.JUHEXBOT_APP_SECRET || '',
  clientGuid: process.env.JUHEXBOT_CLIENT_GUID || ''
})

// 4. Message Service
const messageService = new MessageService(
  databaseService,
  dataLakeService,
  juhexbotAdapter
)

// ============================================================================
// 消息处理器
// ============================================================================

async function handleWebhookMessage(payload: any) {
  try {
    const parsed = juhexbotAdapter.parseWebhookPayload(payload)
    console.log('📨 Received message:', {
      guid: parsed.guid,
      msgId: parsed.message.msgId,
      msgType: parsed.message.msgType,
      from: parsed.message.fromUsername
    })
    await messageService.handleIncomingMessage(parsed)
  } catch (error) {
    console.error('❌ Failed to handle webhook message:', error)
    throw error
  }
}

// ============================================================================
// Hono App
// ============================================================================

const app = new Hono()

app.use('*', logger())
app.use('*', cors())

app.get('/', (c) => {
  return c.json({
    message: 'MoreChat API — Small is boring',
    version: '0.1.0'
  })
})

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.post('/webhook', async (c) => {
  try {
    const payload = await c.req.json()
    await handleWebhookMessage(payload)
    return c.json({ success: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// ============================================================================
// HTTP Server
// ============================================================================

const port = parseInt(env.PORT)
console.log(`🚀 Starting server on http://localhost:${port}`)

const server = serve({
  fetch: app.fetch,
  port
})

// ============================================================================
// WebSocket Service
// ============================================================================

const wsService = new WebSocketService(server)
console.log('✅ WebSocket service initialized')

// ============================================================================
// 优雅关闭
// ============================================================================

async function gracefulShutdown(signal: string) {
  console.log(`\n${signal} received, shutting down gracefully...`)

  try {
    // 1. 关闭 WebSocket 连接
    wsService.close()
    console.log('✅ WebSocket connections closed')

    // 2. 关闭数据库连接
    await databaseService.disconnect()
    console.log('✅ Database disconnected')

    console.log('👋 Shutdown complete')
    process.exit(0)
  } catch (error) {
    console.error('❌ Error during shutdown:', error)
    process.exit(1)
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

console.log('✅ Server is ready')

// ============================================================================
// 导出服务实例供测试使用
// ============================================================================

export {
  dataLakeService,
  databaseService,
  messageService,
  juhexbotAdapter,
  wsService
}
