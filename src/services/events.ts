import api from './api';

export interface Event {
  id: string;
  title: string;
  description?: string;
  type: string;
  startDate: string;
  endDate?: string;
  location?: string;
  isRecurring: boolean;
  recurrenceRule?: string;
  maxParticipants?: number;
  isPublic: boolean;
  communityId: string;
  community?: {
    id: string;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
}

export const eventsService = {
  async getUpcoming(communityId?: string, limit: number = 10): Promise<Event[]> {
    const params = new URLSearchParams();
    if (communityId) params.append('communityId', communityId);
    params.append('limit', limit.toString());

    const response = await api.get(`/events/upcoming?${params.toString()}`);
    return response.data;
  },

  async getAll(communityId?: string, type?: string): Promise<Event[]> {
    const params = new URLSearchParams();
    if (communityId) params.append('communityId', communityId);
    if (type) params.append('type', type);

    const response = await api.get(`/events?${params.toString()}`);
    return response.data;
  },

  async getById(id: string): Promise<Event> {
    const response = await api.get(`/events/${id}`);
    return response.data;
  },

  async getByDateRange(
    startDate: string,
    endDate: string,
    communityId?: string
  ): Promise<Event[]> {
    const params = new URLSearchParams();
    params.append('startDate', startDate);
    params.append('endDate', endDate);
    if (communityId) params.append('communityId', communityId);

    const response = await api.get(`/events/range?${params.toString()}`);
    return response.data;
  },
};

