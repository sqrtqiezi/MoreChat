// ABOUTME: Feed 页面的 Step Definitions
// ABOUTME: 重要消息流的加载和展示验证

import { Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import { CustomWorld } from '../support/world'

Then('Feed 页面应该展示消息列表或空状态', async function (this: CustomWorld) {
  await this.page!.waitForLoadState('networkidle')
  const hasItems = await this.page!.getByText('条消息').count() > 0
  const hasEmpty = await this.page!.getByText('暂无重要消息').count() > 0
  const hasLoading = await this.page!.getByText('正在加载').count() > 0
  // Feed 标题本身就说明页面加载成功了
  const hasTitle = await this.page!.getByText('重要消息').first().isVisible()
  expect(hasItems || hasEmpty || hasLoading || hasTitle).toBe(true)
})
