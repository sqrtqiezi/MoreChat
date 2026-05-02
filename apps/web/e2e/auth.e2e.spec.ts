// ABOUTME: 认证与登录功能的端到端测试
// ABOUTME: 测试登录成功、登录失败、Token 过期等场景

import { test, expect } from '@playwright/test'

// 使用本地测试环境
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
// 本地开发环境的测试密码（对应 .env 中的 AUTH_PASSWORD_HASH）
// $2b$10$xhaDIjVx7SyJJlulTxfLvuiqdo5cOeJqLvZlDJdwiQgjCVOgqNuh. 对应的明文密码是 'test123'
const CORRECT_PASSWORD = 'test123'
const WRONG_PASSWORD = 'wrong_password'

test.describe('认证与登录', () => {
  test.beforeEach(async ({ page, context }) => {
    // 清除所有存储状态，确保每个测试都是全新开始
    await context.clearCookies()
    // 先访问页面，然后再清除 localStorage
    await page.goto(BASE_URL)
    await page.evaluate(() => localStorage.clear())
  })

  test('1.1 成功登录', async ({ page }) => {
    // 访问首页
    await page.goto(BASE_URL)

    // 应该自动重定向到登录页
    await page.waitForURL(/\/login/, { timeout: 10000 })
    expect(page.url()).toContain('/login')

    // 输入正确密码
    const passwordInput = page.locator('input[type="password"]')
    await expect(passwordInput).toBeVisible()
    await passwordInput.fill(CORRECT_PASSWORD)

    // 提交登录
    await page.keyboard.press('Enter')

    // 等待登录成功，重定向到首页（Knowledge Page）
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 })
    expect(page.url()).not.toContain('/login')

    // 验证 localStorage 中保存了 token
    const token = await page.evaluate(() => localStorage.getItem('auth_token'))
    expect(token).toBeTruthy()
    expect(typeof token).toBe('string')

    // 验证页面加载成功（应该能看到搜索框或导航栏）
    await page.waitForLoadState('networkidle')

    // 检查是否有导航栏或主要内容区域
    const hasNavigation = await page.locator('nav').count() > 0
    const hasMainContent = await page.locator('main, [role="main"]').count() > 0
    expect(hasNavigation || hasMainContent).toBeTruthy()
  })

  test('1.2 登录失败', async ({ page }) => {
    // 访问登录页
    await page.goto(`${BASE_URL}/login`)
    await page.waitForLoadState('networkidle')

    // 输入错误密码
    const passwordInput = page.locator('input[type="password"]')
    await expect(passwordInput).toBeVisible()
    await passwordInput.fill(WRONG_PASSWORD)

    // 提交登录
    await page.keyboard.press('Enter')

    // 等待一下，确保有时间处理请求
    await page.waitForTimeout(2000)

    // 应该停留在登录页面
    expect(page.url()).toContain('/login')

    // 应该显示错误提示（可能是 toast、alert 或错误文本）
    // 尝试多种可能的错误提示方式
    const hasErrorToast = await page.locator('[role="alert"], .toast, .error-message').count() > 0
    const hasErrorText = await page.getByText(/密码错误|错误|失败|invalid|error/i).count() > 0

    // 至少应该有一种错误提示
    expect(hasErrorToast || hasErrorText).toBeTruthy()

    // 验证 localStorage 中没有 token
    const token = await page.evaluate(() => localStorage.getItem('auth_token'))
    expect(token).toBeFalsy()
  })

  test('1.3 Token 过期处理', async ({ page }) => {
    // 设置一个过期的 token
    await page.goto(BASE_URL)
    await page.evaluate(() => {
      // 设置一个明显过期的 JWT token（payload 中 exp 是过去的时间）
      // 这是一个示例过期 token，实际项目中应该根据真实的 JWT 格式
      localStorage.setItem('auth_token', 'expired.token.here')
    })

    // 尝试访问受保护的页面
    await page.goto(`${BASE_URL}/chat`)

    // 等待重定向
    await page.waitForTimeout(2000)

    // 应该重定向到登录页
    await page.waitForURL(/\/login/, { timeout: 10000 })
    expect(page.url()).toContain('/login')

    // 验证登录页面正常显示
    const passwordInput = page.locator('input[type="password"]')
    await expect(passwordInput).toBeVisible()
  })

  test('1.4 登录后访问受保护页面', async ({ page }) => {
    // 先登录
    await page.goto(`${BASE_URL}/login`)
    const passwordInput = page.locator('input[type="password"]')
    await passwordInput.fill(CORRECT_PASSWORD)
    await page.keyboard.press('Enter')
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 })

    // 访问各个受保护页面，验证都能正常访问
    const protectedPages = ['/', '/chat', '/feed', '/topics']

    for (const pagePath of protectedPages) {
      await page.goto(`${BASE_URL}${pagePath}`)
      await page.waitForLoadState('networkidle')

      // 不应该重定向到登录页
      expect(page.url()).not.toContain('/login')

      // 应该能看到页面内容
      const hasContent = await page.locator('body').textContent()
      expect(hasContent).toBeTruthy()
    }
  })

  test('1.5 未登录访问受保护页面', async ({ page }) => {
    // 确保没有登录状态
    await page.context().clearCookies()
    await page.evaluate(() => localStorage.clear())

    // 尝试直接访问受保护页面
    const protectedPages = ['/chat', '/feed', '/topics']

    for (const pagePath of protectedPages) {
      await page.goto(`${BASE_URL}${pagePath}`)

      // 应该重定向到登录页
      await page.waitForURL(/\/login/, { timeout: 10000 })
      expect(page.url()).toContain('/login')

      // 清除状态，准备下一次测试
      await page.evaluate(() => localStorage.clear())
    }
  })
})
