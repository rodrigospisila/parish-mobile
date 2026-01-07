import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Event } from './eventService';

// Chaves para AsyncStorage
const NOTIFICATION_SETTINGS_KEY = '@parish_notification_settings';
const SCHEDULED_NOTIFICATIONS_KEY = '@parish_scheduled_notifications';

// Configuração padrão de como as notificações são exibidas
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Interface para configurações de notificação
export interface NotificationSettings {
  enabled: boolean;
  eventReminders: boolean;
  rosterReminders: boolean;
  reminderTime: number; // minutos antes do evento (ex: 60 = 1 hora antes)
}

// Configurações padrão
const defaultSettings: NotificationSettings = {
  enabled: true,
  eventReminders: true,
  rosterReminders: true,
  reminderTime: 60, // 1 hora antes
};

// Interface para notificação agendada
interface ScheduledNotification {
  id: string;
  eventId: string;
  scheduledTime: string;
}

/**
 * Solicita permissão para enviar notificações
 */
export const requestNotificationPermissions = async (): Promise<boolean> => {
  if (!Device.isDevice) {
    console.log('Notificações push não funcionam em emuladores');
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Permissão para notificações não concedida');
    return false;
  }

  // Configuração específica para Android
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Padrão',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2196F3',
    });

    await Notifications.setNotificationChannelAsync('events', {
      name: 'Eventos',
      description: 'Lembretes de eventos da comunidade',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2196F3',
    });

    await Notifications.setNotificationChannelAsync('rosters', {
      name: 'Escalas',
      description: 'Lembretes de escalas de serviço',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF9800',
    });
  }

  return true;
};

/**
 * Obtém o token de push notification (para notificações remotas)
 */
export const getPushToken = async (): Promise<string | null> => {
  if (!Device.isDevice) {
    return null;
  }

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    
    if (!projectId) {
      console.log('Project ID não encontrado');
      return null;
    }

    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  } catch (error) {
    console.error('Erro ao obter push token:', error);
    return null;
  }
};

/**
 * Salva as configurações de notificação
 */
export const saveNotificationSettings = async (settings: NotificationSettings): Promise<void> => {
  try {
    await AsyncStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Erro ao salvar configurações de notificação:', error);
  }
};

/**
 * Carrega as configurações de notificação
 */
export const loadNotificationSettings = async (): Promise<NotificationSettings> => {
  try {
    const stored = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_KEY);
    if (stored) {
      return { ...defaultSettings, ...JSON.parse(stored) };
    }
  } catch (error) {
    console.error('Erro ao carregar configurações de notificação:', error);
  }
  return defaultSettings;
};

/**
 * Agenda uma notificação local para um evento
 */
export const scheduleEventNotification = async (
  event: Event,
  minutesBefore: number = 60
): Promise<string | null> => {
  try {
    const settings = await loadNotificationSettings();
    
    if (!settings.enabled || !settings.eventReminders) {
      return null;
    }

    const eventDate = new Date(event.date);
    const notificationDate = new Date(eventDate.getTime() - minutesBefore * 60 * 1000);

    // Não agendar se a data já passou
    if (notificationDate <= new Date()) {
      return null;
    }

    // Mapeia tipo de evento para texto amigável
    const eventTypeLabels: { [key: string]: string } = {
      MISSA: 'Missa',
      REUNIAO: 'Reunião',
      ATIVIDADE: 'Atividade',
    };

    const eventTypeLabel = eventTypeLabels[event.type] || event.type;
    const timeLabel = minutesBefore >= 60 
      ? `${Math.floor(minutesBefore / 60)} hora(s)` 
      : `${minutesBefore} minutos`;

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: `📅 ${eventTypeLabel} em ${timeLabel}`,
        body: `${event.title} - ${event.location}`,
        data: { eventId: event.id, type: 'event_reminder' },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: notificationDate,
        channelId: 'events',
      },
    });

    // Salvar referência da notificação agendada
    await saveScheduledNotification({
      id: notificationId,
      eventId: event.id,
      scheduledTime: notificationDate.toISOString(),
    });

    return notificationId;
  } catch (error) {
    console.error('Erro ao agendar notificação:', error);
    return null;
  }
};

