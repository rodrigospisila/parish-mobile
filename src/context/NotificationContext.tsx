import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import {
  NotificationSettings,
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
  const router = useRouter();
  const [settings, setSettings] = useState<NotificationSettings>({
    enabled: true,
    eventReminders: true,
    rosterReminders: true,
    reminderTime: 60,
  });
  const [isPermissionGranted, setIsPermissionGranted] = useState(false);
  const [scheduledCount, setScheduledCount] = useState(0);

  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);
  const pushTokenListener = useRef<Notifications.EventSubscription | null>(null);

  // Inicialização
  useEffect(() => {
    const initialize = async () => {
      // Carregar configurações salvas
      const savedSettings = await loadNotificationSettings();
      setSettings(savedSettings);

      // Solicitar permissões
      const granted = await requestNotificationPermissions();
      setIsPermissionGranted(granted);

      // Contar notificações agendadas
      const scheduled = await getScheduledNotifications();
      setScheduledCount(scheduled.length);
    };

    initialize();

    // Listener para notificações recebidas enquanto o app está aberto
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      console.log('Notificação recebida:', notification);
    });

    // Listener para quando o usuário interage com a notificação
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      const kind = typeof data?.kind === 'string' ? data.kind : '';

      if (kind.startsWith('tithe')) {
        // Dízimo e ofertas (tithe-campaign, tithe-confirmed, tithe-schedule, tithe-charge, tithe-reminder,
        // tithe-declared…): a tela do dízimo já mostra campanhas, Pix e histórico — abre direto nela
        router.push('/tithe');
      } else if (data?.scheduleId) {
        // Recusa/substituicao/cancelamento de escala: leva direto para a operacao da escala
        router.push({
          pathname: '/coordination/[scheduleId]',
          params: { scheduleId: String(data.scheduleId) },
        });
      } else if (data?.eventId) {
        // Navegar para o calendário quando clicar na notificação
        router.push('/(tabs)/calendar');
      }
    });

    // Token de push pode rotacionar (reinstalacao, troca de credenciais do dispositivo etc.)
    pushTokenListener.current = Notifications.addPushTokenListener(() => {
      registerPushTokenWithBackend();
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
      pushTokenListener.current?.remove();
    };
  }, []);

  // Envia o token de push atual do dispositivo para o backend (best-effort)
  const registerPushTokenWithBackend = async () => {
    if (!user?.id) {
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
      console.error('Erro ao agendar notificacoes:', error);
    }
  };

  useEffect(() => {
    if (isPermissionGranted && settings.enabled) {
      rescheduleEventNotifications();
    }
  }, [user?.communityId, settings.enabled, settings.eventReminders, settings.reminderTime, isPermissionGranted]);

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
