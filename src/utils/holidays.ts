/**
 * Feriados nacionais do Brasil + datas litúrgicas móveis (mesma tabela do
 * painel web): a agenda gerada já vem com esses dias desmarcados.
 */
const easterSunday = (year: number): Date => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
};

const holidayCache = new Map<number, Map<string, string>>();

export const nationalHolidays = (year: number): Map<string, string> => {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const map = new Map<string, string>();
  const fixed = (month: number, day: number, label: string) =>
    map.set(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, label);
  fixed(1, 1, 'Confraternização Universal');
  fixed(4, 21, 'Tiradentes');
  fixed(5, 1, 'Dia do Trabalho');
  fixed(9, 7, 'Independência do Brasil');
  fixed(10, 12, 'Nossa Senhora Aparecida');
  fixed(11, 2, 'Finados');
  fixed(11, 15, 'Proclamação da República');
  fixed(11, 20, 'Consciência Negra');
  fixed(12, 25, 'Natal');
  const easter = easterSunday(year);
  const offset = (days: number) => {
    const date = new Date(easter);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  map.set(offset(-48), 'Carnaval (segunda)');
  map.set(offset(-47), 'Carnaval (terça)');
  map.set(offset(-2), 'Sexta-feira Santa');
  map.set(offset(0), 'Páscoa');
  map.set(offset(60), 'Corpus Christi');
  holidayCache.set(year, map);
  return map;
};

export const holidayLabel = (isoDate: string): string | null =>
  nationalHolidays(Number(isoDate.slice(0, 4))).get(isoDate) ?? null;

/** dd/mm/aaaa → aaaa-mm-dd (null se inválida) */
export const parseBrDate = (text: string): string | null => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return `${year}-${m[2]}-${m[1]}`;
};

/** Máscara progressiva dd/mm/aaaa enquanto digita */
export const maskBrDate = (raw: string): string => {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

export const isoToBr = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};
