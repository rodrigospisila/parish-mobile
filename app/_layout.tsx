import { Stack, useRouter, useSegments, type ErrorBoundaryProps } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, StatusBar, AppState, Text, TouchableOpacity, useColorScheme } from 'react-native';
import { useFonts } from 'expo-font';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { ThemeProvider, useTheme } from '../src/context/ThemeContext';
import { NotificationProvider } from '../src/context/NotificationContext';
import { CommunityProvider, useCommunity } from '../src/context/CommunityContext';
import { EntitlementsProvider } from '../src/context/EntitlementsContext';
import { flushWriteQueue } from '../src/utils/offlineQueue';
import { applyGlobalFont } from '../src/utils/globalFont';
import { consumePostLoginRoute } from '../src/utils/postLoginRoute';
// Plano da comunidade: aviso amigável no 403 PLAN_REQUIRED (interceptor)
import '../src/services/planService';
import TermsAcceptanceGate from '../src/components/TermsAcceptanceGate';
import NotificationPrimer from '../src/components/NotificationPrimer';
import NotificationResponseRouter from '../src/components/NotificationResponseRouter';
import AppVersionGate from '../src/components/AppVersionGate';
import { track } from '../src/services/analytics';

// Instala o mapeamento peso→Nunito Sans antes de qualquer render de texto.
applyGlobalFont();

/**
 * Rotas abertas a quem não está logado (primeiro segmento da URL): o mapa das
 * igrejas e a página pública da comunidade. Nelas o guard não redireciona —
 * nem para o login, nem para o wizard de comunidade.
 */
const PUBLIC_SEGMENTS = new Set(['nearby-masses', 'comunidade']);

/** Telas em que um toque de notificação ainda não pode navegar (sessão incompleta). */
const NOT_READY_SEGMENTS = new Set(['(auth)', 'select-community', 'change-password']);

/** Volta ao app depois disto em segundo plano conta como nova abertura (app_open). */
const NEW_SESSION_AFTER_MS = 30 * 60_000;

