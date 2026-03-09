import { jwt } from 'hono/jwt'
import type { MiddlewareHandler } from 'hono'

export function authMiddleware(secret: string): MiddlewareHandler {
  return jwt({ secret, alg: 'HS256' })
}
