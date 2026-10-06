import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Event } from './eventService';
import { MassSchedule, eventTypeLabels } from '../types';
import { descreverRecorrencia, ehMensal } from '../utils/recorrencia';
import { chaveDataCivil, dataCivilComHora, formatarDataCivil } from '../utils/dataCivil';
import { proximaOcorrenciaValida, suspensaoNoDia, suspensoesDe } from '../utils/suspensoes';

/**
 * Horário semanal com suspensões à vista ("não haverá"): em vez do lembrete
 * repetido (que não sabe pular uma data), agenda avulsos para as próximas
 * ocorrências válidas. O iOS guarda no máximo 64 avisos locais: o padrão é 6
 * por horário e sobe até 12 (três meses) quando a soma ainda cabe no limite
 * (R3#55). O reagendamento ao abrir/voltar ao app renova a lista.
 */
const MAX_WEEKLY_REMINDERS_WITH_SUSPENSIONS = 6;
const MAX_WEEKLY_REMINDERS_WITH_SUSPENSIONS_EXTENDED = 12;
/** Limite de avisos locais pendentes do iOS, com folga para os de escala/teste. */
const IOS_LOCAL_NOTIFICATION_LIMIT = 64;
const LOCAL_NOTIFICATION_RESERVE = 4;

/**
 * Lembretes avulsos por horário semanal com suspensão: o máximo que cabe no
 * limite do iOS dividido entre esses horários, entre 6 (o de sempre) e 12.
 */
export const weeklyRemindersBudget = (alreadyScheduled: number, otherSchedules: number, withSuspensions: number): number => {
  if (withSuspensions <= 0) return MAX_WEEKLY_REMINDERS_WITH_SUSPENSIONS;
  const free = IOS_LOCAL_NOTIFICATION_LIMIT - LOCAL_NOTIFICATION_RESERVE - alreadyScheduled - otherSchedules;
  const perSchedule = Math.floor(free / withSuspensions);
  return Math.max(MAX_WEEKLY_REMINDERS_WITH_SUSPENSIONS, Math.min(MAX_WEEKLY_REMINDERS_WITH_SUSPENSIONS_EXTENDED, perSchedule));
};

/** Reagendamento ao voltar ao primeiro plano: no máximo 1 vez a cada 6 h (R3#55). */
export const FOREGROUND_RESCHEDULE_INTERVAL_MS = 6 * 60 * 60 * 1000;
let lastRescheduleAt = 0;

/** Marca que os lembretes acabaram de ser refeitos (abertura do app ou volta ao primeiro plano). */
export const markNotificationsRescheduled = (now: number = Date.now()): void => {
  lastRescheduleAt = now;
};

/** Já passou o intervalo desde o último reagendamento? */
export const isForegroundRescheduleDue = (now: number = Date.now()): boolean =>
  now - lastRescheduleAt >= FOREGROUND_RESCHEDULE_INTERVAL_MS;

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

const massScheduleTypeLabels: Record<string, string> = {
  MASS: 'Missa',
  CONFESSION: 'Confissão',
  ADORATION: 'Adoração',
  ROSARY: 'Terço',
};

const weekdayLabels = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
];

/** Antecedência do lembrete por extenso: "1 hora", "2 horas", "1 hora e 30 minutos", "15 minutos". */
const formatLeadTime = (minutesBefore: number): string => {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (minutesBefore < 60) return plural(minutesBefore, 'minuto', 'minutos');
  const hours = Math.floor(minutesBefore / 60);
  const rest = minutesBefore % 60;
  return rest ? `${plural(hours, 'hora', 'horas')} e ${plural(rest, 'minuto', 'minutos')}` : plural(hours, 'hora', 'horas');
};

const parseTime = (time: string) => {
  const [hourStr, minuteStr] = time.split(':');
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  return { hour, minute };
};

const computeReminderTime = (
  dayOfWeek: number,
  hour: number,
  minute: number,
  minutesBefore: number,
) => {
  const totalMinutes = dayOfWeek * 1440 + hour * 60 + minute;
  let reminderMinutes = totalMinutes - minutesBefore;
  const weekMinutes = 7 * 1440;

  while (reminderMinutes < 0) {
    reminderMinutes += weekMinutes;
  }

  const reminderDay = Math.floor(reminderMinutes / 1440) % 7;
  const timeMinutes = reminderMinutes % 1440;
  const reminderHour = Math.floor(timeMinutes / 60);
  const reminderMinute = timeMinutes % 60;

  return { reminderDay, reminderHour, reminderMinute };
};

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

    const eventDate = new Date(event.startDate);
    const notificationDate = new Date(eventDate.getTime() - minutesBefore * 60 * 1000);

    // Não agendar se a data já passou
    if (notificationDate <= new Date()) {
      return null;
    }

    // Mapeia tipo de evento para texto amigável
    const eventTypeLabel = eventTypeLabels[event.type] || event.type;
    const timeLabel = formatLeadTime(minutesBefore);

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
 * Agenda notificacao local recorrente para um horario fixo de missa
 */
