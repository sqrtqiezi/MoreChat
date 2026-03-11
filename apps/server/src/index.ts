import { serve } from '@hono/node-server'
import type { Server } from 'http'
import { env } from './lib/env.js'
import { DataLakeService } from './services/dataLake.js'
import { DatabaseService } from './services/database.js'
import { MessageService } from './services/message.js'
import { JuhexbotAdapter } from './services/juhexbotAdapter.js'
import { WebSocketService } from './services/websocket.js'
import { ClientService } from './services/clientService.js'
import { ConversationService } from './services/conversationService.js'
import { ContactSyncService } from './services/contactSyncService.js'
import { createApp } from './app.js'
import { logger } from './lib/logger.js'

// ============================================================================
// 主函数
// ============================================================================

async function main() {
  try {
    logger.info('Initializing services...')

    // 1. 基础设施层
    const dataLakeService = new DataLakeService({
      type: env.DATA_LAKE_TYPE as 'filesystem',
      path: env.DATA_LAKE_PATH
    })

    const databaseService = new DatabaseService()
    await databaseService.connect()

    // 确保 client 记录存在
    const existingClient = await databaseService.findClientByGuid(env.JUHEXBOT_CLIENT_GUID)
    if (!existingClient) {
      await databaseService.createClient({ guid: env.JUHEXBOT_CLIENT_GUID })
      logger.info({ guid: env.JUHEXBOT_CLIENT_GUID }, 'Client record created')
    }

    const juhexbotAdapter = new JuhexbotAdapter({
      apiUrl: env.JUHEXBOT_API_URL,
      appKey: env.JUHEXBOT_APP_KEY,
      appSecret: env.JUHEXBOT_APP_SECRET,
      clientGuid: env.JUHEXBOT_CLIENT_GUID
    })

    // 获取登录用户信息
    logger.info('Fetching user profile...')
    const userProfile = await juhexbotAdapter.getProfile()
    logger.info({ username: userProfile.username, nickname: userProfile.nickname }, 'User profile fetched')

    // 更新 adapter config
    juhexbotAdapter['config'].clientUsername = userProfile.username

    // 2. 业务服务层
    const clientService = new ClientService(juhexbotAdapter)
    const conversationService = new ConversationService(databaseService, dataLakeService)
    const messageService = new MessageService(databaseService, dataLakeService, juhexbotAdapter, userProfile.username)

    // ContactSyncService 需要 wsService，使用 getter 延迟访问
    const contactSyncService = new ContactSyncService(
      databaseService,
      juhexbotAdapter,
      { broadcast: (event: string, data: unknown) => wsService.broadcast(event, data) } as any
    )

    // 3. 创建 HTTP 应用
    // 注意：wsService 需要在 HTTP server 创建后才能初始化，用 getter 延迟访问
    let wsService: WebSocketService

    const app = createApp({
      clientService,
      conversationService,
      messageService,
      contactSyncService,
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
    logger.info({ port }, 'Starting server')

    const server = serve({ fetch: app.fetch, port })

    // 5. 创建 WebSocket 服务
    wsService = new WebSocketService(server as unknown as Server)
    logger.info('WebSocket service initialized')

    // 6. 启动联系人同步后台任务
    contactSyncService.startBackfillScheduler()

    // 6. 检查 juhexbot 状态
    try {
      const status = await clientService.getStatus()
      logger.info({ online: status.online }, 'juhexbot client status')
    } catch (error) {
      logger.warn({ err: error }, 'Could not check juhexbot status')
    }

    // 7. 注册 webhook 到 juhexbot
    if (env.WEBHOOK_URL) {
      try {
        logger.info({ webhookUrl: env.WEBHOOK_URL }, 'Registering webhook')
        await juhexbotAdapter.setNotifyUrl(env.WEBHOOK_URL)
        logger.info('Webhook registered successfully')
      } catch (error) {
        logger.warn({ err: error }, 'Could not register webhook')
      }
    } else {
      logger.warn('WEBHOOK_URL not configured, skipping webhook registration')
    }

    // 8. 优雅关闭
    async function gracefulShutdown(signal: string) {
      logger.info({ signal }, 'Shutting down gracefully...')
      try {
        contactSyncService.stopBackfillScheduler()
        wsService.close()
        logger.info('WebSocket connections closed')
        await databaseService.disconnect()
        logger.info('Database disconnected')
        logger.info('Shutdown complete')
        process.exit(0)
      } catch (error) {
        logger.error({ err: error }, 'Error during shutdown')
        process.exit(1)
      }
    }

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
    process.on('SIGINT', () => gracefulShutdown('SIGINT'))

    logger.info('Server is ready')
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start server')
    process.exit(1)
  }
}

// 只在直接运行时启动
main()
