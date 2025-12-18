import { router, useSegments, useRootNavigationState } from 'expo-router';
import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
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
  const navigationState = useRootNavigationState();
  const hasNavigated = useRef(false);

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
    hasNavigated.current = false; // Reset para permitir nova navegação
  };

  const register = async (data: any) => {
    const registeredUser = await authService.register(data);
    setUser(registeredUser);
    await AsyncStorage.setItem('user', JSON.stringify(registeredUser));
    hasNavigated.current = false; // Reset para permitir nova navegação
  };

  const signOut = async () => {
    setUser(null);
    await AsyncStorage.removeItem('user');
    hasNavigated.current = false; // Reset para permitir nova navegação
    router.replace('/(auth)/login');
  };
  
  const updateUser = (updatedUser: User) => {
    setUser(updatedUser);
    AsyncStorage.setItem('user', JSON.stringify(updatedUser));
    hasNavigated.current = false; // Reset para permitir nova navegação após atualização
  };

  // Lógica de redirecionamento - executa apenas uma vez por mudança de estado
  useEffect(() => {
    // Aguarda o estado de navegação estar pronto
    if (!navigationState?.key) return;
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inSelectCommunity = segments[0] === 'select-community';

    // Evita navegação duplicada
    if (hasNavigated.current) return;

    if (user) {
      // Usuário logado
      if (inAuthGroup) {
        // Se estiver no grupo de autenticação, redireciona
        hasNavigated.current = true;
        if (!user.communityId) {
          router.replace('/select-community');
        } else {
          router.replace('/(tabs)');
        }
      } else if (!user.communityId && !inSelectCommunity) {
        // Se não tiver communityId e não estiver no wizard, redireciona para o wizard
        hasNavigated.current = true;
        router.replace('/select-community');
      }
      // Se já estiver nas tabs ou no select-community, não faz nada
    } else {
      // Usuário deslogado
      if (!inAuthGroup) {
        hasNavigated.current = true;
        router.replace('/(auth)/login');
      }
    }
  }, [user, isLoading, segments, navigationState?.key]);

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
