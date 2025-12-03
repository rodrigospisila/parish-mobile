import api from '../config/api';

// Tipos de dados (simplificados por enquanto)
interface User {
  id: number;
  email: string;
  name: string;
  token: string;
}

interface LoginData {
  email: string;
  password: string;
}

// O serviço de autenticação fará as chamadas reais para o backend
export const authService = {
  async login(data: LoginData): Promise<User> {
    const response = await api.post('/auth/login', data);
    return response.data;
  },

  async register(data: any): Promise<User> {
    const response = await api.post('/auth/register', data);
    return response.data;
  },
};
