import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { 
  User, 
  AuthResponse, 
  LoginData, 
  RegisterData, 
  authService 
} from '../services/authService';
import { 
  getStoredUser, 
  getAccessToken, 
  clearTokens, 
  saveUser 
} from '../config/api';

// ============================================
// TIPOS
// ============================================

interface AuthContextType {
  /** Usuário autenticado */
  user: User | null;
  /** Indica se está carregando dados do storage */
  isLoading: boolean;
  /** Indica se o usuário está autenticado */
  isAuthenticated: boolean;
  /** Indica se o usuário tem uma comunidade selecionada */
  hasCommunity: boolean;
  /** Realiza login */
  signIn: (data: LoginData) => Promise<void>;
  /** Realiza logout */
  signOut: () => Promise<void>;
  /** Registra novo usuário */
  register: (data: RegisterData) => Promise<void>;
  /** Atualiza dados do usuário no contexto */
  updateUser: (user: User) => Promise<void>;
  /** Atualiza a comunidade do usuário */
  updateCommunity: (communityId: string) => Promise<void>;
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

  // ============================================
  // FUNÇÕES
  // ============================================

  /**
   * Realiza login do usuário
   */
  const signIn = useCallback(async (data: LoginData): Promise<void> => {
    try {
      const response: AuthResponse = await authService.login(data);
      setUser(response.user);
    } catch (error) {
      // Re-throw para que o componente possa tratar
      throw error;
    }
  }, []);

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
  const updateCommunity = useCallback(async (communityId: string): Promise<void> => {
    if (!user) {
      throw new Error('Usuário não autenticado');
    }

    try {
      const updatedUser = await authService.updateCommunity(user.id, communityId);
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
