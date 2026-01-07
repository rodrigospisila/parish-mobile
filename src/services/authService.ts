import api, { saveTokens, saveUser, clearTokens, getErrorMessage } from '../config/api';

// ============================================
// TIPOS
// ============================================

/**
 * Roles de usuário (corresponde ao enum UserRole do backend)
 */
export type UserRole = 
  | 'SYSTEM_ADMIN'
  | 'DIOCESAN_ADMIN'
  | 'PARISH_ADMIN'
  | 'COMMUNITY_COORDINATOR'
  | 'PASTORAL_COORDINATOR'
  | 'SECRETARY'
  | 'CATECHIST'
  | 'MINISTER'
  | 'FAITHFUL';

/**
 * Usuário retornado pela API
 */
export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: UserRole;
  isActive: boolean;
  forcePasswordChange?: boolean;
  dioceseId?: string;
  parishId?: string;
  communityId?: string;
  createdAt: string;
}

/**
 * Resposta do login/registro
 */
export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

/**
 * Dados para login
 */
export interface LoginData {
  email: string;
  password: string;
}

/**
 * Dados para registro
 */
export interface RegisterData {
  email: string;
  password: string;
  name: string;
  phone?: string;
  role?: UserRole;
  dioceseId?: string;
  parishId?: string;
  communityId?: string;
}

/**
 * Dados para atualizar usuário
 */
export interface UpdateUserData {
  name?: string;
  phone?: string;
  communityId?: string;
  parishId?: string;
  dioceseId?: string;
}

// ============================================
// CONFIGURAÇÃO DE AMBIENTE
// ============================================

/**
 * Flag para usar mock ou API real
 * Em desenvolvimento, pode ser útil alternar entre mock e API real
 */
const USE_MOCK = process.env.EXPO_PUBLIC_USE_MOCK === 'true';

// ============================================
// MOCK DATA (para desenvolvimento sem backend)
// ============================================

const mockUsers: Record<string, { user: User; password: string }> = {
  'adm@santarita.com.br': {
    password: '12345678',
    user: {
      id: 'mock-user-1',
      email: 'adm@santarita.com.br',
      name: 'Administrador',
      phone: '11999999999',
      role: 'COMMUNITY_COORDINATOR',
      isActive: true,
      communityId: 'mock-community-1',
      createdAt: new Date().toISOString(),
    },
  },
  'user@test.com': {
    password: '12345678',
    user: {
      id: 'mock-user-2',
      email: 'user@test.com',
      name: 'Usuário Teste',
      phone: '11988888888',
      role: 'FAITHFUL',
      isActive: true,
      communityId: undefined,
      createdAt: new Date().toISOString(),
    },
  },
};

// ============================================
// SERVIÇO DE AUTENTICAÇÃO
// ============================================

