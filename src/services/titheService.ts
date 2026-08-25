import api, { getErrorMessage } from '../config/api';
import { downloadCatechesisPdf } from './catechesisService';

// ============================================
// DÍZIMO ONLINE — Pix da paróquia (Fase 1)
// ============================================

export type TitheIntentStatus = 'CREATED' | 'DECLARED' | 'CONFIRMED' | 'CANCELLED';
export type TitheIntentKind = 'TITHE' | 'OFFERING';

export interface TitheIntent {
  id: string;
  amount: number;
  referenceMonth: string;
  kind: TitheIntentKind;
  status: TitheIntentStatus;
  txid: string;
  brCode?: string | null;
  qrDataUrl?: string;
  note?: string | null;
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
}

export const STATUS_LABELS: Record<TitheIntentStatus, string> = {
  CREATED: 'Pix gerado',
  DECLARED: 'Aguardando conferência',
  CONFIRMED: 'Confirmado',
  CANCELLED: 'Cancelado',
};

export const getMyTithe = async (): Promise<MyTithe> => {
  try {
    const { data } = await api.get('/tithe/my');
    return data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const createTitheIntent = async (input: {
  amount: number;
  referenceMonth?: string;
  kind: TitheIntentKind;
}): Promise<TitheIntent> => {
  try {
    const { data } = await api.post('/tithe/intents', input);
    return data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const getTitheIntent = async (id: string): Promise<TitheIntent> => {
  try {
    const { data } = await api.get(`/tithe/intents/${id}`);
    return data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const declareTitheIntent = async (id: string): Promise<TitheIntent> => {
  try {
    const { data } = await api.post(`/tithe/intents/${id}/declare`);
    return data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const cancelTitheIntent = async (id: string): Promise<TitheIntent> => {
  try {
    const { data } = await api.post(`/tithe/intents/${id}/cancel`);
    return data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/** Comprovante em PDF (só após a confirmação da tesouraria). */
export const shareTitheReceipt = (intent: TitheIntent) =>
  downloadCatechesisPdf(`/tithe/intents/${intent.id}/receipt.pdf`, `comprovante-dizimo-${intent.referenceMonth}.pdf`);
