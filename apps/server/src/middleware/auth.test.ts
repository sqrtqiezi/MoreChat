import { describe, it, expect, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { sign } from 'hono/jwt'
import { authMiddleware } from './auth'

const JWT_SECRET = 'test-jwt-secret'

describe('auth middleware', () => {
  let app: Hono

  beforeEach(() => {
    app = new Hono()
    app.use('/api/*', authMiddleware(JWT_SECRET))
    app.get('/api/test', (c) => c.json({ ok: true }))
    app.get('/health', (c) => c.json({ ok: true }))
  })

  it('should reject requests without token', async () => {
    const res = await app.request('/api/test')
    expect(res.status).toBe(401)
  })

  it('should reject requests with invalid token', async () => {
    const res = await app.request('/api/test', {
      headers: { Authorization: 'Bearer invalid-token' },
    })
    expect(res.status).toBe(401)
  })

  it('should accept requests with valid token', async () => {
    const now = Math.floor(Date.now() / 1000)
    const token = await sign({ iat: now, exp: now + 3600 }, JWT_SECRET)

    const res = await app.request('/api/test', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
  })

  it('should reject expired tokens', async () => {
    const now = Math.floor(Date.now() / 1000)
    const token = await sign({ iat: now - 7200, exp: now - 3600 }, JWT_SECRET)

    const res = await app.request('/api/test', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(401)
  })
})
