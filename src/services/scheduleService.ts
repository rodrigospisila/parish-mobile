import api, { getErrorMessage } from '../config/api';

// ============================================
// TIPOS
// ============================================

export type AssignmentStatus = 'PENDING' | 'CONFIRMED' | 'DECLINED';

export interface ScheduleEvent {
  id: string;
  title: string;
  type: string;
  location?: string;
  community?: {
    id: string;
    name: string;
  };
}

export interface Schedule {
  id: string;
  title: string;
  description?: string;
  date: string;
  event: ScheduleEvent;
  status?: 'OPEN' | 'CLOSED' | 'COMPLETED' | 'CANCELLED';
}

export interface MyAssignment {
  id: string;
  role: string;
  status: AssignmentStatus;
  communityPastoralId?: string;
  checkedIn: boolean;
  checkedInAt?: string;
  schedule: Schedule;
}

export interface MyAssignmentsResponse {
  memberId?: string;
  memberName?: string;
  upcoming: MyAssignment[];
  past: MyAssignment[];
  message?: string;
}

// ============================================
// SERVIÇO
// ============================================

/**
 * Busca as escalas do usuário logado
 */
export const getMyAssignments = async (): Promise<MyAssignmentsResponse> => {
  try {
    const response = await api.get<MyAssignmentsResponse>('/schedules/my-assignments');
    return response.data;
  } catch (error) {
    console.error('Erro ao buscar minhas escalas:', error);
    throw new Error(getErrorMessage(error));
  }
};

/**
 * Confirma participação em uma escala
 */
export const confirmAssignment = async (assignmentId: string): Promise<MyAssignment> => {
  try {
    const response = await api.patch<MyAssignment>(`/schedules/assignments/${assignmentId}/confirm`);
    return response.data;
  } catch (error) {
    console.error('Erro ao confirmar escala:', error);
    throw new Error(getErrorMessage(error));
  }
};

/**
 * Recusa participação em uma escala
 */
export const declineAssignment = async (assignmentId: string): Promise<MyAssignment> => {
  try {
    const response = await api.patch<MyAssignment>(`/schedules/assignments/${assignmentId}/decline`);
    return response.data;
  } catch (error) {
    console.error('Erro ao recusar escala:', error);
    throw new Error(getErrorMessage(error));
  }
};

/**
 * Retorna a label do status
 */
export const getStatusLabel = (status: AssignmentStatus): string => {
  const labels: Record<AssignmentStatus, string> = {
    PENDING: 'Aguardando',
    CONFIRMED: 'Confirmado',
    DECLINED: 'Recusado',
  };
  return labels[status] || status;
};

/**
 * Retorna a cor do status
 */
export const getStatusColor = (status: AssignmentStatus): string => {
  const colors: Record<AssignmentStatus, string> = {
    PENDING: '#FFA500', // Laranja
    CONFIRMED: '#28a745', // Verde
    DECLINED: '#dc3545', // Vermelho
  };
  return colors[status] || '#757575';
};

export default {
  getMyAssignments,
  confirmAssignment,
  declineAssignment,
  getStatusLabel,
  getStatusColor,
};
