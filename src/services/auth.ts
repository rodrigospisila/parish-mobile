import api from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  fullName: string;
  role?: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
  };
}

export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const response = await api.post('/auth/login', credentials);
    const { accessToken, refreshToken, user } = response.data;

    // Salvar tokens no AsyncStorage
    await AsyncStorage.setItem('@parish:token', accessToken);
    await AsyncStorage.setItem('@parish:refreshToken', refreshToken);
    await AsyncStorage.setItem('@parish:user', JSON.stringify(user));

    return response.data;
  },

  async register(data: RegisterData): Promise<AuthResponse> {
    const response = await api.post('/auth/register', data);
    const { accessToken, refreshToken, user } = response.data;

    // Salvar tokens no AsyncStorage
    await AsyncStorage.setItem('@parish:token', accessToken);
    await AsyncStorage.setItem('@parish:refreshToken', refreshToken);
    await AsyncStorage.setItem('@parish:user', JSON.stringify(user));

    return response.data;
  },

  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
    } finally {
      // Limpar tokens do AsyncStorage
      await AsyncStorage.multiRemove([
        '@parish:token',
        '@parish:refreshToken',
        '@parish:user',
      ]);
    }
  },

  async refreshToken(): Promise<string> {
    const refreshToken = await AsyncStorage.getItem('@parish:refreshToken');
    if (!refreshToken) {
      throw new Error('Refresh token não encontrado');
    }

    const response = await api.post('/auth/refresh', { refreshToken });
    const { accessToken } = response.data;

    await AsyncStorage.setItem('@parish:token', accessToken);

    return accessToken;
  },

  async getStoredUser() {
    const userJson = await AsyncStorage.getItem('@parish:user');
    return userJson ? JSON.parse(userJson) : null;
  },

  async getStoredToken() {
    return await AsyncStorage.getItem('@parish:token');
  },
};

