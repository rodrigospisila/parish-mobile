import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Formata uma string ISO 8601 (ou objeto Date) para o padrão brasileiro de data e hora.
 * Ex: 2025-12-04T10:30:00.000Z -> 04/12/2025 07:30
 * @param dateString A string de data/hora ISO 8601 ou objeto Date.
 * @returns A data e hora formatada no padrão 'dd/MM/yyyy HH:mm'.
 */
export function formatDateTimeBR(dateString: string | Date): string {
  try {
    const date = typeof dateString === 'string' ? parseISO(dateString) : dateString;
    // O 'date-fns' usa o fuso horário local por padrão.
    // O formato 'HH:mm' garante que não haverá AM/PM.
    return format(date, 'dd/MM/yyyy HH:mm', { locale: ptBR });
  } catch (error) {
    console.error('Erro ao formatar data:', error);
    return 'Data Inválida';
  }
}

/**
 * Formata uma string ISO 8601 (ou objeto Date) para o padrão brasileiro de data.
 * Ex: 2025-12-04T10:30:00.000Z -> 04/12/2025
 * @param dateString A string de data/hora ISO 8601 ou objeto Date.
 * @returns A data formatada no padrão 'dd/MM/yyyy'.
 */
export function formatDateBR(dateString: string | Date): string {
  try {
    const date = typeof dateString === 'string' ? parseISO(dateString) : dateString;
    return format(date, 'dd/MM/yyyy', { locale: ptBR });
  } catch (error) {
    console.error('Erro ao formatar data:', error);
    return 'Data Inválida';
  }
}

/**
 * Formata uma string ISO 8601 (ou objeto Date) para o padrão brasileiro de hora.
 * Ex: 2025-12-04T10:30:00.000Z -> 07:30
 * @param dateString A string de data/hora ISO 8601 ou objeto Date.
 * @returns A hora formatada no padrão 'HH:mm'.
 */
export function formatTimeBR(dateString: string | Date): string {
  try {
    const date = typeof dateString === 'string' ? parseISO(dateString) : dateString;
    return format(date, 'HH:mm', { locale: ptBR });
  } catch (error) {
    console.error('Erro ao formatar hora:', error);
    return 'Hora Inválida';
  }
}
