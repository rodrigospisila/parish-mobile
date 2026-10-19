import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useRootNavigationState, useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { canCoordinateSchedules } from '../utils/pastoralCoordination';
import { resolveNotificationRoute } from '../utils/notificationRoute';

/** Último toque já tratado (entre aberturas: o Android repete a "última resposta"). */
const LAST_HANDLED_KEY = '@parish:notification:lastHandled';
/** Toque feito sem sessão (login pela frente): vale por 15 minutos. */
const PENDING_TTL_MS = 15 * 60 * 1000;

/** Toques já vistos nesta execução — o cold start e o ouvinte podem entregar o mesmo. */
const seen = new Set<string>();

type Pending = { key: string; data: Record<string, unknown> | null; title: string | null; at: number };

const keyOf = (response: Notifications.NotificationResponse) =>
  `${response.notification.request.identifier}:${response.actionIdentifier}`;

/**
 * Leva o toque na notificação à tela certa (ux-app-01/02/28, eng-qualidade-11).
 *
 * - App aberto ou em segundo plano: ouvinte de resposta;
 * - App fechado (cold start): `getLastNotificationResponse()` na montagem;
 * - Os dois podem entregar o MESMO toque: a chave (id + ação) garante uma
 *   navegação só, e a última chave tratada fica gravada para a próxima
 *   abertura não repetir;
 * - Só navega com a sessão pronta (`ready`: logado, com comunidade, fora do
 *   login/troca de senha) e o navegador raiz montado; antes disso o toque
 *   fica pendente.
 */
export default function NotificationResponseRouter({ ready }: { ready: boolean }) {
  const router = useRouter();
  const { user } = useAuth();
  const navigationState = useRootNavigationState();
  const pending = useRef<Pending | null>(null);
  const [tick, setTick] = useState(0);

  const enqueue = useCallback(async (response: Notifications.NotificationResponse | null) => {
    if (!response) return;
    const key = keyOf(response);
    if (seen.has(key)) return;
    seen.add(key);
    try {
      if ((await AsyncStorage.getItem(LAST_HANDLED_KEY)) === key) return;
    } catch {
      // sem storage: segue (a chave em memória já evita repetir nesta execução)
    }
    const content = response.notification.request.content;
    pending.current = {
      key,
      data: (content.data as Record<string, unknown> | null) ?? null,
      title: content.title ?? null,
      at: Date.now(),
    };
    setTick((value) => value + 1);
  }, []);

  useEffect(() => {
    // Cold start: o toque que abriu o app
    try {
      void enqueue(Notifications.getLastNotificationResponse());
    } catch {
      // módulo nativo sem a API síncrona: o ouvinte abaixo ainda cobre o app aberto
    }
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      void enqueue(response);
    });
    return () => subscription.remove();
  }, [enqueue]);

  useEffect(() => {
    const item = pending.current;
    if (!item || !ready || !navigationState?.key) return;
    pending.current = null;
    if (Date.now() - item.at > PENDING_TTL_MS) return;

    AsyncStorage.setItem(LAST_HANDLED_KEY, item.key).catch(() => undefined);
    try {
      Notifications.clearLastNotificationResponse();
    } catch {
      // opcional
    }

    const target = resolveNotificationRoute(item.data, {
      title: item.title,
      canCoordinate: canCoordinateSchedules(user),
    });
    if (target) router.push(target);
  }, [tick, ready, navigationState?.key, user, router]);

  return null;
}
