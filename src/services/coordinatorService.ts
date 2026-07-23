import api, { USE_MOCK, getErrorMessage } from '../config/api';

export type CoordinatorAssignmentStatus = 'PENDING' | 'CONFIRMED' | 'DECLINED';
export type CandidateRecommendationLevel = 'RECOMMENDED' | 'ATTENTION' | 'CONFLICT';
export type CandidateAvailabilityStatus = 'NOT_CONFIGURED' | 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE';

export interface CoordinatorOverviewParams {
  from?: string;
  to?: string;
}

export interface CoordinatorAssignmentSummary {
  id: string;
  memberId: string;
  memberName: string;
  role: string;
  status: CoordinatorAssignmentStatus;
  checkedIn: boolean;
  checkedInAt?: string;
}

export interface CoordinatorScheduleSummary {
  scheduleId: string;
  title: string;
  date: string;
  event: {
    id: string;
    title: string;
    type: string;
    location?: string;
    community?: {
      id: string;
      name: string;
      parish?: {
        id: string;
        name: string;
      };
    };
  };
  counts: {
    total: number;
    pending: number;
    confirmed: number;
    declined: number;
    checkedIn: number;
  };
  attendanceRate: number;
  assignments: CoordinatorAssignmentSummary[];
}

export interface CoordinatorSchedulePastoral {
  communityPastoralId: string;
  requiredPeople: number;
  role?: string;
  isLeader: boolean;
  communityPastoral: {
    id: string;
    globalPastoral?: {
      id: string;
      name: string;
    };
  };
}

export interface CoordinatorScheduleAssignment {
  id: string;
  role: string;
  status: CoordinatorAssignmentStatus;
  checkedIn: boolean;
  checkedInAt?: string;
  communityPastoral?: {
    id: string;
    globalPastoral?: {
      id: string;
      name: string;
    };
  };
  member: {
    id: string;
    fullName: string;
    email?: string;
    phone?: string;
    photoUrl?: string;
  };
}

export interface CoordinatorScheduleDetail {
  id: string;
  title: string;
  description?: string;
  date: string;
  status: 'OPEN' | 'CLOSED' | 'COMPLETED' | 'CANCELLED';
  event: {
    id: string;
    title: string;
    type: string;
    location?: string;
    eventPastorals: CoordinatorSchedulePastoral[];
  };
  assignments: CoordinatorScheduleAssignment[];
}

export interface CandidatePastoralMembership {
  id: string;
  communityPastoralId: string;
  name: string;
  role: string;
  eventRole?: string;
  isLeader?: boolean;
}

export interface CandidateConflictItem {
  assignmentId: string;
  scheduleId: string;
  title: string;
  role: string;
  date: string;
  location?: string | null;
  community?: string | null;
  status: CoordinatorAssignmentStatus;
  checkedIn: boolean;
}

export interface CandidateHistoryItem {
  assignmentId: string;
  scheduleId: string;
  title: string;
  role: string;
  date: string;
  location?: string | null;
  outcome: 'CHECKED_IN' | 'DECLINED' | 'NO_SHOW';
  status: CoordinatorAssignmentStatus;
  checkedIn: boolean;
  checkedInAt?: string | null;
}

export interface ScheduleCandidateMember {
  id: string;
  fullName: string;
  email?: string;
  phone?: string;
  photoUrl?: string;
  pastorals: CandidatePastoralMembership[];
  currentScheduleAssigned: boolean;
  conflicts: {
    sameDayAssignments: CandidateConflictItem[];
    overlappingAssignments: CandidateConflictItem[];
  };
  load: {
    upcoming30DaysCount: number;
    past30DaysCount: number;
    nextAssignments: CandidateConflictItem[];
  };
  history: {
    totalPastAssignments: number;
    actionableAssignments: number;
    respondedCount: number;
    checkedInCount: number;
    declinedCount: number;
    noShowCount: number;
    attendanceRate: number;
    responseRate: number;
    recent: CandidateHistoryItem[];
  };
  availability: {
    status: CandidateAvailabilityStatus;
    summary: string[];
  };
  recommendation: {
    level: CandidateRecommendationLevel;
    score: number;
    reasons: string[];
  };
}

