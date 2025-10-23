import api from './api';
import { API_ENDPOINTS } from '@/constants/api';
import type { Event } from '@/types';

export const eventsService = {
  async getAll(): Promise<Event[]> {
    const response = await api.get<Event[]>(API_ENDPOINTS.EVENTS);
    return response.data;
  },

  async getById(id: string): Promise<Event> {
    const response = await api.get<Event>(API_ENDPOINTS.EVENT_BY_ID(id));
    return response.data;
  },
};

