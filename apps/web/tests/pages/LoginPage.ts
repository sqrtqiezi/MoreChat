// ABOUTME: 登录页面的 Page Object Model
// ABOUTME: 封装登录页面的元素定位和操作

import { Page, expect } from '@playwright/test'

export class LoginPage {
  constructor(private page: Page) {}

  // 元素定位器
  get passwordInput() {
    return this.page.locator('input[type="password"]')
  }

  get loginButton() {
    return this.page.locator('button:has-text("登录")')
  }

  get errorMessage() {
    return this.page.locator('[role="alert"], .toast, .error-message, :text("密码错误")')
  }

  // 页面操作
  async goto(baseURL: string = 'http://localhost:3000') {
    await this.page.goto(`${baseURL}/login`)
    await this.page.waitForLoadState('networkidle')
  }

  async fillPassword(password: string) {
    await expect(this.passwordInput).toBeVisible()
    await this.passwordInput.fill(password)
  }

  async submitByEnter() {
    await this.page.keyboard.press('Enter')
  }

  async submitByClick() {
    await this.loginButton.click()
  }

  async waitForRedirect() {
    await this.page.waitForURL((url) => !url.pathname.includes('/login'), {
      timeout: 10000
    })
  }

  async isOnLoginPage() {
    return this.page.url().includes('/login')
  }

  async hasErrorMessage() {
    return await this.errorMessage.count() > 0
  }

  // 认证状态操作
  async getAuthToken() {
    return await this.page.evaluate(() => localStorage.getItem('auth_token'))
  }

  async setAuthToken(token: string) {
    await this.page.evaluate((t) => localStorage.setItem('auth_token', t), token)
  }

  async clearAuthToken() {
    await this.page.evaluate(() => {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth-storage')
    })
  }

  async clearAllStorage() {
    await this.page.context().clearCookies()
    await this.page.evaluate(() => localStorage.clear())
  }
}
