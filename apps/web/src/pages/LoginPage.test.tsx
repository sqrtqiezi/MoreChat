import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginPage } from './LoginPage'

const mockNavigate = vi.fn()
const mockLogin = vi.fn()
const authState = {
  isAuthenticated: false,
  token: null as string | null,
}

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')

  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('../stores/authStore', () => ({
  useAuthStore: (selector: (state: {
    isAuthenticated: boolean
    token: string | null
    login: typeof mockLogin
    logout: ReturnType<typeof vi.fn>
  }) => unknown) =>
    selector({
      ...authState,
      login: mockLogin,
      logout: vi.fn(),
    }),
}))

describe('LoginPage', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    mockLogin.mockReset()
    authState.isAuthenticated = false
    authState.token = null
  })

  it('redirects authenticated users to the knowledge page', async () => {
    authState.isAuthenticated = true
    authState.token = 'token'

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
    })
  })

  it('navigates to the knowledge page after a successful login', async () => {
    const user = userEvent.setup()
    mockLogin.mockResolvedValue(undefined)

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('密码'), 'secret')
    await user.click(screen.getByRole('button', { name: '登录' }))

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('secret')
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
    })
  })
})
