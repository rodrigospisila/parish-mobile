/** Frase de sem conexão usada em todas as telas de acesso */
export const NO_CONNECTION_MESSAGE = 'Sem conexão com o servidor. Confira sua internet e tente de novo.';

/**
 * Quanto esperar, em palavras, a partir do Retry-After (segundos) do 429.
 * Sem o cabeçalho (servidor antigo), mantém o "1 minuto" de antes.
 */
export const retryWaitPhrase = (retryAfterSeconds?: number | null): string => {
  if (retryAfterSeconds === undefined || retryAfterSeconds === null || !Number.isFinite(retryAfterSeconds)) {
    return 'Aguarde 1 minuto e tente de novo.';
  }
  const seconds = Math.max(0, Math.ceil(retryAfterSeconds));
  if (seconds <= 45) return seconds <= 5 ? 'Tente de novo em instantes.' : `Aguarde ${seconds} segundos e tente de novo.`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes <= 1) return 'Aguarde 1 minuto e tente de novo.';
  if (minutes < 55) return `Aguarde ${minutes} minutos e tente de novo.`;
  const hours = Math.round(minutes / 60);
  if (hours <= 1) return 'Tente de novo em cerca de 1 hora.';
  return `Tente de novo em cerca de ${hours} horas.`;
};

/** Mensagem do limite de tentativas (429) com o tempo real de espera */
export const rateLimitMessage = (retryAfterSeconds?: number | null): string =>
  `Muitas tentativas seguidas. ${retryWaitPhrase(retryAfterSeconds)}`;

/**
 * Traduz a falha de uma chamada de acesso para uma frase que o fiel entende.
 * Os serviços lançam Error com a mensagem do servidor em português e, quando
 * passam por `authFailure`, com `status` (0 = sem resposta do servidor) e,
 * no 429, `retryAfter` (segundos do cabeçalho Retry-After).
 * Nos demais casos, mostra a mensagem real do servidor (ex.: "Email já cadastrado").
 */
export const authErrorMessage = (error: any, fallback: string): string => {
  const status: number | undefined = typeof error?.status === 'number' ? error.status : undefined;
  const raw: string = typeof error?.message === 'string' ? error.message : '';
  if (status === 0) return NO_CONNECTION_MESSAGE;
  if (status === 429) return rateLimitMessage(error?.retryAfter);
  if (status !== undefined && status >= 500) {
    return 'O servidor está com um problema agora. Tente de novo em instantes.';
  }
  return raw || fallback;
};
