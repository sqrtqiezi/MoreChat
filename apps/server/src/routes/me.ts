import { Hono } from 'hono'

export interface ProfileState {
  username: string
  nickname: string
  avatar?: string
  degraded: boolean
}

export interface MeRouteDeps {
  getProfileState: () => ProfileState
}

export function meRoutes(deps: MeRouteDeps) {
  const router = new Hono()

  // GET /api/me - 获取当前登录用户信息
  router.get('/', (c) => {
    const state = deps.getProfileState()
    return c.json({
      success: true,
      data: {
        username: state.username,
        nickname: state.nickname,
        avatar: state.avatar,
        degraded: state.degraded
      }
    })
  })

  return router
}
