import { create } from 'zustand';
import { authApi } from '../api/auth';

interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  login: (password: string) => Promise<void>;
  logout: () => void;
}

const savedToken = localStorage.getItem('auth_token');

export const useAuthStore = create<AuthState>()((set) => ({
  isAuthenticated: !!savedToken,
  token: savedToken,
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
}));
