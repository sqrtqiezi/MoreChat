import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { useChatStore } from '../stores/chatStore'

const mockUseMessages = vi.fn()
const chatWindowRenderIds: Array<string | null> = []
const mockQueryClient = {
  invalidateQueries: vi.fn(),
  setQueryData: vi.fn(),
}

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')

  return {
    ...actual,
    useQueryClient: () => mockQueryClient,
  }
})

vi.mock('../api/chat', () => ({
  getCurrentUser: vi.fn().mockResolvedValue(null),
  mapMessage: vi.fn(),
  contactNameCache: new Map(),
}))

vi.mock('../components/auth/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('./LoginPage', () => ({
  LoginPage: () => <div>login-page</div>,
}))

vi.mock('../components/layout/Sidebar', () => ({
  Sidebar: () => <div>sidebar</div>,
}))

vi.mock('../components/chat/ChatWindow', () => ({
  ChatWindow: ({ selectedConversationId }: { selectedConversationId: string | null }) => {
    chatWindowRenderIds.push(selectedConversationId)
    return <div data-testid="chat-window">{selectedConversationId ?? 'empty'}</div>
  },
}))

vi.mock('../hooks/useMessages', () => ({
  useMessages: (conversationId: string | null) => {
    mockUseMessages(conversationId)
    return { appendMessage: vi.fn() }
  },
}))

vi.mock('../hooks/useWebSocket', () => ({
  useWebSocket: () => ({ isConnected: true }),
}))

describe('KnowledgePage routing', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/')
    chatWindowRenderIds.length = 0
    mockUseMessages.mockReset()
    useChatStore.setState({
      selectedConversationId: null,
      isSidebarCollapsed: false,
      sidebarMode: 'conversations',
      isAtBottom: true,
    })
  })

  it('renders knowledge page on root route', async () => {
    render(<App />)

    expect(await screen.findByRole('textbox', { name: /搜索/i })).toBeInTheDocument()
  })

  it('uses the URL conversation immediately and syncs the store once', async () => {
    const selectConversation = vi.fn((id: string | null) => {
      useChatStore.setState({ selectedConversationId: id })
    })

    useChatStore.setState({
      selectedConversationId: 'store-conversation',
      selectConversation,
    })
    window.history.pushState({}, '', '/chat?conversationId=url-conversation')

    render(<App />)

    expect(chatWindowRenderIds[0]).toBe('url-conversation')
    expect(mockUseMessages).toHaveBeenNthCalledWith(1, 'url-conversation')
    expect(await screen.findByTestId('chat-window')).toHaveTextContent('url-conversation')
    expect(selectConversation).toHaveBeenCalledTimes(1)
    expect(selectConversation).toHaveBeenCalledWith('url-conversation')
    expect(useChatStore.getState().selectedConversationId).toBe('url-conversation')
  })
})
