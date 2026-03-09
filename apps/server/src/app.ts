import { Hono } from 'hono'
import type { JuhexbotAdapter, ParsedWebhookPayload } from './services/juhexbotAdapter'

export type MessageHandler = (parsed: ParsedWebhookPayload) => Promise<void>

export function createApp(adapter: JuhexbotAdapter, onMessage?: MessageHandler) {
  const app = new Hono()

  app.get('/health', (c) => {
    return c.json({ status: 'ok', timestamp: Date.now() })
  })

  app.post('/webhook', async (c) => {
    try {
      const payload = await c.req.json()
      const parsed = adapter.parseWebhookPayload(payload)

      if (onMessage) {
        await onMessage(parsed)
      }

      return c.json({ success: true })
    } catch (error) {
      console.error('Webhook error:', error)
      return c.json({ success: false, error: 'Internal error' }, 500)
    }
  })

  return app
}
