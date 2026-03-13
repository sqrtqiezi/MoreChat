import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DirectoryPanel } from './DirectoryPanel'
import { useChatStore } from '../../stores/chatStore'

const invalidateQueries = vi.fn()
const openConversation = vi.fn()
const useDirectoryMock = vi.fn()

vi.mock('../../hooks/useDirectory', () => ({
  useDirectory: (...args: unknown[]) => useDirectoryMock(...args),
}))

vi.mock('../../api/chat', () => ({
  chatApi: {
    openConversation: (...args: unknown[]) => openConversation(...args),
  },
}))

vi.mock('../common/EmptyState', () => ({
  EmptyState: ({ title, description }: { title: string; description?: string }) => (
    <div>
      <span>{title}</span>
      {description ? <span>{description}</span> : null}
    </div>
  ),
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries }),
  }
})

function renderPanel() {
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <DirectoryPanel />
    </QueryClientProvider>
  )
}

describe('DirectoryPanel', () => {
  beforeEach(() => {
    invalidateQueries.mockReset()
    openConversation.mockReset()
    useDirectoryMock.mockReset()
    useChatStore.setState({
      selectedConversationId: null,
      isSidebarCollapsed: false,
      sidebarMode: 'directory',
    } as any)
    useDirectoryMock.mockReturnValue({
      data: {
        contacts: [
          { id: 'c1', username: 'friend_1', nickname: 'Friend 1', remark: null, conversationId: 'conv_1' },
        ],
        groups: [
          { id: 'g1', roomUsername: 'room_1@chatroom', name: 'Room 1', conversationId: null },
        ],
      },
      isLoading: false,
      error: null,
    })
  })

  it('filters contacts and groups by search query', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.type(screen.getByPlaceholderText('搜索联系人或群组'), 'Room')

    expect(screen.queryByText('Friend 1')).not.toBeInTheDocument()
    expect(screen.getByText('Room 1')).toBeInTheDocument()
  })

  it('opens existing conversation without calling openConversation api', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('button', { name: /Friend 1/i }))

    expect(openConversation).not.toHaveBeenCalled()
    expect(useChatStore.getState().selectedConversationId).toBe('conv_1')
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['conversations'] })
  })

  it('creates conversation when directory item has no conversationId', async () => {
    const user = userEvent.setup()
    openConversation.mockResolvedValue({ conversationId: 'conv_new' })
    renderPanel()

    await user.click(screen.getByRole('button', { name: /Room 1/i }))

    expect(openConversation).toHaveBeenCalledWith({ type: 'group', roomUsername: 'room_1@chatroom' })
    expect(useChatStore.getState().selectedConversationId).toBe('conv_new')
  })

  it('toggles contacts and groups sections', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('button', { name: /联系人/i }))
    expect(screen.queryByText('Friend 1')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /群聊/i }))
    expect(screen.queryByText('Room 1')).not.toBeInTheDocument()
  })
})