/**
 * Agenda notificação de lembrete de escala
 */
export const scheduleRosterNotification = async (
  event: Event,
  pastoralName: string,
  responsibilities: string,
  minutesBefore: number = 120 // 2 horas antes por padrão
): Promise<string | null> => {
  try {
    const settings = await loadNotificationSettings();
    
    if (!settings.enabled || !settings.rosterReminders) {
      return null;
    }

    const eventDate = new Date(event.date);
    const notificationDate = new Date(eventDate.getTime() - minutesBefore * 60 * 1000);

    if (notificationDate <= new Date()) {
      return null;
    }

    const timeLabel = minutesBefore >= 60 
      ? `${Math.floor(minutesBefore / 60)} hora(s)` 
      : `${minutesBefore} minutos`;

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: `⏰ Você está escalado(a) em ${timeLabel}!`,
        body: `${pastoralName}: ${responsibilities}\n${event.title} - ${event.location}`,
        data: { eventId: event.id, type: 'roster_reminder' },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: notificationDate,
        channelId: 'rosters',
      },
    });

    await saveScheduledNotification({
      id: notificationId,
      eventId: event.id,
      scheduledTime: notificationDate.toISOString(),
    });

    return notificationId;
  } catch (error) {
    console.error('Erro ao agendar notificação de escala:', error);
    return null;
  }
};

/**
 * Cancela uma notificação agendada
 */
export const cancelNotification = async (notificationId: string): Promise<void> => {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
    await removeScheduledNotification(notificationId);
  } catch (error) {
    console.error('Erro ao cancelar notificação:', error);
  }
};

/**
 * Cancela todas as notificações agendadas
 */
export const cancelAllNotifications = async (): Promise<void> => {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await AsyncStorage.removeItem(SCHEDULED_NOTIFICATIONS_KEY);
  } catch (error) {
    console.error('Erro ao cancelar todas as notificações:', error);
  }
};

/**
 * Lista todas as notificações agendadas
 */
export const getScheduledNotifications = async (): Promise<Notifications.NotificationRequest[]> => {
  try {
    return await Notifications.getAllScheduledNotificationsAsync();
  } catch (error) {
    console.error('Erro ao listar notificações agendadas:', error);
    return [];
  }
};

/**
 * Envia uma notificação local imediata (para testes)
 */
export const sendTestNotification = async (): Promise<void> => {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🔔 Teste de Notificação',
      body: 'As notificações estão funcionando corretamente!',
      data: { type: 'test' },
    },
    trigger: null, // Envia imediatamente
  });
};

// ============================================
// Funções auxiliares internas
// ============================================

const saveScheduledNotification = async (notification: ScheduledNotification): Promise<void> => {
  try {
    const stored = await AsyncStorage.getItem(SCHEDULED_NOTIFICATIONS_KEY);
    const notifications: ScheduledNotification[] = stored ? JSON.parse(stored) : [];
    notifications.push(notification);
    await AsyncStorage.setItem(SCHEDULED_NOTIFICATIONS_KEY, JSON.stringify(notifications));
  } catch (error) {
    console.error('Erro ao salvar notificação agendada:', error);
  }
};

const removeScheduledNotification = async (notificationId: string): Promise<void> => {
  try {
    const stored = await AsyncStorage.getItem(SCHEDULED_NOTIFICATIONS_KEY);
    if (stored) {
      const notifications: ScheduledNotification[] = JSON.parse(stored);
      const filtered = notifications.filter((n) => n.id !== notificationId);
      await AsyncStorage.setItem(SCHEDULED_NOTIFICATIONS_KEY, JSON.stringify(filtered));
    }
  } catch (error) {
    console.error('Erro ao remover notificação agendada:', error);
  }
};

/**
 * Agenda notificações para uma lista de eventos
 */
export const scheduleNotificationsForEvents = async (events: Event[]): Promise<void> => {
  const settings = await loadNotificationSettings();
  
  if (!settings.enabled || !settings.eventReminders) {
    return;
  }

  for (const event of events) {
    await scheduleEventNotification(event, settings.reminderTime);
  }
};
