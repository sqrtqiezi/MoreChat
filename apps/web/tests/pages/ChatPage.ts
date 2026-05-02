// ABOUTME: 聊天页面的 Page Object Model
// ABOUTME: 封装聊天页面的元素定位和操作

import { expect, Page } from '@playwright/test'

export class ChatPage {
  constructor(private page: Page) {}

  get emptyStatePanel() {
    return this.page.locator('div').filter({ has: this.welcomeMessage }).first()
  }

  get welcomeMessage() {
    return this.page.getByText('欢迎使用 MoreChat')
  }

  get welcomeSubtext() {
    return this.page.getByText('从左侧选择一个会话开始聊天')
  }

  get conversationList() {
    return this.page.locator('div.overflow-y-auto.flex-1').filter({
      has: this.page.getByRole('button', { name: /聊天 \(\d+\)/ }),
    }).first()
  }

  get messageTextarea() {
    return this.page.locator('textarea')
  }

  get sendButton() {
    return this.page.getByRole('button', { name: /^发送$/ })
  }

  get reconnectingIndicator() {
    return this.page.getByText('正在重新连接...')
  }

  conversationRowByName(name: string) {
    return this.conversationList.locator('.cursor-pointer').filter({
      has: this.page.getByText(name, { exact: true }),
    }).first()
  }

  messageByText(text: string) {
    return this.page.getByText(text, { exact: true }).first()
  }

  async waitForConversationList() {
    await expect(this.conversationList).toBeVisible()
  }

  async expectConversationVisible(name: string) {
    await this.waitForConversationList()
    await expect(this.conversationRowByName(name)).toBeVisible()
  }

  async selectFirstConversation() {
    await this.waitForConversationList()
    await this.conversationList.locator('.cursor-pointer').first().click()
  }

  async selectConversationByName(name: string) {
    const row = this.conversationRowByName(name)
    await this.expectConversationVisible(name)
    await row.click()
    await this.expectMessageInputEnabled()
  }

  async fillMessage(text: string) {
    await this.expectMessageInputEnabled()
    await this.messageTextarea.fill(text)
  }

  async clickSendButton() {
    await expect(this.sendButton).toBeEnabled()
    await this.sendButton.evaluate((button: HTMLButtonElement) => {
      button.click()
    })
  }

  async expectEmptyState() {
    await expect(this.emptyStatePanel).toBeVisible()
    await expect(this.welcomeMessage).toBeVisible()
    await expect(this.welcomeSubtext).toBeVisible()
  }

  async expectUnselectedConversationState() {
    await this.expectEmptyState()
    await expect(this.messageTextarea).toHaveCount(0)
    await expect(this.sendButton).toHaveCount(0)
  }

  async expectMessageInputDisabled() {
    await expect(this.messageTextarea).toBeVisible()
    await expect(this.messageTextarea).toBeDisabled()
  }

  async expectMessageInputEnabled() {
    await expect(this.messageTextarea).toBeVisible()
    await expect(this.messageTextarea).toBeEnabled()
  }

  async waitForRealtimeConnected() {
    await expect(this.reconnectingIndicator).toHaveCount(0)
  }

  async expectSendButtonEnabled() {
    await expect(this.sendButton).toBeEnabled()
  }

  async expectSendButtonDisabled() {
    await expect(this.sendButton).toBeDisabled()
  }

  async expectMessageInputCleared() {
    await expect(this.messageTextarea).toHaveValue('')
  }

  async expectMessageVisible(text: string) {
    await expect(this.messageByText(text)).toBeVisible()
  }

  async expectRealtimeMessageVisible(text: string) {
    await this.expectMessageVisible(text)
  }
}
