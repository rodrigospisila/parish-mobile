import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, ThemeColors, ThemeName } from '../constants/Colors';

const THEME_STORAGE_KEY = '@parish_theme';

interface ThemeContextType {
  theme: ThemeName;
  isDark: boolean;
  colors: ThemeColors;
  setTheme: (theme: ThemeName) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

// Hook simplificado para acessar apenas as cores
export function useColors(): ThemeColors {
  const { colors } = useTheme();
  return colors;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [theme, setThemeState] = useState<ThemeName>('system');
  const [isLoading, setIsLoading] = useState(true);

  // Carregar preferência de tema do AsyncStorage
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (savedTheme && ['light', 'dark', 'system'].includes(savedTheme)) {
          setThemeState(savedTheme as ThemeName);
        }
      } catch (e) {
        console.error('Failed to load theme preference', e);
      } finally {
        setIsLoading(false);
      }
    };
    loadTheme();
  }, []);

  // Determinar se está no modo escuro
  const isDark = theme === 'system' 
    ? systemColorScheme === 'dark' 
    : theme === 'dark';

  // Obter as cores baseadas no tema atual
  const colors = isDark ? Colors.dark : Colors.light;

  // Função para alterar o tema
  const setTheme = async (newTheme: ThemeName) => {
    setThemeState(newTheme);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch (e) {
      console.error('Failed to save theme preference', e);
    }
  };

  // Função para alternar entre light e dark (ignora system)
  const toggleTheme = () => {
    const newTheme = isDark ? 'light' : 'dark';
    setTheme(newTheme);
  };

  // Não renderizar até carregar a preferência
  if (isLoading) {
    return null;
  }

  return (
    <ThemeContext.Provider
      value={{
        theme,
        isDark,
        colors,
        setTheme,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
