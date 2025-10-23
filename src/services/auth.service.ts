import api from './api';
import { API_ENDPOINTS } from '@/constants/api';
import type { LoginRequest, RegisterRequest, AuthResponse, User } from '@/types';

export const authService = {
  async login(credentials: LoginRequest): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>(API_ENDPOINTS.LOGIN, credentials);
    return response.data;
  },

  async register(data: RegisterRequest): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>(API_ENDPOINTS.REGISTER, data);
    return response.data;
  },

  async logout(): Promise<void> {
    await api.post(API_ENDPOINTS.LOGOUT);
  },

  async getMe(): Promise<User> {
    const response = await api.get<User>(API_ENDPOINTS.ME);
    return response.data;
  },

  async refreshToken(refreshToken: string): Promise<{ accessToken: string }> {
    const response = await api.post<{ accessToken: string }>(
      API_ENDPOINTS.REFRESH,
      { refreshToken }
    );
    return response.data;
  },
};

