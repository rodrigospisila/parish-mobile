import type { Href } from 'expo-router';

/**
 * Para onde leva o toque numa notificação (push do backend ou lembrete local).
 * Função pura: usada pelo ouvinte de toque, pelo app aberto a frio (cold start)
 * e, no futuro, pela central /notifications.
 *
 * Mapa tipo → tela (levantado em parish-backend/src em 19/10/2026; `type` é o
 * NotificationType quando o backend o manda em `data`, `kind` é o campo próprio
 * de cada módulo):
 *
 * | Push (data)                                              | Tela                                    |
 * |----------------------------------------------------------|-----------------------------------------|
 * | kind finance-statement (+statementId)                    | /tithe (sheet do balancete)             |
 * | kind tithe-* (campaign, confirmed, schedule, charge…)    | /tithe                                  |
 * | kind assignment-created / assignment-replaced / schedule-reminder / response-nudge / couple-declined (+assignmentId) | Minha Escala, card destacado |
 * | kind schedule-cancelled / team-broadcast (+scheduleId)  | Minha Escala                            |
 * | kind swap-requested (+swapId, scheduleId)                | Minha Escala, convite de troca destacado — NUNCA a coordenação |
 * | kind assignment-declined (coordenação, inclusive casal)  | /coordination/[scheduleId] — só se coordena; senão Minha Escala |
 * | sem kind (backend antigo): type ASSIGNMENT_* / SCHEDULE_* e o título ("Recusa em …" = coordenação; "Escala recusada em casal" = cônjuge) | mesmas telas |
 * | kind chat (+enrollmentId)                                | /catechesis/chat/[enrollmentId]         |
 * | kind application (+classId) — equipe da turma            | /catechesis/[classId]                   |
 * | demais kinds da catequese (session, session-moved, agenda, message, family-message, absence, documents, document, document-review, assessment, fee, fee-payment, approved, rejected) | /catechesis |
 * | clergyMessageId (Palavra Pastoral)                       | /clergy-messages                        |
 * | kind join-request (pedido para entrar em pastoral)      | Início (pendências da coordenação)      |
 * | kind join-request-reviewed / communityPastoralId (aviso da pastoral) | Pastorais                   |
 * | kind security-new-device                                 | /security                               |
 * | kind mass-schedule-cancelled/-restored (+communityId)    | /comunidade/[communityId] (horários)    |
 * | eventId (lembrete de evento, local ou do backend)        | Calendário                              |
 * | massScheduleId (lembrete local de horário favorito)      | Calendário                              |
 * | newsId, room-reservation e qualquer outro sem tela       | /notifications                          |
 *
 * Tipo novo no backend sem tela aqui cai em /notifications (nunca "não abre nada").
 */

export interface NotificationRouteContext {
  /** Título da notificação (fallback para distinguir a recusa avisada à coordenação) */
  title?: string | null;
  /** Usuário coordena escalas (papel gestor ou coordenação de pastoral) */
  canCoordinate: boolean;
}

type Data = Record<string, unknown> | null | undefined;

const str = (value: unknown): string => (typeof value === 'string' ? value : value != null ? String(value) : '');

/** Tipos de escala que pedem a resposta do PRÓPRIO escalado. */
const OWN_ASSIGNMENT_TYPES = new Set(['ASSIGNMENT_CREATED', 'ASSIGNMENT_REPLACED', 'SCHEDULE_REMINDER']);

/**
 * Recusa avisada à coordenação. O backend ainda não manda `type` no push
 * (contrato 8 prevê): sem ele, o título "Recusa em escala"/"Recusa em casal"
 * identifica o aviso ao coordenador; "Escala recusada em casal" vai ao cônjuge.
 */
const isDeclineForCoordinator = (type: string, title: string): boolean => {
  if (/^escala recusada/i.test(title)) return false;
  if (type) return type === 'ASSIGNMENT_DECLINED';
  return /^recusa em/i.test(title);
};

/**
 * Kinds de escala que pedem a resposta do PRÓPRIO escalado (o assignmentId é
 * dele): atribuição, substituição, lembretes D-1/2h, cobrança de resposta e o
 * aviso ao cônjuge na recusa em casal.
 */
const SCHEDULE_KINDS_OWN = new Set([
  'assignment-created',
  'assignment-replaced',
  'schedule-reminder',
  'response-nudge',
  'couple-declined',
]);

