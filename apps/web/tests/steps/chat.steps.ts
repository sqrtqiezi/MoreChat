// ABOUTME: 聊天功能的 Step Definitions
// ABOUTME: 会话列表、消息加载、聊天窗口验证

import { Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import { CustomWorld } from '../support/world'

Then('我应该看到聊天侧边栏', async function (this: CustomWorld) {
  await this.page!.waitForLoadState('networkidle')
  // 侧边栏应该存在（包含导航 rail 和面板）
  const sidebar = this.page!.locator('.border-r.bg-gray-50, aside').first()
  await expect(sidebar).toBeVisible()
})
