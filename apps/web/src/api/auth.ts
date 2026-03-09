import client from './client';

interface LoginResponse {
  success: boolean;
  data?: { token: string };
  error?: { message: string };
}

export const authApi = {
  async login(password: string): Promise<{ token: string }> {
    const response = await client.post<LoginResponse>('/auth/login', { password });

    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error?.message || '登录失败');
    }

    return response.data.data;
  },
};
