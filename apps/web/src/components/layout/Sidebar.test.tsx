import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { useChatStore } from '../../stores/chatStore'

vi.mock('../chat/ConversationList', () => ({
  ConversationList: () => <div>conversation-list</div>,
}))

vi.mock('./ClientStatus', () => ({
  ClientStatus: () => <div>client-status</div>,
}))

vi.mock('../chat/DirectoryPanel', () => ({
  DirectoryPanel: () => <div>directory-panel</div>,
}))

afterEach(() => {
  act(() => {
    useChatStore.setState({
      selectedConversationId: null,
      isSidebarCollapsed: false,
      sidebarMode: 'conversations',
    } as any)
  })
})

describe('Sidebar', () => {
  it('shows rail only when sidebar is collapsed', () => {
    act(() => {
      useChatStore.setState({
        selectedConversationId: null,
        isSidebarCollapsed: true,
        sidebarMode: 'conversations',
      } as any)
    })

    render(
      <BrowserRouter>
        <Sidebar />
      </BrowserRouter>
    )

    expect(screen.queryByText('conversation-list')).not.toBeInTheDocument()
  })

  it('switches between conversations and directory modes from rail buttons', async () => {
    const user = userEvent.setup()
    render(
      <BrowserRouter>
        <Sidebar />
      </BrowserRouter>
    )

    expect(screen.getByText('conversation-list')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '联系人' }))

    expect(screen.getByText('directory-panel')).toBeInTheDocument()
  })
})
