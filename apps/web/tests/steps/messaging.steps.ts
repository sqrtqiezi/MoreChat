// ABOUTME: 消息发送与实时功能的 Step Definitions
// ABOUTME: 通过真实 API、seeded 对话和 webhook 驱动消息场景

import { Given, When, Then } from '@cucumber/cucumber'
import { CustomWorld } from '../support/world'
import { ChatPage } from '../pages/ChatPage'

const E2E_CONVERSATION_NAME = 'E2E Messaging Peer'
const E2E_WEBHOOK_MESSAGE = '这是一条通过 webhook 推送的消息'
const E2E_CLIENT_GUID = 'guid-e2e-messaging'
const E2E_SELF_USERNAME = 'wxid_e2e_messaging_user'
const E2E_PEER_USERNAME = 'wxid_e2e_messaging_peer'

function getChatPage(world: CustomWorld) {
  return new ChatPage(world.page!)
}

Given('我选择了一个会话', { timeout: 30000 }, async function (this: CustomWorld) {
  const chatPage = getChatPage(this)
  await chatPage.selectConversationByName(E2E_CONVERSATION_NAME)
  await chatPage.expectMessageInputEnabled()
})

Given('我选择了名为 {string} 的会话', { timeout: 30000 }, async function (this: CustomWorld, name: string) {
  const chatPage = getChatPage(this)
  await chatPage.selectConversationByName(name)
  await chatPage.expectMessageInputEnabled()
})

When('我在消息输入框输入 {string}', async function (this: CustomWorld, text: string) {
  const chatPage = getChatPage(this)
  await chatPage.fillMessage(text)
})

Then('发送按钮应该可用', async function (this: CustomWorld) {
  const chatPage = getChatPage(this)
  await chatPage.expectSendButtonEnabled()
})

Then('发送按钮应该不可用', async function (this: CustomWorld) {
  const chatPage = getChatPage(this)
  await chatPage.expectSendButtonDisabled()
})

When('我点击发送按钮', { timeout: 15000 }, async function (this: CustomWorld) {
  const chatPage = getChatPage(this)
  await chatPage.clickSendButton()
})

Then('消息输入框应该被清空', async function (this: CustomWorld) {
  const chatPage = getChatPage(this)
  await chatPage.expectMessageInputCleared()
})

Then('应该显示未选择会话的引导空状态', async function (this: CustomWorld) {
  const chatPage = getChatPage(this)
  await chatPage.expectUnselectedConversationState()
})

Then('消息输入框应该可用', async function (this: CustomWorld) {
  const chatPage = getChatPage(this)
  await chatPage.expectMessageInputEnabled()
})

Then('我应该在聊天窗口看到消息 {string}', async function (this: CustomWorld, text: string) {
  const chatPage = getChatPage(this)
  await chatPage.expectMessageVisible(text)
})

When('服务器通过 webhook 推送一条新消息', { timeout: 15000 }, async function (this: CustomWorld) {
  const chatPage = getChatPage(this)
  await chatPage.waitForRealtimeConnected()
  const webhookPayload = {
    guid: E2E_CLIENT_GUID,
    notify_type: 1,
    data: {
      msg_id: `ws-msg-${Date.now()}`,
      msg_type: 1,
      from_username: E2E_PEER_USERNAME,
      to_username: E2E_SELF_USERNAME,
      chatroom_sender: '',
      chatroom: '',
      content: E2E_WEBHOOK_MESSAGE,
      desc: '',
      create_time: Math.floor(Date.now() / 1000),
      is_chatroom_msg: 0,
      source: '',
    },
  }

  const response = await fetch('http://localhost:3100/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(webhookPayload),
  })

  if (!response.ok) {
    throw new Error(`Webhook request failed with status ${response.status}`)
  }

  await chatPage.expectMessageVisible(E2E_WEBHOOK_MESSAGE)
})

Then('我应该在聊天窗口看到新消息', async function (this: CustomWorld) {
  const chatPage = getChatPage(this)
  await chatPage.expectRealtimeMessageVisible(E2E_WEBHOOK_MESSAGE)
})
