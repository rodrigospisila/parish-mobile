import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from './AuthContext';
import { useCommunity } from './CommunityContext';
import { getEntitlements, isFeatureLocked, onPlanRequired, type PlanEntitlements } from '../services/planService';
import { isPlanRequiredError } from '../utils/planErrors';
import { readCache, writeCache } from '../utils/offlineCache';

/**
 * Plano da comunidade no app (ux-app-14 / eng-acessos-23 / saas-implantacao-26).
 *
 * O backend decide o plano pela comunidade do RECURSO (turma, escala,
 * matrícula), pelo communityId explícito da rota ou, sem nenhum dos dois,
 * pelo usuário (comunidade principal + vínculos) — e as rotas "minhas"
 * (my-family, my-classes, my-assignments, swaps/mine) pela comunidade dos
 * recursos do próprio usuário (parish-backend plans/plan-routes.ts). O
 * GET /me/entitlements sem communityId só responde a regra "pelo usuário".
 * Por isso o app NÃO bloqueia por usuário inteiro:
 *
 * - telas de rota "minhas" ou de recurso (`usePlanLock(feature)`): só o 403
 *   PLAN_REQUIRED da própria chamada da tela mostra o estado calmo;
 * - telas de uma comunidade conhecida (`usePlanLock(feature, { communityId })`):
 *   também ficam bloqueadas quando um 403 recente veio DESSA comunidade, ou
 *   quando ela é a comunidade do /me/entitlements e o plano dela não libera
 *   (único caso em que o bloqueio antecipado é certo).
 *
 * Os bloqueios expiram: ao voltar para o app (depois de 30 s) e no
 * pull-to-refresh (`refresh()`) o app limpa os 403 guardados, refaz o
 * /me/entitlements e as telas bloqueadas pela própria chamada tentam de novo.
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

/** Cache dos entitlements e validade de um 403 guardado */
const STALE_MS = 10 * 60 * 1000;
/** Volta ao app: reconsulta (e expira os bloqueios) se a última passou deste tempo */
const RECHECK_MIN_MS = 30 * 1000;

interface EntitlementsContextData {
  entitlements: PlanEntitlements | null;
  /** O recurso pago está bloqueado NESTA comunidade? (sem comunidade: nunca) */
  isLockedFor: (feature: PaidFeature, communityId: string | null | undefined) => boolean;
  /** Pull-to-refresh: expira os bloqueios por 403 e refaz o /me/entitlements */
  refresh: () => Promise<void>;
  /** Muda a cada reconsulta: as telas bloqueadas pela própria chamada tentam de novo */
  generation: number;
}

const EntitlementsContext = createContext<EntitlementsContextData>({
  entitlements: null,
  isLockedFor: () => false,
  refresh: async () => undefined,
  generation: 0,
});

/** Cache em memória por usuário+comunidade (sobrevive à troca de tela) */
const memory = new Map<string, { data: PlanEntitlements; at: number }>();

const blockKey = (feature: string, communityId: string) => `${feature}|${communityId}`;

