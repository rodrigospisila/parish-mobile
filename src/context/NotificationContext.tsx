import React, { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from 'react';
import { AppState, Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  NotificationSettings,
  NotificationPermissionState,
  getNotificationPermissionState,
  requestNotificationPermissions,
  loadNotificationSettings,
  saveNotificationSettings,
  scheduleNotificationsForEvents,
  scheduleNotificationsForMassSchedules,
  cancelAllNotifications,
  getScheduledNotifications,
  sendTestNotification,
  getPushToken,
} from '../services/notificationService';
import { getFavoriteEvents } from '../services/eventService';
import { getFavoriteMassSchedules } from '../services/massScheduleService';
import { authService } from '../services/authService';
import { useAuth } from './AuthContext';

interface NotificationContextData {
  settings: NotificationSettings;
  isPermissionGranted: boolean;
  /** Estado real da permissão do sistema (undetermined = nunca perguntado) */
  permissionStatus: NotificationPermissionState;
  /** A primeira consulta ao sistema já respondeu (antes disso o estado é provisório) */
  permissionChecked: boolean;
  /** false quando o sistema não deixa perguntar de novo (só pelos Ajustes) */
  canAskPermissionAgain: boolean;
  /** Abre o diálogo do sistema — só depois da explicação do app ou de um gesto do usuário */
  requestPermission: () => Promise<boolean>;
  /** Ajustes do aparelho (permissão negada antes) */
  openSystemSettings: () => void;
  scheduledCount: number;
  updateSettings: (newSettings: Partial<NotificationSettings>) => Promise<void>;
  refreshScheduledNotifications: () => Promise<void>;
  rescheduleEventNotifications: () => Promise<void>;
  testNotification: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextData>({} as NotificationContextData);

interface NotificationProviderProps {
  children: ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<NotificationSettings>({
    enabled: true,
    eventReminders: true,
    rosterReminders: true,
    reminderTime: 60,
  });
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermissionState>('undetermined');
  const [canAskPermissionAgain, setCanAskPermissionAgain] = useState(true);
  const [permissionChecked, setPermissionChecked] = useState(false);
  const isPermissionGranted = permissionStatus === 'granted';
  const [scheduledCount, setScheduledCount] = useState(0);

  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const pushTokenListener = useRef<Notifications.EventSubscription | null>(null);
  /**
   * Conta logada para o ouvinte de token rotacionado: o efeito abaixo roda uma
   * vez só e fecharia sobre user=null (M42) — o token novo nunca seria enviado.
   */
  const userIdRef = useRef<string | null>(user?.id ?? null);
  userIdRef.current = user?.id ?? null;

  // Inicialização
  useEffect(() => {
    const initialize = async () => {
      // Carregar configurações salvas
      const savedSettings = await loadNotificationSettings();
      setSettings(savedSettings);

      // Só CONSULTA a permissão: o pedido ao sistema fica para depois do
      // login, com a explicação do app (NotificationPrimer) — no primeiro
      // segundo, antes de entender o app, a pessoa negava e no iOS não há volta
      await refreshPermission();

      // Contar notificações agendadas
      const scheduled = await getScheduledNotifications();
      setScheduledCount(scheduled.length);
    };

    initialize();

    // Listener para notificações recebidas enquanto o app está aberto
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      console.log('Notificação recebida:', notification);
    });

    // O toque na notificação (app aberto ou a frio) é tratado pelo
    // NotificationResponseRouter, montado no layout depois da sessão pronta

    // Token de push pode rotacionar (reinstalacao, troca de credenciais do dispositivo etc.)
    pushTokenListener.current = Notifications.addPushTokenListener(() => {
      registerPushTokenWithBackend().catch(() => undefined);
    });

    return () => {
      notificationListener.current?.remove();
      pushTokenListener.current?.remove();
    };
  }, []);

  const refreshPermission = useCallback(async () => {
    const state = await getNotificationPermissionState();
    setPermissionStatus(state.status);
    setCanAskPermissionAgain(state.canAskAgain);
    setPermissionChecked(true);
    return state.status;
  }, []);

  // Permissão mudada nos Ajustes do aparelho: relê ao voltar para o app
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshPermission();
    });
    return () => subscription.remove();
  }, [refreshPermission]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    let granted = false;
    try {
      granted = await requestNotificationPermissions();
    } catch {
      granted = false;
    }
    await refreshPermission();
    return granted;
  }, [refreshPermission]);

  const openSystemSettings = useCallback(() => {
    Linking.openSettings().catch(() => undefined);
  }, []);

  // Envia o token de push atual do dispositivo para o backend (best-effort)
  const registerPushTokenWithBackend = async () => {
    if (!userIdRef.current) {
      return;
    }

    const token = await getPushToken();
    if (token) {
      await authService.registerPushToken(token);
    }
  };

  // Registra o push token assim que ha permissao concedida e usuario logado
  useEffect(() => {
    if (isPermissionGranted && user?.id) {
      registerPushTokenWithBackend();
    }
  }, [isPermissionGranted, user?.id]);

  // Reagendar notificações quando o usuário ou configurações mudam
  const rescheduleEventNotifications = async () => {
    if (!user?.communityId || !settings.enabled || !isPermissionGranted) {
      return;
    }

    try {
      await cancelAllNotifications();

      const [favorites, favoriteMassSchedules] = await Promise.all([
        getFavoriteEvents(),
        getFavoriteMassSchedules(),
      ]);
      const futureEvents = favorites.filter((event) => new Date(event.startDate) > new Date());

      await scheduleNotificationsForEvents(futureEvents);
      await scheduleNotificationsForMassSchedules(favoriteMassSchedules);

      const scheduled = await getScheduledNotifications();
      setScheduledCount(scheduled.length);
    } catch (error) {
      console.error('Erro ao agendar notificações:', error);
    }
  };

  useEffect(() => {
    if (isPermissionGranted && settings.enabled) {
      rescheduleEventNotifications();
    }
    // user?.id: outra conta na mesma comunidade também refaz os lembretes (B24)
  }, [user?.id, user?.communityId, settings.enabled, settings.eventReminders, settings.reminderTime, isPermissionGranted]);

  const updateSettings = async (newSettings: Partial<NotificationSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    await saveNotificationSettings(updated);

    // Se desabilitar notificações, cancelar todas
    if (newSettings.enabled === false) {
      await cancelAllNotifications();
      setScheduledCount(0);
    }
  };

  const refreshScheduledNotifications = async () => {
    const scheduled = await getScheduledNotifications();
    setScheduledCount(scheduled.length);
  };

  const testNotification = async () => {
    await sendTestNotification();
  };

  return (
    <NotificationContext.Provider
      value={{
        settings,
        isPermissionGranted,
        permissionStatus,
        permissionChecked,
        canAskPermissionAgain,
        requestPermission,
        openSystemSettings,
        scheduledCount,
        updateSettings,
        refreshScheduledNotifications,
        rescheduleEventNotifications,
        testNotification,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications deve ser usado dentro de um NotificationProvider');
  }
  return context;
}
