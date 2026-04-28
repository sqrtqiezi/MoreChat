// ABOUTME: 验证 Feed 页面优先展示知识卡片摘要并支持跳转原始对话
// ABOUTME: 通过 mock hooks 与路由导航隔离页面行为进行交互测试

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FeedPage } from './FeedPage'

const mockNavigate = vi.fn()
const mockUseHighlights = vi.fn()

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

describe('FeedPage', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    mockUseHighlights.mockReset()
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

    render(
      <MemoryRouter>
        <FeedPage />
      </MemoryRouter>,
    )

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

    render(
      <MemoryRouter>
        <FeedPage />
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('button', { name: '打开原始对话' }))
    expect(mockNavigate).toHaveBeenCalledWith('/chat?conversationId=conversation-2')
  })
})
