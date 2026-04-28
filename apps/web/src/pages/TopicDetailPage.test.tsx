import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TopicDetailPage } from './TopicDetailPage'

const mockUseTopicMessages = vi.fn()

vi.mock('../hooks/useTopicMessages', () => ({
  useTopicMessages: (topicId: string) => mockUseTopicMessages(topicId),
}))

vi.mock('../hooks/useTopicsPreview', () => ({
  useTopicsPreview: () => ({ data: [], isLoading: false }),
}))

vi.mock('../hooks/useHighlights', () => ({
  useHighlights: () => ({ data: { items: [], total: 0, limit: 20, offset: 0 }, isLoading: false }),
}))

describe('TopicDetailPage', () => {
  beforeEach(() => {
    mockUseTopicMessages.mockReset()
  })

  it('renders topic metadata and messages', async () => {
    mockUseTopicMessages.mockReturnValue({
      data: {
        topic: {
          id: 'topic_1',
          title: '预算主题',
          summary: '近期预算讨论',
          messageCount: 2,
          participantCount: 3,
          lastSeenAt: 1710000000,
          status: 'active',
        },
        messages: [
          {
            msgId: 'm1',
            content: '预算今晚确认',
            createTime: 1710000000,
            fromUsername: 'alice',
            toUsername: 'room-1',
            conversationId: 'conversation-1',
          },
        ],
      },
      isLoading: false,
    })

    render(
      <MemoryRouter initialEntries={['/topics/topic_1']}>
        <Routes>
          <Route path="/topics/:topicId" element={<TopicDetailPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: '预算主题' })).toBeInTheDocument()
    expect(screen.getByText('近期预算讨论')).toBeInTheDocument()
    expect(screen.getByText('预算今晚确认')).toBeInTheDocument()
  })
})
