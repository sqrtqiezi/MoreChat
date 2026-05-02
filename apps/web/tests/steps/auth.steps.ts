// ABOUTME: 认证与登录专属的 Step Definitions
// ABOUTME: 公共步骤已移至 common.steps.ts

import { Given, When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import { CustomWorld } from '../support/world'
import { LoginPage } from '../pages/LoginPage'

Given('我设置了一个过期的认证令牌', async function (this: CustomWorld) {
  const loginPage = new LoginPage(this.page!)
  await this.page!.goto(this.baseURL)
  await loginPage.setAuthToken('expired.token.here')
})

Given('我清除了所有认证状态', async function (this: CustomWorld) {
  const loginPage = new LoginPage(this.page!)
  await loginPage.clearAllStorage()
})

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

Then('我应该被重定向到首页', async function (this: CustomWorld) {
  const loginPage = new LoginPage(this.page!)
  await loginPage.waitForRedirect()
  const isOnLogin = await loginPage.isOnLoginPage()
  expect(isOnLogin).toBe(false)
})

Then('我应该看到导航栏', async function (this: CustomWorld) {
  await this.page!.waitForLoadState('networkidle')
  const hasNav = await this.page!.locator('nav').count() > 0
  const hasMain = await this.page!.locator('main').count() > 0
  expect(hasNav || hasMain).toBe(true)
})

Then('认证令牌应该被保存', async function (this: CustomWorld) {
  const loginPage = new LoginPage(this.page!)
  const token = await loginPage.getAuthToken()
  expect(token).toBeTruthy()
})

Then('我应该停留在登录页面', async function (this: CustomWorld) {
  expect(this.page!.url()).toContain('/login')
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

Then('我应该看到密码输入框', async function (this: CustomWorld) {
  const loginPage = new LoginPage(this.page!)
  await expect(loginPage.passwordInput).toBeVisible()
})
