import { describe, it, expect, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { authRoutes } from './auth'

// bcrypt hash of "test123"
const TEST_HASH = '$2b$10$7C0HdyN1MmsEDq1N5ig5Tu/T/iwa4m0xv10LII5kr5vcQ6ThHdpIK'
const JWT_SECRET = 'test-jwt-secret'

describe('auth routes', () => {
  let app: Hono

  beforeEach(() => {
    app = new Hono()
    app.route('/api/auth', authRoutes({
      passwordHash: TEST_HASH,
      jwtSecret: JWT_SECRET,
    }))
  })

  describe('POST /api/auth/login', () => {
    it('should return token on correct password', async () => {
      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'test123' }),
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.data.token).toBeDefined()
      expect(typeof body.data.token).toBe('string')
    })

    it('should return 401 on wrong password', async () => {
      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'wrong' }),
      })
      const body = await res.json()

      expect(res.status).toBe(401)
      expect(body.success).toBe(false)
    })

    it('should return 400 if password is missing', async () => {
      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(400)
    })
  })
})
