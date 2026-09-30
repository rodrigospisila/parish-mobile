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

// ---------- Filtro de horário (barra de 00:00 a 23:59) ----------

/** Pontos da barra: 00:00, 00:30 … 23:30 e 23:59 no fim (49 posições). */
export const TIME_STEPS = 48;

/** Intervalo em posições da barra: [início, fim], inclusive. */
export type TimeRange = [number, number];

/** Intervalo inteiro = sem filtro de horário. */
export const FULL_TIME_RANGE: TimeRange = [0, TIME_STEPS];

export const isFullTimeRange = (r: TimeRange) => r[0] <= 0 && r[1] >= TIME_STEPS;

/** Minutos do dia de uma posição da barra (a última é 23:59). */
export const stepToMinutes = (step: number) => (step >= TIME_STEPS ? 23 * 60 + 59 : Math.max(0, step) * 30);

/** "06:30" */
export const fmtMinutes = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** "06:30" de uma posição da barra. */
export const fmtStep = (step: number) => fmtMinutes(stepToMinutes(step));

/** Hora falada para leitor de tela: "6 horas e 30 minutos", "meia-noite". */
export function spokenStep(step: number): string {
  const min = stepToMinutes(step);
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0 && m === 0) return 'meia-noite';
  const hs = h === 0 ? '' : `${h} ${h === 1 ? 'hora' : 'horas'}`;
  const ms = m ? `${m} minutos` : '';
  return [hs, ms].filter(Boolean).join(' e ');
}

/** "06:00–12:00" (curto, para o chip). */
export const timeRangeShort = (r: TimeRange) => `${fmtStep(r[0])}–${fmtStep(r[1])}`;

/** "Das 06:00 às 12:00". */
export const timeRangeLong = (r: TimeRange) => `Das ${fmtStep(r[0])} às ${fmtStep(r[1])}`;

/** Minutos do dia em que a celebração começa (lidos do texto, sem fuso); null se inválido. */
export function startMinutes(start: string): number | null {
  const h = Number(start.slice(11, 13));
  const m = Number(start.slice(14, 16));
  if (!Number.isInteger(h) || !Number.isInteger(m) || start.charAt(13) !== ':') return null;
  return h * 60 + m;
}

/** A celebração começa dentro do intervalo (inclusive nas duas pontas)? */
export function startsInTimeRange(m: { start: string }, r: TimeRange): boolean {
  if (isFullTimeRange(r)) return true;
  const min = startMinutes(m.start);
  if (min == null) return false;
  return min >= stepToMinutes(r[0]) && min <= stepToMinutes(r[1]);
}

/**
 * Horários de uma igreja que valem para os filtros de dia e de horário. Sem
 * filtro nenhum devolve a própria igreja (mesmo objeto).
 */
export function filterCommunityMasses<C extends { nextMasses: PublicMass[] }>(
  c: C,
  day: SearchedDay,
  range: TimeRange,
  todayStr: string,
): C {
  const full = isFullTimeRange(range);
  if (day === 'all' && full) return c;
  const masses = c.nextMasses.filter((m) => {
    if (day === 'today' && m.start.slice(0, 10) !== todayStr) return false;
    if (day === 'sunday') {
      const d = parseLocal(m.start);
      if (!d || d.getDay() !== 0) return false;
    }
    return full || startsInTimeRange(m, range);
  });
  return masses.length === c.nextMasses.length ? c : { ...c, nextMasses: masses };
}
