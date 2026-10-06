/**
 * Datas civis (só-dia) vindas do servidor — auditoria A20.
 *
 * O painel grava a data da missa especial como '2026-10-12T00:00:00.000Z'
 * (meia-noite UTC). `new Date(...)` disso no fuso de Brasília é 11/10 às
 * 21:00 — o DIA ANTERIOR. Data só-dia é sempre lida pelos 10 primeiros
 * caracteres (AAAA-MM-DD) e montada no horário local, nunca via UTC.
 */

const DIA_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/** '2026-10-12' ou '2026-10-12T00:00:00.000Z' → '2026-10-12' (null se inválida). */
export function chaveDataCivil(valor: string | null | undefined): string | null {
  const m = DIA_RE.exec(String(valor ?? '').trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Data só-dia + 'HH:MM' → Date no horário LOCAL do aparelho (null se inválida). */
export function dataCivilComHora(valor: string | null | undefined, hora?: string | null): Date | null {
  const chave = chaveDataCivil(valor);
  if (!chave) return null;
  const [y, m, d] = chave.split('-').map(Number);
  const [hh, mm] = String(hora || '00:00')
    .split(':')
    .map((n) => parseInt(n, 10) || 0);
  const data = new Date(y, m - 1, d, hh, mm, 0, 0);
  return Number.isNaN(data.getTime()) ? null : data;
}

/** Data só-dia → 'dd/MM/aaaa' sem passar por fuso. */
export function formatarDataCivil(valor: string | null | undefined): string {
  const chave = chaveDataCivil(valor);
  if (!chave) return '';
  const [y, m, d] = chave.split('-');
  return `${d}/${m}/${y}`;
}
