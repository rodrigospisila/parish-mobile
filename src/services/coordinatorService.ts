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
  /** Pedido de troca em aberto (alerta ao coordenador) */
  hasPendingSwap?: boolean;
  /** Mensagem do pedido de troca mais recente */
  pendingSwapMessage?: string | null;
  /** Cônjuge (para destacar casais escalados juntos) */
  spouseId?: string | null;
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
    /** Atribuições com pedido de troca em aberto */
    swapsPending?: number;
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
    /** Regra da pastoral: casais servem juntos */
    scheduleCouplesTogether?: boolean;
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
    spouseId?: string | null;
    spouse?: { id: string; fullName: string } | null;
  };
  /** Pedidos de troca em aberto */
  swapRequests?: Array<{ id: string; message?: string | null; createdAt?: string }>;
  /** O cônjuge participa da mesma pastoral desta atribuição */
  spouseInSamePastoral?: boolean;
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
  /** Pastorais da PRÓPRIA escala (fonte das vagas e da regra de casais) */
  pastorals?: CoordinatorSchedulePastoral[];
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
  spouseId?: string | null;
  spouse?: { id: string; fullName: string } | null;
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
    /** Regra da pastoral: casais servem juntos */
    scheduleCouplesTogether?: boolean;
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
      swapsPending: 0,
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
      hasPendingSwap: assignment.hasPendingSwap || false,
      pendingSwapMessage: assignment.pendingSwapMessage ?? null,
      spouseId: assignment.spouseId ?? null,
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

export type ScheduleStatus = 'OPEN' | 'CLOSED' | 'COMPLETED' | 'CANCELLED';

/** Atualiza o status da escala (Aberta/Fechada/Concluída/Cancelada). */
export const updateScheduleStatus = async (
  scheduleId: string,
  status: ScheduleStatus,
): Promise<void> => {
  if (USE_MOCK) {
    return;
  }
  try {
    await api.patch(`/schedules/${scheduleId}/status`, { status });
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/** Remove um membro da escala. */
export const removeCoordinatorAssignment = async (assignmentId: string): Promise<void> => {
  if (USE_MOCK) {
    return;
  }
  try {
    await api.delete(`/schedules/assignments/${assignmentId}`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/** Escala um membro (preencher vaga). */
export const createScheduleAssignment = async (params: {
  scheduleId: string;
  memberId: string;
  role: string;
  communityPastoralId?: string;
}): Promise<void> => {
  if (USE_MOCK) {
    return;
  }
  try {
    await api.post('/schedules/assignments', {
      scheduleId: params.scheduleId,
      memberId: params.memberId,
      role: params.role,
      ...(params.communityPastoralId ? { communityPastoralId: params.communityPastoralId } : {}),
    });
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/** Ajusta as vagas (requiredPeople) das pastorais da escala. */
export const updateSchedulePastorals = async (
  scheduleId: string,
  pastoralSettings: Array<{ communityPastoralId: string; requiredPeople: number }>,
): Promise<void> => {
  if (USE_MOCK) {
    return;
  }
  try {
    await api.patch(`/schedules/${scheduleId}/pastorals`, { pastoralSettings });
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export interface RotationPreviewItem {
  scheduleId: string;
  title: string;
  date: string;
  suggestions: Array<{
    role: string;
    memberId: string;
    memberName: string;
    score: number;
    spouseId?: string | null;
  }>;
  gaps: Array<{ role: string; missing: number }>;
  pastorals?: Array<{ communityPastoralId: string; name: string; requiredPeople: number }>;
  noPastorals?: boolean;
  noSlots?: boolean;
  allFilled?: boolean;
  coupleWarnings?: string[];
}

export interface RotationResponse {
  dryRun: boolean;
  created?: number;
  preview: RotationPreviewItem[];
}

/** Gera o rodízio (preencher automático) — prévia (dryRun) ou publicação. */
export const generateScheduleRotation = async (params: {
  scheduleIds: string[];
  dryRun: boolean;
  couplesTogether?: boolean;
}): Promise<RotationResponse> => {
  if (USE_MOCK) {
    return { dryRun: params.dryRun, preview: [] };
  }
  try {
    const response = await api.post('/schedules/generate', {
      scheduleIds: params.scheduleIds,
      dryRun: params.dryRun,
      couplesTogether: params.couplesTogether !== false,
    });
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

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
