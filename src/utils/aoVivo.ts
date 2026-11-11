/**
 * "Acontecendo agora" dos horários fixos (missa, confissão, adoração…).
 *
 * Quem decide é o SERVIDOR (campo `happeningNow`, no fuso da comunidade, já
 * descontando o "não haverá" do dia) — o relógio do aparelho pode estar em
 * outro fuso. Servidor antigo não manda o campo: nada aparece como "agora" e
 * as telas ficam como sempre foram.
 */

const HHMM = /^(\d{1,2}):(\d{2})/;

/** "7:30" / "07:30:00" → "07:30"; inválido → ''. */
export const horaCurta = (value?: string | null): string => {
  const m = HHMM.exec(String(value ?? '').trim());
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
};

/** Hora de um horário de parede "YYYY-MM-DDTHH:MM:SS" (sem passar por fuso). */
export const horaDe = (floating?: string | null): string => horaCurta(String(floating ?? '').slice(11, 16));

/** Só `true` explícito conta (ausente/nulo = servidor antigo = não mostra). */
export const aoVivo = (item?: { happeningNow?: boolean | null; cancelled?: boolean | null } | null): boolean =>
  !!item && item.happeningNow === true && item.cancelled !== true;

/** "19:00–20:00" quando há fim válido (depois do início); senão só "19:00". */
export const intervalo = (inicio?: string | null, fim?: string | null): string => {
  const a = horaCurta(inicio);
  const b = horaCurta(fim);
  return a && b && b > a ? `${a}–${b}` : a || String(inicio ?? '');
};

/** Tipos que são um ATENDIMENTO com janela (o fim importa para o fiel chegar a tempo). */
export const ehAtendimento = (type?: string | null): boolean => type === 'CONFESSION' || type === 'ADORATION';
