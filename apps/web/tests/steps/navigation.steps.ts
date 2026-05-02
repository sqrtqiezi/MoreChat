// ABOUTME: 导航相关的 Step Definitions
// ABOUTME: 侧边栏导航、页面切换、激活状态验证

import { When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import { CustomWorld } from '../support/world'

When('我点击导航链接 {string}', async function (this: CustomWorld, label: string) {
  const link = this.page!.getByRole('link', { name: label })
  await link.click()
  await this.page!.waitForLoadState('networkidle')
})

Then('导航链接 {string} 应该处于激活状态', async function (this: CustomWorld, label: string) {
  // NavLink 激活时有 text-stone-950 样式，未激活时有 text-stone-300
  const link = this.page!.getByRole('link', { name: label })
  // 等待 React 重新渲染 NavLink 的 className
  await this.page!.waitForTimeout(500)
  await expect(link).toHaveAttribute('class', /text-stone-950/)
})
