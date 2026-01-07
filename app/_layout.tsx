import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { View, ActivityIndicator, StatusBar } from 'react-native';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { ThemeProvider, useTheme } from '../src/context/ThemeContext';
import { NotificationProvider } from '../src/context/NotificationContext';

// Componente interno que gerencia a navegação baseada no estado de autenticação
function RootLayoutNav() {
  const { user, isLoading, isAuthenticated, hasCommunity } = useAuth();
  const { colors, isDark } = useTheme();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inSelectCommunity = segments[0] === 'select-community';

    if (!isAuthenticated) {
      // Usuário não autenticado - deve estar em (auth)
      if (!inAuthGroup) {
        router.replace('/(auth)/login');
      }
    } else {
      // Usuário autenticado
      if (inAuthGroup) {
        // Se está em auth, redireciona baseado no hasCommunity
        if (hasCommunity) {
          router.replace('/(tabs)');
        } else {
          router.replace('/select-community');
        }
      } else if (!hasCommunity && !inSelectCommunity) {
        // Se não tem communityId e não está no wizard, vai para o wizard
        router.replace('/select-community');
      } else if (hasCommunity && inSelectCommunity) {
        // Se tem communityId e está no wizard, vai para as tabs
        router.replace('/(tabs)');
      }
      // Se já está nas tabs com communityId, não faz nada
    }
  }, [isAuthenticated, hasCommunity, isLoading, segments]);

  // Mostra loading enquanto carrega o estado de autenticação
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="select-community" />
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
}

// Componente que envolve o RootLayoutNav com o NotificationProvider
// O NotificationProvider precisa estar dentro do AuthProvider para ter acesso ao user
function RootLayoutWithNotifications() {
  return (
    <NotificationProvider>
      <RootLayoutNav />
    </NotificationProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RootLayoutWithNotifications />
      </AuthProvider>
    </ThemeProvider>
  );
}
