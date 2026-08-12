import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { getMyCommunities, MemberCommunityLink } from '../services/memberCommunitiesService';

const STORAGE_KEY = '@parish:activeCommunityId';

/**
 * Comunidade ATIVA (multi-comunidade, Fase 3): a comunidade em foco nas telas
 * de conteúdo (Início, Calendário, Pastorais). Padrão = comunidade principal;
 * o membro pode alternar para uma secundária vinculada.
 */
interface CommunityContextData {
  activeCommunityId?: string;
  activeCommunityName?: string;
  /** true quando a comunidade ativa não é a principal */
  isSecondaryActive: boolean;
  links: MemberCommunityLink[];
  setActiveCommunity: (communityId: string) => Promise<void>;
  refreshLinks: () => Promise<void>;
}

const CommunityContext = createContext<CommunityContextData>({} as CommunityContextData);

export function CommunityProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [links, setLinks] = useState<MemberCommunityLink[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>(undefined);

  const refreshLinks = useCallback(async () => {
    if (!user?.id) {
      setLinks([]);
      return;
    }
    try {
      setLinks(await getMyCommunities());
    } catch {
      // Sem cadastro de membro (ou erro): segue só com a comunidade principal
      setLinks([]);
    }
  }, [user?.id]);

  // Carrega vínculos + comunidade ativa persistida ao autenticar
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id) {
        setActiveId(undefined);
        setLinks([]);
        return;
      }
      let loaded: MemberCommunityLink[] = [];
      try {
        loaded = await getMyCommunities();
      } catch {
        loaded = [];
      }
      if (cancelled) return;
      setLinks(loaded);

      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      const validIds = new Set([
        ...(user.communityId ? [user.communityId] : []),
        ...loaded.map((link) => link.communityId),
      ]);
      if (cancelled) return;
      setActiveId(stored && validIds.has(stored) ? stored : user.communityId);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.communityId]);

  const setActiveCommunity = useCallback(async (communityId: string) => {
    setActiveId(communityId);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, communityId);
    } catch {
      // Persistência é conveniência — falha silenciosa
    }
  }, []);

  const value = useMemo<CommunityContextData>(() => {
    const activeCommunityId = activeId ?? user?.communityId ?? undefined;
    const activeLink = links.find((link) => link.communityId === activeCommunityId);
    const activeCommunityName =
      activeLink?.community.name ??
      (activeCommunityId === user?.communityId ? user?.community?.name : undefined);
    return {
      activeCommunityId,
      activeCommunityName,
      isSecondaryActive: !!activeCommunityId && activeCommunityId !== user?.communityId,
      links,
      setActiveCommunity,
      refreshLinks,
    };
  }, [activeId, links, user, setActiveCommunity, refreshLinks]);

  return <CommunityContext.Provider value={value}>{children}</CommunityContext.Provider>;
}

export function useCommunity(): CommunityContextData {
  return useContext(CommunityContext);
}

export default CommunityContext;
