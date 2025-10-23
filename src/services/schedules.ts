import api from './api';

export interface Schedule {
  id: string;
  title: string;
  description?: string;
  date: string;
  eventId: string;
  event?: {
    id: string;
    title: string;
    type: string;
  };
  assignments?: ScheduleAssignment[];
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleAssignment {
  id: string;
  role: string;
  scheduleId: string;
  memberId: string;
  checkedIn: boolean;
  checkedInAt?: string;
  member?: {
    id: string;
    fullName: string;
    email: string;
    phone?: string;
    photoUrl?: string;
  };
  schedule?: Schedule;
  createdAt: string;
  updatedAt: string;
}

export interface MemberStats {
  memberId: string;
  total: number;
  checkedIn: number;
  missed: number;
  attendanceRate: number;
}

export const schedulesService = {
  async getAll(eventId?: string): Promise<Schedule[]> {
    const params = new URLSearchParams();
    if (eventId) params.append('eventId', eventId);

    const response = await api.get(`/schedules?${params.toString()}`);
    return response.data;
  },

  async getById(id: string): Promise<Schedule> {
    const response = await api.get(`/schedules/${id}`);
    return response.data;
  },

  async getMyAssignments(memberId: string): Promise<ScheduleAssignment[]> {
    const response = await api.get(`/schedules/assignments/all?memberId=${memberId}`);
    return response.data;
  },

  async checkIn(assignmentId: string): Promise<ScheduleAssignment> {
    const response = await api.patch(`/schedules/assignments/${assignmentId}/checkin`);
    return response.data;
  },

  async undoCheckIn(assignmentId: string): Promise<ScheduleAssignment> {
    const response = await api.patch(`/schedules/assignments/${assignmentId}/undo-checkin`);
    return response.data;
  },

  async getMemberStats(memberId: string): Promise<MemberStats> {
    const response = await api.get(`/schedules/members/${memberId}/stats`);
    return response.data;
  },
};

