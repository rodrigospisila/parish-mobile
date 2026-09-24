/** Frase de sem conexão usada em todas as telas de acesso */
export const NO_CONNECTION_MESSAGE = 'Sem conexão com o servidor. Confira sua internet e tente de novo.';

/**
 * Traduz a falha de uma chamada de acesso para uma frase que o fiel entende.
 * Os serviços lançam Error com a mensagem do servidor em português e, quando
 * passam por `authFailure`, com `status` (0 = sem resposta do servidor).
 * Nos demais casos, mostra a mensagem real do servidor (ex.: "Email já cadastrado").
 */
export const authErrorMessage = (error: any, fallback: string): string => {
  const status: number | undefined = typeof error?.status === 'number' ? error.status : undefined;
  const raw: string = typeof error?.message === 'string' ? error.message : '';
  if (status === 0) return NO_CONNECTION_MESSAGE;
  if (status === 429) return 'Muitas tentativas seguidas. Aguarde 1 minuto e tente de novo.';
  if (status !== undefined && status >= 500) {
    return 'O servidor está com um problema agora. Tente de novo em instantes.';
  }
  return raw || fallback;
};
