// ABOUTME: 验证 Feed 页面优先展示知识卡片摘要并支持跳转原始对话
// ABOUTME: 通过 mock hooks 与路由导航隔离页面行为进行交互测试

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FeedPage } from './FeedPage'

const mockNavigate = vi.fn()
const mockUseHighlights = vi.fn()
const mockUseWebSocket = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('../hooks/useHighlights', () => ({
  useHighlights: () => mockUseHighlights(),
}))

vi.mock('../hooks/useTopicsPreview', () => ({
  useTopicsPreview: () => ({ data: [], isLoading: false }),
}))

vi.mock('../hooks/useWebSocket', () => ({
  useWebSocket: (options: { onMessage?: (data: any) => void; onReconnect?: () => void }) => {
    mockUseWebSocket(options)
    return { isConnected: true }
  },
}))

function renderWithProviders(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{ui}</MemoryRouter>
      </QueryClientProvider>,
    ),
  }
}

describe('FeedPage', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    mockUseHighlights.mockReset()
    mockUseWebSocket.mockReset()
  })

  it('renders knowledge-card summary before the raw message', async () => {
    mockUseHighlights.mockReturnValue({
      data: {
        items: [
          {
            msgId: 'm1',
            content: '预算今晚确认',
            createTime: 1710000000,
            fromUsername: 'alice',
            toUsername: 'room-1',
            conversationId: 'conversation-1',
            tags: [{ tag: 'important', source: 'rule:keyword' }],
            knowledgeCard: {
              id: 'k1',
              title: '预算确认',
              summary: '预算将在今晚定稿',
              decisions: '今晚确认预算版本',
              actionItems: '财务同步表格',
            },
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      },
      isLoading: false,
    })

    renderWithProviders(<FeedPage />)

    expect(await screen.findByText('预算确认')).toBeInTheDocument()
    expect(screen.getByText('预算将在今晚定稿')).toBeInTheDocument()
    expect(screen.getByText('预算今晚确认')).toBeInTheDocument()
  })

  it('navigates to the original conversation', async () => {
    const user = userEvent.setup()
    mockUseHighlights.mockReturnValue({
      data: {
        items: [
          {
            msgId: 'm2',
            content: '@你 明早带合同',
            createTime: 1710000300,
            fromUsername: 'bob',
            toUsername: 'room-2',
            conversationId: 'conversation-2',
            tags: [{ tag: 'important', source: 'rule:mention' }],
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      },
      isLoading: false,
    })

    renderWithProviders(<FeedPage />)

    await user.click(await screen.findByRole('button', { name: '打开原始对话' }))
    expect(mockNavigate).toHaveBeenCalledWith('/chat?conversationId=conversation-2')
  })

  it('invalidates highlights query when receiving highlight:new WebSocket event', async () => {
    mockUseHighlights.mockReturnValue({
      data: { items: [], total: 0, limit: 20, offset: 0 },
      isLoading: false,
    })

    const { queryClient } = renderWithProviders(<FeedPage />)

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const options = mockUseWebSocket.mock.calls[0][0]

    options.onMessage?.({
      event: 'highlight:new',
      data: { msgId: 'm3', conversationId: 'c1', sources: ['rule:watchlist'], createTime: 1 },
    })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['highlights'] })

    invalidateSpy.mockClear()
    options.onMessage?.({ event: 'message:new', data: {} })
    expect(invalidateSpy).not.toHaveBeenCalled()

    invalidateSpy.mockClear()
    options.onReconnect?.()
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['highlights'] })
  })
})
