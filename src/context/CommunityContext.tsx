import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  const [hydrated, setHydrated] = useState(false);
  const prevPrimaryRef = useRef<string | undefined>(undefined);

  const refreshLinks = useCallback(async () => {
    if (!user?.id) {
      setLinks([]);
      return;
    }
    try {
      setLinks(await getMyCommunities());
    } catch {
      // Falha transitória: mantém a lista atual (não zera o estado)
    }
  }, [user?.id]);

  // Hidratação por USUÁRIO: vínculos + comunidade ativa persistida
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id) {
        setActiveId(undefined);
        setLinks([]);
        setHydrated(false);
        prevPrimaryRef.current = undefined;
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
      prevPrimaryRef.current = user.communityId;
      setActiveId(stored && validIds.has(stored) ? stored : user.communityId);
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Troca de PRINCIPAL (qualquer fluxo): o foco acompanha a nova principal
  useEffect(() => {
    if (!hydrated || !user?.communityId) return;
    if (prevPrimaryRef.current !== user.communityId) {
      prevPrimaryRef.current = user.communityId;
      setActiveId(user.communityId);
      AsyncStorage.setItem(STORAGE_KEY, user.communityId).catch(() => {});
      void refreshLinks();
    }
  }, [user?.communityId, hydrated, refreshLinks]);

  // Comunidade ativa órfã (vínculo revogado): volta para a principal
  useEffect(() => {
    if (!hydrated || !activeId || !user?.communityId) return;
    if (activeId === user.communityId) return;
    if (!links.some((link) => link.communityId === activeId)) {
      setActiveId(user.communityId);
      AsyncStorage.setItem(STORAGE_KEY, user.communityId).catch(() => {});
    }
  }, [links, activeId, user?.communityId, hydrated]);

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
