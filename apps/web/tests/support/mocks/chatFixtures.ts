// ABOUTME: Reusable chat-related E2E fixtures for API route mocks
// ABOUTME: Keeps payload builders centralized for messaging and future chat flows

export function createPrivateConversationFixture() {
  const now = Date.now()
  const nowIso = new Date(now).toISOString()

  return {
    id: 'mock-conv-001',
    clientId: 'mock-client',
    type: 'private',
    contactId: 'mock-contact-001',
    groupId: null,
    unreadCount: 0,
    lastMessageAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso,
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
}

export function createMessageListFixture() {
  return [
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
}

export function createSentMessageResponseFixture() {
  return {
    msgId: `mock-sent-${Date.now()}`,
  }
}

export function createCurrentUserFixture() {
  return {
    username: 'njin_cool',
    nickname: '牛晋',
    degraded: false,
  }
}

export function createDirectoryFixture() {
  return {
    contacts: [],
    groups: [],
  }
}
