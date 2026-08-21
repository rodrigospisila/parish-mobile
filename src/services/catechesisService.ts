import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import api, { getAccessToken, getErrorMessage } from '../config/api';

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
  /** Equipe da turma (catequistas e auxiliares) */
  catechists: Array<{ memberId: string; fullName: string; role: string }>;
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
  /** Taxas de material da turma com a situação desta matrícula (Fase 5) */
  fees?: Array<{
    id: string;
    description: string;
    amount: number;
    dueDate?: string | null;
    status: 'PENDING' | 'PAID' | 'WAIVED';
  }>;
  /** Documentos enviados pelo app (mais recente primeiro) */
  documents?: Array<{
    id: string;
    kind: string;
    status: 'SUBMITTED' | 'VERIFIED' | 'REJECTED';
    reviewNotes?: string | null;
    createdAt: string;
  }>;
  /** Quantos pareceres do catequista já foram registrados */
  assessmentsCount?: number;
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

// ============================================
// PARECERES POR PERÍODO (Fase 5)
// ============================================

export type CatechesisRating = 'EXCELLENT' | 'GOOD' | 'REGULAR' | 'NEEDS_ATTENTION';

export const RATING_LABELS: Record<CatechesisRating, string> = {
  EXCELLENT: 'Ótimo',
  GOOD: 'Bom',
  REGULAR: 'Regular',
  NEEDS_ATTENTION: 'Precisa de atenção',
};

export interface CatechesisAssessment {
  id: string;
  period: string;
  rating?: CatechesisRating | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

/** Pareceres da matrícula (equipe da turma ou a própria família). */
export const getEnrollmentAssessments = async (
  enrollmentId: string,
): Promise<CatechesisAssessment[]> => {
  try {
    const { data } = await api.get(`/catechesis/enrollments/${enrollmentId}/assessments`);
    return data ?? [];
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/** Parecer em LOTE: mesmo período/conceito/texto para vários da turma. */
export const upsertClassAssessmentsBatch = async (
  classId: string,
  dto: { period: string; rating?: CatechesisRating; notes: string; enrollmentIds: string[] },
): Promise<{ saved: number }> => {
  try {
    const { data } = await api.post(`/catechesis/classes/${classId}/assessments`, dto);
    return data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/** Cria/atualiza o parecer do período (catequista da turma). */
export const upsertEnrollmentAssessment = async (
  enrollmentId: string,
  dto: { period: string; rating?: CatechesisRating; notes: string },
): Promise<void> => {
  try {
    await api.post(`/catechesis/enrollments/${enrollmentId}/assessments`, dto);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

// ============================================
// ACOMPANHAMENTO DETALHADO (família)
// ============================================

export interface EnrollmentAttendanceItem {
  date: string;
  topic?: string | null;
  present: boolean;
  late: boolean;
}

/** Frequência detalhada por encontro (família ou equipe). */
export const getEnrollmentAttendance = async (
  enrollmentId: string,
): Promise<EnrollmentAttendanceItem[]> => {
  try {
    const { data } = await api.get(`/catechesis/enrollments/${enrollmentId}/attendance`);
    return data ?? [];
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  createdAt: string;
}

/** Histórico de avisos recebidos (para reler o que chegou por push). */
export const getMyNotifications = async (type?: string): Promise<AppNotification[]> => {
  try {
    const { data } = await api.get('/notifications/mine', {
      params: type ? { type } : undefined,
    });
    return data ?? [];
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

// ============================================
// DOCUMENTOS DA MATRÍCULA (envio pela família)
// ============================================

/**
 * Envia a foto do documento pendente (ex.: Certidão de Batismo).
 * O arquivo vive só até a conferência da coordenação (retenção mínima).
 */
export const submitCatechesisDocument = async (
  enrollmentId: string,
  kind: string,
  asset: { uri: string; mimeType?: string | null; fileName?: string | null },
): Promise<void> => {
  try {
    const form = new FormData();
    form.append('kind', kind);
    form.append('file', {
      uri: asset.uri,
      type: asset.mimeType ?? 'image/jpeg',
      name: asset.fileName ?? 'documento.jpg',
    } as any);
    await api.post(`/catechesis/enrollments/${enrollmentId}/documents`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

// ============================================
// PAPELADA EM PDF (Fase 4)
// ============================================

const attemptPdfDownload = async (url: string, target: string) => {
  const token = await getAccessToken();
  return FileSystem.downloadAsync(url, target, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
};

/**
 * Baixa um PDF autenticado da catequese e abre a folha de compartilhamento
 * (salvar em Arquivos, enviar no WhatsApp, imprimir).
 */
export const downloadCatechesisPdf = async (path: string, filename: string): Promise<void> => {
  const base = api.defaults.baseURL ?? '';
  const target = `${FileSystem.cacheDirectory}${filename}`;
  let result = await attemptPdfDownload(`${base}${path}`, target);
  if (result.status === 401) {
    // downloadAsync não passa pelo interceptor do axios — força o refresh da
    // sessão com uma chamada leve e tenta uma única vez com o token novo
    try {
      await api.get('/catechesis/my-family');
    } catch {
      throw new Error('Sessão expirada — faça login novamente.');
    }
    result = await attemptPdfDownload(`${base}${path}`, target);
  }
  if (result.status !== 200) {
    throw new Error('Não foi possível gerar o documento — tente novamente.');
  }
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Compartilhamento indisponível neste dispositivo.');
  }
  await Sharing.shareAsync(result.uri, { mimeType: 'application/pdf', dialogTitle: filename });
};

const pdfSlug = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'catequizando';

/** Certificado de conclusão do catequizando (família ou equipe). */
export const shareCatechesisCertificate = (enrollmentId: string, memberName?: string) =>
  downloadCatechesisPdf(
    `/catechesis/enrollments/${enrollmentId}/certificate.pdf`,
    `certificado-${memberName ? pdfSlug(memberName) : enrollmentId.slice(-8)}.pdf`,
  );

/** Declaração de matrícula/frequência (família ou equipe). */
export const shareCatechesisDeclaration = (enrollmentId: string, memberName?: string) =>
  downloadCatechesisPdf(
    `/catechesis/enrollments/${enrollmentId}/declaration.pdf`,
    `declaracao-${memberName ? pdfSlug(memberName) : enrollmentId.slice(-8)}.pdf`,
  );
