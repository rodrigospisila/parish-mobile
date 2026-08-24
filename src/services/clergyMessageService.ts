import api, { getErrorMessage } from '../config/api';
import { cachedFetch } from '../utils/offlineCache';

// ============================================
// TIPOS — Palavra do Pastor (mensagens do clero)
// ============================================

export type ClergyMessageAudience = 'DIOCESE' | 'PARISH' | 'COMMUNITY' | 'PASTORAL' | 'MEMBER';

export interface ClergyMessage {
  id: string;
  title: string;
  body?: string | null;
  videoUrl?: string | null;
  senderTitle?: string | null;
  senderLabel?: string; // rótulo dinâmico: "Palavra do Bispo/Pároco/Diácono"
  audience: ClergyMessageAudience;
  publishedAt: string;
  sender?: { id: string; name: string } | null;
  community?: { id: string; name: string } | null;
  communityPastoral?: { id: string; globalPastoral?: { name: string } | null } | null;
}

// ============================================
// SERVIÇO
// ============================================

/**
 * Feed da Palavra do Pastor (com cache offline: o app mostra as últimas
 * mensagens mesmo sem internet — roadmap 4.7).
 */
export const getClergyMessages = async (
  limit = 20,
  communityId?: string,
): Promise<{ messages: ClergyMessage[]; fromCache: boolean }> => {
  try {
    const cacheKey = communityId
      ? `clergy-messages:${communityId}:${limit}`
      : `clergy-messages:${limit}`;
    const result = await cachedFetch<ClergyMessage[]>(cacheKey, async () => {
      const response = await api.get<ClergyMessage[]>('/clergy-messages', {
        params: { limit, ...(communityId ? { communityId } : {}) },
      });
      return response.data;
    });
    return { messages: result.data, fromCache: result.fromCache };
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const getAudienceLabel = (message: ClergyMessage): string => {
  switch (message.audience) {
    case 'DIOCESE':
      return 'Diocese';
    case 'PARISH':
      return 'Paróquia';
    case 'COMMUNITY':
      return message.community?.name ?? 'Comunidade';
    case 'PASTORAL':
      return message.communityPastoral?.globalPastoral?.name ?? 'Pastoral';
    case 'MEMBER':
      return 'Para você';
    default:
      return '';
  }
};

export default { getClergyMessages, getAudienceLabel };