export interface ScheduleCandidatesResponse {
  scheduleId: string;
  title: string;
  date: string;
  event: {
    id: string;
    title: string;
    type: string;
    location?: string;
    community?: {
      id: string;
      name: string;
      parish?: {
        id: string;
        name: string;
      };
    };
  };
  pastorals: Array<{
    id: string;
    communityPastoralId: string;
    name: string;
    role?: string;
    isLeader?: boolean;
    requiredPeople: number;
    assignedCount: number;
    remainingPeople?: number | null;
  }>;
  hasPastorals: boolean;
  availabilityFeatureEnabled: boolean;
  members: ScheduleCandidateMember[];
}

const mapOverviewItem = (item: any): CoordinatorScheduleSummary => {
  const event = item.event || {};
  return {
    scheduleId: item.scheduleId,
    title: item.title,
    date: item.date,
    event: {
      id: event.id || '',
      title: event.title || item.title || '',
      type: event.type || 'OTHER',
      location: event.location,
      community: event.community,
    },
    counts: item.counts || {
      total: 0,
      pending: 0,
      confirmed: 0,
      declined: 0,
      checkedIn: 0,
    },
    attendanceRate: item.attendanceRate || 0,
    assignments: (item.assignments || []).map((assignment: any) => ({
      id: assignment.id,
      memberId: assignment.memberId,
      memberName: assignment.memberName,
      role: assignment.role,
      status: assignment.status || 'PENDING',
      checkedIn: assignment.checkedIn || false,
      checkedInAt: assignment.checkedInAt,
    })),
  };
};

export const getCoordinatorScheduleOverview = async (
  params: CoordinatorOverviewParams = {},
): Promise<CoordinatorScheduleSummary[]> => {
  if (USE_MOCK) {
    return [];
  }

  try {
    const response = await api.get('/schedules/coordinator-overview', { params });
    return (response.data || []).map(mapOverviewItem);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const getCoordinatorScheduleDetail = async (
  scheduleId: string,
): Promise<CoordinatorScheduleDetail> => {
  if (USE_MOCK) {
    throw new Error('Detalhe da escala indisponivel em modo mock');
  }

  try {
    const response = await api.get(`/schedules/${scheduleId}`);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const getScheduleCandidates = async (
  scheduleId: string,
): Promise<ScheduleCandidatesResponse> => {
  if (USE_MOCK) {
    return {
      scheduleId,
      title: 'Escala',
      date: new Date().toISOString(),
      event: {
        id: '',
        title: 'Evento',
        type: 'OTHER',
      },
      pastorals: [],
      hasPastorals: false,
      availabilityFeatureEnabled: true,
      members: [],
    };
  }

  try {
    const response = await api.get(`/schedules/${scheduleId}/candidates`);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const replaceCoordinatorAssignment = async (
  assignmentId: string,
  memberId: string,
): Promise<void> => {
  if (USE_MOCK) {
    return;
  }

  try {
    await api.patch(`/schedules/assignments/${assignmentId}/replace`, { memberId });
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const checkInCoordinatorAssignment = async (assignmentId: string): Promise<void> => {
  if (USE_MOCK) {
    return;
  }

  try {
    await api.patch(`/schedules/assignments/${assignmentId}/checkin`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const undoCheckInCoordinatorAssignment = async (assignmentId: string): Promise<void> => {
  if (USE_MOCK) {
    return;
  }

  try {
    await api.patch(`/schedules/assignments/${assignmentId}/undo-checkin`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export interface NotifyTeamResult {
  notified: number;
}

export const notifyScheduleTeam = async (
  scheduleId: string,
  message: string,
): Promise<NotifyTeamResult> => {
  if (USE_MOCK) {
    return { notified: 0 };
  }

  try {
    const response = await api.post(`/schedules/${scheduleId}/notify-team`, { message });
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};
