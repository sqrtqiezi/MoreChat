import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TopicsPage } from './TopicsPage'

const mockNavigate = vi.fn()
const mockUseTopics = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('../hooks/useTopics', () => ({
  useTopics: () => mockUseTopics(),
}))

vi.mock('../hooks/useTopicsPreview', () => ({
  useTopicsPreview: () => ({ data: [], isLoading: false }),
}))

vi.mock('../hooks/useHighlights', () => ({
  useHighlights: () => ({ data: { items: [], total: 0, limit: 20, offset: 0 }, isLoading: false }),
}))

describe('TopicsPage', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    mockUseTopics.mockReset()
  })

  it('renders the topic timeline and navigates on click', async () => {
    const user = userEvent.setup()
    mockUseTopics.mockReturnValue({
      data: [
        {
          id: 'topic_1',
          title: '预算主题',
          summary: '近期预算讨论',
          messageCount: 8,
          participantCount: 3,
          lastSeenAt: 1710000000,
          status: 'active',
        },
      ],
      isLoading: false,
    })

    render(
      <MemoryRouter>
        <TopicsPage />
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('button', { name: '打开话题：预算主题' }))
    expect(mockNavigate).toHaveBeenCalledWith('/topics/topic_1')
  })
})
