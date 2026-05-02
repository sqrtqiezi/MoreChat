// ABOUTME: 聊天页面的 Page Object Model
// ABOUTME: 封装聊天页面的元素定位和操作

import { Page } from '@playwright/test'

export class ChatPage {
  constructor(private page: Page) {}

  get welcomeMessage() {
    return this.page.getByText('欢迎使用 MoreChat')
  }

  get welcomeSubtext() {
    return this.page.getByText('从左侧选择一个会话开始聊天')
  }

  get conversationItems() {
    return this.page.locator('[data-testid="conversation-item"], .conversation-item, [role="listitem"]')
  }

  get sidebarPanel() {
    return this.page.locator('aside, [role="complementary"]').first()
  }

  get messageInput() {
    return this.page.locator('textarea, input[type="text"]').last()
  }

  get messageList() {
    return this.page.locator('[data-testid="message-list"], .message-list, [role="log"]')
  }

  async hasConversations() {
    await this.page.waitForTimeout(3000)
    // 侧边栏中的可点击会话项
    const items = this.page.locator('.cursor-pointer').filter({ hasText: /.+/ })
    const count = await items.count()
    return count > 0
  }

  async clickFirstConversation() {
    await this.page.waitForTimeout(2000)
    const items = this.page.locator('.cursor-pointer').filter({ hasText: /.+/ })
    await items.first().click()
    await this.page.waitForTimeout(2000)
  }

  async hasChatWindow() {
    // 聊天窗口出现后，欢迎消息应该消失
    const welcomeGone = await this.welcomeMessage.count() === 0
    return welcomeGone
  }

  async hasMessageInput() {
    const textarea = this.page.locator('textarea')
    return await textarea.count() > 0
  }
}
