/**
 * Horário fixo suspenso numa data ("não haverá").
 *
 * O gestor marca que a Confissão das 15:00 não acontece na quinta (agenda dos
 * padres, feriado…). O servidor manda as datas em `upcomingCancellations`
 * (hoje até +60 dias) e marca `cancelled` nas ocorrências. Servidor antigo não
 * manda nada — aí tudo continua como antes.
 */
import { proximaOcorrencia, Recorrencia } from './recorrencia';

export interface DiaSuspenso {
  /** YYYY-MM-DD */
  date: string;
  reason: string | null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Dia local no formato YYYY-MM-DD (sem passar por UTC). */
export const chaveDoDia = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Hoje + n dias, em YYYY-MM-DD. */
export const chaveDaquiA = (dias: number, base: Date = new Date()) => {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + dias);
  return chaveDoDia(d);
};

/** "2026-10-02" → "02/10". */
export const diaMes = (chave: string) => {
  const [, m, d] = chave.split('-');
  return d && m ? `${d}/${m}` : chave;
};

/** ["02/10", "09/10", "16/10"] → "02/10, 09/10 e 16/10". */
export const juntarLista = (itens: string[]) =>
  itens.length <= 1 ? itens.join('') : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;

/** Suspensões válidas e ordenadas (ignora lixo de servidor). */
export const suspensoesDe = (s: { upcomingCancellations?: DiaSuspenso[] | null }): DiaSuspenso[] =>
  (Array.isArray(s.upcomingCancellations) ? s.upcomingCancellations : [])
    .filter((c) => c && typeof c.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.date.slice(0, 10)))
    .map((c) => ({ date: c.date.slice(0, 10), reason: c.reason ?? null }))
    .sort((a, b) => a.date.localeCompare(b.date));

/** Suspensão do horário num dia (ou null). */
export const suspensaoNoDia = (
  s: { upcomingCancellations?: DiaSuspenso[] | null },
  chave: string,
): DiaSuspenso | null => suspensoesDe(s).find((c) => c.date === chave) ?? null;

/** Motivo pronto para uma linha ("agenda dos padres"); vazio se não houver. */
export const motivoCurto = (reason?: string | null) => (reason || '').trim().replace(/\s+/g, ' ');

/**
 * Próxima ocorrência de um horário recorrente PULANDO as datas suspensas.
 * Null quando não há ocorrência à vista.
 */
export function proximaOcorrenciaValida(
  r: Recorrencia & { upcomingCancellations?: DiaSuspenso[] | null },
  time: string,
  apartirDe: Date,
): Date | null {
  const suspensas = new Set(suspensoesDe(r).map((c) => c.date));
  let base = new Date(apartirDe);
  // Poucas voltas bastam: a lista cobre só ~60 dias
  for (let i = 0; i < 16; i += 1) {
    const data = proximaOcorrencia(r, time, base);
    if (!data) return null;
    if (!suspensas.has(chaveDoDia(data))) return data;
    // Pula para o dia seguinte à ocorrência suspensa
    base = new Date(data.getFullYear(), data.getMonth(), data.getDate() + 1, 0, 0, 0, 0);
  }
  return null;
}
