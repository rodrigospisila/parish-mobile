import type { User } from '../services/authService';

/**
 * Valores de vínculo que o backend aceita como coordenação. 'Vice-Coordenador'
 * NÃO é coordenação para o servidor: mostrar ações de gestão a ele só gerava 403.
 */
const COORDINATOR_MEMBERSHIP_ROLES = ['COORDINATOR', 'Coordenador'];

/**
 * Pastorais que o usuário COORDENA. Usa `coordinatedPastoralIds` (backend
 * novo: login e /users/me); no servidor antigo, os vínculos com papel de
 * coordenador. Participação (`pastoralIds`) nunca conta.
 */
export const coordinatedPastoralIdsOf = (user: User | null | undefined): string[] => {
  if (!user) return [];
  if (Array.isArray(user.coordinatedPastoralIds)) return user.coordinatedPastoralIds;
  return (user.pastorals ?? [])
    .filter((pastoral) => COORDINATOR_MEMBERSHIP_ROLES.includes(pastoral.role))
    .map((pastoral) => pastoral.id);
};

/** Coordena ao menos uma pastoral (aba/painel de Coordenação) */
export const coordinatesAnyPastoral = (user: User | null | undefined): boolean =>
  coordinatedPastoralIdsOf(user).length > 0;

/** Papéis de gestão que enxergam a Coordenação (escalas) no app */
const MANAGEMENT_ROLES = ['SYSTEM_ADMIN', 'DIOCESAN_ADMIN', 'PARISH_ADMIN', 'COMMUNITY_COORDINATOR', 'PASTORAL_COORDINATOR'];

/**
 * Aba/painel de Coordenação: papel gestor OU coordenação de alguma pastoral
 * (vice-coordenação não conta — o servidor recusaria as ações).
 */
export const canCoordinateSchedules = (user: User | null | undefined): boolean =>
  (!!user?.role && MANAGEMENT_ROLES.includes(user.role)) || coordinatesAnyPastoral(user);
