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
export interface UserPastoral {
  id: string;
  name: string;
  communityId: string;
  role: string;
}

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
  // Escopo resolvido (nomes) retornado por /users/me
  diocese?: { id: string; name: string };
  parish?: { id: string; name: string };
  community?: { id: string; name: string };
  createdAt: string;
  /** IDs das pastorais da comunidade em que o usuário é membro ativo */
  pastoralIds?: string[];
  pastorals?: UserPastoral[];
  /** Segundo fator (TOTP) ativo — governança de acesso (D4.7) */
  twoFactorEnabled?: boolean;
}

/**
 * Resposta do login/registro
 */
export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  /** true quando é o primeiro acesso da conta neste aparelho */
  newDevice?: boolean;
}

/**
 * Resposta do login quando a conta tem 2FA ativo: o servidor NÃO emite tokens;
 * o app precisa concluir com o código do autenticador (POST /auth/2fa/login).
 */
export interface TwoFactorChallenge {
  requiresTwoFactor: true;
  challengeToken: string;
  user: Pick<User, 'id' | 'email' | 'name'>;
}

export type LoginResult = AuthResponse | TwoFactorChallenge;

export const isTwoFactorChallenge = (result: LoginResult): result is TwoFactorChallenge =>
  (result as TwoFactorChallenge).requiresTwoFactor === true;

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
  verifiedPhoneToken?: string;
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
// Mock só em desenvolvimento (__DEV__) — mesma regra de config/api; um build de
// produção com a env herdada por engano NUNCA aceita as credenciais fictícias
const USE_MOCK = __DEV__ && process.env.EXPO_PUBLIC_USE_MOCK === 'true';

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
   * Realiza login do usuário.
   * Pode devolver um desafio de segundo fator (sem tokens) — nesse caso nada
   * é salvo e o chamador deve concluir com `loginWithTwoFactor`.
   */
  async login(data: LoginData): Promise<LoginResult> {
    // Modo Mock
    if (USE_MOCK) {
      return mockLogin(data);
    }

    // Chamada real para a API
    try {
      const response = await api.post<LoginResult>('/auth/login', data);

      if (isTwoFactorChallenge(response.data)) {
        return response.data;
      }

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
   * Segunda etapa do login (2FA): código do autenticador ou de recuperação.
   * 401 = código inválido ou desafio expirado (5 min).
   */
  async loginWithTwoFactor(challengeToken: string, code: string): Promise<AuthResponse> {
    if (USE_MOCK) {
      throw new Error('Segundo fator não disponível no modo Mock');
    }

    try {
      const response = await api.post<AuthResponse>('/auth/2fa/login', {
        challengeToken,
        code: code.trim(),
      });
      const { user, accessToken, refreshToken } = response.data;

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
   * Solicita a recuperação de senha (envia código por SMS/e-mail).
   * A resposta é sempre genérica (não revela se a conta existe).
   */
  async forgotPassword(params: { email?: string; phone?: string }): Promise<string> {
    try {
      const response = await api.post<{ message: string }>('/auth/forgot-password', params);
      return response.data.message;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  /**
   * Redefine a senha usando o código recebido.
   */
  async resetPassword(token: string, newPassword: string): Promise<string> {
    try {
      const response = await api.post<{ message: string }>('/auth/reset-password', {
        token,
        newPassword,
      });
      return response.data.message;
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
      // Limpa o push token no servidor antes de derrubar a sessão
      await authService.registerPushToken(null);
      await api.post('/auth/logout');
    } catch (error) {
      // Mesmo se a chamada falhar, limpa os tokens locais
      console.warn('Erro ao fazer logout na API:', error);
    } finally {
      await clearTokens();
    }
  },

  /**
   * Exclui DEFINITIVAMENTE a conta do usuário logado (autoatendimento —
   * exigido pela App Store e pela LGPD). Em caso de sucesso, o chamador deve
   * encerrar a sessão local (signOut) para voltar à tela de login.
   */
  async deleteAccount(): Promise<void> {
    if (USE_MOCK) {
      return;
    }
    await api.delete('/users/me');
  },

  /**
   * Registra (ou limpa, com null) o token de push notification do dispositivo
   * no usuário logado. Best-effort: falha aqui nunca deve travar login/logout.
   */
  async registerPushToken(pushToken: string | null): Promise<void> {
    if (USE_MOCK) {
      return;
    }

    try {
      await api.patch('/users/me/push-token', { pushToken });
    } catch (error) {
      console.warn('Erro ao registrar push token:', error);
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
   * Envia código OTP por SMS para o celular informado
   */
  async sendOtp(phone: string): Promise<void> {
    try {
      await api.post('/auth/otp/send', { phone });
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  /**
   * Verifica o código OTP e retorna o token de celular verificado
   */
  async verifyOtp(phone: string, code: string): Promise<string> {
    try {
      const response = await api.post<{ verifiedPhoneToken: string }>('/auth/otp/verify', { phone, code });
      return response.data.verifiedPhoneToken;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  /**
   * Atualiza a comunidade do usuário
   * Usa o endpoint /users/me/community que permite qualquer usuário autenticado
   * atualizar sua própria comunidade (usado no fluxo de onboarding)
   */
  async updateCommunity(userId: string, communityId: string, consentGiven?: boolean): Promise<User> {
    // Modo Mock
    if (USE_MOCK) {
      return mockUpdateCommunity(userId, communityId);
    }

    // Chamada real para a API - usa endpoint específico para atualizar própria comunidade
    try {
      const response = await api.patch<User>('/users/me/community', { communityId, consentGiven });

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
