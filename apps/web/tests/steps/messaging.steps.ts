// ABOUTME: 消息发送与实时功能的 Step Definitions
// ABOUTME: 使用 Playwright route mock 拦截 API 请求，模拟消息发送和接收

import { Given, When, Then } from '@cucumber/cucumber'
import { CustomWorld } from '../support/world'
import { ChatPage } from '../pages/ChatPage'

const MOCK_CONVERSATION = {
  id: 'mock-conv-001',
  clientId: 'mock-client',
  type: 'private',
  contactId: 'mock-contact-001',
  groupId: null,
  unreadCount: 0,
  lastMessageAt: Date.now(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  contact: {
    id: 'mock-contact-001',
    username: 'test_user',
    nickname: '测试用户',
    remark: null,
    avatar: null,
    type: 'friend',
  },
  group: null,
  contactType: null,
}

const MOCK_MESSAGES = [
  {
    msgId: 'mock-msg-001',
    msgType: 1,
    fromUsername: 'test_user',
    toUsername: 'njin_cool',
    content: '你好',
    createTime: Math.floor(Date.now() / 1000) - 60,
    senderNickname: '测试用户',
    displayType: 'text',
    displayContent: '你好',
  },
]

Given('消息发送 API 已被 mock', async function (this: CustomWorld) {
  // Mock 会话列表（带或不带查询参数）
  await this.page!.route('**/api/conversations*', async (route) => {
    const url = route.request().url()
    if (route.request().method() === 'GET' && !url.includes('/messages')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { conversations: [MOCK_CONVERSATION] },
        }),
      })
    } else {
      await route.continue()
    }
  })

  // Mock 会话详情和消息列表
  await this.page!.route('**/api/conversations/mock-conv-001**', async (route) => {
    const url = route.request().url()
    if (url.includes('/messages')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { messages: MOCK_MESSAGES, hasMore: false },
        }),
      })
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: MOCK_CONVERSATION }),
      })
    }
  })

  // Mock 消息发送
  await this.page!.route('**/api/messages/send', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { msgId: `mock-sent-${Date.now()}` },
      }),
    })
  })

  // Mock 用户信息
  await this.page!.route('**/api/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { username: 'njin_cool', nickname: '牛晋', degraded: false },
      }),
    })
  })

  // Mock 目录
  await this.page!.route('**/api/directory', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { contacts: [], groups: [] },
      }),
    })
  })
})

Given('我选择了一个会话', { timeout: 30000 }, async function (this: CustomWorld) {
  const chatPage = new ChatPage(this.page!)
  await chatPage.selectFirstConversation()
  await chatPage.expectMessageInputEnabled()
})

When('我在消息输入框输入 {string}', async function (this: CustomWorld, text: string) {
  const chatPage = new ChatPage(this.page!)
  await chatPage.fillMessage(text)
})

Then('发送按钮应该可用', async function (this: CustomWorld) {
  const chatPage = new ChatPage(this.page!)
  await chatPage.expectSendButtonEnabled()
})

Then('发送按钮应该不可用', async function (this: CustomWorld) {
  const chatPage = new ChatPage(this.page!)
  await chatPage.expectSendButtonDisabled()
})

When('我点击发送按钮', { timeout: 15000 }, async function (this: CustomWorld) {
  const chatPage = new ChatPage(this.page!)
  await chatPage.clickSendButton()
})

Then('消息输入框应该被清空', async function (this: CustomWorld) {
  const chatPage = new ChatPage(this.page!)
  await chatPage.expectMessageInputCleared()
})

Then('应该显示未选择会话的引导空状态', async function (this: CustomWorld) {
  const chatPage = new ChatPage(this.page!)
  await chatPage.expectUnselectedConversationState()
})

Then('消息输入框应该可用', async function (this: CustomWorld) {
  const chatPage = new ChatPage(this.page!)
  await chatPage.expectMessageInputEnabled()
})

When('服务器推送一条新消息', { timeout: 15000 }, async function (this: CustomWorld) {
  // 通过 POST /webhook 模拟 juhexbot 推送消息（在 Node.js 端发起，避免浏览器 CORS 问题）
  const webhookPayload = {
    guid: 'test-client-guid',
    notify_type: 1,
    data: {
      msg_id: `ws-msg-${Date.now()}`,
      msg_type: 1,
      from_username: 'test_user',
      to_username: 'njin_cool',
      chatroom_sender: '',
      chatroom: '',
      content: '这是一条通过 WebSocket 推送的消息',
      desc: '',
      create_time: Math.floor(Date.now() / 1000),
      is_chatroom_msg: 0,
      source: '',
    },
  }

  await fetch('http://localhost:3100/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(webhookPayload),
  })

  await this.page!.waitForTimeout(3000)
})

Then('我应该在聊天窗口看到新消息', async function (this: CustomWorld) {
  const chatPage = new ChatPage(this.page!)
  await chatPage.expectRealtimeMessageVisible('这是一条通过 WebSocket 推送的消息')
})
