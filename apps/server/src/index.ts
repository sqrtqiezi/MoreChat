import { serve } from '@hono/node-server'
import { env } from './lib/env.js'
import { DataLakeService } from './services/dataLake.js'
import { DatabaseService } from './services/database.js'
import { MessageService } from './services/message.js'
import { JuhexbotAdapter } from './services/juhexbotAdapter.js'
import { WebSocketService } from './services/websocket.js'
import { createApp } from './app.js'
import type { ParsedWebhookPayload } from './services/juhexbotAdapter.js'

// ============================================================================
// 主函数
// ============================================================================

async function main() {
  try {
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
      appKey: env.JUHEXBOT_APP_KEY,
      appSecret: env.JUHEXBOT_APP_SECRET,
      clientGuid: env.JUHEXBOT_CLIENT_GUID
    })

    // 4. Message Service
    const messageService = new MessageService(
      databaseService,
      dataLakeService,
      juhexbotAdapter
    )

    // 5. 创建消息处理器
    async function handleWebhookMessage(parsed: ParsedWebhookPayload) {
      try {
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

    // 6. 创建 Hono App
    const app = createApp(juhexbotAdapter, handleWebhookMessage)

    // 7. 启动 HTTP 服务器
    const port = parseInt(env.PORT)
    console.log(`🚀 Starting server on http://localhost:${port}`)

    const server = serve({
      fetch: app.fetch,
      port
    })

    // 8. 创建 WebSocket 服务
    const wsService = new WebSocketService(server)
    console.log('✅ WebSocket service initialized')

    // 9. 优雅关闭
    async function gracefulShutdown(signal: string) {
      console.log(`\n${signal} received, shutting down gracefully...`)

      try {
        wsService.close()
        console.log('✅ WebSocket connections closed')

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

    return { dataLakeService, databaseService, messageService, juhexbotAdapter, wsService }
  } catch (error) {
    console.error('❌ Failed to start server:', error)
    process.exit(1)
  }
}

// 只在直接运行时启动
main()
