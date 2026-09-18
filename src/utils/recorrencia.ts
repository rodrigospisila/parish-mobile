/**
 * Recorrência do horário fixo de missa.
 *
 * O modelo sabe três formas: toda semana, enésimo dia da semana do mês
 * ("1º e 3º sábado") e data fixa do mês ("todo dia 13"). No interior do Norte e
 * do Nordeste a mensal é a regra: a comunidade recebe o padre uma vez por mês.
 *
 * Aqui isso importa mais do que em qualquer outra tela — "Missa mais próxima"
 * mostrando o sábado que vem, quando a missa só acontece no 1º sábado, manda o
 * fiel para uma igreja fechada.
 */

export type MassRecurrence = 'WEEKLY' | 'MONTHLY_NTH' | 'MONTHLY_DAY';

export interface Recorrencia {
  recurrence?: MassRecurrence | null;
  dayOfWeek?: number | null;
  weeksOfMonth?: number[] | null;
  dayOfMonth?: number | null;
}

const NOMES = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Domingo e sábado são masculinos; os dias úteis, femininos ("1ª sexta-feira"). */
const feminino = (dayOfWeek: number) => dayOfWeek >= 1 && dayOfWeek <= 5;

export const ehMensal = (r: Recorrencia) => r.recurrence === 'MONTHLY_NTH' || r.recurrence === 'MONTHLY_DAY';

/** Rótulo curto para o cartão ("Sáb", "1º Sáb", "Dia 13"). */
export function rotuloCurto(r: Recorrencia): string {
  if (r.recurrence === 'MONTHLY_DAY') return r.dayOfMonth ? `Dia ${r.dayOfMonth}` : 'Mensal';
  const dia = r.dayOfWeek;
  if (typeof dia !== 'number') return '';
  if (r.recurrence === 'MONTHLY_NTH' && (r.weeksOfMonth ?? []).length > 0) {
    const semanas = r.weeksOfMonth as number[];
    const fem = feminino(dia);
    if (semanas.length === 1) {
      const n = semanas[0];
      return `${n === -1 ? 'Últ.' : `${n}${fem ? 'ª' : 'º'}`} ${CURTOS[dia]}`;
    }
    return `${CURTOS[dia]} (mensal)`;
  }
  return CURTOS[dia] ?? '';
}

/** Frase completa ("1º e 3º sábado do mês"). */
export function descreverRecorrencia(r: Recorrencia): string {
  const dia = r.dayOfWeek;
  if (r.recurrence === 'MONTHLY_DAY') {
    return r.dayOfMonth ? `Todo dia ${r.dayOfMonth} do mês` : 'Data fixa do mês';
  }
  if (r.recurrence === 'MONTHLY_NTH' && typeof dia === 'number' && (r.weeksOfMonth ?? []).length > 0) {
    const fem = feminino(dia);
    const rotulo = (n: number) => (n === -1 ? (fem ? 'última' : 'último') : `${n}${fem ? 'ª' : 'º'}`);
    const partes = (r.weeksOfMonth as number[]).map(rotulo);
    const lista = partes.length > 1 ? `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}` : partes[0];
    const texto = `${lista} ${NOMES[dia]} do mês`;
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }
  if (typeof dia !== 'number') return '—';
  const nome = NOMES[dia];
  return `${feminino(dia) ? 'Toda' : 'Todo'} ${nome}`;
}

/**
 * Próxima data/hora em que o horário acontece. Devolve null quando não há
 * ocorrência no horizonte — melhor não mostrar nada do que mostrar errado.
 */
export function proximaOcorrencia(r: Recorrencia, time: string, apartirDe: Date): Date | null {
  const [hh, mm] = (time || '00:00').split(':').map((n) => parseInt(n, 10) || 0);
  const base = new Date(apartirDe);
  const comHora = (d: Date) => {
    const x = new Date(d);
    x.setHours(hh, mm, 0, 0);
    return x;
  };

  if (r.recurrence === 'MONTHLY_DAY') {
    if (!r.dayOfMonth) return null;
    for (let i = 0; i < 14; i += 1) {
      const mes = new Date(base.getFullYear(), base.getMonth() + i, 1);
      const diasNoMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
      // Fevereiro não tem "dia 30": o mês é pulado, não empurrado para março
      if (r.dayOfMonth > diasNoMes) continue;
      const data = comHora(new Date(mes.getFullYear(), mes.getMonth(), r.dayOfMonth));
      if (data.getTime() >= base.getTime()) return data;
    }
    return null;
  }

  const dia = r.dayOfWeek;
  if (typeof dia !== 'number') return null;

  if (r.recurrence === 'MONTHLY_NTH' && (r.weeksOfMonth ?? []).length > 0) {
    const semanas = r.weeksOfMonth as number[];
    for (let i = 0; i < 14; i += 1) {
      const mes = new Date(base.getFullYear(), base.getMonth() + i, 1);
      const diasNoMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
      const doDia: Date[] = [];
      for (let d = 1; d <= diasNoMes; d += 1) {
        const data = new Date(mes.getFullYear(), mes.getMonth(), d);
        if (data.getDay() === dia) doDia.push(data);
      }
      const candidatas = semanas
        .map((s) => (s === -1 ? doDia[doDia.length - 1] : doDia[s - 1]))
        .filter((d): d is Date => Boolean(d))
        .map(comHora)
        .filter((d) => d.getTime() >= base.getTime())
        .sort((a, b) => a.getTime() - b.getTime());
      if (candidatas.length) return candidatas[0];
    }
    return null;
  }

  const data = new Date(base);
  data.setDate(data.getDate() + ((dia - data.getDay() + 7) % 7));
  const comHoraAjustada = comHora(data);
  // Hoje, mas já passou: vai para a semana seguinte
  if (comHoraAjustada.getTime() < base.getTime()) comHoraAjustada.setDate(comHoraAjustada.getDate() + 7);
  return comHoraAjustada;
}
