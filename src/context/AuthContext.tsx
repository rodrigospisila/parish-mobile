import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, authService } from '../services/authService';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (data: any) => Promise<void>;
  signOut: () => Promise<void>;
  register: (data: any) => Promise<void>;
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Este é o componente que gerencia o estado de autenticação
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Carregar usuário do AsyncStorage
  useEffect(() => {
    const loadUser = async () => {
      try {
        const storedUser = await AsyncStorage.getItem('user');
        if (storedUser) {
          setUser(JSON.parse(storedUser));
        }
      } catch (e) {
        console.error('Failed to load user from storage', e);
      } finally {
        setIsLoading(false);
      }
    };
    loadUser();
  }, []);

  const signIn = async (data: any) => {
    const loggedUser = await authService.login(data);
    setUser(loggedUser);
    await AsyncStorage.setItem('user', JSON.stringify(loggedUser));
    // Navegação é gerenciada pelo _layout.tsx
  };

  const register = async (data: any) => {
    const registeredUser = await authService.register(data);
    setUser(registeredUser);
    await AsyncStorage.setItem('user', JSON.stringify(registeredUser));
    // Navegação é gerenciada pelo _layout.tsx
  };

  const signOut = async () => {
    setUser(null);
    await AsyncStorage.removeItem('user');
    // Navegação é gerenciada pelo _layout.tsx
  };
  
  const updateUser = (updatedUser: User) => {
    setUser(updatedUser);
    AsyncStorage.setItem('user', JSON.stringify(updatedUser));
    // Navegação é gerenciada pelo _layout.tsx
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        signIn,
        signOut,
        register,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