export const scheduleMassScheduleNotification = async (
  schedule: MassSchedule,
  minutesBefore: number = 60,
  maxWeeklyReminders: number = MAX_WEEKLY_REMINDERS_WITH_SUSPENSIONS
): Promise<string | null> => {
  try {
    const settings = await loadNotificationSettings();

    if (!settings.enabled || !settings.eventReminders) {
      return null;
    }

    const { hour, minute } = parseTime(schedule.time);
    if (Number.isNaN(hour) || Number.isNaN(minute)) {
      return null;
    }

    const typeLabel = massScheduleTypeLabels[schedule.type] || schedule.type;
    const timeLabel = formatLeadTime(minutesBefore);

    if (schedule.isSpecial && schedule.specialDate) {
      // Data só-dia (A20): '2026-10-12T00:00:00.000Z' é 12/10, não 11/10 às 21:00
      const notificationDate = dataCivilComHora(schedule.specialDate, schedule.time);
      if (!notificationDate) return null;
      // Especial suspensa ("não haverá"): sem lembrete
      const dayKey = chaveDataCivil(schedule.specialDate);
      if (dayKey && suspensaoNoDia(schedule, dayKey)) return null;
      const reminderDate = new Date(notificationDate.getTime() - minutesBefore * 60 * 1000);

      if (reminderDate <= new Date()) {
        return null;
      }

      const bodyLabel = formatarDataCivil(schedule.specialDate);
      return await Notifications.scheduleNotificationAsync({
        content: {
          title: `${typeLabel} especial em ${timeLabel}`,
          body: schedule.notes
            ? `${bodyLabel} ${schedule.time} - ${schedule.notes}`
            : `${bodyLabel} ${schedule.time}`,
          data: { massScheduleId: schedule.id, type: 'mass_schedule_reminder' },
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: reminderDate,
          channelId: 'events',
        },
      });
    }

    // Recorrência mensal: um único aviso para a próxima ocorrência. Repetir
    // toda semana anunciaria missas que não acontecem.
    if (ehMensal(schedule)) {
      // Pula as datas suspensas ("não haverá")
      const proxima = proximaOcorrenciaValida(schedule, schedule.time, new Date());
      if (!proxima) return null;
      const lembrete = new Date(proxima.getTime() - minutesBefore * 60 * 1000);
      if (lembrete <= new Date()) return null;
      const quando = descreverRecorrencia(schedule);
      return await Notifications.scheduleNotificationAsync({
        content: {
          title: `${typeLabel} em ${timeLabel}`,
          body: schedule.notes
            ? `${quando}, ${schedule.time} - ${schedule.notes}`
            : `${quando}, ${schedule.time}`,
          data: { massScheduleId: schedule.id, type: 'mass_schedule_reminder' },
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: lembrete,
          channelId: 'events',
        },
      });
    }

    if (schedule.dayOfWeek === null || schedule.dayOfWeek === undefined) return null;

    const weekdayName = weekdayLabels[schedule.dayOfWeek] || 'Dia';
    if (suspensoesDe(schedule).length > 0) {
      // Semanal com suspensão à vista: lembretes avulsos, pulando os dias suspensos
      let firstId: string | null = null;
      let base = new Date();
      for (let i = 0; i < maxWeeklyReminders; i += 1) {
        const occurrence = proximaOcorrenciaValida(schedule, schedule.time, base);
        if (!occurrence) break;
        base = new Date(occurrence.getFullYear(), occurrence.getMonth(), occurrence.getDate() + 1, 0, 0, 0, 0);
        const reminder = new Date(occurrence.getTime() - minutesBefore * 60 * 1000);
        if (reminder <= new Date()) continue;
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: `${typeLabel} em ${timeLabel}`,
            body: schedule.notes ? `${weekdayName} ${schedule.time} - ${schedule.notes}` : `${weekdayName} ${schedule.time}`,
            data: { massScheduleId: schedule.id, type: 'mass_schedule_reminder' },
            sound: true,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: reminder,
            channelId: 'events',
          },
        });
        firstId = firstId ?? id;
      }
      return firstId;
    }

    const { reminderDay, reminderHour, reminderMinute } = computeReminderTime(
      schedule.dayOfWeek,
      hour,
      minute,
      minutesBefore,
    );

    const weekdayLabel = weekdayLabels[schedule.dayOfWeek] || 'Dia';
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: `${typeLabel} em ${timeLabel}`,
        body: schedule.notes
          ? `${weekdayLabel} ${schedule.time} - ${schedule.notes}`
          : `${weekdayLabel} ${schedule.time}`,
        data: { massScheduleId: schedule.id, type: 'mass_schedule_reminder' },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
        weekday: reminderDay + 1,
        hour: reminderHour,
        minute: reminderMinute,
        repeats: true,
        channelId: 'events',
      },
    });
  } catch (error) {
    console.error('Erro ao agendar notificação de missa fixa:', error);
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

    const eventDate = new Date(event.startDate);
    const notificationDate = new Date(eventDate.getTime() - minutesBefore * 60 * 1000);

    if (notificationDate <= new Date()) {
      return null;
    }

    const timeLabel = formatLeadTime(minutesBefore);

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

/**
 * Agenda notificacoes para horarios fixos favoritados
 */
export const scheduleNotificationsForMassSchedules = async (
  schedules: MassSchedule[]
): Promise<void> => {
  const settings = await loadNotificationSettings();

  if (!settings.enabled || !settings.eventReminders) {
    return;
  }

  // Janela dos avulsos (semanal com suspensão) conforme o que já está agendado
  const withSuspensions = schedules.filter(
    (s) => !(s.isSpecial && s.specialDate) && !ehMensal(s) && suspensoesDe(s).length > 0,
  ).length;
  const alreadyScheduled = (await getScheduledNotifications()).length;
  const perSchedule = weeklyRemindersBudget(alreadyScheduled, schedules.length - withSuspensions, withSuspensions);

  for (const schedule of schedules) {
    await scheduleMassScheduleNotification(schedule, settings.reminderTime, perSchedule);
  }
};
