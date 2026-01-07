import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import {
  NotificationSettings,
  requestNotificationPermissions,
  loadNotificationSettings,
  saveNotificationSettings,
  scheduleNotificationsForEvents,
  cancelAllNotifications,
  getScheduledNotifications,
  sendTestNotification,
} from '../services/notificationService';
import { getCommunityEvents } from '../services/eventService';
import { useAuth } from './AuthContext';

interface NotificationContextData {
  settings: NotificationSettings;
  isPermissionGranted: boolean;
  scheduledCount: number;
  updateSettings: (newSettings: Partial<NotificationSettings>) => Promise<void>;
  refreshScheduledNotifications: () => Promise<void>;
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

  const notificationListener = useRef<Notifications.EventSubscription>();
  const responseListener = useRef<Notifications.EventSubscription>();

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
      
      if (data?.eventId) {
        // Navegar para o calendário quando clicar na notificação
        router.push('/(tabs)/calendar');
      }
    });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  // Reagendar notificações quando o usuário ou configurações mudam
  useEffect(() => {
    const scheduleNotifications = async () => {
      if (!user?.communityId || !settings.enabled) {
        return;
      }

      try {
        // Cancelar notificações antigas
        await cancelAllNotifications();

        // Buscar eventos futuros
        const events = await getCommunityEvents(user.communityId);
        
        // Filtrar apenas eventos futuros
        const futureEvents = events.filter((event) => new Date(event.date) > new Date());

        // Agendar novas notificações
        await scheduleNotificationsForEvents(futureEvents);

        // Atualizar contagem
        const scheduled = await getScheduledNotifications();
        setScheduledCount(scheduled.length);
      } catch (error) {
        console.error('Erro ao agendar notificações:', error);
      }
    };

    if (isPermissionGranted && settings.enabled) {
      scheduleNotifications();
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
