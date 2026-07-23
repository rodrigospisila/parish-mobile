import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import api from '../config/api';

/**
 * Fila de sincronização de ESCRITAS offline (roadmap 4.7 — camada de escrita).
 *
 * Complementa o offlineCache (leituras). Quando uma escrita idempotente falha
 * por FALTA DE REDE, ela entra na fila e é reenviada quando o app volta ao
 * primeiro plano / reconecta (flushWriteQueue é chamado no _layout raiz).
 *
 * Regras:
 * - Apenas erros de REDE enfileiram (sem response). Erros do servidor (4xx/5xx)
 *   NUNCA enfileiram nem re-executam: a regra de negócio já rejeitou a ação.
 * - No flush, itens rejeitados pelo servidor são DESCARTADOS (poison-pill não
 *   trava a fila); itens com erro de rede permanecem para a próxima tentativa.
 * - Use somente para escritas seguras de repetir (confirmar/declinar escala).
 */

const QUEUE_KEY = '@parish:write-queue:v1';

export interface QueuedWrite {
  id: string;
  method: 'post' | 'patch' | 'put' | 'delete';
  path: string;
  body?: unknown;
  /** Descrição curta para exibir ao usuário (ex.: "Confirmar presença") */
  description: string;
  createdAt: number;
}

export interface FlushResult {
  sent: number;
  discarded: number;
  remaining: number;
}

let flushing = false;

async function readQueue(): Promise<QueuedWrite[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedWrite[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // best-effort: falha ao persistir não pode quebrar o fluxo do app
  }
}

/** True quando o erro é de rede (sem resposta do servidor). */
export function isNetworkError(error: unknown): boolean {
  return axios.isAxiosError(error) && !error.response;
}

export async function enqueueWrite(
  write: Omit<QueuedWrite, 'id' | 'createdAt'>,
): Promise<QueuedWrite> {
  const item: QueuedWrite = {
    ...write,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  };
  const queue = await readQueue();
  queue.push(item);
  await writeQueue(queue);
  return item;
}

export async function getQueue(): Promise<QueuedWrite[]> {
  return readQueue();
}

export async function getQueueLength(): Promise<number> {
  return (await readQueue()).length;
}

/**
 * Reenvia a fila em ordem (FIFO).
 * - sucesso → remove da fila
 * - erro de rede → para o flush (continua offline); mantém o restante
 * - erro do servidor → descarta o item (a prévia/estado local será recarregado)
 */
export async function flushWriteQueue(): Promise<FlushResult> {
  if (flushing) return { sent: 0, discarded: 0, remaining: (await readQueue()).length };
  flushing = true;
  try {
    let queue = await readQueue();
    let sent = 0;
    let discarded = 0;

    while (queue.length > 0) {
      const item = queue[0];
      try {
        await api.request({ method: item.method, url: item.path, data: item.body });
        sent++;
        queue = queue.slice(1);
        await writeQueue(queue);
      } catch (error) {
        if (isNetworkError(error)) {
          // Continua offline: preserva a fila e tenta na próxima oportunidade
          break;
        }
        // Rejeição do servidor: descarta para não travar os demais itens
        discarded++;
        queue = queue.slice(1);
        await writeQueue(queue);
      }
    }

    return { sent, discarded, remaining: queue.length };
  } finally {
    flushing = false;
  }
}

export async function clearWriteQueue(): Promise<void> {
  try {
    await AsyncStorage.removeItem(QUEUE_KEY);
  } catch {
    // ignore
  }
}
