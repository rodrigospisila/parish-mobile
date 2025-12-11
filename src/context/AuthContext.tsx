import { router, useSegments } from 'expo-router';
import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, authService } from '../services/authService';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
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
  const segments = useSegments();

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
  };

  const register = async (data: any) => {
    const registeredUser = await authService.register(data);
    setUser(registeredUser);
    await AsyncStorage.setItem('user', JSON.stringify(registeredUser));
  };

  const signOut = async () => {
    setUser(null);
    await AsyncStorage.removeItem('user');
    router.replace('/(auth)/login');
  };
  
  const updateUser = (updatedUser: User) => {
    setUser(updatedUser);
    AsyncStorage.setItem('user', JSON.stringify(updatedUser));
  };

  // Lógica de redirecionamento
  useEffect(() => {
    if (!isLoading) {
      const inAuthGroup = segments[0] === '(auth)';
      const inTabsGroup = segments[0] === '(tabs)';
      const inSelectCommunity = segments[0] === 'select-community';

      if (user) {
        // Usuário logado
        if (inAuthGroup) {
          // Se estiver no grupo de autenticação, redireciona para a Home
          router.replace('/(tabs)');
        } else if (!user.communityId && !inSelectCommunity) {
          // Se não tiver communityId e não estiver no wizard, redireciona para o wizard
          router.replace('/select-community');
        } else if (user.communityId && !inTabsGroup && !inSelectCommunity) {
          // Se tiver communityId e não estiver nas tabs, redireciona para a Home
          router.replace('/(tabs)');
        }
      } else if (!user && !inAuthGroup) {
        // Usuário deslogado e não está no grupo de autenticação, redireciona para o Login
        router.replace('/(auth)/login');
      }
    }
  }, [user, isLoading, segments]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
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
