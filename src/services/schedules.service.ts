import api from './api';
import { API_ENDPOINTS } from '@/constants/api';
import type { ScheduleAssignment } from '@/types';

export const schedulesService = {
  async getMyAssignments(): Promise<ScheduleAssignment[]> {
    const response = await api.get<ScheduleAssignment[]>(API_ENDPOINTS.SCHEDULES_MY);
    return response.data;
  },

  async checkin(assignmentId: string): Promise<ScheduleAssignment> {
    const response = await api.post<ScheduleAssignment>(
      API_ENDPOINTS.SCHEDULE_CHECKIN(assignmentId)
    );
    return response.data;
  },

  async undoCheckin(assignmentId: string): Promise<ScheduleAssignment> {
    const response = await api.post<ScheduleAssignment>(
      API_ENDPOINTS.SCHEDULE_UNDO_CHECKIN(assignmentId)
    );
    return response.data;
  },
};

