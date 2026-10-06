import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  User,
  AuthResponse,
  LoginData,
  LoginResult,
  RegisterData,
  authService,
  isTwoFactorChallenge,
  clearAccountLocalData,
} from '../services/authService';
import { biometricService } from '../services/biometricService';
import {
  getStoredUser,
  getAccessToken,
  clearTokens,
  saveUser,
  onAuthFailure,
  onPasswordChangeRequired,
} from '../config/api';

// ============================================
// TIPOS
// ============================================

/**
 * Resultado do login (D4.7): ou a sessão foi aberta, ou a conta tem 2FA e a
 * tela precisa pedir o código para concluir com `completeTwoFactorSignIn`.
 */
/** Conta que entrou (id/e-mail/celular) — a tela compara com a dona da biometria guardada */
export type SignedInAccount = { id: string; email: string; phone?: string | null };

export type SignInResult =
  | { requiresTwoFactor: true; challengeToken: string }
  | { requiresTwoFactor: false; newDevice: boolean; account: SignedInAccount };

const accountOf = (user: User): SignedInAccount => ({ id: user.id, email: user.email, phone: user.phone ?? null });

interface AuthContextType {
  /** Usuário autenticado */
  user: User | null;
  /** Indica se está carregando dados do storage */
  isLoading: boolean;
  /** Indica se o usuário está autenticado */
  isAuthenticated: boolean;
  /** Indica se o usuário tem uma comunidade selecionada */
  hasCommunity: boolean;
  /** Realiza login (pode devolver um desafio de segundo fator) */
  signIn: (data: LoginData) => Promise<SignInResult>;
  /** Conclui o login com o código do autenticador / de recuperação */
  completeTwoFactorSignIn: (challengeToken: string, code: string) => Promise<SignInResult>;
  /** Sai deste aparelho (os outros seguem logados) */
  signOut: () => Promise<void>;
  /** Encerra a sessão em todos os aparelhos, inclusive este */
  signOutAllDevices: () => Promise<void>;
  /** Troca a senha da própria conta (Segurança / troca obrigatória) */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** Registra novo usuário */
  register: (data: RegisterData) => Promise<void>;
  /** Atualiza dados do usuário no contexto */
  updateUser: (user: User) => Promise<void>;
  /** Atualiza a comunidade do usuário */
  updateCommunity: (communityId: string, consentGiven?: boolean) => Promise<void>;
  /** Recarrega os dados do usuário da API */
  refreshUser: () => Promise<void>;
}

// ============================================
// GESTOR SEM COMUNIDADE DE ESCOPO
// ============================================

/**
 * Papéis acima de VOLUNTEER. Um PARISH_ADMIN/DIOCESAN_ADMIN não tem comunidade
 * de ESCOPO; o backend novo devolve em `communityId` a comunidade de FÉ dele
 * (só exibição). Sem ela o app mandava o gestor ao assistente a cada login.
 */
const MANAGEMENT_ROLES = new Set([
  'SYSTEM_ADMIN',
  'DIOCESAN_ADMIN',
  'PARISH_ADMIN',
  'COMMUNITY_COORDINATOR',
  'PASTORAL_COORDINATOR',
]);

const isManager = (user: User | null | undefined): boolean => !!user && MANAGEMENT_ROLES.has(user.role);

/**
 * Antes de decidir "tem comunidade?" depois do login: se o gestor veio sem
 * communityId (servidor antigo ou cadastro sem vínculo principal), pergunta
 * UMA vez ao /users/me. Falhou ou continua sem: segue com o que veio — sem
 * nova tentativa (nada de laço).
 */
const resolveManagerCommunity = async (user: User): Promise<User> => {
  if (user.communityId || !isManager(user)) return user;
  try {
    const fresh = await authService.getCurrentUser();
    return fresh?.id === user.id ? fresh : user;
  } catch {
    return user;
  }
};

/**
 * Atualização em segundo plano (/users/me ao voltar ao app) não pode tirar a
 * comunidade de um gestor que já estava usando o app — senão o layout o
 * jogaria no assistente no meio da sessão. Só vale para gestor e o mesmo id.
 */
