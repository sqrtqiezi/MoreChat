import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi } from '../api/auth';

interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  login: (password: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      token: null,
      login: async (password: string) => {
        const { token } = await authApi.login(password);
        localStorage.setItem('auth_token', token);
        set({
          isAuthenticated: true,
          token,
        });
      },
      logout: () => {
        localStorage.removeItem('auth_token');
        set({
          isAuthenticated: false,
          token: null,
        });
      },
    }),
    {
      name: 'auth-storage',
    }
  )
);
