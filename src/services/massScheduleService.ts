import api, { getErrorMessage } from '../config/api';
import { MassSchedule } from '../types';

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

export default {
  getMassSchedules,
  getFavoriteMassSchedules,
  addFavoriteMassSchedule,
  removeFavoriteMassSchedule,
  getMassScheduleTypeLabel,
};
