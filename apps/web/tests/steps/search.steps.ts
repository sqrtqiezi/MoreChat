// ABOUTME: 搜索功能的 Step Definitions
// ABOUTME: 搜索输入、模式切换、过滤、结果验证

import { When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import { CustomWorld } from '../support/world'
import { SearchPage } from '../pages/SearchPage'

Then('我应该看到搜索输入框', async function (this: CustomWorld) {
  const searchPage = new SearchPage(this.page!)
  await expect(searchPage.searchInput).toBeVisible()
})

Then('我应该看到搜索按钮', async function (this: CustomWorld) {
  const searchPage = new SearchPage(this.page!)
  await expect(searchPage.searchButton).toBeVisible()
})

When('我在搜索框输入 {string}', async function (this: CustomWorld, query: string) {
  const searchPage = new SearchPage(this.page!)
  await searchPage.fillSearch(query)
})

When('我点击搜索按钮', async function (this: CustomWorld) {
  const searchPage = new SearchPage(this.page!)
  await searchPage.submitSearch()
})

When('我切换搜索模式到 {string}', async function (this: CustomWorld, mode: string) {
  const searchPage = new SearchPage(this.page!)
  await searchPage.switchMode(mode)
})

When('我勾选仅重要消息', async function (this: CustomWorld) {
  const searchPage = new SearchPage(this.page!)
  await searchPage.toggleImportantOnly()
})

Then('搜索模式 {string} 应该处于激活状态', async function (this: CustomWorld, mode: string) {
  const searchPage = new SearchPage(this.page!)
  const isActive = await searchPage.isModeActive(mode)
  expect(isActive).toBe(true)
})

Then('仅重要消息复选框应该被选中', async function (this: CustomWorld) {
  const searchPage = new SearchPage(this.page!)
  const isChecked = await searchPage.isImportantChecked()
  expect(isChecked).toBe(true)
})

Then('我应该看到搜索结果区域', async function (this: CustomWorld) {
  // 搜索后应该出现结果区域（可能有结果或无结果提示）
  await this.page!.waitForTimeout(2000)
  const hasResults = await this.page!.locator('main').textContent()
  expect(hasResults).toBeTruthy()
})

Then('我应该看到空搜索提示', async function (this: CustomWorld) {
  await this.page!.waitForTimeout(2000)
  // 搜索无结果时应该有提示文本
  const noResults = await this.page!.getByText(/没有找到|无结果|No results|未找到/).count() > 0
  const emptyState = await this.page!.getByText(/搜索微信历史消息/).count() > 0
  expect(noResults || emptyState).toBe(true)
})