/** Minha Escala na seção de trocas, com o convite destacado. */
const mySwaps = (swapId?: string): Href =>
  (swapId ? { pathname: '/(tabs)/schedule', params: { swapId } } : '/(tabs)/schedule') as Href;

const mySchedule = (assignmentId?: string): Href =>
  (assignmentId
    ? { pathname: '/(tabs)/schedule', params: { assignmentId } }
    : '/(tabs)/schedule') as Href;

/** Tela de destino do toque; null = notificação sem destino (ex.: teste). */
export function resolveNotificationRoute(data: Data, context: NotificationRouteContext): Href | null {
  if (!data || typeof data !== 'object') return '/notifications' as Href;

  const kind = str(data.kind);
  const type = str(data.type);
  const title = str(context.title);

  // Lembrete de teste do Perfil: só aparece, não navega
  if (type === 'test') return null;

  // ---- Dízimo e finanças ----
  if (kind === 'finance-statement') {
    // Balancete publicado: a tela do dízimo abre a seção Transparência e, com statementId, já mostra a sheet dele
    const statementId = str(data.statementId);
    return (statementId ? { pathname: '/tithe', params: { statementId } } : '/tithe') as Href;
  }
  if (kind.startsWith('tithe')) {
    // tithe-schedule também traz scheduleId (agendamento do dízimo, não escala) — por isso vem antes
    return '/tithe' as Href;
  }

  // ---- Escalas ----
  const scheduleId = str(data.scheduleId);
  const assignmentId = str(data.assignmentId);
  const swapId = str(data.swapId);

  // Convite de troca: o assignmentId é de QUEM pediu — abre as trocas em
  // Minha Escala; NUNCA a coordenação (mesmo trazendo scheduleId)
  if (kind.startsWith('swap') || swapId) return mySwaps(swapId || undefined);

  // `kind` explícito (contrato 8) é a fonte principal
  if (SCHEDULE_KINDS_OWN.has(kind)) return mySchedule(assignmentId || undefined);
  if (kind === 'assignment-declined') {
    return context.canCoordinate && scheduleId
      ? ({ pathname: '/coordination/[scheduleId]', params: { scheduleId } } as Href)
      : mySchedule();
  }
  if (kind === 'schedule-cancelled' || kind === 'team-broadcast') return mySchedule();

  // Backend antigo (sem kind): type e título
  if (scheduleId) {
    if (isDeclineForCoordinator(type, title)) {
      return context.canCoordinate
        ? ({ pathname: '/coordination/[scheduleId]', params: { scheduleId } } as Href)
        : mySchedule();
    }
    if (OWN_ASSIGNMENT_TYPES.has(type) || assignmentId) return mySchedule(assignmentId || undefined);
    // Escala cancelada / aviso do coordenador à equipe: o escalado acompanha em Minha Escala
    return mySchedule();
  }

  // ---- Catequese ----
  const enrollmentId = str(data.enrollmentId);
  const classId = str(data.classId);
  if (kind === 'chat' && enrollmentId) {
    return { pathname: '/catechesis/chat/[enrollmentId]', params: { enrollmentId } } as Href;
  }
  if (kind === 'application' && classId) {
    // Nova inscrição/fila de espera: vai para a equipe da turma
    return { pathname: '/catechesis/[classId]', params: { classId } } as Href;
  }
  if (type === 'CATECHESIS' || kind === 'family-message' || ((enrollmentId || classId) && kind)) {
    return '/catechesis' as Href;
  }

  // ---- Palavra Pastoral, pastorais, conta ----
  if (str(data.clergyMessageId) || type === 'CLERGY_MESSAGE') return '/clergy-messages' as Href;
  if (kind === 'join-request') return '/(tabs)' as Href;
  if (kind === 'join-request-reviewed' || str(data.communityPastoralId)) return '/(tabs)/pastorals' as Href;
  if (kind === 'security-new-device') return '/security' as Href;

  // ---- Horários e eventos ----
  if (kind === 'mass-schedule-cancelled' || kind === 'mass-schedule-restored') {
    const communityId = str(data.communityId);
    return (communityId ? { pathname: '/comunidade/[id]', params: { id: communityId } } : '/(tabs)/calendar') as Href;
  }
  if (str(data.eventId) || str(data.massScheduleId)) return '/(tabs)/calendar' as Href;

  // Comunicado/aviso urgente (newsId), reserva de sala e tipos novos: central de avisos
  return '/notifications' as Href;
}
