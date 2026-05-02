// ABOUTME: 通用页面的 Page Object Model
// ABOUTME: 封装所有页面共享的元素和操作

import { Page, expect } from '@playwright/test'

export class CommonPage {
  constructor(private page: Page) {}

  // 通用元素定位器
  get navigation() {
    return this.page.locator('nav')
  }

  get mainContent() {
    return this.page.locator('main, [role="main"]')
  }

  get body() {
    return this.page.locator('body')
  }

  // 通用操作
  async goto(path: string) {
    // 如果是相对路径，需要拼接 baseURL
    const url = path.startsWith('http') ? path : `${this.page.url().split('/').slice(0, 3).join('/')}${path}`
    await this.page.goto(url)
    await this.page.waitForLoadState('networkidle')
  }

  async getCurrentUrl() {
    return this.page.url()
  }

  async hasNavigation() {
    return await this.navigation.count() > 0
  }

  async hasMainContent() {
    return await this.mainContent.count() > 0
  }

  async hasContent() {
    const content = await this.body.textContent()
    return !!content && content.trim().length > 0
  }

  async waitForNavigation() {
    await this.page.waitForLoadState('networkidle')
  }

  async isOnPage(pathPattern: string | RegExp) {
    const url = await this.getCurrentUrl()
    if (typeof pathPattern === 'string') {
      return url.includes(pathPattern)
    }
    return pathPattern.test(url)
  }
}
