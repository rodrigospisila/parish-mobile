import { router, useSegments, useRootNavigationState } from 'expo-router';
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
  const navigationState = useRootNavigationState();

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
    
    // Navegação direta após login bem-sucedido
    if (loggedUser.communityId) {
      router.replace('/(tabs)');
    } else {
      router.replace('/select-community');
    }
  };

  const register = async (data: any) => {
    const registeredUser = await authService.register(data);
    setUser(registeredUser);
    await AsyncStorage.setItem('user', JSON.stringify(registeredUser));
    
    // Novo usuário sempre vai para seleção de comunidade
    router.replace('/select-community');
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

  // Lógica de redirecionamento apenas para carregamento inicial (restore session)
  useEffect(() => {
    // Aguarda o estado de navegação estar pronto
    if (!navigationState?.key) return;
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inSelectCommunity = segments[0] === 'select-community';
    const inTabsGroup = segments[0] === '(tabs)';

    // Apenas redireciona em casos específicos de restauração de sessão
    if (user) {
      // Usuário logado - se estiver na tela de auth, redireciona
      if (inAuthGroup) {
        if (user.communityId) {
          router.replace('/(tabs)');
        } else {
          router.replace('/select-community');
        }
      }
    } else {
      // Usuário deslogado - se não estiver na tela de auth, redireciona
      if (!inAuthGroup) {
        router.replace('/(auth)/login');
      }
    }
  }, [isLoading, navigationState?.key]); // Removido 'user' e 'segments' para evitar loops

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
