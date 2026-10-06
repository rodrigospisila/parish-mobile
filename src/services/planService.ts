import api from '../config/api';
import { PLAN_MESSAGES, planErrorCode, type PlanErrorCode } from '../utils/planErrors';

/**
 * Tratamento do plano da comunidade no app.
 *
 * Importado uma vez em app/_layout.tsx: instala um interceptor que troca a
 * mensagem técnica do 403 PLAN_REQUIRED/PLAN_SCOPE/PLAN_MEMBER_LIMIT por um
 * aviso amigável — as telas que mostram `getErrorMessage(error)` já exibem o
 * texto novo — e avisa quem quiser ouvir (`onPlanRequired`).
 */

/** GET /me/entitlements — o que o plano da comunidade libera agora. */
export interface PlanEntitlements {
  enforcement: 'off' | 'log' | 'on';
  communityId: string | null;
  paidAccess: boolean;
  features: string[];
  paidFeatures: string[];
  plan: { status: string; trialEndsAt: string | null; currentPeriodEnd: string | null } | null;
}

type PlanListener = (code: PlanErrorCode, feature: string | null) => void;
const listeners = new Set<PlanListener>();

export function onPlanRequired(listener: PlanListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Carrega os entitlements; falha → null (nada bloqueado no app: quem decide é o backend). */
export async function getEntitlements(): Promise<PlanEntitlements | null> {
  try {
    const { data } = await api.get<PlanEntitlements>('/me/entitlements');
    return data ?? null;
  } catch {
    return null;
  }
}

/** Recurso pago fora do plano agora (só no modo "on"). */
export function isFeatureLocked(entitlements: PlanEntitlements | null, feature: string): boolean {
  return !!entitlements && entitlements.paidFeatures.includes(feature) && !entitlements.features.includes(feature);
}

let installed = false;

export function installPlanErrorHandler(): void {
  if (installed) return;
  installed = true;
  api.interceptors.response.use(
    (response) => response,
    (error) => {
      const code = planErrorCode(error);
      if (code) {
        const data = error.response.data as { message?: unknown; feature?: unknown };
        data.message = PLAN_MESSAGES[code];
        const feature = typeof data.feature === 'string' ? data.feature : null;
        listeners.forEach((listener) => {
          try {
            listener(code, feature);
          } catch {
            // ouvinte com erro não derruba a requisição
          }
        });
      }
      return Promise.reject(error);
    },
  );
}

installPlanErrorHandler();
