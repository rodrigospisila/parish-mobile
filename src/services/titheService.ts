import axios from 'axios';
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
  /** Oferta com finalidade: campanha/fundo escolhido na hora de contribuir */
  campaignId?: string | null;
  campaign?: { id: string; name: string } | null;
  declaredAt?: string | null;
  confirmedAt?: string | null;
  createdAt: string;
}

// ============================================
// CAMPANHAS E FUNDOS
// ============================================

export type TitheCampaignKind = 'CAMPAIGN' | 'FUND';

export const CAMPAIGN_KIND_LABELS: Record<TitheCampaignKind, string> = {
  CAMPAIGN: 'Campanha',
  FUND: 'Fundo',
};

/** Promessa do fiel para uma campanha — compromisso pessoal, sem cobrança automática */
export interface CampaignPledge {
  amount: number;
  note?: string | null;
  /** myTotal já alcançou o valor prometido */
  fulfilled: boolean;
}

/** Campanha/fundo visível ao fiel: ativa, da paróquia inteira ou da comunidade dele */
export interface TitheCampaign {
  id: string;
  parishId: string;
  communityId: string | null;
  community: { id: string; name: string } | null;
  kind: TitheCampaignKind;
  status: 'ACTIVE';
  code: string;
  name: string;
  description?: string | null;
  goalAmount: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  /** Só então a oferta pode ser anônima */
  allowAnonymous: boolean;
  /** Valores sugeridos pela paróquia — substituem os presets padrão quando houver */
  suggestedAmounts: number[];
  raised: number;
  /** 0–100, ou null quando não há meta */
  percent: number | null;
  contributors: number;
  /** null quando não tem data de término; nunca negativo — 0 é o último dia (vencida vem com expired=true) */
  daysLeft: number | null;
  /** Prazo encerrado: ainda aparece na lista (promessas/histórico), mas não recebe novas contribuições */
  expired: boolean;
  /** Quanto o fiel já contribuiu (confirmado) para esta campanha */
  myTotal: number;
  myPledge: CampaignPledge | null;
}

/** QR estático da paróquia (sem valor) identificado pela campanha, para divulgar */
export interface CampaignQr {
  brCode: string;
  qrDataUrl: string;
  name: string;
  code: string;
  parish: string;
  pixKey?: string | null;
  merchantName?: string | null;
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
  /** Pix do mês pelo WhatsApp (D4.5): available = paróquia ativou o canal e o servidor tem Twilio */
  whatsapp: {
    available: boolean;
    optIn: boolean;
    /** Sem celular cadastrado o opt-in não liga (a secretaria cadastra no perfil do fiel) */
    hasPhone: boolean;
  };
  /**
   * Link público de doação da web (D4.6) — /doar/:paróquia, para quem não tem o app.
   * null quando o Pix da paróquia está desligado ou o servidor não tem PUBLIC_WEB_URL.
   */
  donationUrl: string | null;
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

/** Erro já traduzido para o usuário, com o status HTTP (null sem resposta) — a tela usa para tratar 400 específicos */
export interface TitheApiError extends Error {
  status: number | null;
}

const wrap = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    const wrapped = new Error(getErrorMessage(error)) as TitheApiError;
    wrapped.status = axios.isAxiosError(error) ? (error.response?.status ?? null) : null;
    throw wrapped;
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
  /** Oferta com finalidade: o backend força kind OFFERING e só aceita anonymous se a campanha permitir */
  campaignId?: string;
}): Promise<TitheIntent> => wrap(async () => (await api.post('/tithe/intents', input)).data);

/** Campanhas e fundos ativos visíveis ao fiel (paróquia inteira ou a comunidade dele). */
export const getCampaigns = (): Promise<TitheCampaign[]> =>
  wrap(async () => (await api.get('/tithe/campaigns')).data ?? []);

/** Cria ou altera a promessa do fiel para a campanha. */
export const setCampaignPledge = (
  id: string,
  input: { amount: number; note?: string },
): Promise<CampaignPledge & { myTotal: number }> =>
  wrap(async () => (await api.post(`/tithe/campaigns/${id}/pledge`, input)).data);

export const cancelCampaignPledge = (id: string): Promise<{ cancelled: boolean }> =>
  wrap(async () => (await api.delete(`/tithe/campaigns/${id}/pledge`)).data);

/** QR estático da campanha para compartilhar (400 se a paróquia não ativou o Pix pelo app). */
export const getCampaignQr = (id: string): Promise<CampaignQr> =>
  wrap(async () => (await api.get(`/tithe/campaigns/${id}/qr`)).data);

export const getTitheIntent = (id: string): Promise<TitheIntent> =>
  wrap(async () => (await api.get(`/tithe/intents/${id}`)).data);

export const declareTitheIntent = (id: string): Promise<TitheIntent> =>
  wrap(async () => (await api.post(`/tithe/intents/${id}/declare`)).data);

