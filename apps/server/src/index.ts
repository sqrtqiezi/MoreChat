import { serve } from '@hono/node-server'
import type { Server } from 'http'
import { env } from './lib/env.js.js'
import { DataLakeService } from './services/dataLake.js.js'
import { DatabaseService } from './services/database.js.js'
import { MessageService } from './services/message.js.js'
import { JuhexbotAdapter } from './services/juhexbotAdapter.js.js'
import { WebSocketService } from './services/websocket.js.js'
import { ClientService } from './services/clientService.js.js'
import { ConversationService } from './services/conversationService.js.js'
import { createApp } from './app.js.js'

// ============================================================================
// 主函数
// ============================================================================

async function main() {
  try {
    console.log('🔧 Initializing services...')

    // 1. 基础设施层
    const dataLakeService = new DataLakeService({
      type: env.DATA_LAKE_TYPE as 'filesystem',
      path: env.DATA_LAKE_PATH
    })

    const databaseService = new DatabaseService()
    await databaseService.connect()

    const juhexbotAdapter = new JuhexbotAdapter({
      apiUrl: env.JUHEXBOT_API_URL,
      appKey: env.JUHEXBOT_APP_KEY,
      appSecret: env.JUHEXBOT_APP_SECRET,
      clientGuid: env.JUHEXBOT_CLIENT_GUID
    })

    // 2. 业务服务层
    const clientService = new ClientService(juhexbotAdapter)
    const conversationService = new ConversationService(databaseService, dataLakeService)
    const messageService = new MessageService(databaseService, dataLakeService, juhexbotAdapter)

    // 3. 创建 HTTP 应用
    // 注意：wsService 需要在 HTTP server 创建后才能初始化，用 getter 延迟访问
    let wsService: WebSocketService

    const app = createApp({
      clientService,
      conversationService,
      messageService,
      juhexbotAdapter,
      get wsService() { return wsService },
      clientGuid: env.JUHEXBOT_CLIENT_GUID,
      auth: {
        passwordHash: env.AUTH_PASSWORD_HASH,
        jwtSecret: env.AUTH_JWT_SECRET,
      },
      corsOrigin: env.CORS_ORIGIN,
      nodeEnv: env.NODE_ENV,
    } as any)

    // 4. 启动 HTTP 服务器
    const port = parseInt(env.PORT)
    console.log(`🚀 Starting server on http://localhost:${port}`)

    const server = serve({ fetch: app.fetch, port })

    // 5. 创建 WebSocket 服务
    wsService = new WebSocketService(server as unknown as Server)
    console.log('✅ WebSocket service initialized')

    // 6. 检查 juhexbot 状态
    try {
      const status = await clientService.getStatus()
      console.log(`✅ juhexbot client: ${status.online ? 'online' : 'offline'}`)
    } catch (error) {
      console.warn('⚠️ Could not check juhexbot status:', error)
    }

    // 7. 优雅关闭
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
  } catch (error) {
    console.error('❌ Failed to start server:', error)
    process.exit(1)
  }
}

// 只在直接运行时启动
main()
