import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import fs from 'fs/promises'
import path from 'path'

const app = new Hono()

// 采集计数器
let captureCount = 0

app.post('/webhook', async (c) => {
  try {
    const data = await c.req.json()
    const timestamp = Date.now()
    captureCount++

    // 确保 samples 目录存在
    await fs.mkdir('./samples', { recursive: true })

    // 保存原始数据
    const filename = `msg-${timestamp}-${captureCount}.json`
    const filepath = path.join('./samples', filename)
    await fs.writeFile(filepath, JSON.stringify(data, null, 2), 'utf-8')

    // 控制台输出
    console.log(`\n✅ [${captureCount}] Captured message: ${filename}`)
    console.log('─'.repeat(60))
    console.log(JSON.stringify(data, null, 2))
    console.log('─'.repeat(60))

    return c.json({ success: true, captured: captureCount })
  } catch (error) {
    console.error('❌ Error capturing message:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// 健康检查端点
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    captured: captureCount,
    timestamp: new Date().toISOString()
  })
})

// 根路径
app.get('/', (c) => {
  return c.html(`
    <html>
      <head><title>MoreChat Webhook Capture</title></head>
      <body>
        <h1>🎣 MoreChat Webhook Capture Tool</h1>
        <p>Status: <strong>Running</strong></p>
        <p>Messages captured: <strong>${captureCount}</strong></p>
        <p>Webhook endpoint: <code>POST /webhook</code></p>
        <hr>
        <p>Set juhexbot notify_url to: <code>https://your-ngrok-url.ngrok.io/webhook</code></p>
      </body>
    </html>
  `)
})

const port = 3100
console.log('🎣 MoreChat Webhook Capture Tool')
console.log('─'.repeat(60))
console.log(`📡 Server running on http://localhost:${port}`)
console.log(`🔗 Webhook endpoint: http://localhost:${port}/webhook`)
console.log(`💚 Health check: http://localhost:${port}/health`)
console.log('─'.repeat(60))
console.log('Waiting for messages...\n')

serve({ fetch: app.fetch, port })
