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

export interface CatechesisStudentReport {
  enrollmentId: string;
  member: { id: string; fullName: string };
  status: 'ACTIVE' | 'TRANSFERRED' | 'COMPLETED' | 'DROPPED_OUT';
  pendingDocuments?: string | null;
  attendanceRate: number | null;
  sessions: number;
}

export interface CatechesisClassReport {
  total: number;
  active: number;
  dropouts: number;
  completed: number;
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