const keepManagerCommunity = (previous: User | null, fresh: User): User => {
  if (fresh.communityId || !isManager(fresh) || !previous?.communityId || previous.id !== fresh.id) {
    return fresh;
  }
  return { ...fresh, communityId: previous.communityId, community: fresh.community ?? previous.community };
};

// ============================================
// CONTEXTO
// ============================================

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Hook para acessar o contexto de autenticação
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// ============================================
// PROVIDER
// ============================================

interface AuthProviderProps {
  children: React.ReactNode;
}

/**
 * Provider que gerencia o estado de autenticação do app
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  // ============================================
  // EFEITOS
  // ============================================

  /**
   * Carrega o usuário do AsyncStorage ao iniciar o app
   */
  useEffect(() => {
    const loadStoredAuth = async () => {
      try {
        // Verifica se existe um token válido
        const token = await getAccessToken();
        
        if (token) {
          // Se existe token, carrega o usuário do storage
          const storedUser = await getStoredUser();
          
          if (storedUser) {
            // Gestor salvo sem comunidade (sessão de antes do backend novo):
            // uma consulta ao /users/me antes de abrir — sem rede, segue como está
            const resolved = await resolveManagerCommunity(storedUser);
            setUser(resolved);
          } else {
            // Token existe mas usuário não, limpa tudo
            await clearTokens();
          }
        }
      } catch (error) {
        console.error('Erro ao carregar autenticação:', error);
        // Em caso de erro, limpa os dados
        await clearTokens();
      } finally {
        setIsLoading(false);
      }
    };

    loadStoredAuth();
  }, []);

  /**
   * Sessão expirada de vez (refresh token rejeitado pelo servidor):
   * zera o usuário em memória — o layout raiz redireciona para o login.
   * Sem isso o app ficava "logado" com o storage limpo, falhando em loop.
   */
  useEffect(() => {
    const unsubscribe = onAuthFailure(() => {
      setUser(null);
      // A conta caiu sem "Sair": a fila offline e os lembretes dela não
      // podem ficar para quem entrar depois neste aparelho (B24)
      clearAccountLocalData().catch(() => undefined);
    });
    return unsubscribe;
  }, []);

  /**
   * Servidor recusou com PASSWORD_CHANGE_REQUIRED: marca o usuário — o layout
   * leva à tela de troca de senha (M18).
   */
  useEffect(() => {
    const unsubscribe = onPasswordChangeRequired(() =>
      setUser((previous) => (previous && !previous.forcePasswordChange ? { ...previous, forcePasswordChange: true } : previous)),
    );
    return unsubscribe;
  }, []);

  /**
   * Atualiza dados do usuário sempre que o app volta ao foreground,
   * assim mudanças feitas no painel web (ex: novo role de coordenador)
   * aparecem sem precisar fazer logout/login.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const wasBackground = appState.current === 'background' || appState.current === 'inactive';
      const isActive = nextState === 'active';
      appState.current = nextState;

      if (wasBackground && isActive) {
        getAccessToken().then((token) => {
          if (token) {
            authService
              .getCurrentUser()
              .then((fresh) => setUser((previous) => keepManagerCommunity(previous, fresh)))
              .catch(() => {});
          }
        });
      }
    });

    return () => subscription.remove();
  }, []);

  // ============================================
  // FUNÇÕES
  // ============================================

  /**
   * Realiza login do usuário. Se a conta tiver 2FA, NÃO abre sessão — devolve
   * o desafio para a tela pedir o código.
   */
  const signIn = useCallback(async (data: LoginData): Promise<SignInResult> => {
    try {
      const result: LoginResult = await authService.login(data);

      if (isTwoFactorChallenge(result)) {
        return { requiresTwoFactor: true, challengeToken: result.challengeToken };
      }

      // Gestor: decide a comunidade com o que o login devolveu (comunidade de
      // fé) e, se veio vazio, com UMA consulta ao /users/me — antes do setUser,
      // para o layout não abrir o assistente por um instante
      setUser(await resolveManagerCommunity(result.user));
      return { requiresTwoFactor: false, newDevice: !!result.newDevice, account: accountOf(result.user) };
    } catch (error) {
      // Re-throw para que o componente possa tratar
      throw error;
    }
  }, []);

  /**
   * Segunda etapa do login (2FA) — ao validar o código, abre a sessão
   * exatamente como o login normal.
   */
  const completeTwoFactorSignIn = useCallback(
    async (challengeToken: string, code: string): Promise<SignInResult> => {
      const response: AuthResponse = await authService.loginWithTwoFactor(challengeToken, code);
      setUser(await resolveManagerCommunity(response.user));
      return { requiresTwoFactor: false, newDevice: !!response.newDevice, account: accountOf(response.user) };
    },
    [],
  );

  /**
   * Registra um novo usuário
   */
  const register = useCallback(async (data: RegisterData): Promise<void> => {
    try {
      const response: AuthResponse = await authService.register(data);
      setUser(response.user);
    } catch (error) {
      // Re-throw para que o componente possa tratar
      throw error;
    }
  }, []);

  /**
   * Realiza logout do usuário
   */
  const signOut = useCallback(async (): Promise<void> => {
    try {
      await authService.logout();
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
    } finally {
      setUser(null);
    }
  }, []);

  const signOutAllDevices = useCallback(async (): Promise<void> => {
    try {
      await authService.logoutAllDevices();
    } finally {
      setUser(null);
    }
  }, []);

  /**
   * Troca a senha. Tira a troca obrigatória do usuário e mantém a senha da
   * biometria em dia (se estiver ativa).
   */
  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string): Promise<void> => {
      if (!user) throw new Error('Usuário não autenticado');
      await authService.changePassword(user.id, currentPassword, newPassword);
      const updated = { ...user, forcePasswordChange: false };
      setUser(updated);
      await saveUser(updated);
      await biometricService.updatePassword(newPassword).catch(() => undefined);
    },
    [user],
  );

  /**
   * Atualiza os dados do usuário no contexto e storage
   */
  const updateUser = useCallback(async (updatedUser: User): Promise<void> => {
    setUser(updatedUser);
    await saveUser(updatedUser);
  }, []);

  /**
   * Atualiza a comunidade do usuário
   */
  const updateCommunity = useCallback(async (communityId: string, consentGiven?: boolean): Promise<void> => {
    if (!user) {
      throw new Error('Usuário não autenticado');
    }

    try {
      const updatedUser = await authService.updateCommunity(user.id, communityId, consentGiven);
      // Servidor antigo devolvia o gestor sem communityId mesmo após escolher a
      // comunidade — mantém a escolhida (só exibição) para não reabrir o assistente
      if (!updatedUser.communityId && isManager(updatedUser)) {
        const withCommunity = { ...updatedUser, communityId };
        setUser(withCommunity);
        await saveUser(withCommunity);
      } else {
        setUser(updatedUser);
      }
    } catch (error) {
      // Re-throw para que o componente possa tratar
      throw error;
    }
  }, [user]);

  /**
   * Recarrega os dados do usuário da API
   */
  const refreshUser = useCallback(async (): Promise<void> => {
    try {
      const currentUser = await authService.getCurrentUser();
      setUser((previous) => keepManagerCommunity(previous, currentUser));
    } catch (error) {
      console.error('Erro ao atualizar usuário:', error);
      // Se falhar ao buscar usuário, pode ser que o token expirou
      // O interceptor do axios já deve ter tratado isso
    }
  }, []);

  // ============================================
  // VALORES COMPUTADOS
  // ============================================

  const isAuthenticated = !!user;
  const hasCommunity = !!user?.communityId;

  // ============================================
  // RENDER
  // ============================================

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated,
        hasCommunity,
        signIn,
        completeTwoFactorSignIn,
        signOut,
        signOutAllDevices,
        changePassword,
        register,
        updateUser,
        updateCommunity,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export default AuthContext;
