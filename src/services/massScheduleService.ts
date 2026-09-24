import api, { getErrorMessage } from '../config/api';
import { MassSchedule, MassScheduleType, ScheduleCancellation } from '../types';

const USE_MOCK = process.env.EXPO_PUBLIC_USE_MOCK === 'true';

const massScheduleTypeLabels: Record<string, string> = {
  MASS: 'Missa',
  CONFESSION: 'Confissao',
  ADORATION: 'Adoracao',
  ROSARY: 'Terco',
};

export const getMassScheduleTypeLabel = (type: MassSchedule['type']): string => {
  return massScheduleTypeLabels[type] || type;
};

export const getMassSchedules = async (communityId: string): Promise<MassSchedule[]> => {
  if (USE_MOCK) {
    return [];
  }

  try {
    const response = await api.get<MassSchedule[]>('/mass-schedules', {
      params: {
        communityId,
      },
    });
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const getFavoriteMassSchedules = async (): Promise<MassSchedule[]> => {
  if (USE_MOCK) {
    return [];
  }

  try {
    const response = await api.get<MassSchedule[]>('/mass-schedules/favorites');
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const addFavoriteMassSchedule = async (scheduleId: string): Promise<void> => {
  if (USE_MOCK) {
    return;
  }

  try {
    await api.post(`/mass-schedules/${scheduleId}/favorite`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const removeFavoriteMassSchedule = async (scheduleId: string): Promise<void> => {
  if (USE_MOCK) {
    return;
  }

  try {
    await api.delete(`/mass-schedules/${scheduleId}/favorite`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

// ============================================
// Suspensões ("não haverá") de horário fixo numa data
// ============================================

/** Ocorrência de um horário fixo num dia (GET /mass-schedules/occurrences). */
export interface FixedOccurrence {
  /** `mass-<scheduleId>-<YYYY-MM-DD>` */
  id: string;
  massScheduleId: string;
  title: string;
  type: MassScheduleType;
  notes: string | null;
  /** relógio de parede, sem fuso: YYYY-MM-DDTHH:MM:SS */
  start: string;
  end: string;
  community: { id: string; name: string } | null;
  isFixed: true;
  /** Servidor antigo não manda: tratar como false. */
  cancelled?: boolean;
  cancelReason?: string | null;
}

/** Papéis que podem suspender/reativar um horário fixo. */
export const SCHEDULE_MANAGER_ROLES = ['SYSTEM_ADMIN', 'DIOCESAN_ADMIN', 'PARISH_ADMIN', 'COMMUNITY_COORDINATOR'];

export const canManageScheduleCancellations = (role?: string | null) =>
  !!role && SCHEDULE_MANAGER_ROLES.includes(role);

/**
 * Ocorrências dos horários fixos entre dois dias (inclusive), no formato
 * YYYY-MM-DD. O backend trata as datas como dias de calendário, então não
 * mandamos hora (evita pegar um dia a mais por causa do fuso).
 */
export const getFixedOccurrencesBetween = async (
  communityId: string,
  fromDay: string,
  toDay: string,
): Promise<FixedOccurrence[]> => {
  try {
    const { data } = await api.get<FixedOccurrence[]>('/mass-schedules/occurrences', {
      params: { communityId, from: fromDay, to: toDay },
    });
    return Array.isArray(data) ? data : [];
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const getScheduleCancellations = async (scheduleId: string): Promise<ScheduleCancellation[]> => {
  try {
    const { data } = await api.get<ScheduleCancellation[]>(
      `/mass-schedules/${encodeURIComponent(scheduleId)}/cancellations`,
    );
    return Array.isArray(data) ? data : [];
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/** Marca "não haverá" em uma ou mais datas (YYYY-MM-DD). Motivo até 140 caracteres. */
export const cancelScheduleDates = async (
  scheduleId: string,
  dates: string[],
  reason?: string,
): Promise<void> => {
  try {
    const motivo = reason?.trim().slice(0, 140);
    await api.post(`/mass-schedules/${encodeURIComponent(scheduleId)}/cancellations`, {
      dates,
      ...(motivo ? { reason: motivo } : {}),
    });
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/** Desfaz a suspensão: o horário volta a acontecer na data. */
export const reactivateScheduleDate = async (scheduleId: string, date: string): Promise<void> => {
  try {
    await api.delete(
      `/mass-schedules/${encodeURIComponent(scheduleId)}/cancellations/${encodeURIComponent(date)}`,
    );
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export default {
  getMassSchedules,
  getFavoriteMassSchedules,
  addFavoriteMassSchedule,
  removeFavoriteMassSchedule,
  getMassScheduleTypeLabel,
};
