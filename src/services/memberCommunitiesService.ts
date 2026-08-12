import api, { getErrorMessage } from '../config/api';

/** Vínculo do membro com uma comunidade (multi-comunidade, Fase 3). */
export interface MemberCommunityLink {
  id: string;
  communityId: string;
  isPrimary: boolean;
  isActive: boolean;
  consentGiven?: boolean;
  community: {
    id: string;
    name: string;
    parish?: { id: string; name: string };
  };
}

/** Vínculos do membro logado (principal + secundárias). */
export const getMyCommunities = async (): Promise<MemberCommunityLink[]> => {
  try {
    const { data } = await api.get('/members/me/communities');
    return (data ?? []).filter((link: MemberCommunityLink) => link.isActive !== false);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/** Vincula uma comunidade SECUNDÁRIA (com consentimento LGPD). */
export const addMyCommunity = async (communityId: string): Promise<void> => {
  try {
    await api.post('/members/me/communities', { communityId, consentGiven: true });
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/** Remove (desativa) um vínculo secundário. */
export const removeMyCommunity = async (communityId: string): Promise<void> => {
  try {
    await api.delete(`/members/me/communities/${communityId}`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};
