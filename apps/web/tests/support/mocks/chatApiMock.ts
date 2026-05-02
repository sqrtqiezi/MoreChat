// ABOUTME: Shared Playwright route installer for chat-related API mocks
// ABOUTME: Centralizes messaging E2E mocks so multiple features can reuse them safely

import { Page, Route } from '@playwright/test'
import {
  createCurrentUserFixture,
  createDirectoryFixture,
  createMessageListFixture,
  createPrivateConversationFixture,
  createSentMessageResponseFixture,
} from './chatFixtures'

const installedPages = new WeakSet<Page>()

async function fulfillJson(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

async function fulfillError(route: Route, status: number, message: string) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify({
      success: false,
      error: { message },
    }),
  })
}

function getConversationIdFromPath(url: string) {
  const [, conversationId] = new URL(url).pathname.match(/\/api\/conversations\/([^/]+)/) ?? []
  return conversationId ?? null
}

function parseSendMessagePayload(route: Route): Record<string, unknown> | null {
  const rawBody = route.request().postData()
  if (!rawBody) {
    return null
  }

  try {
    return JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return null
  }
}

export async function installChatApiMocks(page: Page) {
  if (installedPages.has(page)) {
    return
  }

  const conversation = createPrivateConversationFixture()
  const messages = createMessageListFixture()

  await page.route(/\/api\/conversations(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback()
      return
    }

    await fulfillJson(route, {
      success: true,
      data: { conversations: [conversation] },
    })
  })

  await page.route(/\/api\/conversations\/[^/?]+(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback()
      return
    }

    const conversationId = getConversationIdFromPath(route.request().url())
    if (conversationId !== conversation.id) {
      await fulfillError(route, 404, 'Conversation not found')
      return
    }

    await fulfillJson(route, {
      success: true,
      data: conversation,
    })
  })

  await page.route(/\/api\/conversations\/[^/?]+\/messages(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback()
      return
    }

    const conversationId = getConversationIdFromPath(route.request().url())
    if (conversationId !== conversation.id) {
      await fulfillError(route, 404, 'Conversation not found')
      return
    }

    await fulfillJson(route, {
      success: true,
      data: { messages, hasMore: false },
    })
  })

  await page.route(/\/api\/messages\/send(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== 'POST') {
      await fulfillError(route, 405, 'Method not allowed')
      return
    }

    const payload = parseSendMessagePayload(route)
    if (!payload) {
      await fulfillError(route, 400, 'Invalid JSON body')
      return
    }

    const conversationId =
      typeof payload.conversationId === 'string' ? payload.conversationId.trim() : ''
    const content = typeof payload.content === 'string' ? payload.content.trim() : ''

    if (!conversationId) {
      await fulfillError(route, 400, 'conversationId is required')
      return
    }

    if (conversationId !== conversation.id) {
      await fulfillError(route, 404, 'Conversation not found')
      return
    }

    if (!content) {
      await fulfillError(route, 400, 'content is required')
      return
    }

    await fulfillJson(route, {
      success: true,
      data: createSentMessageResponseFixture(),
    })
  })

  await page.route(/\/api\/me(?:\?.*)?$/, async (route) => {
    await fulfillJson(route, {
      success: true,
      data: createCurrentUserFixture(),
    })
  })

  await page.route(/\/api\/directory(?:\?.*)?$/, async (route) => {
    await fulfillJson(route, {
      success: true,
      data: createDirectoryFixture(),
    })
  })

  installedPages.add(page)
}
