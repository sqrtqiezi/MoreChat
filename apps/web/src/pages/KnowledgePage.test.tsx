import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { useChatStore } from '../stores/chatStore'
import { useKnowledgeStore } from '../stores/knowledgeStore'

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
    useKnowledgeStore.getState().reset()
    useChatStore.setState({
      selectedConversationId: null,
      isSidebarCollapsed: false,
      sidebarMode: 'conversations',
      isAtBottom: true,
    })
  })

  it('renders knowledge page on root route', async () => {
    render(<App />)

    expect(await screen.findByRole('textbox', { name: '搜索消息' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '知识库导航' })).toBeInTheDocument()
    expect(screen.getByText('搜索微信历史消息')).toBeInTheDocument()
  })

  it('updates knowledge store from the search controls', async () => {
    const user = userEvent.setup()

    render(<App />)

    await user.type(await screen.findByRole('textbox', { name: '搜索消息' }), '项目复盘')
    await user.click(screen.getByRole('button', { name: '语义' }))
    await user.click(screen.getByRole('checkbox', { name: '仅重要消息' }))
    await user.click(screen.getByRole('button', { name: '搜索' }))

    expect(useKnowledgeStore.getState().query).toBe('项目复盘')
    expect(useKnowledgeStore.getState().mode).toBe('semantic')
    expect(useKnowledgeStore.getState().filters.important).toBe(true)
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
