import React, { createContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authService } from '@/services/auth.service';
import type { User, LoginRequest, RegisterRequest } from '@/types';

interface AuthContextData {
  user: User | null;
  loading: boolean;
  signIn: (credentials: LoginRequest) => Promise<void>;
  signUp: (data: RegisterRequest) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextData>({} as AuthContextData);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStoredData();
  }, []);

  async function loadStoredData() {
    try {
      const [storedUser, accessToken] = await AsyncStorage.multiGet([
        'user',
        'accessToken',
      ]);

      if (storedUser[1] && accessToken[1]) {
        setUser(JSON.parse(storedUser[1]));
      }
    } catch (error) {
      console.error('Error loading stored data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function signIn(credentials: LoginRequest) {
    try {
      const response = await authService.login(credentials);
      
      await AsyncStorage.multiSet([
        ['user', JSON.stringify(response.user)],
        ['accessToken', response.accessToken],
        ['refreshToken', response.refreshToken],
      ]);

      setUser(response.user);
    } catch (error) {
      console.error('Error signing in:', error);
      throw error;
    }
  }

  async function signUp(data: RegisterRequest) {
    try {
      const response = await authService.register(data);
      
      await AsyncStorage.multiSet([
        ['user', JSON.stringify(response.user)],
        ['accessToken', response.accessToken],
        ['refreshToken', response.refreshToken],
      ]);

      setUser(response.user);
    } catch (error) {
      console.error('Error signing up:', error);
      throw error;
    }
  }

  async function signOut() {
    try {
      await authService.logout();
    } catch (error) {
      console.error('Error logging out:', error);
    } finally {
      await AsyncStorage.multiRemove(['user', 'accessToken', 'refreshToken']);
      setUser(null);
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

