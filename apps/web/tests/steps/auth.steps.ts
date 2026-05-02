// ABOUTME: 认证与登录相关的 Step Definitions
// ABOUTME: 实现 Feature 文件中定义的步骤

import { Given, When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import { CustomWorld } from '../support/world'
import { LoginPage } from '../pages/LoginPage'
import { CommonPage } from '../pages/CommonPage'

// Given 步骤 - 前置条件

Given('我访问应用首页', async function (this: CustomWorld) {
  await this.page!.goto(this.baseURL)
  await this.page!.waitForLoadState('networkidle')
})

Given('我设置了一个过期的认证令牌', async function (this: CustomWorld) {
  const loginPage = new LoginPage(this.page!)
  await this.page!.goto(this.baseURL)
  await loginPage.setAuthToken('expired.token.here')
})

Given('我已经成功登录', async function (this: CustomWorld) {
  const loginPage = new LoginPage(this.page!)
  await loginPage.goto(this.baseURL)
  await loginPage.fillPassword('test123')
  await loginPage.submitByEnter()
  await loginPage.waitForRedirect()
})

Given('我清除了所有认证状态', async function (this: CustomWorld) {
  const loginPage = new LoginPage(this.page!)
  await loginPage.clearAllStorage()
})

// When 步骤 - 执行操作

When('我输入正确的密码 {string}', async function (this: CustomWorld, password: string) {
  const loginPage = new LoginPage(this.page!)
  await loginPage.fillPassword(password)
})

When('我输入错误的密码 {string}', async function (this: CustomWorld, password: string) {
  const loginPage = new LoginPage(this.page!)
  await loginPage.fillPassword(password)
})

When('我提交登录表单', async function (this: CustomWorld) {
  const loginPage = new LoginPage(this.page!)
  await loginPage.submitByEnter()
  // 等待一下，确保有时间处理请求
  await this.page!.waitForTimeout(2000)
})

When('我尝试访问受保护页面 {string}', async function (this: CustomWorld, path: string) {
  await this.page!.goto(`${this.baseURL}${path}`)
  await this.page!.waitForLoadState('networkidle')
})

When('我访问受保护页面 {string}', async function (this: CustomWorld, path: string) {
  await this.page!.goto(`${this.baseURL}${path}`)
  await this.page!.waitForLoadState('networkidle')
})

// Then 步骤 - 验证结果

Then('我应该被重定向到首页', async function (this: CustomWorld) {
  const loginPage = new LoginPage(this.page!)
  await loginPage.waitForRedirect()
  const isOnLogin = await loginPage.isOnLoginPage()
  expect(isOnLogin).toBe(false)
})

Then('我应该看到导航栏', async function (this: CustomWorld) {
  const commonPage = new CommonPage(this.page!)
  await commonPage.waitForNavigation()
  const hasNav = await commonPage.hasNavigation()
  const hasMain = await commonPage.hasMainContent()
  expect(hasNav || hasMain).toBe(true)
})

Then('认证令牌应该被保存', async function (this: CustomWorld) {
  const loginPage = new LoginPage(this.page!)
  const token = await loginPage.getAuthToken()
  expect(token).toBeTruthy()
  expect(typeof token).toBe('string')
})

Then('我应该停留在登录页面', async function (this: CustomWorld) {
  const loginPage = new LoginPage(this.page!)
  const isOnLogin = await loginPage.isOnLoginPage()
  expect(isOnLogin).toBe(true)
})

Then('我应该看到错误提示', async function (this: CustomWorld) {
  const loginPage = new LoginPage(this.page!)
  const hasError = await loginPage.hasErrorMessage()
  expect(hasError).toBe(true)
})

Then('认证令牌不应该被保存', async function (this: CustomWorld) {
  const loginPage = new LoginPage(this.page!)
  const token = await loginPage.getAuthToken()
  expect(token).toBeFalsy()
})

Then('我应该被重定向到登录页面', async function (this: CustomWorld) {
  await this.page!.waitForTimeout(2000)
  await this.page!.waitForURL(/\/login/, { timeout: 10000 })
  const commonPage = new CommonPage(this.page!)
  const isOnLogin = await commonPage.isOnPage('/login')
  expect(isOnLogin).toBe(true)
})

Then('我应该看到密码输入框', async function (this: CustomWorld) {
  const loginPage = new LoginPage(this.page!)
  await expect(loginPage.passwordInput).toBeVisible()
})

Then('我不应该被重定向到登录页面', async function (this: CustomWorld) {
  const commonPage = new CommonPage(this.page!)
  const isOnLogin = await commonPage.isOnPage('/login')
  expect(isOnLogin).toBe(false)
})

Then('我应该看到页面内容', async function (this: CustomWorld) {
  const commonPage = new CommonPage(this.page!)
  const hasContent = await commonPage.hasContent()
  expect(hasContent).toBe(true)
})