export function EntitlementsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { activeCommunityId } = useCommunity();
  const cacheKey = user?.id ? `${user.id}:${user.communityId ?? '-'}:${activeCommunityId ?? '-'}` : null;

  const [entitlements, setEntitlements] = useState<PlanEntitlements | null>(null);
  /** 403 PLAN_REQUIRED recebidos: "feature|comunidade" → quando */
  const [serverBlocked, setServerBlocked] = useState<Map<string, number>>(new Map());
  const [generation, setGeneration] = useState(0);
  const keyRef = useRef(cacheKey);
  keyRef.current = cacheKey;
  const lastCheck = useRef(0);

  const load = useCallback(async (key: string, force = false) => {
    lastCheck.current = Date.now();
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

  /** Expira os bloqueios, avisa as telas e refaz a consulta */
  const recheck = useCallback(
    async (key: string) => {
      setServerBlocked(new Map());
      setGeneration((value) => value + 1);
      await load(key, true);
    },
    [load],
  );

  // Login, troca de conta ou de comunidade: estado novo para a chave nova
  useEffect(() => {
    setServerBlocked(new Map());
    if (!cacheKey) {
      setEntitlements(null);
      return;
    }
    setEntitlements(memory.get(cacheKey)?.data ?? null);
    void load(cacheKey);
  }, [cacheKey, load]);

  // De volta ao app: os 403 guardados expiram e o plano é consultado de novo
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const key = keyRef.current;
      if (state !== 'active' || !key) return;
      if (Date.now() - lastCheck.current < RECHECK_MIN_MS) return;
      void recheck(key);
    });
    return () => subscription.remove();
  }, [recheck]);

  // 403 PLAN_REQUIRED de qualquer requisição: vale só para a comunidade que o
  // servidor recusou (sem comunidade na resposta, só a tela da chamada decide)
  useEffect(
    () =>
      onPlanRequired((code, feature, communityId) => {
        if (code !== 'PLAN_REQUIRED' || !feature || !communityId) return;
        setServerBlocked((previous) => {
          const next = new Map(previous);
          next.set(blockKey(feature, communityId), Date.now());
          return next;
        });
      }),
    [],
  );

  const refresh = useCallback(async () => {
    const key = keyRef.current;
    if (!key) return;
    await recheck(key);
  }, [recheck]);

  const value = useMemo<EntitlementsContextData>(
    () => ({
      entitlements,
      isLockedFor: (feature, communityId) => {
        if (!communityId) return false;
        const at = serverBlocked.get(blockKey(feature, communityId));
        if (at !== undefined && Date.now() - at < STALE_MS) return true;
        // Sem communityId o /me/entitlements avalia a comunidade principal e os
        // vínculos: recusado, a principal certamente não tem o recurso
        return entitlements?.communityId === communityId && isFeatureLocked(entitlements, feature);
      },
      refresh,
      generation,
    }),
    [entitlements, serverBlocked, refresh, generation],
  );

  return <EntitlementsContext.Provider value={value}>{children}</EntitlementsContext.Provider>;
}

export function useEntitlements(): EntitlementsContextData {
  return useContext(EntitlementsContext);
}

/**
 * Estado bloqueado de uma tela paga.
 *
 * - `track(error)`: a tela passa o resultado da sua chamada principal — `null`
 *   no sucesso (desbloqueia), o erro na falha (403 PLAN_REQUIRED bloqueia;
 *   outro erro mantém o estado). Devolve true quando foi PLAN_REQUIRED;
 * - `communityId`: comunidade que a rota da tela usa (communityId explícito ou
 *   a principal, nas rotas decididas pelo usuário) — some o bloqueio guardado
 *   dela e o do /me/entitlements;
 * - `onRecheck`: na reconsulta (volta ao app / pull-to-refresh), tela
 *   bloqueada pela própria chamada carrega de novo; sem ele, desbloqueia.
 */
export function usePlanLock(
  feature: PaidFeature,
  options: { communityId?: string | null; onRecheck?: () => void } = {},
): { locked: boolean; track: (error: unknown) => boolean } {
  const { isLockedFor, generation } = useEntitlements();
  const [ownLocked, setOwnLocked] = useState(false);
  const ownLockedRef = useRef(ownLocked);
  ownLockedRef.current = ownLocked;
  const recheckRef = useRef(options.onRecheck);
  recheckRef.current = options.onRecheck;
  const seenGeneration = useRef(generation);

  useEffect(() => {
    if (generation === seenGeneration.current) return;
    seenGeneration.current = generation;
    if (!ownLockedRef.current) return;
    if (recheckRef.current) recheckRef.current();
    else setOwnLocked(false);
  }, [generation]);

  const track = useCallback((error: unknown) => {
    if (error == null) {
      setOwnLocked(false);
      return false;
    }
    if (!isPlanRequiredError(error)) return false;
    setOwnLocked(true);
    return true;
  }, []);

  return { locked: ownLocked || isLockedFor(feature, options.communityId), track };
}
