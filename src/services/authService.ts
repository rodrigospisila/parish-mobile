import api from '../config/api';

// Tipos de dados (simplificados por enquanto)
export interface User {
  id: number;
  email: string;
  name: string;
  token: string;
  communityId?: string; // Adicionado para o novo fluxo
}

interface LoginData {
  email: string;
  password: string;
}

interface RegisterData {
  email: string;
  password: string;
  name: string;
}

// O serviço de autenticação fará as chamadas reais para o backend
export const authService = {
  async login(data: LoginData): Promise<User> {
    // Mock de resposta para login
    if (data.email === 'adm@santarita.com.br' && data.password === '12345678') {
      return {
        id: 1,
        email: data.email,
        name: 'Administrador',
        token: 'mock-token-123',
        communityId: '1001', // Usuário com comunidade selecionada
      };
    }
    
    // Mock de usuário sem comunidade selecionada (para testar o wizard)
    if (data.email === 'user@test.com' && data.password === '123456') {
      return {
        id: 2,
        email: data.email,
        name: 'Usuário Teste',
        token: 'mock-token-456',
        communityId: undefined, // Usuário sem comunidade selecionada
      };
    }

    // Chamada real (descomentar quando o backend estiver pronto)
    // const response = await api.post('/auth/login', data);
    // return response.data;
    
    throw new Error('Credenciais inválidas (Mock)');
  },

  async register(data: RegisterData): Promise<User> {
    // Mock de resposta para registro
    return {
      id: Math.floor(Math.random() * 1000) + 10,
      email: data.email,
      name: data.name,
      token: 'mock-token-new',
      communityId: undefined, // Novo usuário sempre começa sem comunidade
    };
    
    // Chamada real (descomentar quando o backend estiver pronto)
    // const response = await api.post('/auth/register', data);
    // return response.data;
  },
  
  async updateCommunity(userId: number, communityId: string): Promise<void> {
    // Mock de atualização
    console.log(`[Mock] Usuário ${userId} atualizado com communityId: ${communityId}`);
    
    // Chamada real (descomentar quando o backend estiver pronto)
    // await api.patch(`/users/${userId}/community`, { communityId });
  }
};
