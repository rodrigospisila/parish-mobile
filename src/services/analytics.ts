import { useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import axios from 'axios';
import Constants from 'expo-constants';
import { useFocusEffect } from 'expo-router';
import api, { getAccessToken } from '../config/api';
import { useCommunity } from '../context/CommunityContext';

/**
 * Telemetria de uso do produto (Onda 1, contrato C4 — eng-qualidade-17).
 *
 * - SEM dado pessoal: só o nome do evento, a plataforma, a versão do app e
 *   (quando faz sentido) a comunidade. O papel vem do token no servidor, que
 *   agrega por dia (ProductEvent) — nada identifica a pessoa.
 * - `track()` só enfileira em memória; o envio é em lote (`POST /product-events`,
 *   até 50 por vez) depois de alguns segundos, ao juntar eventos suficientes
 *   ou quando o app vai para o segundo plano.
 * - Nunca atrapalha o app: erro é engolido. Sem rede/servidor fora → a fila
 *   espera (com recuo crescente) e, passando de MAX_QUEUE, descarta os mais
 *   antigos. Servidor que recusa o lote (4xx) → o lote é descartado.
 * - Os nomes abaixo precisam estar na lista branca do backend.
 */
export const ANALYTICS_EVENTS = [
  'app_open',
  'screen_home',
  'screen_liturgy',
  'screen_nearby',
  'screen_community',
  'screen_schedule',
  'screen_catechesis',
  'screen_tithe',
  'claim_started', // tocou em "É da equipe desta paróquia?" (página da comunidade)
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

interface AnalyticsEvent {
  name: AnalyticsEventName;
  platform: 'app';
  appVersion?: string;
  communityId?: string;
}

/**
 * Rota da coleta. O contrato C4 dizia `POST /events`, mas essa rota já é a
 * criação de eventos da paróquia — o backend publicou em `/product-events`.
 */
const EVENTS_PATH = '/product-events';
/** Máximo por requisição (limite do backend) */
const BATCH_SIZE = 50;
/** Fila máxima em memória: acima disso descarta os mais antigos */
const MAX_QUEUE = 200;
/** Envia sozinho ao juntar isto */
const FLUSH_AT = 20;
/** Espera antes de enviar (junta os eventos de uma navegação) */
const FLUSH_DELAY_MS = 15_000;
/** Recuo depois de falha temporária: 15 s, 30 s, 1 min… até 10 min */
const BACKOFF_BASE_MS = 15_000;
const BACKOFF_MAX_MS = 10 * 60_000;
/** Servidor sem a rota (backend antigo): para de tentar por um bom tempo */
const NOT_FOUND_PAUSE_MS = 6 * 60 * 60_000;

const APP_VERSION: string | undefined = Constants.expoConfig?.version ?? undefined;

let queue: AnalyticsEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
let failures = 0;
let pausedUntil = 0;
let appStateHooked = false;

const isValidId = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && id.length <= 64;

const hookAppState = () => {
  if (appStateHooked) return;
  appStateHooked = true;
  try {
    AppState.addEventListener('change', (state) => {
      // Indo para o segundo plano: última chance de enviar antes de o sistema suspender
      if (state === 'background' || state === 'inactive') void flushAnalytics();
    });
  } catch {
    // sem AppState (teste/ambiente estranho): segue só com o temporizador
  }
};

const schedule = (delayMs: number) => {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void flushAnalytics();
  }, delayMs);
};

/**
 * Registra um evento de uso. Nunca lança erro e nunca espera a rede.
 * `communityId` só quando o evento é de uma comunidade (null/undefined = sem).
 */
export function track(name: AnalyticsEventName, options?: { communityId?: string | null }): void {
  try {
    if (!(ANALYTICS_EVENTS as readonly string[]).includes(name)) return;
    hookAppState();
    const event: AnalyticsEvent = { name, platform: 'app' };
    if (APP_VERSION) event.appVersion = APP_VERSION;
    if (isValidId(options?.communityId)) event.communityId = options!.communityId as string;
    queue.push(event);
    if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
    if (queue.length >= FLUSH_AT) void flushAnalytics();
    else schedule(FLUSH_DELAY_MS);
  } catch {
    // telemetria nunca derruba a tela
  }
}

const postBatch = async (events: AnalyticsEvent[]) => {
  const url = `${String(api.defaults.baseURL || '').replace(/\/+$/, '')}${EVENTS_PATH}`;
  const token = await getAccessToken().catch(() => null);
  const send = (bearer: string | null) =>
    axios.post(
      url,
      { events },
      {
        timeout: 10_000,
        headers: {
          'Content-Type': 'application/json',
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        },
      },
    );
  // Axios "cru" (fora da instância `api`): um 401 aqui nunca dispara
  // renovação de sessão nem logout. Token vencido → manda sem Bearer.
  try {
    await send(token);
  } catch (error) {
    if (token && axios.isAxiosError(error) && error.response?.status === 401) {
      await send(null);
      return;
    }
    throw error;
  }
};

/** Envia a fila em lotes. Chamado pelo temporizador e ao ir para o segundo plano. */
export async function flushAnalytics(): Promise<void> {
  if (flushing || queue.length === 0) return;
  if (Date.now() < pausedUntil) {
    schedule(pausedUntil - Date.now());
    return;
  }
  flushing = true;
  try {
    while (queue.length > 0) {
      const batch = queue.slice(0, BATCH_SIZE);
      try {
        await postBatch(batch);
        failures = 0;
        queue = queue.filter((e) => !batch.includes(e));
      } catch (error) {
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        if (status === 404) {
          // Backend ainda sem a rota: descarta e para de tentar por horas
          queue = queue.filter((e) => !batch.includes(e));
          pausedUntil = Date.now() + NOT_FOUND_PAUSE_MS;
        } else if (status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429) {
          // Servidor recusou o lote (validação/nome fora da lista): descarta
          queue = queue.filter((e) => !batch.includes(e));
          continue;
        } else {
          // Sem rede, 408/429 ou 5xx: guarda e tenta depois, com recuo
          failures += 1;
          pausedUntil = Date.now() + Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (failures - 1));
        }
        break;
      }
    }
  } finally {
    flushing = false;
    if (queue.length > 0) schedule(Math.max(FLUSH_DELAY_MS, pausedUntil - Date.now()));
  }
}

/**
 * Evento de tela a cada vez que a tela ganha o foco.
 * - padrão: com a comunidade ATIVA do usuário (se houver);
 * - `communityId`: comunidade explícita (ex.: página pública visitada);
 * - `communityId: null`: sem comunidade (ex.: mapa).
 */
export function useTrackScreen(name: AnalyticsEventName, options?: { communityId?: string | null }): void {
  const { activeCommunityId } = useCommunity();
  const explicit = options !== undefined && 'communityId' in options;
  const communityId = explicit ? options!.communityId : activeCommunityId;
  // A comunidade pode chegar depois (hidratação): o ref evita contar a mesma visita duas vezes
  const communityRef = useRef<string | null | undefined>(communityId);
  communityRef.current = communityId;
  useFocusEffect(
    useCallback(() => {
      track(name, { communityId: communityRef.current });
    }, [name]),
  );
}

/** Só para testes. */
export const __analyticsInternals = {
  get queue() {
    return queue;
  },
  reset() {
    queue = [];
    failures = 0;
    pausedUntil = 0;
    if (timer) clearTimeout(timer);
    timer = null;
  },
};
