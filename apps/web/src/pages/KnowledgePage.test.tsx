import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { KnowledgePage } from './KnowledgePage'
import { useChatStore } from '../stores/chatStore'
import { useKnowledgeStore } from '../stores/knowledgeStore'

const mockUseMessages = vi.fn()
const mockUseSearch = vi.fn()
const mockNavigate = vi.fn()
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

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')

  return {
    ...actual,
    useNavigate: () => mockNavigate,
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

vi.mock('../hooks/useSearch', () => ({
  useSearch: () => mockUseSearch(),
}))

function renderKnowledgePage() {
  return render(
    <MemoryRouter>
      <KnowledgePage />
    </MemoryRouter>,
  )
}

describe('KnowledgePage routing', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/')
    chatWindowRenderIds.length = 0
    mockUseMessages.mockReset()
    mockUseSearch.mockReset()
    mockNavigate.mockReset()
    mockUseSearch.mockReturnValue({
      data: undefined,
      isLoading: false,
    })
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

  it('applies search control updates with the expected timing semantics', async () => {
    const user = userEvent.setup()

    render(<App />)

    const searchInput = await screen.findByRole('textbox', { name: '搜索消息' })

    await user.type(searchInput, '项目复盘')

    expect(useKnowledgeStore.getState().query).toBe('')

    await user.click(screen.getByRole('button', { name: '语义' }))
    expect(useKnowledgeStore.getState().mode).toBe('semantic')

    await user.click(screen.getByRole('checkbox', { name: '仅重要消息' }))
    expect(useKnowledgeStore.getState().filters.important).toBe(true)
    expect(useKnowledgeStore.getState().query).toBe('')

    await user.click(screen.getByRole('button', { name: '搜索' }))

    expect(useKnowledgeStore.getState().query).toBe('项目复盘')
    expect(useKnowledgeStore.getState().mode).toBe('semantic')
    expect(useKnowledgeStore.getState().filters.important).toBe(true)
  })

  it('renders search results after query resolves', async () => {
    useKnowledgeStore.setState({ query: '预算' })
    mockUseSearch.mockReturnValue({
      data: {
        results: [
          {
            msgId: 'm1',
            content: '预算今晚确认',
            createTime: 1710000000,
            fromUsername: 'alice',
            conversationId: 'c1',
          },
        ],
        total: 1,
        query: '预算',
      },
      isLoading: false,
    })

    renderKnowledgePage()

    expect(await screen.findByText('预算今晚确认')).toBeInTheDocument()
  })

  it('renders the empty-query state from store state', () => {
    renderKnowledgePage()

    expect(screen.getByText('搜索微信历史消息')).toBeInTheDocument()
    expect(screen.queryByText('未找到结果')).not.toBeInTheDocument()
  })

  it('renders the loading state when a store query is active', () => {
    useKnowledgeStore.setState({ query: '项目复盘' })
    mockUseSearch.mockReturnValue({
      data: undefined,
      isLoading: true,
    })

    const { container } = renderKnowledgePage()

    expect(screen.getByRole('heading', { name: '项目复盘' })).toBeInTheDocument()
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(3)
    expect(screen.queryByText('未找到结果')).not.toBeInTheDocument()
  })

  it('renders the no-results state from the current store query instead of API echo data', () => {
    useKnowledgeStore.setState({ query: '真实查询' })
    mockUseSearch.mockReturnValue({
      data: {
        results: [],
        total: 0,
        query: '错误回显',
      },
      isLoading: false,
    })

    renderKnowledgePage()

    expect(screen.getByRole('heading', { name: '真实查询' })).toBeInTheDocument()
    expect(screen.getByText('未找到结果')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '错误回显' })).not.toBeInTheDocument()
  })

  it('renders the success list for an active store query', async () => {
    useKnowledgeStore.setState({ query: '预算' })
    mockUseSearch.mockReturnValue({
      data: {
        results: [
          {
            msgId: 'm1',
            content: '预算今晚确认',
            createTime: 1710000000,
            fromUsername: 'alice',
            conversationId: 'c1',
          },
          {
            msgId: 'm2',
            content: '预算表已经同步',
            createTime: 1710000300,
            fromUsername: 'bob',
            conversationId: 'c2',
          },
        ],
        total: 2,
        query: '错误回显',
      },
      isLoading: false,
    })

    renderKnowledgePage()

    expect(await screen.findByText('预算今晚确认')).toBeInTheDocument()
    expect(screen.getByText('预算表已经同步')).toBeInTheDocument()
    expect(screen.getByText('2 条结果')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '预算' })).toBeInTheDocument()
  })

  it('selects the result card and navigates to the source conversation', async () => {
    const user = userEvent.setup()

    useKnowledgeStore.setState({ query: '预算' })
    mockUseSearch.mockReturnValue({
      data: {
        results: [
          {
            msgId: 'm1',
            content: '预算今晚确认',
            createTime: 1710000000,
            fromUsername: 'alice',
            conversationId: 'conversation-1',
          },
        ],
        total: 1,
        query: '预算',
      },
      isLoading: false,
    })

    renderKnowledgePage()

    await user.click(await screen.findByText('预算今晚确认'))
    expect(useKnowledgeStore.getState().selectedResultId).toBe('m1')

    await user.click(screen.getByRole('button', { name: '打开原始对话' }))
    expect(mockNavigate).toHaveBeenCalledWith('/chat?conversationId=conversation-1')
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
