import { Hono } from 'hono'

export interface MeRouteDeps {
  username: string
  nickname: string
  avatar?: string
}

export function meRoutes(deps: MeRouteDeps) {
  const router = new Hono()

  // GET /api/me - 获取当前登录用户信息
  router.get('/', (c) => {
    return c.json({
      success: true,
      data: {
        username: deps.username,
        nickname: deps.nickname,
        avatar: deps.avatar
      }
    })
  })

  return router
}