export const authService = {
  /**
   * Realiza login do usuário
   */
  async login(data: LoginData): Promise<AuthResponse> {
    // Modo Mock
    if (USE_MOCK) {
      return mockLogin(data);
    }

    // Chamada real para a API
    try {
      const response = await api.post<AuthResponse>('/auth/login', data);
      const { user, accessToken, refreshToken } = response.data;

      // Salva os tokens e usuário no AsyncStorage
      await saveTokens(accessToken, refreshToken);
      await saveUser(user);

      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  /**
   * Registra um novo usuário
   */
  async register(data: RegisterData): Promise<AuthResponse> {
    // Modo Mock
    if (USE_MOCK) {
      return mockRegister(data);
    }

    // Chamada real para a API
    try {
      const response = await api.post<AuthResponse>('/auth/register', data);
      const { user, accessToken, refreshToken } = response.data;

      // Salva os tokens e usuário no AsyncStorage
      await saveTokens(accessToken, refreshToken);
      await saveUser(user);

      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  /**
   * Realiza logout do usuário
   */
  async logout(): Promise<void> {
    // Modo Mock
    if (USE_MOCK) {
      await clearTokens();
      return;
    }

    // Chamada real para a API
    try {
      await api.post('/auth/logout');
    } catch (error) {
      // Mesmo se a chamada falhar, limpa os tokens locais
      console.warn('Erro ao fazer logout na API:', error);
    } finally {
      await clearTokens();
    }
  },

  /**
   * Renova o token de acesso
   */
  async refreshToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    // Modo Mock
    if (USE_MOCK) {
      return {
        accessToken: 'mock-access-token-refreshed',
        refreshToken: 'mock-refresh-token-refreshed',
      };
    }

    // Chamada real para a API
    try {
      const response = await api.post('/auth/refresh', { refreshToken });
      const { accessToken: newAccessToken, refreshToken: newRefreshToken } = response.data;

      // Salva os novos tokens
      await saveTokens(newAccessToken, newRefreshToken);

      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  /**
   * Atualiza a comunidade do usuário
   */
  async updateCommunity(userId: string, communityId: string): Promise<User> {
    // Modo Mock
    if (USE_MOCK) {
      return mockUpdateCommunity(userId, communityId);
    }

    // Chamada real para a API
    try {
      const response = await api.patch<User>(`/users/${userId}`, { communityId });
      
      // Atualiza o usuário no AsyncStorage
      await saveUser(response.data);
      
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  /**
   * Obtém os dados do usuário atual
   */
  async getCurrentUser(): Promise<User> {
    // Modo Mock
    if (USE_MOCK) {
      throw new Error('Usuário não encontrado (Mock)');
    }

    // Chamada real para a API
    try {
      const response = await api.get<User>('/users/me');
      
      // Atualiza o usuário no AsyncStorage
      await saveUser(response.data);
      
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  /**
   * Atualiza os dados do usuário
   */
  async updateUser(userId: string, data: UpdateUserData): Promise<User> {
    // Modo Mock
    if (USE_MOCK) {
      throw new Error('Não implementado (Mock)');
    }

    // Chamada real para a API
    try {
      const response = await api.patch<User>(`/users/${userId}`, data);
      
      // Atualiza o usuário no AsyncStorage
      await saveUser(response.data);
      
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },
};

// ============================================
// FUNÇÕES MOCK
// ============================================

async function mockLogin(data: LoginData): Promise<AuthResponse> {
  // Simula delay de rede
  await new Promise((resolve) => setTimeout(resolve, 500));

  const mockUser = mockUsers[data.email];

  if (!mockUser || mockUser.password !== data.password) {
    throw new Error('Credenciais inválidas');
  }

  const response: AuthResponse = {
    user: mockUser.user,
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
  };

  // Salva no AsyncStorage (mesmo no mock)
  await saveTokens(response.accessToken, response.refreshToken);
  await saveUser(response.user);

  return response;
}

async function mockRegister(data: RegisterData): Promise<AuthResponse> {
  // Simula delay de rede
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Verifica se o email já existe
  if (mockUsers[data.email]) {
    throw new Error('Email já cadastrado');
  }

  const newUser: User = {
    id: `mock-user-${Date.now()}`,
    email: data.email,
    name: data.name,
    phone: data.phone,
    role: data.role || 'FAITHFUL',
    isActive: true,
    communityId: data.communityId,
    createdAt: new Date().toISOString(),
  };

  const response: AuthResponse = {
    user: newUser,
    accessToken: 'mock-access-token-new',
    refreshToken: 'mock-refresh-token-new',
  };

  // Salva no AsyncStorage (mesmo no mock)
  await saveTokens(response.accessToken, response.refreshToken);
  await saveUser(response.user);

  return response;
}

async function mockUpdateCommunity(userId: string, communityId: string): Promise<User> {
  // Simula delay de rede
  await new Promise((resolve) => setTimeout(resolve, 300));

  // Busca o usuário mock pelo ID
  const userEntry = Object.values(mockUsers).find((entry) => entry.user.id === userId);

  if (!userEntry) {
    throw new Error('Usuário não encontrado');
  }

  // Atualiza a comunidade
  userEntry.user.communityId = communityId;

  // Salva no AsyncStorage
  await saveUser(userEntry.user);

  return userEntry.user;
}

export default authService;
