// ABOUTME: Cucumber hooks - 在测试前后执行的操作
// ABOUTME: Before: 初始化浏览器，After: 截图（失败时）+ 清理资源

import { Before, After, Status, BeforeAll, AfterAll } from '@cucumber/cucumber'
import { CustomWorld } from '../support/world'
import * as fs from 'fs'
import * as path from 'path'

// 确保报告目录存在
BeforeAll(async function () {
  const dirs = ['reports', 'reports/screenshots', 'reports/videos']
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  })
})

// 每个场景前：初始化浏览器
Before(async function (this: CustomWorld) {
  await this.init()
})

// 每个场景后：截图（失败时）+ 清理资源
After(async function (this: CustomWorld, { pickle, result }) {
  // 如果测试失败，截图
  if (result?.status === Status.FAILED && this.page) {
    const screenshotPath = path.join(
      'reports/screenshots',
      `${pickle.name.replace(/\s+/g, '_')}_${Date.now()}.png`
    )
    await this.page.screenshot({ path: screenshotPath, fullPage: true })
    console.log(`📸 Screenshot saved: ${screenshotPath}`)
  }

  // 清理资源
  await this.cleanup()
})

// 所有测试完成后的清理
AfterAll(async function () {
  console.log('✅ All tests completed')
})
