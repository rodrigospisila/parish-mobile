import api, { getErrorMessage } from '../config/api';

// ============================================
// TIPOS — Troca de escala entre membros (4.6)
// ============================================

export type SwapStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED';

export interface SwapRequest {
  id: string;
  status: SwapStatus;
  message?: string | null;
  createdAt: string;
  requesterName?: string | null;
  targetName?: string | null;
  assignment?: {
    role: string;
    schedule?: { id: string; title: string; date: string } | null;
  } | null;
}

export interface MySwaps {
  requested: SwapRequest[];
  invited: SwapRequest[];
  memberId: string | null;
}

// ============================================
// SERVIÇO
// ============================================

/** Pede para repassar a própria escala (aberta à pastoral ou direcionada). */
export const requestSwap = async (
  assignmentId: string,
  options?: { targetMemberId?: string; message?: string },
): Promise<SwapRequest> => {
  try {
    const response = await api.post<SwapRequest>('/swaps', {
      assignmentId,
      targetMemberId: options?.targetMemberId,
      message: options?.message,
    });
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const getMySwaps = async (): Promise<MySwaps> => {
  try {
    const response = await api.get<MySwaps>('/swaps/mine');
    return {
      requested: response.data.requested ?? [],
      invited: response.data.invited ?? [],
      memberId: response.data.memberId ?? null,
    };
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const acceptSwap = async (swapId: string): Promise<void> => {
  try {
    await api.patch(`/swaps/${swapId}/accept`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const rejectSwap = async (swapId: string): Promise<void> => {
  try {
    await api.patch(`/swaps/${swapId}/reject`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const cancelSwap = async (swapId: string): Promise<void> => {
  try {
    await api.patch(`/swaps/${swapId}/cancel`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const getSwapStatusLabel = (status: SwapStatus): string => {
  const labels: Record<SwapStatus, string> = {
    PENDING: 'Pendente',
    ACCEPTED: 'Aceita',
    REJECTED: 'Recusada',
    CANCELLED: 'Cancelada',
    EXPIRED: 'Expirada',
  };
  return labels[status] || status;
};

export default {
  requestSwap,
  getMySwaps,
  acceptSwap,
  rejectSwap,
  cancelSwap,
  getSwapStatusLabel,
};
