import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sign } from 'hono/jwt'
import { createApp } from './app.js'
import type { AppDependencies } from './app.js'

const TEST_JWT_SECRET = 'test-jwt-secret'

async function validToken() {
  const now = Math.floor(Date.now() / 1000)
  return sign({ iat: now, exp: now + 3600 }, TEST_JWT_SECRET)
}

describe('createApp', () => {
  let deps: AppDependencies

  beforeEach(() => {
    deps = {
      clientService: { getStatus: vi.fn() } as any,
      conversationService: {
        list: vi.fn(),
        getById: vi.fn(),
        markAsRead: vi.fn(),
        getMessages: vi.fn(),
        openConversation: vi.fn()
      } as any,
      directoryService: {
        list: vi.fn(),
      } as any,
      messageService: {
        handleIncomingMessage: vi.fn(),
        sendMessage: vi.fn()
      } as any,
      imageService: {} as any,
      contactSyncService: {
        syncGroup: vi.fn(),
        syncContact: vi.fn()
      } as any,
      juhexbotAdapter: {
        parseWebhookPayload: vi.fn()
      } as any,
      wsService: {
        broadcast: vi.fn(),
        sendToClient: vi.fn()
      } as any,
      clientGuid: 'test_guid',
      userProfile: {
        username: 'test_user',
        nickname: 'Test User'
      },
      auth: {
        passwordHash: '$2a$10$some_test_hash',
        jwtSecret: TEST_JWT_SECRET,
      }
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
    const token = await validToken()
    const res = await app.request('/api/client/status', {
      headers: { Authorization: `Bearer ${token}` }
    })

    expect(res.status).toBe(200)
  })

  it('should mount conversation routes', async () => {
    vi.mocked(deps.conversationService.list).mockResolvedValue([])

    const app = createApp(deps)
    const token = await validToken()
    const res = await app.request('/api/conversations', {
      headers: { Authorization: `Bearer ${token}` }
    })

    expect(res.status).toBe(200)
  })

  it('should mount directory routes', async () => {
    vi.mocked((deps.directoryService as any).list).mockResolvedValue({ contacts: [], groups: [] })

    const app = createApp(deps)
    const token = await validToken()
    const res = await app.request('/api/directory', {
      headers: { Authorization: `Bearer ${token}` }
    })

    expect(res.status).toBe(200)
  })

  it('should mount message routes', async () => {
    const app = createApp(deps)
    const token = await validToken()
    const res = await app.request('/api/messages/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ conversationId: 'conv_1', content: 'test' })
    })

    // 即使 mock 返回 undefined，路由应该存在
    expect(res.status).not.toBe(404)
  })

  it('should reject /api/* requests without token', async () => {
    const app = createApp(deps)
    const res = await app.request('/api/client/status')

    expect(res.status).toBe(401)
  })

  it('should allow /api/auth/login without token', async () => {
    const app = createApp(deps)
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrong-password' })
    })

    // Should not be 401 from middleware — the route itself may return 401 for wrong password,
    // but that's the route logic, not the middleware blocking it
    expect(res.status).not.toBe(404)
  })

  it('should allow /health without token', async () => {
    const app = createApp(deps)
    const res = await app.request('/health')

    expect(res.status).toBe(200)
  })

  it('should allow /webhook without token', async () => {
    vi.mocked(deps.juhexbotAdapter.parseWebhookPayload).mockReturnValue({
      conversationId: 'conv_1',
      content: 'hello',
    } as any)
    vi.mocked(deps.messageService.handleIncomingMessage).mockResolvedValue(undefined as any)

    const app = createApp(deps)
    const res = await app.request('/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'message', data: {} })
    })

    expect(res.status).toBe(200)
  })

  it('should broadcast message:recall via WebSocket for recall result', async () => {
    vi.mocked(deps.juhexbotAdapter.parseWebhookPayload).mockReturnValue({
      message: { msgType: 10002 }
    } as any)
    vi.mocked(deps.messageService.handleIncomingMessage).mockResolvedValue({
      type: 'recall',
      conversationId: 'conv_1',
      revokedMsgId: 'msg_1',
    } as any)

    const app = createApp(deps)
    const res = await app.request('/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'message', data: {} })
    })

    expect(res.status).toBe(200)
    expect(deps.wsService.broadcast).toHaveBeenCalledWith('message:recall', {
      conversationId: 'conv_1',
      msgId: 'msg_1',
    })
  })
})
