import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { AuthProvider, useAuth } from '../src/context/AuthContext';

// Componente interno que gerencia a navegação baseada no estado de autenticação
function RootLayoutNav() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inSelectCommunity = segments[0] === 'select-community';

    if (!user) {
      // Usuário não autenticado - deve estar em (auth)
      if (!inAuthGroup) {
        router.replace('/(auth)/login');
      }
    } else {
      // Usuário autenticado
      if (inAuthGroup) {
        // Se está em auth, redireciona baseado no communityId
        if (user.communityId) {
          router.replace('/(tabs)');
        } else {
          router.replace('/select-community');
        }
      } else if (!user.communityId && !inSelectCommunity) {
        // Se não tem communityId e não está no wizard, vai para o wizard
        router.replace('/select-community');
      }
      // Se já está nas tabs ou no select-community com communityId, não faz nada
    }
  }, [user, isLoading, segments]);

  // Mostra loading enquanto carrega o estado de autenticação
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="select-community" />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
