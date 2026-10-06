import axios from 'axios';

/**
 * Erros do plano da comunidade (backend: PlanFeatureGuard / MemberLimitGuard).
 * Puro (sem importar a instância da API) para poder ser usado no cache offline.
 *
 * - PLAN_REQUIRED: recurso pago e a comunidade não tem plano ativo;
 * - PLAN_SCOPE: comunidade fora do acesso do usuário;
 * - PLAN_MEMBER_LIMIT: a comunidade atingiu o limite de membros da faixa.
 */
export type PlanErrorCode = 'PLAN_REQUIRED' | 'PLAN_SCOPE' | 'PLAN_MEMBER_LIMIT';

export const PLAN_MESSAGES: Record<PlanErrorCode, string> = {
  PLAN_REQUIRED:
    'Este recurso não faz parte do plano da comunidade. Calendário, mapa e liturgia continuam liberados; para ativar, fale com a coordenação da paróquia.',
  PLAN_SCOPE: 'Esta comunidade está fora do seu acesso.',
  PLAN_MEMBER_LIMIT: 'A comunidade atingiu o limite de membros do plano. Fale com a coordenação da paróquia.',
};

export function planErrorCode(error: unknown): PlanErrorCode | null {
  if (!axios.isAxiosError(error) || error.response?.status !== 403) return null;
  const code = (error.response.data as { code?: unknown } | undefined)?.code;
  return code === 'PLAN_REQUIRED' || code === 'PLAN_SCOPE' || code === 'PLAN_MEMBER_LIMIT' ? code : null;
}

/** 403 do plano: a resposta é definitiva (não é falta de rede) — não usar o cache offline. */
export const isPlanError = (error: unknown): boolean => planErrorCode(error) !== null;
