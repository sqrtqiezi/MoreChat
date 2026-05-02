// ABOUTME: 搜索页面的 Page Object Model
// ABOUTME: 封装搜索页面的元素定位和操作

import { Page, expect } from '@playwright/test'

export class SearchPage {
  constructor(private page: Page) {}

  get searchInput() {
    return this.page.getByLabel('搜索消息')
  }

  get searchButton() {
    return this.page.getByRole('button', { name: '搜索' })
  }

  get importantCheckbox() {
    return this.page.getByRole('checkbox', { name: '仅重要消息' })
  }

  modeButton(name: string) {
    return this.page.getByRole('button', { name, exact: true })
  }

  async fillSearch(query: string) {
    await this.searchInput.fill(query)
  }

  async submitSearch() {
    await this.searchButton.click()
    await this.page.waitForTimeout(3000)
  }

  async switchMode(mode: string) {
    await this.modeButton(mode).click()
  }

  async isModeActive(mode: string) {
    const pressed = await this.modeButton(mode).getAttribute('aria-pressed')
    return pressed === 'true'
  }

  async toggleImportantOnly() {
    await this.importantCheckbox.click()
  }

  async isImportantChecked() {
    return await this.importantCheckbox.isChecked()
  }
}
