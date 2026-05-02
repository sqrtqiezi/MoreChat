// ABOUTME: 跨 Feature 复用的公共步骤定义
// ABOUTME: 包含登录、导航、文本验证等通用步骤

import { Given, When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import { CustomWorld } from '../support/world'
import { LoginPage } from '../pages/LoginPage'
import { CommonPage } from '../pages/CommonPage'

Given('我访问应用首页', async function (this: CustomWorld) {
  await this.page!.goto(this.baseURL)
  await this.page!.waitForLoadState('networkidle')
})

Given('我已经成功登录', async function (this: CustomWorld) {
  const loginPage = new LoginPage(this.page!)
  await loginPage.goto(this.baseURL)
  await loginPage.fillPassword('test123')
  await loginPage.submitByEnter()
  await loginPage.waitForRedirect()
})

When('我访问页面 {string}', async function (this: CustomWorld, path: string) {
  await this.page!.goto(`${this.baseURL}${path}`)
  await this.page!.waitForLoadState('networkidle')
})

Then('我应该看到文本 {string}', async function (this: CustomWorld, text: string) {
  await expect(this.page!.getByText(text).first()).toBeVisible()
})

Then('我不应该看到文本 {string}', async function (this: CustomWorld, text: string) {
  await expect(this.page!.getByText(text)).toHaveCount(0)
})

Then('当前页面路径应该是 {string}', async function (this: CustomWorld, path: string) {
  const url = new URL(this.page!.url())
  expect(url.pathname).toBe(path)
})

Then('当前页面路径应该包含 {string}', async function (this: CustomWorld, path: string) {
  expect(this.page!.url()).toContain(path)
})

Then('我应该看到页面内容', async function (this: CustomWorld) {
  const commonPage = new CommonPage(this.page!)
  const hasContent = await commonPage.hasContent()
  expect(hasContent).toBe(true)
})

Then('我不应该被重定向到登录页面', async function (this: CustomWorld) {
  const commonPage = new CommonPage(this.page!)
  const isOnLogin = await commonPage.isOnPage('/login')
  expect(isOnLogin).toBe(false)
})

Then('我应该被重定向到登录页面', async function (this: CustomWorld) {
  await this.page!.waitForTimeout(2000)
  await this.page!.waitForURL(/\/login/, { timeout: 10000 })
  expect(this.page!.url()).toContain('/login')
})
