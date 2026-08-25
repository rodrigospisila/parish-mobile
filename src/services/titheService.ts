import api, { getErrorMessage } from '../config/api';
import { downloadCatechesisPdf } from './catechesisService';

// ============================================
// DÍZIMO ONLINE — Pix da paróquia (Fase 1 + Onda D2)
// ============================================

export type TitheIntentStatus = 'CREATED' | 'DECLARED' | 'CONFIRMED' | 'CANCELLED';
export type TitheIntentKind = 'TITHE' | 'OFFERING';

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
}

export interface PersistentQr {
  registrationNumber: string;
  txid: string;
  brCode: string;
  qrDataUrl: string;
  parish: string;
  merchantName?: string | null;
}

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

/** QR fixo do dizimista (sem valor; txid = nº do dizimista). */
export const getPersistentQr = (): Promise<PersistentQr> => wrap(async () => (await api.get('/tithe/my/qr')).data);

export const sharePersistentQrPdf = () => downloadCatechesisPdf('/tithe/my/qr.pdf', 'meu-pix-dizimo.pdf');

export const shareAnnualStatement = (year: number) =>
  downloadCatechesisPdf(`/tithe/my/statement.pdf?year=${year}`, `extrato-dizimo-${year}.pdf`);

/** Comprovante em PDF (só após a confirmação da tesouraria). */
export const shareTitheReceipt = (intent: TitheIntent) =>
  downloadCatechesisPdf(`/tithe/intents/${intent.id}/receipt.pdf`, `comprovante-dizimo-${intent.referenceMonth}.pdf`);
