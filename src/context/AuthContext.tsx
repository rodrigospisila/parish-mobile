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
} from '../services/authService';
import {
  getStoredUser,
  getAccessToken,
  clearTokens,
  saveUser,
  onAuthFailure
} from '../config/api';

// ============================================
// TIPOS
// ============================================

/**
 * Resultado do login (D4.7): ou a sessão foi aberta, ou a conta tem 2FA e a
 * tela precisa pedir o código para concluir com `completeTwoFactorSignIn`.
 */
export type SignInResult =
  | { requiresTwoFactor: true; challengeToken: string }
  | { requiresTwoFactor: false; newDevice: boolean };

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
  /** Realiza logout */
  signOut: () => Promise<void>;
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
            setUser(storedUser);
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
    const unsubscribe = onAuthFailure(() => setUser(null));
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
            authService.getCurrentUser().then(setUser).catch(() => {});
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

      setUser(result.user);
      return { requiresTwoFactor: false, newDevice: !!result.newDevice };
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
      setUser(response.user);
      return { requiresTwoFactor: false, newDevice: !!response.newDevice };
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
      setUser(updatedUser);
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
      setUser(currentUser);
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
