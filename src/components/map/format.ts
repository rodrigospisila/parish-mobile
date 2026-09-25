import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { MapCommunity, PublicMass } from '../../services/publicMapService';

export const TYPE_LABELS: Record<string, string> = {
  MASS: 'Missa',
  CONFESSION: 'Confissão',
  ADORATION: 'Adoração',
  ROSARY: 'Terço',
};

export const typeLabel = (type: string) => TYPE_LABELS[type] || type;

/** Dia pesquisado no mapa (mesmos valores do filtro de dia). */
export type SearchedDay = 'all' | 'today' | 'sunday';

/** Tolerância para uma celebração que acabou de começar ainda contar como "de hoje". */
const STARTED_TOLERANCE_MS = 30 * 60 * 1000;

/** Converte o horário flutuante (sem fuso) em Date local; null se inválido. */
export function parseLocal(start: string): Date | null {
  try {
    const d = parseISO(start);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/**
 * Formata o horário flutuante (YYYY-MM-DDTHH:MM:SS) em rótulo pt-BR.
 * Usa "Hoje"/"Amanhã" no lugar do nome do dia quando aplicável.
 */
export function formatMassTime(start: string, now: Date = new Date()): string {
  const d = parseLocal(start);
  if (!d) return start;
  const dateStr = start.slice(0, 10);
  const todayStr = format(now, 'yyyy-MM-dd');
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = format(tomorrow, 'yyyy-MM-dd');
  const hour = format(d, 'HH:mm');
  if (dateStr === todayStr) return `Hoje, ${hour}`;
  if (dateStr === tomorrowStr) return `Amanhã, ${hour}`;
  const weekday = format(d, 'EEE', { locale: ptBR });
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${format(d, 'dd/MM')}, ${hour}`;
}

/** Ocorrência suspensa ("não haverá") — campo ausente em servidor antigo. */
export const isCancelled = (m: { cancelled?: boolean | null }) => m.cancelled === true;

/** Próxima ocorrência que vai mesmo acontecer (pula as suspensas). */
export const firstActiveMass = (list: PublicMass[]): PublicMass | undefined => list.find((m) => !isCancelled(m));

/**
 * Celebração do dia pesquisado (círculo verde): no filtro "Domingo", o domingo;
 * em "Hoje" e "Próximos dias", hoje — desde que ainda não tenha passado
 * (começou há até 30 min ainda conta). Suspensa nunca conta.
 */
export function isOnSearchedDay(m: PublicMass, day: SearchedDay = 'all', now: Date = new Date()): boolean {
  if (isCancelled(m)) return false;
  const d = parseLocal(m.start);
  if (!d) return false;
  if (day === 'sunday') return d.getDay() === 0;
  if (m.start.slice(0, 10) !== format(now, 'yyyy-MM-dd')) return false;
  return d.getTime() >= now.getTime() - STARTED_TOLERANCE_MS;
}

/** Círculo verde no pino: alguma celebração do dia pesquisado que NÃO foi suspensa. */
export const hasMassOnSearchedDay = (
  c: { nextMasses: PublicMass[] },
  day: SearchedDay = 'all',
  now: Date = new Date(),
) => c.nextMasses.some((m) => isOnSearchedDay(m, day, now));

/** Distância em km entre dois pontos (haversine). */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function formatDistance(km: number | null | undefined): string | null {
  if (km == null || !Number.isFinite(km)) return null;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1).replace('.', ',')} km`;
  return `${Math.round(km)} km`;
}

/** "Cidade/UF" (ou só o que existir). */
export const cityLine = (c: { city: string | null; state: string | null }) =>
  c.city && c.state ? `${c.city}/${c.state}` : c.city || c.state || '';

/** Distância: a do servidor, ou calculada a partir da posição do usuário. */
export function distanceFor(c: MapCommunity, user: { lat: number; lng: number } | null): number | null {
  if (c.distanceKm != null && Number.isFinite(c.distanceKm)) return c.distanceKm;
  if (!user) return null;
  return haversineKm(user, { lat: c.latitude, lng: c.longitude });
}
