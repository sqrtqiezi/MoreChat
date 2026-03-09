import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createApp } from './app'
import type { AppDependencies } from './app'

describe('createApp', () => {
  let deps: AppDependencies

  beforeEach(() => {
    deps = {
      clientService: { getStatus: vi.fn() } as any,
      conversationService: {
        list: vi.fn(),
        getById: vi.fn(),
        markAsRead: vi.fn(),
        getMessages: vi.fn()
      } as any,
      messageService: {
        handleIncomingMessage: vi.fn(),
        sendMessage: vi.fn()
      } as any,
      juhexbotAdapter: {
        parseWebhookPayload: vi.fn()
      } as any,
      wsService: {
        broadcast: vi.fn(),
        sendToClient: vi.fn()
      } as any,
      clientGuid: 'test_guid'
    }
  })

  it('should respond to health check', async () => {
    const app = createApp(deps)
    const res = await app.request('/health')
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.status).toBe('ok')
  })

  it('should mount client routes', async () => {
    vi.mocked(deps.clientService.getStatus).mockResolvedValue({
      online: true, guid: 'test_guid'
    })

    const app = createApp(deps)
    const res = await app.request('/api/client/status')

    expect(res.status).toBe(200)
  })

  it('should mount conversation routes', async () => {
    vi.mocked(deps.conversationService.list).mockResolvedValue([])

    const app = createApp(deps)
    const res = await app.request('/api/conversations')

    expect(res.status).toBe(200)
  })

  it('should mount message routes', async () => {
    const app = createApp(deps)
    const res = await app.request('/api/messages/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: 'conv_1', content: 'test' })
    })

    // 即使 mock 返回 undefined，路由应该存在
    expect(res.status).not.toBe(404)
  })
})
