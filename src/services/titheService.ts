import api, { getErrorMessage } from '../config/api';
import { downloadCatechesisPdf } from './catechesisService';

// ============================================
// DÍZIMO ONLINE — Pix da paróquia (Fase 1 + Onda D2)
// ============================================

export type TitheIntentStatus = 'CREATED' | 'DECLARED' | 'CONFIRMED' | 'CANCELLED';
export type TitheIntentKind = 'TITHE' | 'OFFERING';
/** Meio de pagamento no provedor: Pix (padrão), cartão (página segura do Asaas) ou boleto */
export type TithePaymentMethod = 'PIX' | 'CARD' | 'BOLETO';

export const PAYMENT_METHOD_LABELS: Record<TithePaymentMethod, string> = {
  PIX: 'Pix',
  CARD: 'Cartão',
  BOLETO: 'Boleto',
};

/**
 * Situações do provedor que o app destaca (os demais valores de providerStatus são internos):
 * in_review — cartão em análise de risco, ainda CREATED: a confirmação vem sozinha, sem pagar de novo;
 * disputed — estorno/chargeback em disputa num intent já CONFIRMED.
 */
export const PROVIDER_STATUS_HINTS = {
  in_review: 'Em análise pelo provedor — a confirmação chega sozinha',
  disputed: 'Estorno em análise',
} as const;

export interface TitheIntent {
  id: string;
  amount: number;
  amountPaid?: number | null;
  referenceMonth: string;
  kind: TitheIntentKind;
  status: TitheIntentStatus;
  txid: string;
  brCode?: string | null;
  qrDataUrl?: string;
  note?: string | null;
  anonymous?: boolean;
  contestNote?: string | null;
  /** Encerrado pela tesouraria e ainda não contestado — o fiel pode contestar */
  canContest?: boolean;
  /** PIX_STATIC (chave da paróquia) ou GATEWAY (provedor, confirmação automática) */
  method?: 'PIX_STATIC' | 'GATEWAY';
  /** PIX (padrão) · CARD/BOLETO só no Asaas — sem brCode/qrDataUrl; qrExpiresAt traz o vencimento */
  paymentMethod?: TithePaymentMethod;
  /** Página segura do provedor para pagar (cartão, ou boleto) */
  paymentUrl?: string | null;
  /** PDF do boleto */
  boletoUrl?: string | null;
  /** Linha digitável do boleto */
  boletoLine?: string | null;
  feeAmount?: number;
  chargedAmount?: number | null;
  /** Validade do Pix; para boleto já inclui a folga de compensação (vencimento + 3 dias) */
  qrExpiresAt?: string | null;
  /** Situação bruta no provedor — ver PROVIDER_STATUS_HINTS ('in_review', 'disputed') */
  providerStatus?: string | null;
  declaredAt?: string | null;
  confirmedAt?: string | null;
  createdAt: string;
}

export interface MyTithe {
  member: { id: string; fullName: string; community: string };
  parish: {
    id: string;
    name: string;
    titheEnabled: boolean;
    titheMessage?: string | null;
    pixKeyType?: string | null;
    pixKey?: string | null;
    merchantName?: string | null;
  } | null;
  tither: { registrationNumber?: string | null; joinedAt: string; status: string } | null;
  contributions: Array<{
    id: string;
    amount: number;
    date: string;
    referenceMonth: string;
    method: string;
    receiptNumber?: string | null;
  }>;
  intents: TitheIntent[];
  suggestedAmount: number | null;
  currentMonth: string;
  reminderDay: number | null;
  monthsBack: number;
  monthsAhead: number;
  persistentQrAvailable: boolean;
  gateway: {
    provider: string | null;
    available: boolean;
    needsCpf: boolean;
    /** Mercado Pago exige e-mail do pagador; sem ele o gateway fica indisponível */
    needsEmail: boolean;
    feePolicy: string;
    feeFixed: number;
    feePercent: number;
    recurringAvailable: boolean;
    /** Meios aceitos — só ['PIX'] quando não há Asaas ou falta CPF */
    methods?: TithePaymentMethod[];
  } | null;
  schedule: TitheSchedule | null;
}

