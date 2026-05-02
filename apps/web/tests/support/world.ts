// ABOUTME: 自定义 World 类，用于在步骤之间共享状态
// ABOUTME: 包含 Playwright 的 page、context、browser 对象

import { setWorldConstructor, World, IWorldOptions } from '@cucumber/cucumber'
import { Browser, BrowserContext, Page, chromium } from '@playwright/test'

export interface CustomWorld extends World {
  browser?: Browser
  context?: BrowserContext
  page?: Page
  baseURL: string
}

export class CustomWorldImpl extends World implements CustomWorld {
  browser?: Browser
  context?: BrowserContext
  page?: Page
  baseURL: string

  constructor(options: IWorldOptions) {
    super(options)
    this.baseURL = process.env.BASE_URL || 'http://localhost:3000'
  }

  async init() {
    this.browser = await chromium.launch({
      headless: process.env.HEADLESS !== 'false',
      slowMo: process.env.SLOW_MO ? parseInt(process.env.SLOW_MO) : 0
    })
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
      recordVideo: process.env.VIDEO ? { dir: 'reports/videos' } : undefined
    })
    this.page = await this.context.newPage()
  }

  async cleanup() {
    if (this.page) await this.page.close()
    if (this.context) await this.context.close()
    if (this.browser) await this.browser.close()
  }
}

setWorldConstructor(CustomWorldImpl)