export const cancelTitheIntent = (id: string): Promise<TitheIntent> =>
  wrap(async () => (await api.post(`/tithe/intents/${id}/cancel`)).data);

/** Fiel contesta um "não localizado" contando onde/quando pagou. */
export const contestTitheIntent = (id: string, note: string): Promise<TitheIntent> =>
  wrap(async () => (await api.post(`/tithe/intents/${id}/contest`, { note })).data);

/** Estado final das preferências, como o backend devolve após o PATCH */
export interface TithePreferences {
  reminderDay: number | null;
  whatsappOptIn: boolean;
}

/**
 * Preferências do dízimo: lembrete mensal (dia 1..28 ou null para desligar) e Pix do mês pelo WhatsApp.
 * Ligar o WhatsApp sem dia de lembrete faz o backend definir o dia 10 — por isso a resposta traz os dois campos.
 * 400 ao ligar o WhatsApp sem celular cadastrado ou com o canal desligado na paróquia.
 */
export const updateTithePreferences = (input: {
  reminderDay?: number | null;
  whatsappOptIn?: boolean;
}): Promise<TithePreferences> => wrap(async () => (await api.patch('/tithe/my/preferences', input)).data);

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

/** 'março/2026' → 'marco-2026': nome de arquivo seguro (sem acento nem '/') */
const fileSlug = (value: string) =>
  Array.from(value.normalize('NFD'))
    // descarta os diacríticos que o NFD separa (bloco U+0300–U+036F)
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code < 0x300 || code > 0x36f;
    })
    .join('')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

/**
 * Comprovante em PDF (só após a confirmação — vale para o fiel e para lançamentos do modo agente).
 * Com txid o nome do arquivo fica único ("comprovante-dizimo-2026-08-par123.pdf"): dois lançamentos
 * do mesmo mês não se sobrescrevem na pasta de downloads.
 */
export const shareTitheReceipt = (intent: Pick<TitheIntent, 'id' | 'referenceMonth'> & { txid?: string | null }) =>
  downloadCatechesisPdf(
    `/tithe/intents/${intent.id}/receipt.pdf`,
    `comprovante-dizimo-${intent.referenceMonth}${intent.txid ? `-${fileSlug(intent.txid)}` : ''}.pdf`,
  );

// ============================================
// TRANSPARÊNCIA — balancetes publicados pela paróquia (D4.3)
// ============================================

/** Linha de resumo do balancete (por categoria ou por centro de custo) */
export interface StatementLine {
  name: string;
  total: number;
  count: number;
}

/** Lado do balancete (receitas ou despesas) com os agrupamentos */
export interface StatementSide {
  total: number;
  count: number;
  byCategory: StatementLine[];
  byCostCenter: StatementLine[];
}

/**
 * Balancete mensal aprovado pelo Conselho de Assuntos Econômicos e publicado aos fiéis —
 * da paróquia inteira (communityId null) ou só da comunidade do fiel.
 */
export interface PublishedStatement {
  id: string;
  parishId: string;
  communityId: string | null;
  community: { id: string; name: string } | null;
  /** 'AAAA-MM' */
  referenceMonth: string;
  /** Pronto para exibir: 'agosto/2026' */
  monthLabel: string;
  status: 'PUBLISHED';
  snapshot: {
    income: StatementSide;
    expense: StatementSide;
    /** Receitas − despesas (negativo quando gastou mais do que entrou) */
    balance: number;
    campaigns: Array<{ id: string; name: string; total: number }>;
    communities: Array<{ id: string; name: string; income: number; expense: number }>;
  };
  /** Mensagem do Conselho aos fiéis */
  notes: string | null;
  approvedAt: string;
  approvedByName: string;
  publishedAt: string;
}

/** Balancetes publicados visíveis ao fiel (paróquia e/ou a comunidade dele), mais recentes primeiro. */
export const getPublishedStatements = (): Promise<PublishedStatement[]> =>
  wrap(async () => (await api.get('/finance/statements/published')).data ?? []);

/** PDF do balancete — mesmo fluxo do comprovante: baixa com o token da sessão e abre a folha de compartilhar. */
export const shareStatementPdf = (id: string, monthLabel: string) =>
  downloadCatechesisPdf(
    `/finance/statements/published/${id}/pdf`,
    `balancete-${fileSlug(monthLabel) || id.slice(-8)}.pdf`,
  );

// ============================================
// MODO AGENTE — tesouraria registra contribuição presencial (D4.2)
// ============================================

/** Papéis com acesso financeiro (modo agente) — mesma regra do backend */
export const FINANCIAL_ROLES = ['SYSTEM_ADMIN', 'DIOCESAN_ADMIN', 'PARISH_ADMIN', 'COMMUNITY_COORDINATOR'] as const;

