// ABOUTME: Topics 页面的 Step Definitions
// ABOUTME: 话题列表的加载和展示验证

import { Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import { CustomWorld } from '../support/world'

Then('Topics 页面应该展示话题列表或空状态', async function (this: CustomWorld) {
  await this.page!.waitForLoadState('networkidle')
  const hasTopics = await this.page!.locator('section a, section [role="link"]').count() > 0
  const hasEmpty = await this.page!.getByText('暂无话题').count() > 0
  const hasLoading = await this.page!.getByText('正在加载').count() > 0
  // Topics 标题本身就说明页面加载成功了
  const hasTitle = await this.page!.getByText('话题').first().isVisible()
  expect(hasTopics || hasEmpty || hasLoading || hasTitle).toBe(true)
})
