import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Cache de leitura para resiliência offline (roadmap 4.7).
 *
 * Estratégia "network-first, cache-fallback": tenta a rede; em sucesso, grava o
 * resultado no AsyncStorage; em falha (sem internet), devolve o último valor
 * cacheado. Garante que o app abra as escalas/eventos do usuário mesmo sem rede.
 *
 * Uso apenas para LEITURAS idempotentes. Escritas offline (fila de sincronização)
 * são uma etapa posterior.
 */
const PREFIX = '@parish:cache:';

interface CacheEnvelope<T> {
  cachedAt: number;
  data: T;
}

export async function readCache<T>(key: string): Promise<{ data: T; cachedAt: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const envelope = JSON.parse(raw) as CacheEnvelope<T>;
    return { data: envelope.data, cachedAt: envelope.cachedAt };
  } catch {
    return null;
  }
}

export async function writeCache<T>(key: string, data: T): Promise<void> {
  try {
    const envelope: CacheEnvelope<T> = { cachedAt: Date.now(), data };
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(envelope));
  } catch {
    // cache é best-effort; falha ao gravar nunca quebra o fluxo
  }
}

/**
 * Executa `fetcher` (rede). Em sucesso, atualiza o cache e retorna os dados
 * marcando `fromCache: false`. Em falha, retorna o cache (se houver) com
 * `fromCache: true` e `cachedAt`; se não houver cache, relança o erro.
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<{ data: T; fromCache: boolean; cachedAt?: number }> {
  try {
    const fresh = await fetcher();
    await writeCache(key, fresh);
    return { data: fresh, fromCache: false };
  } catch (error) {
    const cached = await readCache<T>(key);
    if (cached) {
      return { data: cached.data, fromCache: true, cachedAt: cached.cachedAt };
    }
    throw error;
  }
}

export async function clearCache(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}
