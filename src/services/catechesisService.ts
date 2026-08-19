import api, { getErrorMessage } from '../config/api';

// ============================================
// CATEQUESE — app do catequista (Fase 1)
// ============================================

export interface MyCatechesisClass {
  classId: string;
  role: string;
  name: string;
  year: number;
  weekday?: number | null;
  time?: string | null;
  room?: string | null;
  status: string;
  stage: { id: string; name: string; sacramentType?: string | null };
  community: { id: string; name: string };
  activeEnrollments: number;
  sessionsCount: number;
}

export interface CatechesisSessionSummary {
  id: string;
  date: string;
  topic?: string | null;
  /** Quantos catequizandos já têm chamada marcada neste encontro */
  marked: number;
  present: number;
  late: number;
}

export type CatechesisEnrollmentStatus =
  | 'ACTIVE'
  | 'TRANSFERRED'
  | 'COMPLETED'
  | 'DROPPED_OUT'
  | 'PENDING_APPROVAL'
  | 'REJECTED';

export interface CatechesisStudentReport {
  enrollmentId: string;
  member: { id: string; fullName: string };
  status: CatechesisEnrollmentStatus;
  pendingDocuments?: string | null;
  attendanceRate: number | null;
  sessions: number;
}

export interface CatechesisClassReport {
  total: number;
  active: number;
  dropouts: number;
  completed: number;
  /** Inscrições online aguardando aprovação */
  pending: number;
  students: CatechesisStudentReport[];
}

export interface SessionAttendanceStudent {
  enrollmentId: string;
  member: { id: string; fullName: string };
  /** null = chamada ainda não marcada para este catequizando */
  present: boolean | null;
  late: boolean;
}

export interface SessionAttendance {
  sessionId: string;
  date: string;
  topic?: string | null;
  students: SessionAttendanceStudent[];
}

export interface FamilyCatechesisItem {
  enrollmentId: string;
  member: { id: string; fullName: string; isSelf: boolean };
  status: CatechesisEnrollmentStatus;
  pendingDocuments?: string | null;
  attendanceRate: number | null;
  sessions: number;
  class: {
    id: string;
    name: string;
    year: number;
    weekday?: number | null;
    time?: string | null;
    room?: string | null;
    stage: { id: string; name: string; sacramentType?: string | null };
    community: { id: string; name: string };
  };
  nextSession: { date: string; topic?: string | null } | null;
}

/** Catequese da FAMÍLIA: matrículas próprias e dos dependentes. */
export const getMyFamilyCatechesis = async (): Promise<FamilyCatechesisItem[]> => {
  try {
    const { data } = await api.get('/catechesis/my-family');
    return data ?? [];
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/** Mensagem do catequista para as famílias da turma. */
export const notifyClassFamilies = async (
  classId: string,
  message: string,
): Promise<{ notified: number }> => {
  try {
    const { data } = await api.post(`/catechesis/classes/${classId}/notify`, { message });
    return data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/** Turmas em que o usuário logado é catequista/auxiliar. */
export const getMyCatechesisClasses = async (): Promise<MyCatechesisClass[]> => {
  try {
    const { data } = await api.get('/catechesis/my-classes');
    return data ?? [];
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const getCatechesisClassReport = async (
  classId: string,
): Promise<CatechesisClassReport> => {
  try {
    const { data } = await api.get(`/catechesis/classes/${classId}/report`);
    return data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const getCatechesisSessions = async (
  classId: string,
): Promise<CatechesisSessionSummary[]> => {
  try {
    const { data } = await api.get(`/catechesis/classes/${classId}/sessions`);
    return data ?? [];
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const createCatechesisSession = async (
  classId: string,
  date: string,
  topic?: string,
): Promise<{ id: string }> => {
  try {
    const { data } = await api.post(`/catechesis/classes/${classId}/sessions`, { date, topic });
    return data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const getSessionAttendance = async (sessionId: string): Promise<SessionAttendance> => {
  try {
    const { data } = await api.get(`/catechesis/sessions/${sessionId}/attendance`);
    return data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const markSessionAttendance = async (
  sessionId: string,
  entries: Array<{ enrollmentId: string; present: boolean; late?: boolean }>,
): Promise<void> => {
  try {
    await api.post(`/catechesis/sessions/${sessionId}/attendance`, { entries });
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

// ============================================
// INSCRIÇÃO ONLINE (Fase 3)
// ============================================

export interface CatechesisOpenClass {
  classId: string;
  name: string;
  year: number;
  weekday?: number | null;
  time?: string | null;
  room?: string | null;
  stage: { id: string; name: string; sacramentType?: string | null };
  community: { id: string; name: string };
  capacity: number | null;
  occupied: number;
  /** null = sem limite de vagas */
  openSpots: number | null;
}

export interface MyDependent {
  id: string;
  fullName: string;
  birthDate?: string | null;
}

/** Turmas com inscrição aberta na comunidade (em foco ou principal). */
export const getCatechesisOpenClasses = async (
  communityId?: string,
): Promise<CatechesisOpenClass[]> => {
  try {
    const { data } = await api.get('/catechesis/open-classes', {
      params: communityId ? { communityId } : undefined,
    });
    return data ?? [];
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/** Dependentes (filhos) do usuário logado. */
export const getMyDependents = async (): Promise<MyDependent[]> => {
  try {
    const { data } = await api.get('/members/me/dependents');
    return data ?? [];
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/** Inscrição online: para si, um dependente ou um filho novo. */
export const applyCatechesis = async (dto: {
  classId: string;
  forMemberId?: string;
  newChild?: { fullName: string; birthDate?: string };
  consentGiven: boolean;
}): Promise<{ id: string }> => {
  try {
    const { data } = await api.post('/catechesis/apply', dto);
    return data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/** Aprova uma inscrição pendente (catequista da turma ou coordenação). */
export const approveCatechesisEnrollment = async (enrollmentId: string): Promise<void> => {
  try {
    await api.patch(`/catechesis/enrollments/${enrollmentId}/approve`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/** Recusa uma inscrição pendente. */
export const rejectCatechesisEnrollment = async (
  enrollmentId: string,
  reason?: string,
): Promise<void> => {
  try {
    await api.patch(`/catechesis/enrollments/${enrollmentId}/reject`, { reason });
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};
