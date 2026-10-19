import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from './AuthContext';
import { useCommunity } from './CommunityContext';
import { getEntitlements, isFeatureLocked, onPlanRequired, type PlanEntitlements } from '../services/planService';
import { readCache, writeCache } from '../utils/offlineCache';

/**
 * Plano da comunidade no app (ux-app-14 / eng-acessos-23 / saas-implantacao-26).
 *
 * Carrega GET /me/entitlements depois do login e de novo ao trocar a
 * comunidade (principal ou ativa), com cache por usuário+comunidade (memória e
 * AsyncStorage — sem rede, vale o último). Um 403 PLAN_REQUIRED de qualquer
 * tela marca o recurso como bloqueado para a comunidade atual, mesmo antes da
 * próxima consulta. As telas pagas usam `useFeatureLocked(feature)` para
 * mostrar o estado calmo (PlanLockedState) em vez de erro ou lista vazia.
 *
 * Fora do modo "on" do PLAN_ENFORCEMENT o backend libera tudo em `features`,
 * então nada aparece bloqueado. Falha ao consultar = nada bloqueado (quem
 * decide é o backend). O app nunca mostra preço nem cobrança (regra das lojas).
 */

/** Chaves dos recursos pagos (parish-backend src/modules/plans/plan-rules.ts) */
export type PaidFeature =
  | 'pastorals'
  | 'schedules'
  | 'swaps'
  | 'catechesis'
  | 'formation'
  | 'rooms'
  | 'visitation'
  | 'documents';

/** Consulta de novo ao voltar para o app depois deste tempo */
const STALE_MS = 10 * 60 * 1000;

interface EntitlementsContextData {
  entitlements: PlanEntitlements | null;
  isLocked: (feature: PaidFeature) => boolean;
  refresh: () => Promise<void>;
}

const EntitlementsContext = createContext<EntitlementsContextData>({
  entitlements: null,
  isLocked: () => false,
  refresh: async () => undefined,
});

/** Cache em memória por usuário+comunidade (sobrevive à troca de tela) */
const memory = new Map<string, { data: PlanEntitlements; at: number }>();

export function EntitlementsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { activeCommunityId } = useCommunity();
  const cacheKey = user?.id ? `${user.id}:${user.communityId ?? '-'}:${activeCommunityId ?? '-'}` : null;

  const [entitlements, setEntitlements] = useState<PlanEntitlements | null>(null);
  /** Recursos que o servidor recusou com PLAN_REQUIRED para a chave atual */
  const [serverBlocked, setServerBlocked] = useState<Set<string>>(new Set());
  const keyRef = useRef(cacheKey);
  keyRef.current = cacheKey;

  const load = useCallback(async (key: string, force = false) => {
    const hit = memory.get(key);
    if (hit) {
      setEntitlements(hit.data);
      if (!force && Date.now() - hit.at < STALE_MS) return;
    } else {
      const stored = await readCache<PlanEntitlements>(`entitlements:${key}`);
      if (stored && keyRef.current === key) setEntitlements(stored.data);
    }
    const fresh = await getEntitlements();
    if (keyRef.current !== key) return; // trocou de conta/comunidade no meio
    if (fresh) {
      memory.set(key, { data: fresh, at: Date.now() });
      void writeCache(`entitlements:${key}`, fresh);
      setEntitlements(fresh);
    }
  }, []);

  // Login, troca de conta ou de comunidade: estado novo para a chave nova
  useEffect(() => {
    setServerBlocked(new Set());
    if (!cacheKey) {
      setEntitlements(null);
      return;
    }
    setEntitlements(memory.get(cacheKey)?.data ?? null);
    void load(cacheKey);
  }, [cacheKey, load]);

  // De volta ao app: reconsulta se o cache passou do prazo
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const key = keyRef.current;
      if (state === 'active' && key) void load(key);
    });
    return () => subscription.remove();
  }, [load]);

  // 403 PLAN_REQUIRED de qualquer requisição: o recurso fica bloqueado já
  useEffect(
    () =>
      onPlanRequired((code, feature) => {
        if (code !== 'PLAN_REQUIRED' || !feature) return;
        setServerBlocked((previous) => {
          if (previous.has(feature)) return previous;
          const next = new Set(previous);
          next.add(feature);
          return next;
        });
      }),
    [],
  );

  const refresh = useCallback(async () => {
    const key = keyRef.current;
    if (!key) return;
    setServerBlocked(new Set());
    await load(key, true);
  }, [load]);

  const value = useMemo<EntitlementsContextData>(
    () => ({
      entitlements,
      isLocked: (feature) => serverBlocked.has(feature) || isFeatureLocked(entitlements, feature),
      refresh,
    }),
    [entitlements, serverBlocked, refresh],
  );

  return <EntitlementsContext.Provider value={value}>{children}</EntitlementsContext.Provider>;
}

export function useEntitlements(): EntitlementsContextData {
  return useContext(EntitlementsContext);
}

/** Atalho para as telas: o recurso pago está fora do plano da comunidade agora? */
export function useFeatureLocked(feature: PaidFeature): boolean {
  return useEntitlements().isLocked(feature);
}
