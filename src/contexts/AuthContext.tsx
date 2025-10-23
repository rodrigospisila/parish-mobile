import React, { createContext, useState, useContext, useEffect } from 'react';
import { authService, LoginCredentials, RegisterData } from '../services/auth';

interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
}

interface AuthContextData {
  user: User | null;
  loading: boolean;
  signIn: (credentials: LoginCredentials) => Promise<void>;
  signUp: (data: RegisterData) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStoredData();
  }, []);

  async function loadStoredData() {
    try {
      const storedUser = await authService.getStoredUser();
      const storedToken = await authService.getStoredToken();

      if (storedUser && storedToken) {
        setUser(storedUser);
      }
    } catch (error) {
      console.error('Erro ao carregar dados armazenados:', error);
    } finally {
      setLoading(false);
    }
  }

  async function signIn(credentials: LoginCredentials) {
    try {
      const response = await authService.login(credentials);
      setUser(response.user);
    } catch (error) {
      throw error;
    }
  }

  async function signUp(data: RegisterData) {
    try {
      const response = await authService.register(data);
      setUser(response.user);
    } catch (error) {
      throw error;
    }
  }

  async function signOut() {
    try {
      await authService.logout();
      setUser(null);
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }

  return context;
}

