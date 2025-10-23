import api from './api';
import { API_ENDPOINTS } from '@/constants/api';
import type { LiturgyData } from '@/types';

export const liturgyService = {
  async getToday(): Promise<LiturgyData> {
    const response = await api.get<LiturgyData>(API_ENDPOINTS.LITURGY_TODAY);
    return response.data;
  },

  async getByDate(date: string): Promise<LiturgyData> {
    const response = await api.get<LiturgyData>(API_ENDPOINTS.LITURGY_DATE(date));
    return response.data;
  },
};

