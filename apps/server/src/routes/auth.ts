import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { sign } from 'hono/jwt'

interface AuthDeps {
  passwordHash: string
  jwtSecret: string
}

export function authRoutes(deps: AuthDeps) {
  const router = new Hono()

  router.post('/login', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const { password } = body

    if (!password || typeof password !== 'string') {
      return c.json({ success: false, error: { message: '密码不能为空' } }, 400)
    }

    const valid = await bcrypt.compare(password, deps.passwordHash)
    if (!valid) {
      return c.json({ success: false, error: { message: '密码错误' } }, 401)
    }

    const now = Math.floor(Date.now() / 1000)
    const token = await sign(
      { iat: now, exp: now + 7 * 24 * 60 * 60 },
      deps.jwtSecret
    )

    return c.json({ success: true, data: { token } })
  })

  return router
}
