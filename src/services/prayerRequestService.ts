import api, { getErrorMessage } from '../config/api';

// ============================================
// PEDIDOS DE ORAÇÃO (mural da comunidade)
// ============================================

export type PrayerCategory = 'HEALTH' | 'FAMILY' | 'WORK' | 'STUDIES' | 'OTHER';

export const PRAYER_CATEGORY_LABELS: Record<PrayerCategory, string> = {
  HEALTH: 'Saúde',
  FAMILY: 'Família',
  WORK: 'Trabalho',
  STUDIES: 'Estudos',
  OTHER: 'Outros',
};

export interface PrayerRequest {
  id: string;
  title: string;
  description: string;
  category: PrayerCategory;
  isAnonymous: boolean;
  prayerCount: number;
  createdAt: string;
  community?: { id: string; name: string } | null;
  member?: { fullName: string } | null;
}

/** Pedidos aprovados da comunidade (mural público). */
export const getApprovedPrayerRequests = async (
  communityId?: string | null,
): Promise<PrayerRequest[]> => {
  try {
    const { data } = await api.get('/prayer-requests/approved', {
      params: communityId ? { communityId } : undefined,
    });
    return data ?? [];
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/** Envia um pedido — entra em moderação antes de aparecer no mural. */
export const createPrayerRequest = async (input: {
  title: string;
  description: string;
  category: PrayerCategory;
  isAnonymous: boolean;
  communityId: string;
}): Promise<void> => {
  try {
    await api.post('/prayer-requests', input);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/** "Rezei por isso" — incrementa o contador de orações. */
export const prayForRequest = async (id: string): Promise<number> => {
  try {
    const { data } = await api.post(`/prayer-requests/${id}/pray`);
    return data?.prayerCount ?? 0;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};