/**
 * Tela de erro do app inteiro (eng-qualidade-03): uma exceção de render vira
 * esta tela com "Tentar de novo" em vez de app fechado/tela branca. Fica fora
 * dos providers (tema/sessão podem ser a origem do erro): cores próprias.
 *
 * TODO(Sentry): quando entrar @sentry/react-native (exige build nativa), enviar
 * `error` aqui (Sentry.captureException) e mostrar o id do evento ao usuário.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const dark = useColorScheme() === 'dark';
  const bg = dark ? '#090B0E' : '#F5F7FA';
  const fg = dark ? '#F7F9FB' : '#151A20';
  const muted = dark ? '#AEB6C1' : '#52606D';
  return (
    <View style={{ flex: 1, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', padding: 28 }}>
      <Text style={{ fontSize: 20, fontWeight: '800', color: fg, textAlign: 'center', marginBottom: 10 }}>
        Algo deu errado
      </Text>
      <Text style={{ fontSize: 15, lineHeight: 21, color: muted, textAlign: 'center', marginBottom: 22 }}>
        O Parish encontrou um problema nesta tela. Tente de novo; se continuar, feche e abra o app.
      </Text>
      {__DEV__ ? (
        <Text style={{ fontSize: 12, color: muted, textAlign: 'center', marginBottom: 18 }}>{error?.message}</Text>
      ) : null}
      <TouchableOpacity
        onPress={() => void retry()}
        accessibilityRole="button"
        style={{ backgroundColor: dark ? '#0A84FF' : '#075AA9', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28 }}
      >
        <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '800' }}>Tentar de novo</Text>
      </TouchableOpacity>
    </View>
  );
}

// Componente interno que gerencia a navegação baseada no estado de autenticação
function RootLayoutNav() {
  const { user, isLoading, isAuthenticated, hasCommunity } = useAuth();
  const { colors, isDark } = useTheme();
  const segments = useSegments();
  const router = useRouter();
  /** Aceite dos termos resolvido (sem aviso bloqueante na frente) */
  const [termsClear, setTermsClear] = useState(false);
  const { activeCommunityId } = useCommunity();

  // Telemetria (C4): app_open na abertura e na volta depois de 30 min fora,
  // com a comunidade ativa (ou a principal, antes da hidratação dos vínculos)
  const openCommunityRef = useRef<string | null>(null);
  openCommunityRef.current = activeCommunityId ?? user?.communityId ?? null;
  const openTrackedRef = useRef(false);
  useEffect(() => {
    if (isLoading || openTrackedRef.current) return;
    openTrackedRef.current = true;
    track('app_open', { communityId: openCommunityRef.current });
  }, [isLoading]);
  useEffect(() => {
    let backgroundAt = 0;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        backgroundAt = Date.now();
      } else if (state === 'active' && backgroundAt) {
        if (Date.now() - backgroundAt > NEW_SESSION_AFTER_MS) {
          track('app_open', { communityId: openCommunityRef.current });
        }
        backgroundAt = 0;
      }
    });
    return () => subscription.remove();
  }, []);

  // Fila de escritas offline (4.7): tenta sincronizar ao abrir o app e
  // sempre que ele volta ao primeiro plano (momento típico de reconexão).
  useEffect(() => {
    if (!isAuthenticated) return;

    flushWriteQueue().catch(() => undefined);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        flushWriteQueue().catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, [isAuthenticated]);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inSelectCommunity = segments[0] === 'select-community';
    const inPublicRoute = PUBLIC_SEGMENTS.has(segments[0] as string);

    if (!isAuthenticated) {
      // Usuário não autenticado - deve estar em (auth) ou numa rota pública
      if (!inAuthGroup && !inPublicRoute) {
        router.replace('/(auth)/login');
      }
    } else if (user?.forcePasswordChange) {
      // Senha definida pela secretaria (conta nova/redefinida): troca antes de tudo (M18)
      if ((segments[0] as string) !== 'change-password') {
        router.replace('/change-password' as never);
      }
    } else {
      // Usuário autenticado
      if (inAuthGroup) {
        // Entrou a partir de uma tela pública (ex.: "Sugerir correção"):
        // volta para ela (tirando o login da pilha) em vez de ir para a Home.
        // dismissTo reaproveita a tela que ficou embaixo, com o texto digitado.
        const returnTo = consumePostLoginRoute();
        if (returnTo && hasCommunity) {
          router.dismissTo(returnTo as never);
        } else if (hasCommunity) {
          router.replace('/(tabs)');
        } else {
          router.replace('/select-community');
        }
      } else if (inPublicRoute) {
        // Rota pública: nunca força o wizard de comunidade
      } else if (!hasCommunity && !inSelectCommunity) {
        // Se não tem communityId e não está no wizard, vai para o wizard
        router.replace('/select-community');
      } else if (hasCommunity && inSelectCommunity) {
        // Se tem communityId e está no wizard, vai para as tabs
        router.replace('/(tabs)');
      }
      // Se já está nas tabs com communityId, não faz nada
    }
  }, [isAuthenticated, hasCommunity, isLoading, segments, user?.forcePasswordChange]);

  // Sessão completa: logado, com comunidade e fora do login/assistente/troca de senha
  const sessionReady =
    isAuthenticated &&
    hasCommunity &&
    !user?.forcePasswordChange &&
    !NOT_READY_SEGMENTS.has(segments[0] as string);
  // Dentro das abas (a raiz "/" também é o Início)
  const inTabs = segments[0] === '(tabs)' || (segments as string[]).length === 0;

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
      {/* Aceite dos termos vigentes (M3/M4): bloqueia até aceitar */}
      <TermsAcceptanceGate onClearChange={setTermsClear} />
      {/* Toque em notificação (app aberto ou a frio) → tela certa */}
      <NotificationResponseRouter ready={sessionReady} />
      {/* Convite para os avisos: só dentro do app, depois dos termos */}
      <NotificationPrimer enabled={sessionReady && termsClear && inTabs} />
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
  const [fontsLoaded, fontError] = useFonts({
    NunitoSans_400Regular: require('../assets/fonts/NunitoSans-Regular.ttf'),
    NunitoSans_600SemiBold: require('../assets/fonts/NunitoSans-SemiBold.ttf'),
    NunitoSans_700Bold: require('../assets/fonts/NunitoSans-Bold.ttf'),
    NunitoSans_800ExtraBold: require('../assets/fonts/NunitoSans-ExtraBold.ttf'),
  });

  // Aguarda as fontes (ou segue caso falhem, para não travar o app)
  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0B1C2C' }}>
        <ActivityIndicator size="large" color="#0A84FF" />
      </View>
    );
  }

  return (
    <ThemeProvider>
      {/* Versão mínima (C4): bloqueia o app inteiro quando a versão não é mais suportada */}
      <AppVersionGate>
        <AuthProvider>
          <CommunityProvider>
            <EntitlementsProvider>
              <RootLayoutWithNotifications />
            </EntitlementsProvider>
          </CommunityProvider>
        </AuthProvider>
      </AppVersionGate>
    </ThemeProvider>
  );
}