export const isFinancialRole = (role?: string | null): boolean =>
  !!role && (FINANCIAL_ROLES as readonly string[]).includes(role);

/** Como a tesouraria recebeu a contribuição presencial */
export type PresentialMethod = 'CASH' | 'ENVELOPE' | 'POS' | 'PIX' | 'TRANSFER' | 'CHECK';

export const PRESENTIAL_METHOD_LABELS: Record<PresentialMethod, string> = {
  CASH: 'Dinheiro',
  ENVELOPE: 'Envelope',
  POS: 'Maquininha',
  PIX: 'Pix (visto no extrato)',
  TRANSFER: 'Transferência',
  CHECK: 'Cheque',
};

/** Fiel encontrado na busca do agente (CPF/telefone já vêm mascarados do backend) */
export interface AgentMember {
  id: string;
  fullName: string;
  /** Paróquia do fiel (via community.parishId) — null sem comunidade; filtra as campanhas elegíveis */
  parishId: string | null;
  community: { id: string; name: string } | null;
  registrationNumber: string | null;
  titherStatus: string | null;
  cpfMasked: string | null;
  phoneMasked: string | null;
  /** method é o rótulo livre do histórico ('PIX', 'Dinheiro', 'Envelope'…), não um PresentialMethod */
  lastContribution: { referenceMonth: string; amount: number; date: string; method: string } | null;
}

/** Contribuição lançada pelo agente — entra CONFIRMED na hora; CANCELLED após "desfazer" */
export interface AgentContribution {
  id: string;
  status: TitheIntentStatus;
  amount: number;
  referenceMonth: string;
  kind: TitheIntentKind;
  /** Identificador do lançamento (vem no registro e em GET /tithe/agent/recent) — entra no nome do comprovante */
  txid?: string | null;
  /** Um PresentialMethod; string livre por segurança (lançamentos antigos/outras origens) */
  paymentMethod: PresentialMethod | string;
  campaign: { id: string; name: string } | null;
  confirmedAt: string | null;
  member: { id: string; fullName: string };
  /** Até 24 h, só pelo próprio agente */
  canUndo: boolean;
}

export interface RegisterAgentContributionInput {
  memberId: string;
  amount: number;
  /** Padrão TITHE; com campaignId o backend força OFFERING */
  kind?: TitheIntentKind;
  /** 'AAAA-MM' — padrão: mês atual */
  referenceMonth?: string;
  method: PresentialMethod;
  campaignId?: string | null;
  /** 'AAAA-MM-DD' — padrão: hoje */
  date?: string;
  note?: string;
  receiptNumber?: string;
}

export type ManagedCampaignStatus = 'ACTIVE' | 'PAUSED' | 'CLOSED';

/** Campanha/fundo na visão de gestão (GET /tithe/campaigns/manage) — subconjunto estável dos campos */
export interface ManagedCampaign {
  id: string;
  parishId: string;
  name: string;
  code?: string;
  /** null = paróquia inteira */
  communityId: string | null;
  community?: { id: string; name: string } | null;
  kind: TitheCampaignKind;
  status: ManagedCampaignStatus | string;
  description?: string | null;
  goalAmount?: number | null;
  raised?: number;
  /** No futuro = ainda não começou; só a partir daí aceita lançamentos */
  startsAt: string | null;
  endsAt?: string | null;
  /** Prazo encerrado: a gestão ainda lista, mas não recebe novos lançamentos */
  expired: boolean;
  suggestedAmounts?: number[];
}

/** Busca por nome (parte), nº de dizimista, CPF ou telefone (últimos 8 dígitos); mínimo 2 caracteres, até 20 resultados. */
export const searchAgentMembers = (q: string): Promise<AgentMember[]> =>
  wrap(async () => (await api.get('/tithe/agent/members', { params: { q } })).data ?? []);

/** Registra na hora uma contribuição presencial em nome do fiel (já confirmada). */
export const registerAgentContribution = (input: RegisterAgentContributionInput): Promise<AgentContribution> =>
  wrap(async () => (await api.post('/tithe/agent/contributions', input)).data);

/** Lançamentos deste agente nas últimas 48 h. */
export const getAgentRecent = (): Promise<AgentContribution[]> =>
  wrap(async () => (await api.get('/tithe/agent/recent')).data ?? []);

/** Desfaz um lançamento próprio (até 24 h). */
export const undoAgentContribution = (id: string): Promise<{ id: string; status: 'CANCELLED' }> =>
  wrap(async () => (await api.post(`/tithe/agent/contributions/${id}/undo`)).data);

/** Campanhas/fundos na visão de gestão (padrão: só as ativas) — seletor opcional do modo agente. */
export const getManagedCampaigns = (status: ManagedCampaignStatus = 'ACTIVE'): Promise<ManagedCampaign[]> =>
  wrap(async () => (await api.get('/tithe/campaigns/manage', { params: { status } })).data ?? []);
