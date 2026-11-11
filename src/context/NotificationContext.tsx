import React, { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from 'react';
import { AppState, Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  NotificationSettings,
  NotificationPermissionState,
  LocalReminderType,
  getNotificationPermissionState,
  requestNotificationPermissions,
  loadNotificationSettings,
  saveNotificationSettings,
  scheduleNotificationsForEvents,
  scheduleNotificationsForMassSchedules,
  cancelAllNotifications,
  cancelNotificationsByType,
  getScheduledNotifications,
  sendTestNotification,
  getPushToken,
} from '../services/notificationService';
import { getFavoriteEvents } from '../services/eventService';
import { getFavoriteMassSchedules } from '../services/massScheduleService';
import { authService } from '../services/authService';
import { isPlanRequiredError } from '../utils/planErrors';
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

  /**
   * Refaz os lembretes locais dos favoritos.
   *
   * Ordem que importa: PRIMEIRO busca (cada consulta por conta própria), só
   * DEPOIS cancela e reagenda — e só o grupo cuja consulta deu certo:
   * - eventos favoritos falharam (rede/servidor): os lembretes de horário fixo
   *   (missa, confissão…) são refeitos normalmente e os de evento que já
   *   existiam ficam como estavam;
   * - eventos não estão ativos na comunidade (403 PLAN_REQUIRED): os lembretes
   *   de evento já agendados são cancelados (não ficam órfãos);
   * - horários favoritos falharam: os lembretes de horário fixo ficam intactos;
   * - as duas falharam (sem internet): nada é cancelado.
   * Antes cancelava tudo e depois buscava com Promise.all — qualquer erro nos
   * eventos apagava os lembretes de missa.
   *
   * "Não haverá": /mass-schedules/favorites traz `upcomingCancellations`
   * (hoje a +60 dias) e o agendamento pula essas datas (avulsos no lugar do
   * lembrete semanal repetido — ver scheduleMassScheduleNotification).
   */
  const runReschedule = async () => {
    // Conta para a qual esta execução agenda: se mudar no meio (logout, troca
    // de conta, avisos desligados), para a cada item e desfaz o que criou
    const startedFor = userIdRef.current;
    const stillValid = () => rescheduleAllowed.current && userIdRef.current === startedFor;

    const [eventsResult, massResult] = await Promise.allSettled([
      getFavoriteEvents(),
      getFavoriteMassSchedules(),
    ]);
    // Eventos fora do plano da comunidade (voltou ao grátis): resposta
    // definitiva do servidor, não falha de rede — os lembretes de evento já
    // agendados ficariam órfãos, avisando de eventos que o app diz não estarem
    // ativos. Falha de rede (ou outro erro) continua sem apagar nada.
    const eventsOffPlan = eventsResult.status === 'rejected' && isPlanRequiredError(eventsResult.reason);
    if (eventsResult.status === 'rejected' && massResult.status === 'rejected' && !eventsOffPlan) {
      return; // sem dados novos: os lembretes atuais continuam valendo
    }
    // Saiu da conta (ou desligou os avisos) enquanto buscava: não reagenda nada
    if (!stillValid()) return;

    const touched: LocalReminderType[] = [];
    try {
      // Horários fixos primeiro: são o que o plano grátis garante ao fiel
      if (massResult.status === 'fulfilled') {
        const cleared = await cancelNotificationsByType(['mass_schedule_reminder']);
        if (cleared && stillValid()) {
          touched.push('mass_schedule_reminder');
          await scheduleNotificationsForMassSchedules(massResult.value, stillValid);
        }
      }
      if (eventsResult.status === 'fulfilled') {
        const cleared = await cancelNotificationsByType(['event_reminder']);
        if (cleared && stillValid()) {
          touched.push('event_reminder');
          const now = new Date();
          await scheduleNotificationsForEvents(
            eventsResult.value.filter((event) => new Date(event.startDate) > now),
            stillValid,
          );
        }
      } else if (eventsOffPlan) {
        await cancelNotificationsByType(['event_reminder']);
      }
    } catch (error) {
      console.error('Erro ao agendar notificações:', error);
    }

    // A conta mudou no meio: o que esta execução criou era da conta anterior
    // (o logout cancela tudo, mas um item pode ter sido agendado logo depois)
    if (!stillValid() && touched.length > 0) {
      await cancelNotificationsByType(touched);
      // Já há outra conta logada: refaz para ela ao final desta execução
      if (rescheduleAllowed.current) rescheduleQueued.current = true;
    }

    const scheduled = await getScheduledNotifications();
    setScheduledCount(scheduled.length);
  };

  /** Uma execução por vez: duas ao mesmo tempo agendariam lembretes em dobro. */
  const rescheduleRunning = useRef<Promise<void> | null>(null);
  const rescheduleQueued = useRef(false);
  const rescheduleAllowed = useRef(false);
  // Favorito de horário fixo vale também para quem ainda não tem comunidade (mapa)
  rescheduleAllowed.current = !!user?.id && settings.enabled && isPermissionGranted;
  const runRescheduleRef = useRef(runReschedule);
  runRescheduleRef.current = runReschedule;

  // Reagendar notificações quando o usuário ou configurações mudam
  const rescheduleEventNotifications = async (): Promise<void> => {
    if (!rescheduleAllowed.current) return;
    if (rescheduleRunning.current) {
      // Pedido novo durante uma execução (favoritou outro horário): roda mais uma vez ao final
      rescheduleQueued.current = true;
      return rescheduleRunning.current;
    }
    const loop = (async () => {
      try {
        do {
          rescheduleQueued.current = false;
          await runRescheduleRef.current().catch((error) => console.error('Erro ao agendar notificações:', error));
        } while (rescheduleQueued.current && rescheduleAllowed.current);
      } finally {
        rescheduleRunning.current = null;
      }
    })();
    rescheduleRunning.current = loop;
    return loop;
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