export interface TitheSchedule {
  id: string;
  amount: number;
  dayOfMonth: number;
  mode: 'PIX_AUTOMATIC' | 'PIX_SUBSCRIPTION';
  status: 'PENDING_AUTHORIZATION' | 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'FAILED';
  nextDueDate?: string | null;
  authorizationPayload?: string | null;
  authorizationExpires?: string | null;
  /** Autorização vencida: authorizationPayload/qrDataUrl vêm null — cancelar e ativar de novo */
  authorizationExpired?: boolean;
  lastError?: string | null;
  qrDataUrl?: string | null;
}

export const SCHEDULE_STATUS_LABELS: Record<TitheSchedule['status'], string> = {
  PENDING_AUTHORIZATION: 'Aguardando autorização no banco',
  ACTIVE: 'Ativo',
  PAUSED: 'Pausado',
  CANCELLED: 'Cancelado',
  FAILED: 'Não ativado',
};

export interface PersistentQr {
  registrationNumber: string | null;
  txid: string;
  brCode: string;
  qrDataUrl: string;
  parish: string;
  merchantName?: string | null;
}

/** CREATED é "Pix gerado" só para Pix — cartão/boleto usam o rótulo próprio (ver statusLabel na tela) */
export const STATUS_LABELS: Record<TitheIntentStatus, string> = {
  CREATED: 'Pix gerado',
  DECLARED: 'Aguardando conferência',
  CONFIRMED: 'Confirmado',
  CANCELLED: 'Cancelado',
};

const wrap = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const getMyTithe = (): Promise<MyTithe> => wrap(async () => (await api.get('/tithe/my')).data);

export const createTitheIntent = (input: {
  amount: number;
  referenceMonth?: string;
  kind: TitheIntentKind;
  anonymous?: boolean;
  /** Padrão PIX; CARD/BOLETO exigem Asaas (o backend responde 400 quando não há) */
  paymentMethod?: TithePaymentMethod;
}): Promise<TitheIntent> => wrap(async () => (await api.post('/tithe/intents', input)).data);

export const getTitheIntent = (id: string): Promise<TitheIntent> =>
  wrap(async () => (await api.get(`/tithe/intents/${id}`)).data);

export const declareTitheIntent = (id: string): Promise<TitheIntent> =>
  wrap(async () => (await api.post(`/tithe/intents/${id}/declare`)).data);

export const cancelTitheIntent = (id: string): Promise<TitheIntent> =>
  wrap(async () => (await api.post(`/tithe/intents/${id}/cancel`)).data);

/** Fiel contesta um "não localizado" contando onde/quando pagou. */
export const contestTitheIntent = (id: string, note: string): Promise<TitheIntent> =>
  wrap(async () => (await api.post(`/tithe/intents/${id}/contest`, { note })).data);

/** Lembrete mensal: dia 1..28 ou null para desligar. */
export const updateTithePreferences = (reminderDay: number | null): Promise<{ reminderDay: number | null }> =>
  wrap(async () => (await api.patch('/tithe/my/preferences', { reminderDay })).data);

/** Dízimo automático (provedor): cria, consulta e cancela. */
export const getMySchedule = (): Promise<TitheSchedule | null> => wrap(async () => (await api.get('/tithe/schedules/mine')).data ?? null);

export const createTitheSchedule = (input: { amount: number; dayOfMonth: number; mode: 'PIX_AUTOMATIC' | 'PIX_SUBSCRIPTION' }): Promise<TitheSchedule> =>
  wrap(async () => (await api.post('/tithe/schedules', input)).data);

export const cancelTitheSchedule = (id: string): Promise<TitheSchedule> =>
  wrap(async () => (await api.delete(`/tithe/schedules/${id}`)).data);

/** QR fixo do dizimista (sem valor; txid = nº do dizimista). */
export const getPersistentQr = (): Promise<PersistentQr> => wrap(async () => (await api.get('/tithe/my/qr')).data);

export const sharePersistentQrPdf = () => downloadCatechesisPdf('/tithe/my/qr.pdf', 'meu-pix-dizimo.pdf');

export const shareAnnualStatement = (year: number) =>
  downloadCatechesisPdf(`/tithe/my/statement.pdf?year=${year}`, `extrato-dizimo-${year}.pdf`);

/** Comprovante em PDF (só após a confirmação da tesouraria). */
export const shareTitheReceipt = (intent: TitheIntent) =>
  downloadCatechesisPdf(`/tithe/intents/${intent.id}/receipt.pdf`, `comprovante-dizimo-${intent.referenceMonth}.pdf`);
