import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Image,
  TextInput,
  Modal,
  Pressable,
  Share,
  Switch,
  KeyboardAvoidingView,
  Platform,
  AppState,
  AppStateStatus,
  LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { useColors } from '../src/context/ThemeContext';
import { useAuth } from '../src/context/AuthContext';
import {
  MyTithe,
  TitheIntent,
  TitheIntentKind,
  TithePaymentMethod,
  PersistentQr,
  TitheSchedule,
  TitheCampaign,
  TithePreferences,
  PublishedStatement,
  STATUS_LABELS,
  SCHEDULE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PROVIDER_STATUS_HINTS,
  CAMPAIGN_KIND_LABELS,
  getMyTithe,
  createTitheIntent,
  declareTitheIntent,
  cancelTitheIntent,
  contestTitheIntent,
  updateTithePreferences,
  getPersistentQr,
  sharePersistentQrPdf,
  shareAnnualStatement,
  shareTitheReceipt,
  getTitheIntent,
  getMySchedule,
  createTitheSchedule,
  cancelTitheSchedule,
  getCampaigns,
  setCampaignPledge,
  cancelCampaignPledge,
  getCampaignQr,
  getPublishedStatements,
  shareStatementPdf,
  isFinancialRole,
} from '../src/services/titheService';

const PRESETS = [20, 50, 100, 200];
const REMINDER_DAYS = [5, 10, 15, 20, 25];
// Transparência: balancetes mostrados no card antes de "Ver mais"
const STATEMENTS_PREVIEW = 6;
// Ordem fixa dos chips; só aparecem os meios que o backend liberou em gateway.methods
const PAYMENT_METHODS: TithePaymentMethod[] = ['PIX', 'CARD', 'BOLETO'];
const PAYMENT_METHOD_HINTS: Record<TithePaymentMethod, string> = {
  PIX: 'Pix — confirma na hora.',
  CARD: 'Cartão — página segura do Asaas, sem digitar o cartão no app.',
  BOLETO: 'Boleto — compensa em até 2 dias úteis.',
};
const payMethodOf = (intent: TitheIntent): TithePaymentMethod => intent.paymentMethod ?? 'PIX';
const isPix = (intent: TitheIntent) => payMethodOf(intent) === 'PIX';
/** "Pix gerado" só faz sentido para Pix; cartão/boleto têm o próprio rótulo em CREATED */
const statusLabel = (intent: TitheIntent) => {
  if (intent.status !== 'CREATED') return STATUS_LABELS[intent.status];
  const method = payMethodOf(intent);
  return method === 'CARD' ? 'Cobrança gerada' : method === 'BOLETO' ? 'Boleto gerado' : STATUS_LABELS.CREATED;
};
/** Aviso ao lado do status: cartão em análise de risco (ainda em aberto) ou estorno em disputa (já confirmado) */
const providerHint = (intent: TitheIntent): string | null => {
  if (intent.providerStatus === 'in_review' && (intent.status === 'CREATED' || intent.status === 'DECLARED')) {
    return PROVIDER_STATUS_HINTS.in_review;
  }
  if (intent.providerStatus === 'disputed' && intent.status === 'CONFIRMED') return PROVIDER_STATUS_HINTS.disputed;
  return null;
};
/** Contestação: pergunta e exemplo conforme o meio que o fiel usou */
const CONTEST_COPY: Record<TithePaymentMethod, { title: string; details: string; placeholder: string }> = {
  PIX: { title: 'Você pagou este Pix?', details: 'data, banco, valor', placeholder: 'Ex.: paguei dia 12 pelo Nubank, R$ 33,00' },
  CARD: {
    title: 'Você pagou com cartão?',
    details: 'data, cartão usado, valor',
    placeholder: 'Ex.: paguei dia 12 no cartão final 1234, R$ 33,00',
  },
  BOLETO: {
    title: 'Você pagou este boleto?',
    details: 'data, banco, valor',
    placeholder: 'Ex.: paguei o boleto dia 12 no app do Itaú, R$ 33,00',
  },
};
const dateTimeBR = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** "27/08" — aprovação/publicação do balancete (o mês já está no título do card) */
const dateBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—';

const money = (value: number) => `R$ ${value.toFixed(2).replace('.', ',')}`;
/** Saldo negativo com o sinal antes do R$ ("−R$ 150,00") em vez do "R$ -150,00" cru */
const balanceText = (value: number) => (value < 0 ? `−${money(-value)}` : money(value));
const decimalBR = (value: number) => value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const providerLabel = (provider?: string | null) =>
  provider === 'MERCADOPAGO' ? 'Mercado Pago' : provider === 'ASAAS' ? 'Asaas' : 'provedor de pagamento';
/** "R$ 0,99 + 1,99%" — só as partes maiores que zero; vazio se ambas forem 0 */
const feeText = (feeFixed: number, feePercent: number) => {
  const parts: string[] = [];
  if (feeFixed > 0) parts.push(`R$ ${decimalBR(feeFixed)}`);
  if (feePercent > 0) parts.push(`${decimalBR(feePercent)}%`);
  return parts.join(' + ');
};
// GATEWAY em CREATED: consulta o provedor a cada 8 s por até 5 min enquanto o modal está aberto
const GATEWAY_POLL_MS = 8_000;
const GATEWAY_POLL_MAX_MS = 5 * 60 * 1000;
const monthLabel = (iso: string, short = false) => {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, 1)).toLocaleDateString('pt-BR', {
    month: short ? 'short' : 'long',
    year: short ? '2-digit' : 'numeric',
    timeZone: 'UTC',
  });
};
const shiftMonth = (iso: string, delta: number) => {
  const [y, m] = iso.split('-').map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
};
/** 33 → "33,00" para preencher um campo de valor */
const amountToText = (value: number) => value.toFixed(2).replace('.', ',');
/** Sem contribuinte identificado mas com valor arrecadado = lançamentos manuais da tesouraria (ou ofertas anônimas) */
const contributorsText = (count: number, raised: number) =>
  count === 0
    ? raised > 0
      ? 'Contribuições registradas pela tesouraria'
      : 'Nenhum contribuinte ainda'
    : count === 1
      ? '1 contribuinte'
      : `${count} contribuintes`;
/** null = sem data de término (fundo permanente). daysLeft nunca é negativo: 0 é o último dia; vencida vem com expired */
const daysLeftText = (campaign: TitheCampaign) => {
  if (campaign.expired) return 'prazo encerrado';
  const days = campaign.daysLeft;
  return days === null ? null : days <= 0 ? 'último dia' : days === 1 ? '1 dia restante' : `${days} dias restantes`;
};
/** Valores sugeridos pela campanha (positivos, sem repetição) — vazio cai nos presets padrão */
const campaignPresets = (campaign: TitheCampaign | null) =>
  campaign ? Array.from(new Set((campaign.suggestedAmounts ?? []).filter((v) => Number.isFinite(v) && v > 0))) : [];

/**
 * Dízimo e ofertas pelo app (Fase 1 + Onda D2): Pix copia-e-cola com a chave da
 * paróquia, mês de referência, oferta anônima, contestação, lembrete mensal,
 * QR fixo do dizimista e extrato anual. Com Asaas, o fiel também pode pagar com
 * cartão (página segura do provedor) ou boleto — confirmação automática nos três.
 */
export default function TitheScreen() {
  const router = useRouter();
  const colors = useColors();
  const styles = createStyles(colors);
  const { user } = useAuth();
  // Tesouraria/coordenação: atalho para o modo agente (registrar contribuição presencial em nome do fiel)
  const isFinancial = isFinancialRole(user?.role);

  const [data, setData] = useState<MyTithe | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [kind, setKind] = useState<TitheIntentKind>('TITHE');
  const [referenceMonth, setReferenceMonth] = useState<string | null>(null);
  const [anonymous, setAnonymous] = useState(false);
  const [amountText, setAmountText] = useState('');
  const [payMethod, setPayMethod] = useState<TithePaymentMethod>('PIX');
  const [creating, setCreating] = useState(false);
  const [active, setActive] = useState<TitheIntent | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [contestTarget, setContestTarget] = useState<TitheIntent | null>(null);
  const [contestText, setContestText] = useState('');
  const [persistent, setPersistent] = useState<PersistentQr | null>(null);
  const [savingReminder, setSavingReminder] = useState(false);
  const [savingWhatsapp, setSavingWhatsapp] = useState(false);
  // Dízimo automático (provedor)
  const [scheduleModal, setScheduleModal] = useState(false);
  const [scheduleAmount, setScheduleAmount] = useState('');
  const [scheduleDay, setScheduleDay] = useState(10);
  const [scheduleMode, setScheduleMode] = useState<'PIX_AUTOMATIC' | 'PIX_SUBSCRIPTION'>('PIX_AUTOMATIC');
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [authQr, setAuthQr] = useState<TitheSchedule | null>(null);
  const prefilledRef = useRef(false);
  // Último intent GATEWAY encerrado pelo app — evita alerta duplicado quando navegador, AppState e polling respondem juntos
  const settledIdRef = useRef<string | null>(null);
  // Campanhas e fundos
  const [campaigns, setCampaigns] = useState<TitheCampaign[]>([]);
  /** Campanha escolhida em "Contribuir": a oferta sai com finalidade (chip "Para: …" no card de contribuição) */
  const [campaignTarget, setCampaignTarget] = useState<TitheCampaign | null>(null);
  const [pledgeTarget, setPledgeTarget] = useState<TitheCampaign | null>(null);
  const [pledgeAmount, setPledgeAmount] = useState('');
  const [pledgeNote, setPledgeNote] = useState('');
  const [pledgeBusy, setPledgeBusy] = useState(false);
  const [qrBusyId, setQrBusyId] = useState<string | null>(null);
  // Transparência: balancetes publicados pela paróquia (qualquer fiel vê)
  const [statements, setStatements] = useState<PublishedStatement[]>([]);
  const [showAllStatements, setShowAllStatements] = useState(false);
  const [statementTarget, setStatementTarget] = useState<PublishedStatement | null>(null);
  const [statementPdfBusy, setStatementPdfBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  // Posição do card "Contribuir agora" dentro do ScrollView — para rolar até ele ao tocar em "Contribuir"
  const contributeY = useRef(0);
  /** Com campanha escolhida, a contribuição é sempre oferta (o backend também força) */
  const effectiveKind: TitheIntentKind = campaignTarget ? 'OFFERING' : kind;

  const load = useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true);
    try {
      // Campanhas e balancetes são acessório: se falharem, a tela segue com a lista anterior (null = não atualizar)
      const [result, campaignList, statementList] = await Promise.all([
        getMyTithe(),
        getCampaigns().then(
          (list) => list,
          (): TitheCampaign[] | null => null,
        ),
        getPublishedStatements().then(
          (list) => list,
          (): PublishedStatement[] | null => null,
        ),
      ]);
      setData(result);
      if (statementList) setStatements(statementList);
      if (campaignList) {
        setCampaigns(campaignList);
        // Mantém a campanha escolhida com os números atualizados; some se ela deixou de estar ativa ou venceu o prazo
        setCampaignTarget((current) => {
          if (!current) return null;
          const fresh = campaignList.find((c) => c.id === current.id);
          return fresh && !fresh.expired ? fresh : null;
        });
      }
      setReferenceMonth((current) => current ?? result.currentMonth);
      if (!prefilledRef.current && result.suggestedAmount) {
        prefilledRef.current = true;
        setAmountText(String(result.suggestedAmount.toFixed(2)).replace('.', ','));
      }
    } catch (error: any) {
      Alert.alert('Dízimo', error?.message ?? 'Não foi possível carregar.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Se o backend deixou de liberar o meio escolhido (ex.: gateway saiu do ar), volta para Pix
  const gatewayMethods = data?.gateway?.methods;
  useEffect(() => {
    if (payMethod !== 'PIX' && !(gatewayMethods ?? []).includes(payMethod)) setPayMethod('PIX');
  }, [gatewayMethods, payMethod]);

  // "1.234,56" → 1234.56 · "1.000" → 1000 · "50.00" → 50 · ",5" → 0.5
  const parseAmount = (text: string) => {
    const clean = text.replace(/[^\d,.]/g, '');
    let normalized: string;
    if (clean.includes(',')) {
      normalized = clean.replace(/\./g, '').replace(/,(?=.*,)/g, '').replace(',', '.');
    } else if (/\.\d{1,2}$/.test(clean)) {
      normalized = clean.replace(/\.(?=.*\.)/g, '');
    } else {
      normalized = clean.replace(/\./g, '');
    }
    const value = Number(normalized || '0');
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
  };

  const handleCreate = async () => {
    const amount = parseAmount(amountText);
    if (amount < 1) {
      Alert.alert('Valor', 'Informe um valor a partir de R$ 1,00.');
      return;
    }
    setCreating(true);
    const target = campaignTarget;
    try {
      const intent = await createTitheIntent({
        amount,
        kind: effectiveKind,
        referenceMonth: effectiveKind === 'TITHE' ? referenceMonth ?? data?.currentMonth : data?.currentMonth,
        anonymous: effectiveKind === 'OFFERING' && (target ? target.allowAnonymous : true) ? anonymous : false,
        paymentMethod: payMethod,
        ...(target ? { campaignId: target.id } : {}),
      });
      // A campanha vale para esta cobrança; a próxima volta ao padrão (evita mandar o dízimo do mês para a campanha sem querer)
      setActive(target ? { ...intent, campaign: intent.campaign ?? { id: target.id, name: target.name } } : intent);
      setCampaignTarget(null);
      await load(true);
    } catch (error: any) {
      Alert.alert(
        payMethod === 'CARD'
          ? 'Não foi possível iniciar o pagamento'
          : payMethod === 'BOLETO'
            ? 'Não foi possível gerar o boleto'
            : 'Não foi possível gerar o Pix',
        error?.message ?? 'Tente novamente.',
      );
      // 400 da campanha ("Campanha encerrada ou indisponível…"): o alvo saiu do ar entre o toque e o envio —
      // solta o chip "Para: …" e recarrega a lista para a tela refletir o estado real
      if (target && error?.status === 400 && /campanha/i.test(String(error?.message ?? ''))) {
        setCampaignTarget(null);
        await load(true);
      }
    } finally {
      setCreating(false);
    }
  };

  const copyCode = async (code: string) => {
    await Clipboard.setStringAsync(code);
    Alert.alert('Copiado ✓', 'Abra o app do seu banco, escolha "Pix copia e cola" e cole o código.');
  };

  const copyBoletoLine = async (line: string) => {
    await Clipboard.setStringAsync(line);
    Alert.alert('Copiado ✓', 'Abra o app do seu banco, escolha "Pagar boleto" e cole a linha digitável.');
  };

  /**
   * Abre a página segura do provedor (cartão) ou o PDF do boleto no navegador interno.
   * Devolve o resultado do navegador (null se não abriu): no iOS a promise só resolve quando o
   * usuário fecha; no Android resolve na hora com type 'opened', com o navegador ainda aberto.
   */
  const openUrl = async (url: string | null | undefined, what: string): Promise<WebBrowser.WebBrowserResult | null> => {
    if (!url) {
      Alert.alert(what, 'Link indisponível — gere outra cobrança.');
      return null;
    }
    try {
      return await WebBrowser.openBrowserAsync(url);
    } catch {
      Alert.alert(what, 'Não foi possível abrir. Tente de novo.');
      return null;
    }
  };

  const shareCode = async (intent: TitheIntent) => {
    const method = payMethodOf(intent);
    const origin =
      intent.method === 'GATEWAY'
        ? `Cobrança emitida por ${providerLabel(data?.gateway?.provider)} em nome de ${data?.parish?.name}`
        : `Recebedor: ${data?.parish?.merchantName ?? data?.parish?.name}`;
    const purpose = intent.campaign ? `para "${intent.campaign.name}"` : intent.kind === 'TITHE' ? 'do dízimo' : 'de oferta';
    let head: string;
    let body: string;
    if (method === 'CARD') {
      if (!intent.paymentUrl) return;
      head = `Pagamento ${purpose} com cartão`;
      body = `Página de pagamento:\n${intent.paymentUrl}`;
    } else if (method === 'BOLETO') {
      const parts: string[] = [];
      if (intent.boletoLine) parts.push(`Linha digitável:\n${intent.boletoLine}`);
      if (intent.boletoUrl) parts.push(`Boleto (PDF):\n${intent.boletoUrl}`);
      else if (intent.paymentUrl) parts.push(`Página de pagamento:\n${intent.paymentUrl}`);
      if (parts.length === 0) return;
      head = `Boleto ${purpose}`;
      body = parts.join('\n\n');
    } else {
      if (!intent.brCode) return;
      head = `Pix ${purpose}`;
      body = `Pix copia e cola:\n${intent.brCode}`;
    }
    const due = method !== 'PIX' && intent.qrExpiresAt ? `\nVencimento: ${dateTimeBR(intent.qrExpiresAt)}` : '';
    try {
      await Share.share({
        message: `${head} · ${money(intent.amount)} · ${monthLabel(intent.referenceMonth)}\n${origin}\nIdentificador: ${intent.txid}${due}\n\n${body}`,
      });
    } catch {
      // usuário cancelou
    }
  };

  const handleDeclare = async (intent: TitheIntent) => {
    setBusyId(intent.id);
    try {
      const updated = await declareTitheIntent(intent.id);
      setActive((current) => (current && current.id === intent.id ? { ...current, ...updated } : current));
      await load(true);
      Alert.alert('Obrigado 🙏', 'A tesouraria vai conferir o Pix e você recebe a confirmação por aqui.');
    } catch (error: any) {
      Alert.alert('Dízimo', error?.message ?? 'Não foi possível registrar.');
      // Estado real do servidor: se o Pix foi encerrado (chave trocada etc.), fecha o modal
      await load(true);
      try {
        const fresh = await getTitheIntent(intent.id);
        setActive(fresh.status === 'CREATED' || fresh.status === 'DECLARED' ? fresh : null);
      } catch {
        setActive(null);
      }
    } finally {
      setBusyId(null);
    }
  };

  /** Fecha o modal e avisa conforme o estado final vindo do provedor (uma vez só por intent). */
  const settleGatewayIntent = useCallback(
    (fresh: TitheIntent) => {
      if (settledIdRef.current === fresh.id) return;
      settledIdRef.current = fresh.id;
      setActive(null);
      void load(true);
      const method = payMethodOf(fresh);
      if (fresh.status === 'CONFIRMED') {
        Alert.alert(
          'Contribuição confirmada 🙏',
          method === 'CARD'
            ? 'O pagamento no cartão foi aprovado e já está registrado.'
            : method === 'BOLETO'
              ? 'O boleto compensou e o pagamento já está registrado.'
              : 'O banco confirmou o seu Pix e ele já está registrado.',
        );
      } else {
        Alert.alert(
          method === 'PIX' ? 'Pix encerrado' : 'Pagamento encerrado',
          fresh.note ?? (method === 'PIX' ? 'Este Pix foi encerrado.' : 'Este pagamento foi encerrado.'),
        );
      }
    },
    [load],
  );

  /**
   * Aplica ao modal o estado real vindo do provedor: encerra (confirmado/cancelado) ou atualiza o
   * intent aberto. Devolve true quando encerrou. Mesma rotina para polling, volta do navegador e
   * retorno ao app (AppState).
   */
  const applyGatewayIntent = useCallback(
    (id: string, fresh: TitheIntent) => {
      if (fresh.status === 'CONFIRMED' || fresh.status === 'CANCELLED') {
        settleGatewayIntent(fresh);
        return true;
      }
      setActive((current) => {
        if (!current || current.id !== id) return current;
        // Mesma referência quando nada mudou — evita re-render a cada ciclo do polling
        if (current.status === fresh.status && (current.providerStatus ?? null) === (fresh.providerStatus ?? null)) return current;
        return { ...current, ...fresh };
      });
      return false;
    },
    [settleGatewayIntent],
  );

  // GATEWAY: quem confirma é o provedor — só consultamos o estado real (nunca "declare")
  const handleVerifyGateway = async (intent: TitheIntent) => {
    setBusyId(intent.id);
    try {
      const fresh = await getTitheIntent(intent.id);
      if (applyGatewayIntent(intent.id, fresh)) return;
      const method = payMethodOf(intent);
      if (fresh.providerStatus === 'in_review') {
        Alert.alert(
          'Em análise pelo provedor',
          'O provedor ainda está analisando este pagamento — não é preciso pagar de novo. Assim que aprovar, a confirmação aparece sozinha aqui.',
        );
        return;
      }
      Alert.alert(
        method === 'BOLETO' ? 'Aguardando a compensação' : 'Aguardando o banco',
        method === 'CARD'
          ? 'Ainda não chegou a aprovação do cartão — normalmente leva alguns segundos depois de concluir na página de pagamento. Se você pagou, ela aparece sozinha aqui.'
          : method === 'BOLETO'
            ? 'O boleto ainda não compensou — pode levar até 2 dias úteis depois do pagamento. Quando compensar, a confirmação aparece sozinha aqui.'
            : 'Ainda não chegou a confirmação do banco — normalmente leva alguns segundos. Se você pagou, ela aparece sozinha aqui.',
      );
    } catch (error: any) {
      Alert.alert('Dízimo', error?.message ?? 'Não foi possível verificar.');
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Cartão: abre a página do provedor e consulta o estado real DEPOIS que o navegador fecha, sem alerta.
   * iOS: `openBrowserAsync` só resolve no fechamento. Android: resolve na hora ('opened') com o navegador
   * ainda aberto — aí quem consulta é o listener de AppState, na volta ao app. O polling segue nos dois.
   */
  const openPaymentPage = async (intent: TitheIntent) => {
    const result = await openUrl(intent.paymentUrl, 'Página de pagamento');
    if (!result || result.type === WebBrowser.WebBrowserResultType.OPENED) return;
    try {
      applyGatewayIntent(intent.id, await getTitheIntent(intent.id));
    } catch {
      // rede instável: o polling tenta de novo
    }
  };

  const pollingId = active && active.method === 'GATEWAY' && active.status === 'CREATED' ? active.id : null;
  useEffect(() => {
    if (!pollingId) return;
    const startedAt = Date.now();
    let cancelled = false;
    let inFlight = false;
    const timer = setInterval(async () => {
      if (cancelled || inFlight) return;
      if (Date.now() - startedAt > GATEWAY_POLL_MAX_MS) {
        clearInterval(timer);
        return;
      }
      inFlight = true;
      try {
        const fresh = await getTitheIntent(pollingId);
        if (cancelled) return;
        if (applyGatewayIntent(pollingId, fresh)) clearInterval(timer);
      } catch {
        // rede instável: tenta de novo no próximo ciclo
      } finally {
        inFlight = false;
      }
    }, GATEWAY_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pollingId, applyGatewayIntent]);

  // Retorno ao app (Android/iOS) com o modal de cartão/boleto aberto: o fiel pagou no navegador ou no
  // app do banco e voltou — consulta o provedor uma vez, sem esperar o próximo ciclo do polling
  useEffect(() => {
    if (!pollingId) return;
    let cancelled = false;
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next !== 'active') return;
      getTitheIntent(pollingId)
        .then((fresh) => {
          if (!cancelled) applyGatewayIntent(pollingId, fresh);
        })
        .catch(() => {
          // rede instável: o polling tenta de novo
        });
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [pollingId, applyGatewayIntent]);

  const handleCancel = (intent: TitheIntent) => {
    const noun = payMethodOf(intent) === 'CARD' ? 'cobrança' : payMethodOf(intent) === 'BOLETO' ? 'boleto' : 'Pix';
    Alert.alert(`Cancelar ${noun === 'cobrança' ? 'esta' : 'este'} ${noun}?`, 'Só cancele se você NÃO fez o pagamento.', [
      { text: 'Voltar', style: 'cancel' },
      {
        text: `Cancelar ${noun}`,
        style: 'destructive',
        onPress: async () => {
          setBusyId(intent.id);
          try {
            await cancelTitheIntent(intent.id);
            if (active?.id === intent.id) setActive(null);
            await load(true);
          } catch (error: any) {
            Alert.alert('Dízimo', error?.message ?? 'Não foi possível cancelar.');
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const submitContest = async () => {
    if (!contestTarget) return;
    const note = contestText.trim();
    if (note.length < 5) {
      Alert.alert('Contestar', `Conte onde e quando você pagou (${CONTEST_COPY[payMethodOf(contestTarget)].details}).`);
      return;
    }
    setBusyId(contestTarget.id);
    try {
      await contestTitheIntent(contestTarget.id, note);
      setContestTarget(null);
      setContestText('');
      await load(true);
      Alert.alert('Enviado', 'A tesouraria vai conferir de novo com as suas informações.');
    } catch (error: any) {
      Alert.alert('Contestar', error?.message ?? 'Não foi possível enviar.');
    } finally {
      setBusyId(null);
    }
  };

  const openIntent = async (intent: TitheIntent) => {
    if (intent.status !== 'CREATED' && intent.status !== 'DECLARED') return;
    try {
      const fresh = await getTitheIntent(intent.id);
      if (fresh.status === 'CREATED' || fresh.status === 'DECLARED') {
        setActive(fresh);
        return;
      }
      // O servidor já sabe o desfecho (ex.: provedor confirmou): atualiza a lista em vez de abrir o QR
      await load(true);
      const what = isPix(fresh) ? 'Este Pix' : 'Este pagamento';
      if (fresh.status === 'CONFIRMED') {
        Alert.alert('Dízimo', `${what} já foi confirmado. 🙏`);
      } else {
        // A nota do sistema já vem neutra e completa ("Cobrança expirada — gere outra…"): mostra como está
        Alert.alert(isPix(fresh) ? 'Pix encerrado' : 'Pagamento encerrado', fresh.note ?? `${what} foi encerrado.`);
      }
    } catch (error: any) {
      Alert.alert('Dízimo', error?.message ?? 'Não foi possível abrir.');
      await load(true);
    }
  };

  const handleReceipt = async (intent: TitheIntent) => {
    setBusyId(intent.id);
    try {
      await shareTitheReceipt(intent);
    } catch (error: any) {
      Alert.alert('Comprovante', error?.message ?? 'Não foi possível gerar.');
    } finally {
      setBusyId(null);
    }
  };

  /** PDF do balancete publicado — baixa com o token da sessão e abre a folha de compartilhar. */
  const handleStatementPdf = async (statement: PublishedStatement) => {
    setStatementPdfBusy(true);
    try {
      await shareStatementPdf(statement.id, statement.monthLabel);
    } catch (error: any) {
      Alert.alert('Balancete', error?.message ?? 'Não foi possível gerar.');
    } finally {
      setStatementPdfBusy(false);
    }
  };

  /** Receitas · Despesas · Saldo (verde/vermelho) — no card e na sheet do balancete */
  const renderStatementTotals = (snapshot: PublishedStatement['snapshot']) => (
    <View style={styles.statementTotals}>
      <View style={styles.statementTotal}>
        <Text style={styles.statementTotalLabel}>Receitas</Text>
        <Text style={[styles.statementTotalValue, styles.statementIncome]}>{money(snapshot.income.total)}</Text>
      </View>
      <View style={styles.statementTotal}>
        <Text style={styles.statementTotalLabel}>Despesas</Text>
        <Text style={[styles.statementTotalValue, styles.statementExpense]}>{money(snapshot.expense.total)}</Text>
      </View>
      <View style={styles.statementTotal}>
        <Text style={styles.statementTotalLabel}>Saldo</Text>
        <Text style={[styles.statementTotalValue, snapshot.balance < 0 ? styles.statementExpense : styles.statementIncome]}>
          {balanceText(snapshot.balance)}
        </Text>
      </View>
    </View>
  );

  /** Bloco "nome · total" da sheet do balancete (categorias, centros de custo, campanhas) */
  const renderStatementLines = (title: string, lines: Array<{ name: string; total: number }>) => (
    <View style={styles.statementGroup}>
      <Text style={styles.label}>{title}</Text>
      {lines.length === 0 ? (
        <Text style={styles.hint}>Nenhum lançamento no mês.</Text>
      ) : (
        lines.map((line, index) => (
          <View key={`${title}-${index}`} style={styles.statementRow}>
            <Text style={styles.statementRowName} numberOfLines={2}>
              {line.name}
            </Text>
            <Text style={styles.statementRowValue}>{money(line.total)}</Text>
          </View>
        ))
      )}
    </View>
  );

  /** Reflete a resposta do PATCH de preferências (lembrete + WhatsApp) no estado local, sem recarregar a tela */
  const applyPreferences = (prefs: TithePreferences) =>
    setData((current) =>
      current
        ? {
            ...current,
            reminderDay: prefs.reminderDay,
            whatsapp: { ...current.whatsapp, optIn: prefs.whatsappOptIn },
          }
        : current,
    );

  const setReminder = async (day: number | null) => {
    setSavingReminder(true);
    try {
      applyPreferences(await updateTithePreferences({ reminderDay: day }));
    } catch (error: any) {
      Alert.alert('Lembrete', error?.message ?? 'Não foi possível salvar.');
    } finally {
      setSavingReminder(false);
    }
  };

  /** Pix do mês pelo WhatsApp: ao ligar sem dia de lembrete o backend define o dia 10 — a resposta já vem com ele */
  const setWhatsappOptIn = async (on: boolean) => {
    setSavingWhatsapp(true);
    try {
      applyPreferences(await updateTithePreferences({ whatsappOptIn: on }));
    } catch (error: any) {
      Alert.alert('WhatsApp', error?.message ?? 'Não foi possível salvar.');
    } finally {
      setSavingWhatsapp(false);
    }
  };

  const handleCreateSchedule = async () => {
    const amount = parseAmount(scheduleAmount);
    if (amount < 1) {
      Alert.alert('Valor', 'Informe o valor mensal a partir de R$ 1,00.');
      return;
    }
    setScheduleBusy(true);
    try {
      const created = await createTitheSchedule({ amount, dayOfMonth: scheduleDay, mode: scheduleMode });
      setScheduleModal(false);
      await load(true);
      if (created.status === 'ACTIVE') {
        Alert.alert('Dízimo automático ativado', 'Todo mês o Pix do seu dízimo aparece aqui no app, no dia escolhido.');
      } else if (created.status === 'PENDING_AUTHORIZATION') {
        if (created.qrDataUrl) {
          setAuthQr(created);
        } else {
          Alert.alert(
            'Dízimo automático',
            "Não foi possível gerar o QR de autorização agora — toque em 'Autorizar no banco' para tentar de novo ou cancele e ative outra vez",
          );
        }
      } else {
        Alert.alert('Dízimo automático', created.lastError ?? `Situação: ${SCHEDULE_STATUS_LABELS[created.status]}`);
      }
    } catch (error: any) {
      Alert.alert('Dízimo automático', error?.message ?? 'Não foi possível ativar.');
    } finally {
      setScheduleBusy(false);
    }
  };

  const openAuthorization = async () => {
    try {
      const current = await getMySchedule();
      if (current?.qrDataUrl) setAuthQr(current);
      else Alert.alert('Autorização', 'O QR de autorização expirou — cancele e ative de novo.');
    } catch (error: any) {
      Alert.alert('Autorização', error?.message ?? 'Não foi possível abrir.');
    }
  };

  const handleCancelSchedule = (schedule: TitheSchedule) => {
    Alert.alert('Cancelar dízimo automático?', 'Você pode ativar de novo quando quiser.', [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Cancelar',
        style: 'destructive',
        onPress: async () => {
          setScheduleBusy(true);
          try {
            await cancelTitheSchedule(schedule.id);
            setAuthQr(null);
            await load(true);
          } catch (error: any) {
            Alert.alert('Dízimo automático', error?.message ?? 'Não foi possível cancelar.');
          } finally {
            setScheduleBusy(false);
          }
        },
      },
    ]);
  };

  const openPersistentQr = async () => {
    try {
      setPersistent(await getPersistentQr());
    } catch (error: any) {
      Alert.alert('QR fixo', error?.message ?? 'Não foi possível gerar.');
    }
  };

  /** "Contribuir" na campanha: seleciona o destino no card "Contribuir agora" e rola até ele. */
  const selectCampaign = (campaign: TitheCampaign) => {
    if (campaign.expired) return; // botão fica escondido; guarda só por segurança
    setCampaignTarget(campaign);
    // best-effort: se o card ainda não mediu, fica onde está
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: Math.max(0, contributeY.current - 8), animated: true }));
  };

  const openPledge = (campaign: TitheCampaign) => {
    setPledgeAmount(campaign.myPledge ? amountToText(campaign.myPledge.amount) : '');
    setPledgeNote(campaign.myPledge?.note ?? '');
    setPledgeTarget(campaign);
  };

  const submitPledge = async () => {
    if (!pledgeTarget) return;
    const amount = parseAmount(pledgeAmount);
    if (amount < 1) {
      Alert.alert('Promessa', 'Informe um valor a partir de R$ 1,00.');
      return;
    }
    setPledgeBusy(true);
    try {
      const note = pledgeNote.trim();
      const saved = await setCampaignPledge(pledgeTarget.id, { amount, ...(note ? { note } : {}) });
      const pledge = { amount: saved.amount, note: saved.note ?? null, fulfilled: saved.fulfilled };
      setCampaigns((list) => list.map((c) => (c.id === pledgeTarget.id ? { ...c, myTotal: saved.myTotal, myPledge: pledge } : c)));
      setPledgeTarget(null);
      Alert.alert(
        'Promessa registrada 🙏',
        saved.fulfilled
          ? 'Você já contribuiu esse valor — promessa cumprida!'
          : `Você prometeu ${money(saved.amount)} para “${pledgeTarget.name}”. Contribua quando puder — o app mostra quanto falta.`,
      );
    } catch (error: any) {
      Alert.alert('Promessa', error?.message ?? 'Não foi possível salvar.');
    } finally {
      setPledgeBusy(false);
    }
  };

  const handleCancelPledge = (campaign: TitheCampaign) => {
    Alert.alert('Cancelar promessa?', 'O que você já contribuiu continua registrado — só a promessa é desfeita.', [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Cancelar promessa',
        style: 'destructive',
        onPress: async () => {
          setPledgeBusy(true);
          try {
            await cancelCampaignPledge(campaign.id);
            setCampaigns((list) => list.map((c) => (c.id === campaign.id ? { ...c, myPledge: null } : c)));
            setPledgeTarget(null);
          } catch (error: any) {
            Alert.alert('Promessa', error?.message ?? 'Não foi possível cancelar.');
          } finally {
            setPledgeBusy(false);
          }
        },
      },
    ]);
  };

  /** QR estático da paróquia identificado pela campanha — para divulgar no grupo da comunidade. */
  const shareCampaignQr = async (campaign: TitheCampaign) => {
    setQrBusyId(campaign.id);
    let message: string;
    try {
      const qr = await getCampaignQr(campaign.id);
      const lines = [
        `${CAMPAIGN_KIND_LABELS[campaign.kind]}: ${qr.name} · ${qr.parish}`,
        `Recebedor: ${qr.merchantName ?? qr.parish}`,
        qr.pixKey ? `Chave Pix: ${qr.pixKey}` : null,
        `Código: ${qr.code}`,
        '',
        'Pix copia e cola (sem valor fixo — informe o valor no banco):',
        qr.brCode,
      ].filter((line): line is string => line !== null);
      message = lines.join('\n');
    } catch (error: any) {
      // 400 quando a paróquia não ativou o Pix pelo app: mostra a mensagem do backend
      Alert.alert('Compartilhar QR', error?.message ?? 'Não foi possível gerar o QR.');
      return;
    } finally {
      setQrBusyId(null);
    }
    try {
      await Share.share({ message });
    } catch {
      // usuário cancelou
    }
  };

  /** Convite para doar (D4.6): link público /doar/:paróquia — quem não tem o app doa pelo navegador. */
  const shareDonationLink = async (url: string) => {
    try {
      await Share.share({
        message: `Ajude a ${data?.parish?.name ?? 'sua paróquia'}: contribua pelo link ${url} — sem precisar de cadastro.`,
        url,
      });
    } catch {
      // usuário cancelou
    }
  };

  const parish = data?.parish;
  const enabled = !!parish?.titheEnabled;
  // Link público de doação (D4.6): só existe com o Pix da paróquia ativo e PUBLIC_WEB_URL no servidor
  const donationUrl = data?.donationUrl ?? null;
  // Toda a janela aceita pelo backend (+1 à frente … 12 atrás), mais recentes primeiro
  const monthOptions = data
    ? Array.from({ length: data.monthsBack + data.monthsAhead + 1 }, (_, i) => shiftMonth(data.currentMonth, data.monthsAhead - i))
    : [];
  const currentYear = new Date().getFullYear();
  const gatewayFee = data?.gateway ? feeText(data.gateway.feeFixed, data.gateway.feePercent) : '';
  // Chips só quando há escolha real (Asaas com CPF); sem isso o backend manda só ['PIX'] ou nada
  const availableMethods = PAYMENT_METHODS.filter((m) => (gatewayMethods ?? []).includes(m));
  const showMethodChips = availableMethods.length > 1;
  const hasNonPixIntent = !!data?.intents.some((intent) => !isPix(intent));
  const activeMethod: TithePaymentMethod = active ? payMethodOf(active) : 'PIX';
  const scheduleAuthExpired =
    !!data?.schedule &&
    (data.schedule.authorizationExpired === true ||
      (!!data.schedule.authorizationExpires && Date.parse(data.schedule.authorizationExpires) < Date.now()));
  const qrExpired = !!active && active.status === 'CREATED' && !!active.qrExpiresAt && Date.parse(active.qrExpiresAt) < Date.now();
  // Boleto: qrExpiresAt já inclui a folga de compensação — vencido ainda pode ter sido pago, então "verificar" segue ativo
  const boletoExpired = qrExpired && activeMethod === 'BOLETO';
  // Cartão em análise de risco: nada de pedir novo pagamento nem tratar como vencido
  const activeInReview = !!active && active.providerStatus === 'in_review' && active.status === 'CREATED';
  const contestCopy = CONTEST_COPY[contestTarget ? payMethodOf(contestTarget) : 'PIX'];
  // Com campanha: valores sugeridos dela (se houver) e "anônimo" só quando ela permite
  const targetPresets = campaignPresets(campaignTarget);
  const presets = targetPresets.length > 0 ? targetPresets : PRESETS;
  const showAnonymous = effectiveKind === 'OFFERING' && (campaignTarget ? campaignTarget.allowAnonymous : true);
  const registeredText = campaignTarget ? 'sua contribuição é registrada' : 'seu dízimo é registrado';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()} hitSlop={10}>
          <FontAwesome5 name="arrow-left" size={17} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>💛 Dízimo e ofertas</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => load(true)} />}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {isFinancial && (
          <TouchableOpacity style={styles.agentBanner} activeOpacity={0.85} onPress={() => router.push('/tithe-agent' as never)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.agentTitle}>🧾 Modo agente — registrar contribuição presencial</Text>
              <Text style={styles.hint}>Envelope, dinheiro, maquininha, Pix visto no extrato, transferência ou cheque — em nome do fiel.</Text>
            </View>
            <FontAwesome5 name="chevron-right" size={14} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
        {isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : !data ? (
          <Text style={styles.emptyText}>Não foi possível carregar.</Text>
        ) : !enabled ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{parish?.name ?? 'Sua paróquia'}</Text>
            <Text style={styles.cardBody}>
              Sua paróquia ainda não ativou o dízimo pelo app. Enquanto isso, procure a secretaria — e obrigado por
              querer contribuir. 🙏
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{parish?.name}</Text>
              <Text style={styles.cardBody}>
                {parish?.titheMessage ||
                  'O dízimo é a partilha que sustenta a missão da paróquia: liturgia, catequese, caridade e manutenção.'}
              </Text>
              {data.tither?.registrationNumber ? (
                <Text style={styles.meta}>Dizimista nº {data.tither.registrationNumber}</Text>
              ) : null}
            </View>

            <View
              style={styles.card}
              onLayout={(event: LayoutChangeEvent) => {
                contributeY.current = event.nativeEvent.layout.y;
              }}
            >
              <Text style={styles.sectionTitle}>Contribuir agora</Text>
              {campaignTarget ? (
                <>
                  <TouchableOpacity style={styles.targetChip} onPress={() => setCampaignTarget(null)} hitSlop={6}>
                    <Text style={styles.targetChipText} numberOfLines={1}>
                      Para: {campaignTarget.name}
                    </Text>
                    <Text style={styles.targetChipClose}>✕</Text>
                  </TouchableOpacity>
                  <Text style={styles.hint}>
                    Oferta com finalidade: vai para {CAMPAIGN_KIND_LABELS[campaignTarget.kind].toLowerCase()} “{campaignTarget.name}”
                    {campaignTarget.community ? ` (${campaignTarget.community.name})` : ''}. Toque em ✕ para voltar ao dízimo.
                  </Text>
                </>
              ) : (
                <View style={styles.kindRow}>
                  {(['TITHE', 'OFFERING'] as TitheIntentKind[]).map((option) => (
                    <TouchableOpacity
                      key={option}
                      style={[styles.kindChip, kind === option && styles.kindChipOn]}
                      onPress={() => setKind(option)}
                    >
                      <Text style={[styles.kindChipText, kind === option && styles.kindChipTextOn]}>
                        {option === 'TITHE' ? 'Dízimo' : 'Oferta avulsa'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {effectiveKind === 'TITHE' ? (
                <>
                  <Text style={styles.label}>Mês de referência</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kindRow}>
                    {monthOptions.map((m) => (
                      <TouchableOpacity
                        key={m}
                        style={[styles.monthChip, (referenceMonth ?? data.currentMonth) === m && styles.kindChipOn]}
                        onPress={() => setReferenceMonth(m)}
                      >
                        <Text style={[styles.kindChipText, (referenceMonth ?? data.currentMonth) === m && styles.kindChipTextOn]}>
                          {monthLabel(m, true)}
                          {m === data.currentMonth ? ' · atual' : ''}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              ) : showAnonymous ? (
                <TouchableOpacity style={styles.anonRow} onPress={() => setAnonymous(!anonymous)}>
                  <FontAwesome5
                    name={anonymous ? 'check-square' : 'square'}
                    size={18}
                    color={anonymous ? colors.primary : colors.textTertiary}
                  />
                  <Text style={styles.anonText}>Oferta anônima — meu nome não aparece para a tesouraria</Text>
                </TouchableOpacity>
              ) : null}
              <View style={styles.presetRow}>
                {presets.map((preset) => (
                  <TouchableOpacity
                    key={preset}
                    style={[styles.preset, parseAmount(amountText) === preset && styles.presetOn]}
                    onPress={() => setAmountText(String(preset))}
                  >
                    <Text style={[styles.presetText, parseAmount(amountText) === preset && styles.presetTextOn]}>
                      {money(preset)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.amountRow}>
                <Text style={styles.amountPrefix}>R$</Text>
                <TextInput
                  style={styles.amountInput}
                  keyboardType="decimal-pad"
                  placeholder="0,00"
                  placeholderTextColor={colors.textTertiary}
                  value={amountText}
                  onChangeText={setAmountText}
                  maxLength={10}
                />
              </View>
              {showMethodChips && (
                <>
                  <Text style={styles.label}>Como pagar</Text>
                  <View style={styles.kindRow}>
                    {availableMethods.map((method) => (
                      <TouchableOpacity
                        key={method}
                        style={[styles.kindChip, payMethod === method && styles.kindChipOn]}
                        onPress={() => setPayMethod(method)}
                      >
                        <Text style={[styles.kindChipText, payMethod === method && styles.kindChipTextOn]}>
                          {PAYMENT_METHOD_LABELS[method]}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.hint}>{PAYMENT_METHOD_HINTS[payMethod]}</Text>
                </>
              )}
              <TouchableOpacity style={styles.primaryBtn} disabled={creating} onPress={() => void handleCreate()}>
                <Text style={styles.primaryBtnText}>
                  {creating
                    ? 'Gerando...'
                    : payMethod === 'CARD'
                      ? '💳 Pagar com cartão'
                      : payMethod === 'BOLETO'
                        ? 'Gerar boleto'
                        : 'Gerar Pix'}
                </Text>
              </TouchableOpacity>
              {data.gateway?.available ? (
                <Text style={styles.hint}>
                  {payMethod === 'CARD'
                    ? `Cartão com confirmação automática: você paga na página segura do Asaas e, assim que for aprovado, ${registeredText} sem você precisar avisar.`
                    : payMethod === 'BOLETO'
                      ? `Boleto com confirmação automática: quando compensar (até 2 dias úteis), ${registeredText} sem você precisar avisar.`
                      : `Pix com confirmação automática: assim que o banco aprovar, ${registeredText} sem você precisar avisar.`}
                  {data.gateway.feePolicy === 'PASS_THROUGH'
                    ? payMethod === 'PIX'
                      ? gatewayFee
                        ? ` A taxa do provedor (${gatewayFee}) é somada ao Pix.`
                        : ''
                      : ' A taxa do provedor é somada ao valor — você vê o total antes de pagar.'
                    : ''}
                </Text>
              ) : (
                <Text style={styles.hint}>
                  Você paga no app do seu banco (QR ou copia e cola) — confira o nome do recebedor antes de confirmar.
                  Depois toque em “Já fiz o Pix”: a tesouraria confere e confirma.
                </Text>
              )}
              {data.gateway?.needsCpf && (
                <Text style={styles.notice}>
                  Peça à secretaria para cadastrar seu CPF — é o que libera a confirmação automática e o dízimo
                  automático.
                </Text>
              )}
              {data.gateway?.needsEmail && (
                <Text style={styles.notice}>
                  Cadastre um e-mail no seu perfil para ter confirmação automática — a secretaria faz isso para você.
                </Text>
              )}
              {donationUrl ? (
                <View style={styles.inviteBlock}>
                  <TouchableOpacity style={styles.secondaryBtnSm} onPress={() => void shareDonationLink(donationUrl)}>
                    <Text style={styles.secondaryBtnSmText}>🔗 Convidar alguém a doar</Text>
                  </TouchableOpacity>
                  <Text style={styles.hint}>
                    Compartilhe com quem não tem o app: a pessoa doa pelo navegador e recebe o comprovante por e-mail.
                  </Text>
                </View>
              ) : null}
            </View>

            {campaigns.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Campanhas e fundos</Text>
                <Text style={styles.hint}>
                  Contribuições com destino certo: escolha uma campanha e a tesouraria registra o seu Pix nela.
                </Text>
                {campaigns.map((campaign) => {
                  const percent = campaign.percent === null ? null : Math.min(100, Math.max(0, campaign.percent));
                  const pledge = campaign.myPledge;
                  const pledgeRemaining = pledge ? Math.max(0, pledge.amount - campaign.myTotal) : 0;
                  const daysLeft = daysLeftText(campaign);
                  const selected = campaignTarget?.id === campaign.id;
                  const qrBusy = qrBusyId === campaign.id;
                  return (
                    <View key={campaign.id} style={styles.campaign}>
                      <View style={styles.rowBetween}>
                        <Text style={styles.campaignName}>{campaign.name}</Text>
                        <Text style={[styles.tag, campaign.kind === 'FUND' ? styles.tagFund : styles.tagCampaign]}>
                          {CAMPAIGN_KIND_LABELS[campaign.kind]}
                        </Text>
                      </View>
                      <Text style={styles.meta}>{campaign.community?.name ?? 'Paróquia'}</Text>
                      {campaign.description ? (
                        <Text style={styles.cardBody} numberOfLines={2}>
                          {campaign.description}
                        </Text>
                      ) : null}
                      {percent !== null ? (
                        <View style={styles.progressTrack}>
                          <View style={[styles.progressFill, { width: `${percent}%` as const }]} />
                        </View>
                      ) : null}
                      <Text style={styles.campaignRaised}>
                        {campaign.goalAmount
                          ? `${money(campaign.raised)} arrecadados de ${money(campaign.goalAmount)}`
                          : `${money(campaign.raised)} arrecadados`}
                        {percent !== null ? ` · ${Math.round(percent)}%` : ''}
                      </Text>
                      <Text style={styles.hint}>
                        {contributorsText(campaign.contributors, campaign.raised)}
                        {daysLeft ? ` · ${daysLeft}` : ''}
                      </Text>
                      {campaign.myTotal > 0 ? (
                        <Text style={styles.campaignMine}>Você já contribuiu {money(campaign.myTotal)}</Text>
                      ) : null}
                      {pledge ? (
                        <Text style={styles.campaignPledge}>
                          Promessa: {money(pledge.amount)} {pledge.fulfilled ? '✓ cumprida' : `· faltam ${money(pledgeRemaining)}`}
                        </Text>
                      ) : null}
                      <View style={styles.campaignActions}>
                        {/* Prazo encerrado: o backend recusa novas contribuições (400) — não oferece o botão */}
                        {!campaign.expired ? (
                          <TouchableOpacity style={styles.primaryBtnSm} onPress={() => selectCampaign(campaign)}>
                            <Text style={styles.primaryBtnSmText}>{selected ? 'Selecionada ↑' : 'Contribuir'}</Text>
                          </TouchableOpacity>
                        ) : null}
                        <TouchableOpacity style={styles.secondaryBtnSm} disabled={pledgeBusy} onPress={() => openPledge(campaign)}>
                          <Text style={styles.secondaryBtnSmText}>{pledge ? 'Alterar promessa' : 'Prometer'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.secondaryBtnSm, qrBusy && styles.btnDisabled]}
                          disabled={qrBusy}
                          onPress={() => void shareCampaignQr(campaign)}
                        >
                          <Text style={styles.secondaryBtnSmText}>{qrBusy ? 'Gerando...' : 'Compartilhar QR'}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {statements.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Transparência</Text>
                <Text style={styles.hint}>Balancetes aprovados pelo Conselho de Assuntos Econômicos</Text>
                {(showAllStatements ? statements : statements.slice(0, STATEMENTS_PREVIEW)).map((statement) => (
                  <TouchableOpacity
                    key={statement.id}
                    style={styles.statement}
                    onPress={() => setStatementTarget(statement)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.rowBetween}>
                      <Text style={styles.statementMonth}>{statement.monthLabel}</Text>
                      <Text
                        style={[styles.tag, statement.community ? styles.tagCampaign : styles.tagFund, styles.statementScope]}
                        numberOfLines={1}
                      >
                        {statement.community?.name ?? 'Paróquia'}
                      </Text>
                    </View>
                    {renderStatementTotals(statement.snapshot)}
                    <Text style={styles.hint}>
                      Aprovado por {statement.approvedByName} em {dateBR(statement.approvedAt)} · publicado em{' '}
                      {dateBR(statement.publishedAt)}
                    </Text>
                  </TouchableOpacity>
                ))}
                {statements.length > STATEMENTS_PREVIEW ? (
                  <TouchableOpacity onPress={() => setShowAllStatements((current) => !current)} hitSlop={6}>
                    <Text style={styles.link}>
                      {showAllStatements ? 'Ver menos' : `Ver mais (${statements.length - STATEMENTS_PREVIEW})`}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}

            {(data.gateway?.recurringAvailable || data.schedule) && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Dízimo automático</Text>
                {data.schedule ? (
                  <>
                    <Text style={styles.cardBody}>
                      {money(data.schedule.amount)} todo dia {data.schedule.dayOfMonth} ·{' '}
                      {data.schedule.mode === 'PIX_AUTOMATIC' ? 'Pix Automático (débito no seu banco)' : 'Pix mensal para você pagar'}
                    </Text>
                    <Text style={[styles.badge, styles[`sbadge_${data.schedule.status}` as const], { alignSelf: 'flex-start' }]}>
                      {SCHEDULE_STATUS_LABELS[data.schedule.status]}
                    </Text>
                    {data.schedule.lastError ? <Text style={styles.hint}>{data.schedule.lastError}</Text> : null}
                    {data.schedule.status === 'PENDING_AUTHORIZATION' && scheduleAuthExpired ? (
                      <Text style={styles.expiredHint}>Autorização vencida — cancele e ative de novo</Text>
                    ) : null}
                    <View style={styles.rowGap}>
                      {data.schedule.status === 'PENDING_AUTHORIZATION' && !scheduleAuthExpired && (
                        <TouchableOpacity style={styles.secondaryBtnSm} onPress={() => void openAuthorization()}>
                          <Text style={styles.secondaryBtnSmText}>Autorizar no banco</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={styles.secondaryBtnSm} disabled={scheduleBusy} onPress={() => handleCancelSchedule(data.schedule!)}>
                        <Text style={styles.secondaryBtnSmText}>Cancelar</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.hint}>
                      Escolha o valor e o dia: com o Pix Automático, o seu banco debita o dízimo todo mês depois de uma
                      única autorização. Sem cartão, sem boleto.
                    </Text>
                    <TouchableOpacity
                      style={styles.secondaryBtnSm}
                      onPress={() => {
                        setScheduleAmount(amountText || (data.suggestedAmount ? String(data.suggestedAmount) : ''));
                        setScheduleModal(true);
                      }}
                    >
                      <Text style={styles.secondaryBtnSmText}>Ativar dízimo automático</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}

            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Lembrete mensal</Text>
                  <Text style={styles.hint}>Um aviso no dia escolhido, só se o mês ainda estiver em aberto.</Text>
                </View>
                <Switch
                  value={data.reminderDay !== null}
                  disabled={savingReminder || savingWhatsapp}
                  onValueChange={(on) => void setReminder(on ? 10 : null)}
                  trackColor={{ true: colors.primary }}
                />
              </View>
              {data.reminderDay !== null && (
                <View style={styles.kindRow}>
                  {REMINDER_DAYS.map((day) => (
                    <TouchableOpacity
                      key={day}
                      style={[styles.kindChip, data.reminderDay === day && styles.kindChipOn]}
                      disabled={savingReminder || savingWhatsapp}
                      onPress={() => void setReminder(day)}
                    >
                      <Text style={[styles.kindChipText, data.reminderDay === day && styles.kindChipTextOn]}>dia {day}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {data.whatsapp?.available ? (
                data.whatsapp.hasPhone ? (
                  <View style={styles.whatsappRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.whatsappTitle}>📲 Receber o Pix do mês pelo WhatsApp</Text>
                      <Text style={styles.hint}>
                        No dia do lembrete você recebe o Pix copia e cola por WhatsApp; responda PAGUEI depois de pagar.
                        SAIR para parar.
                      </Text>
                    </View>
                    <Switch
                      value={data.whatsapp.optIn}
                      disabled={savingReminder || savingWhatsapp}
                      onValueChange={(on) => void setWhatsappOptIn(on)}
                      trackColor={{ true: colors.primary }}
                    />
                  </View>
                ) : (
                  <View style={styles.whatsappRow}>
                    <Text style={[styles.hint, { flex: 1 }]}>
                      📲 Cadastre um celular no seu perfil (a secretaria faz isso) para receber pelo WhatsApp.
                    </Text>
                  </View>
                )
              ) : null}
              <Text style={styles.hint}>
                Prefere não depender de lembrete? No seu banco, agende um Pix mensal para a chave da paróquia usando o
                seu QR fixo abaixo.
              </Text>
            </View>

            {data.persistentQrAvailable && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Meu QR fixo</Text>
                <Text style={styles.hint}>
                  Um código só seu, sem valor: serve para o envelope, o carnê e para agendar o Pix no banco. A tesouraria
                  identifica você pelo número de dizimista.
                </Text>
                <View style={styles.rowGap}>
                  <TouchableOpacity style={styles.secondaryBtnSm} onPress={() => void openPersistentQr()}>
                    <Text style={styles.secondaryBtnSmText}>Ver meu QR</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.secondaryBtnSm}
                    onPress={async () => {
                      try {
                        await sharePersistentQrPdf();
                      } catch (error: any) {
                        Alert.alert('QR fixo', error?.message ?? 'Não foi possível gerar.');
                      }
                    }}
                  >
                    <Text style={styles.secondaryBtnSmText}>🖨 Etiqueta (PDF)</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {data.intents.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>{hasNonPixIntent ? 'Meus pagamentos' : 'Meus Pix'}</Text>
                {data.intents.map((intent) => (
                  <TouchableOpacity
                    key={intent.id}
                    style={styles.intentRow}
                    activeOpacity={0.8}
                    onPress={() => void openIntent(intent)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.intentTitle}>
                        {intent.kind === 'TITHE' ? 'Dízimo' : intent.anonymous ? 'Oferta anônima' : 'Oferta'} ·{' '}
                        {monthLabel(intent.referenceMonth)}
                      </Text>
                      {intent.campaign ? (
                        <Text style={styles.intentCampaign} numberOfLines={1}>
                          Campanha: {intent.campaign.name}
                        </Text>
                      ) : null}
                      <Text style={styles.intentMeta}>
                        {money(intent.amountPaid ?? intent.amount)}
                        {intent.amountPaid != null && intent.amountPaid !== intent.amount ? ` (gerado ${money(intent.amount)})` : ''} ·{' '}
                        {new Date(intent.createdAt).toLocaleDateString('pt-BR')}
                        {intent.note && intent.status === 'CANCELLED' ? ` · ${intent.note}` : ''}
                        {intent.contestNote ? ' · contestado' : ''}
                      </Text>
                      {intent.canContest && (
                        <TouchableOpacity
                          onPress={() => {
                            if (contestTarget?.id !== intent.id) setContestText('');
                            setContestTarget(intent);
                          }}
                          hitSlop={6}
                        >
                          <Text style={styles.link}>Paguei — contestar</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      <View style={styles.statusRow}>
                        <Text style={styles.intentMethod}>{PAYMENT_METHOD_LABELS[payMethodOf(intent)]}</Text>
                        <Text style={[styles.badge, styles[`badge_${intent.status}` as const]]}>{statusLabel(intent)}</Text>
                      </View>
                      {providerHint(intent) ? <Text style={styles.providerHint}>{providerHint(intent)}</Text> : null}
                      {intent.status === 'CONFIRMED' && (
                        <TouchableOpacity disabled={busyId === intent.id} onPress={() => void handleReceipt(intent)} hitSlop={6}>
                          <Text style={styles.link}>{busyId === intent.id ? 'Gerando...' : '🧾 Comprovante'}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.sectionTitle}>Contribuições registradas</Text>
                <TouchableOpacity
                  onPress={async () => {
                    try {
                      await shareAnnualStatement(currentYear);
                    } catch (error: any) {
                      Alert.alert('Extrato', error?.message ?? 'Não foi possível gerar.');
                    }
                  }}
                  hitSlop={6}
                >
                  <Text style={styles.link}>🖨 Extrato {currentYear}</Text>
                </TouchableOpacity>
              </View>
              {data.contributions.length === 0 ? (
                <Text style={styles.hint}>Nenhuma contribuição confirmada ainda.</Text>
              ) : (
                data.contributions.map((contribution) => (
                  <View key={contribution.id} style={styles.intentRow}>
                    <Text style={styles.intentTitle}>{monthLabel(contribution.referenceMonth)}</Text>
                    <Text style={styles.intentMeta}>
                      {money(contribution.amount)} · {contribution.method}
                    </Text>
                  </View>
                ))
              )}
              <Text style={styles.hint}>O extrato é para o seu acompanhamento — dízimo não é dedutível no Imposto de Renda.</Text>
            </View>
          </>
        )}
      </ScrollView>

      {/* Cobrança gerada: Pix (QR + copia e cola), cartão (página do Asaas) ou boleto (linha digitável + PDF) */}
      <Modal visible={!!active} transparent animationType="fade" onRequestClose={() => setActive(null)}>
        <Pressable style={styles.overlay} onPress={() => setActive(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            {active && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.sheetTitle}>
                  {activeMethod === 'CARD'
                    ? 'Pagar com cartão'
                    : activeMethod === 'BOLETO'
                      ? 'Pagar com boleto'
                      : `${active.kind === 'TITHE' ? 'Dízimo' : 'Oferta'} · ${money(active.amount)}`}
                </Text>
                <Text style={styles.sheetMeta}>
                  {activeMethod === 'PIX'
                    ? monthLabel(active.referenceMonth)
                    : `${active.kind === 'TITHE' ? 'Dízimo' : 'Oferta'} · ${money(active.amount)} · ${monthLabel(active.referenceMonth)}`}
                  {active.campaign ? ` · Campanha: ${active.campaign.name}` : ''}
                </Text>
                {active.method === 'GATEWAY' ? (
                  <View style={styles.beneficiary}>
                    <Text style={styles.beneficiaryLabel}>
                      {activeMethod === 'CARD'
                        ? 'Cartão com confirmação automática'
                        : activeMethod === 'BOLETO'
                          ? 'Boleto com confirmação automática'
                          : 'Pix com confirmação automática'}
                    </Text>
                    <Text style={styles.beneficiaryText}>
                      Cobrança emitida por {providerLabel(data?.gateway?.provider)} em nome de {parish?.name}
                    </Text>
                    <Text style={styles.beneficiaryText}>Identificador: {active.txid}</Text>
                    {active.chargedAmount != null && active.chargedAmount !== active.amount ? (
                      <Text style={styles.beneficiaryText}>
                        {activeMethod === 'PIX' ? 'Valor do Pix' : 'Valor cobrado'}: {money(active.chargedAmount)} (inclui taxa de{' '}
                        {money(active.feeAmount ?? active.chargedAmount - active.amount)})
                      </Text>
                    ) : null}
                    {activeMethod !== 'PIX' && active.qrExpiresAt ? (
                      <Text style={styles.beneficiaryText}>Vencimento: {dateTimeBR(active.qrExpiresAt)}</Text>
                    ) : null}
                  </View>
                ) : (
                  <View style={styles.beneficiary}>
                    <Text style={styles.beneficiaryLabel}>Confira no seu banco antes de pagar</Text>
                    <Text style={styles.beneficiaryText}>Recebedor: {parish?.merchantName ?? parish?.name}</Text>
                    {parish?.pixKey ? <Text style={styles.beneficiaryText}>Chave: {parish.pixKey}</Text> : null}
                    <Text style={styles.beneficiaryText}>Identificador: {active.txid}</Text>
                  </View>
                )}

                {/* CARD: sem QR/copia e cola — só a página segura do provedor */}
                {activeMethod === 'CARD' && (
                  <>
                    <Text style={[styles.hint, { textAlign: 'center' }]}>
                      {activeInReview
                        ? 'O provedor está analisando o pagamento no cartão — não é preciso pagar de novo.'
                        : `Você paga na página segura do Asaas em nome de ${parish?.name}; a confirmação aparece aqui sozinha.`}
                    </Text>
                    {qrExpired && !activeInReview ? <Text style={styles.expiredText}>⌛ Cobrança vencida — gere outra</Text> : null}
                    {active.status === 'CREATED' && !activeInReview && (
                      <>
                        <TouchableOpacity
                          style={[styles.primaryBtn, { marginTop: 12 }, (qrExpired || !active.paymentUrl) && styles.btnDisabled]}
                          disabled={qrExpired || !active.paymentUrl}
                          onPress={() => void openPaymentPage(active)}
                        >
                          <Text style={styles.primaryBtnText}>💳 Abrir página de pagamento</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.secondaryBtnSm, { marginTop: 8 }, (qrExpired || !active.paymentUrl) && styles.btnDisabled]}
                          disabled={qrExpired || !active.paymentUrl}
                          onPress={() => void shareCode(active)}
                        >
                          <Text style={styles.secondaryBtnSmText}>Compartilhar link</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </>
                )}

                {/* BOLETO: linha digitável + PDF (+ página do provedor, se houver) */}
                {activeMethod === 'BOLETO' && (
                  <>
                    {active.boletoLine ? (
                      <>
                        <Text style={styles.codeLabel}>Linha digitável</Text>
                        <Text style={styles.code} selectable>
                          {active.boletoLine}
                        </Text>
                      </>
                    ) : (
                      <Text style={[styles.hint, { textAlign: 'center', marginTop: 8 }]}>
                        Linha digitável indisponível — abra o PDF do boleto para pagar.
                      </Text>
                    )}
                    {boletoExpired ? (
                      <Text style={styles.expiredText}>
                        ⌛ Boleto vencido — se você já pagou, aguarde a compensação (até 2 dias úteis); se não pagou, gere outro
                      </Text>
                    ) : null}
                    {/* Vencido: só copiar/abrir PDF/compartilhar ficam bloqueados; página do provedor e "verificar" seguem ativos */}
                    {active.status === 'CREATED' && (
                      <>
                        {active.boletoLine ? (
                          <TouchableOpacity
                            style={[styles.primaryBtn, { marginTop: 12 }, qrExpired && styles.btnDisabled]}
                            disabled={qrExpired}
                            onPress={() => void copyBoletoLine(active.boletoLine!)}
                          >
                            <Text style={styles.primaryBtnText}>📋 Copiar linha digitável</Text>
                          </TouchableOpacity>
                        ) : null}
                        <View style={styles.rowGap}>
                          <TouchableOpacity
                            style={[styles.secondaryBtnSm, { flex: 1, marginTop: 4 }, (qrExpired || !active.boletoUrl) && styles.btnDisabled]}
                            disabled={qrExpired || !active.boletoUrl}
                            onPress={() => void openUrl(active.boletoUrl, 'Boleto')}
                          >
                            <Text style={styles.secondaryBtnSmText}>📄 Abrir boleto (PDF)</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.secondaryBtnSm, { flex: 1, marginTop: 4 }, qrExpired && styles.btnDisabled]}
                            disabled={qrExpired}
                            onPress={() => void shareCode(active)}
                          >
                            <Text style={styles.secondaryBtnSmText}>Compartilhar</Text>
                          </TouchableOpacity>
                        </View>
                        {active.paymentUrl ? (
                          <TouchableOpacity
                            style={[styles.secondaryBtnSm, { marginTop: 8 }]}
                            onPress={() => void openUrl(active.paymentUrl, 'Página de pagamento')}
                          >
                            <Text style={styles.secondaryBtnSmText}>Abrir página de pagamento</Text>
                          </TouchableOpacity>
                        ) : null}
                      </>
                    )}
                    {!boletoExpired ? (
                      <Text style={[styles.hint, { textAlign: 'center', marginTop: 10 }]}>
                        Boleto compensa em até 2 dias úteis — a confirmação aparece aqui sozinha.
                      </Text>
                    ) : null}
                  </>
                )}

                {/* PIX (provedor ou chave estática): QR + copia e cola */}
                {activeMethod === 'PIX' && active.qrDataUrl ? (
                  <Image source={{ uri: active.qrDataUrl }} style={styles.qr} resizeMode="contain" />
                ) : null}
                {activeMethod === 'PIX' && active.brCode ? (
                  <>
                    <Text style={styles.codeLabel}>Pix copia e cola</Text>
                    <Text style={styles.code} numberOfLines={3} selectable>
                      {active.brCode}
                    </Text>
                    {qrExpired ? <Text style={styles.expiredText}>⌛ QR vencido — gere outro Pix</Text> : null}
                    <View style={styles.rowGap}>
                      <TouchableOpacity
                        style={[styles.primaryBtn, { flex: 1 }, qrExpired && styles.btnDisabled]}
                        disabled={qrExpired}
                        onPress={() => void copyCode(active.brCode!)}
                      >
                        <Text style={styles.primaryBtnText}>📋 Copiar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.secondaryBtnSm, { flex: 1, marginTop: 4 }, qrExpired && styles.btnDisabled]}
                        disabled={qrExpired}
                        onPress={() => void shareCode(active)}
                      >
                        <Text style={styles.secondaryBtnSmText}>Compartilhar</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : null}
                {active.status === 'CREATED' && active.method === 'GATEWAY' && (
                  <>
                    {activeInReview ? <Text style={styles.declared}>⏳ {PROVIDER_STATUS_HINTS.in_review}.</Text> : null}
                    <TouchableOpacity
                      style={styles.secondaryBtn}
                      disabled={busyId === active.id}
                      onPress={() => void handleVerifyGateway(active)}
                    >
                      <Text style={styles.secondaryBtnText}>
                        {busyId === active.id ? 'Verificando...' : '✅ Já paguei — verificar'}
                      </Text>
                    </TouchableOpacity>
                    <Text style={[styles.hint, { textAlign: 'center', marginTop: 8 }]}>
                      {activeInReview
                        ? 'Pode fechar — quando o provedor concluir a análise, o resultado aparece aqui sozinho.'
                        : activeMethod === 'CARD'
                          ? 'Assim que o cartão for aprovado, a confirmação aparece aqui sozinha.'
                          : activeMethod === 'BOLETO'
                            ? 'Pagou o boleto? Pode fechar — quando compensar, a confirmação aparece sozinha.'
                            : 'Assim que o banco aprovar, a confirmação aparece aqui sozinha.'}
                    </Text>
                  </>
                )}
                {active.status === 'CREATED' && active.method !== 'GATEWAY' && (
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    disabled={busyId === active.id}
                    onPress={() => void handleDeclare(active)}
                  >
                    <Text style={styles.secondaryBtnText}>
                      {busyId === active.id ? 'Registrando...' : '✅ Já fiz o Pix'}
                    </Text>
                  </TouchableOpacity>
                )}
                {active.status === 'DECLARED' && (
                  <Text style={styles.declared}>
                    {active.method === 'GATEWAY'
                      ? activeMethod === 'PIX'
                        ? '⏳ Pix informado — aguardando a confirmação do banco.'
                        : '⏳ Pagamento informado — aguardando a confirmação do provedor.'
                      : '⏳ Pix informado — aguardando a conferência da tesouraria.'}
                  </Text>
                )}
                {(active.status === 'CREATED' || active.status === 'DECLARED') && (
                  <TouchableOpacity disabled={busyId === active.id} onPress={() => handleCancel(active)}>
                    <Text style={styles.cancelLink}>Não fiz o pagamento — cancelar</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.closeBtn} onPress={() => setActive(null)}>
                  <Text style={styles.closeBtnText}>Fechar</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* QR fixo */}
      <Modal visible={!!persistent} transparent animationType="fade" onRequestClose={() => setPersistent(null)}>
        <Pressable style={styles.overlay} onPress={() => setPersistent(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            {persistent && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.sheetTitle}>Meu Pix do dízimo</Text>
                <Text style={styles.sheetMeta}>
                  {persistent.registrationNumber ? `Dizimista nº ${persistent.registrationNumber} · ` : ''}
                  {persistent.merchantName ?? persistent.parish}
                </Text>
                <Image source={{ uri: persistent.qrDataUrl }} style={styles.qr} resizeMode="contain" />
                <Text style={styles.hint}>Sem valor fixo: informe o valor no banco. Identificador {persistent.txid}.</Text>
                <View style={styles.rowGap}>
                  <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={() => void copyCode(persistent.brCode)}>
                    <Text style={styles.primaryBtnText}>📋 Copiar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.secondaryBtnSm, { flex: 1, marginTop: 4 }]}
                    onPress={() => void Share.share({ message: `Meu Pix do dízimo (${persistent.parish}) — identificador ${persistent.txid}:\n${persistent.brCode}` })}
                  >
                    <Text style={styles.secondaryBtnSmText}>Compartilhar</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={styles.closeBtn} onPress={() => setPersistent(null)}>
                  <Text style={styles.closeBtnText}>Fechar</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Dízimo automático: configurar */}
      <Modal visible={scheduleModal} transparent animationType="fade" onRequestClose={() => setScheduleModal(false)}>
        <Pressable style={styles.overlay} onPress={() => setScheduleModal(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Dízimo automático</Text>
            <Text style={styles.label}>Valor mensal</Text>
            <View style={styles.amountRow}>
              <Text style={styles.amountPrefix}>R$</Text>
              <TextInput style={styles.amountInput} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor={colors.textTertiary} value={scheduleAmount} onChangeText={setScheduleAmount} maxLength={10} />
            </View>
            <Text style={styles.label}>Dia do mês</Text>
            <View style={styles.kindRow}>
              {REMINDER_DAYS.map((day) => (
                <TouchableOpacity key={day} style={[styles.kindChip, scheduleDay === day && styles.kindChipOn]} onPress={() => setScheduleDay(day)}>
                  <Text style={[styles.kindChipText, scheduleDay === day && styles.kindChipTextOn]}>dia {day}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Como</Text>
            <View style={styles.kindRow}>
              <TouchableOpacity style={[styles.kindChip, scheduleMode === 'PIX_AUTOMATIC' && styles.kindChipOn]} onPress={() => setScheduleMode('PIX_AUTOMATIC')}>
                <Text style={[styles.kindChipText, scheduleMode === 'PIX_AUTOMATIC' && styles.kindChipTextOn]}>Pix Automático (débito)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.kindChip, scheduleMode === 'PIX_SUBSCRIPTION' && styles.kindChipOn]} onPress={() => setScheduleMode('PIX_SUBSCRIPTION')}>
                <Text style={[styles.kindChipText, scheduleMode === 'PIX_SUBSCRIPTION' && styles.kindChipTextOn]}>Pix mensal para eu pagar</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.hint}>
              {scheduleMode === 'PIX_AUTOMATIC'
                ? 'Você autoriza uma vez no seu banco (lendo um QR) e o débito acontece todo mês, sem esquecer.'
                : 'Todo mês o Pix do dízimo aparece aqui no app e você paga quando quiser.'}
            </Text>
            <TouchableOpacity style={styles.primaryBtn} disabled={scheduleBusy} onPress={() => void handleCreateSchedule()}>
              <Text style={styles.primaryBtnText}>{scheduleBusy ? 'Ativando...' : 'Ativar'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setScheduleModal(false)}>
              <Text style={styles.closeBtnText}>Fechar</Text>
            </TouchableOpacity>
          </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Dízimo automático: QR de autorização */}
      <Modal visible={!!authQr} transparent animationType="fade" onRequestClose={() => setAuthQr(null)}>
        <Pressable style={styles.overlay} onPress={() => setAuthQr(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            {authQr && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.sheetTitle}>Autorize no seu banco</Text>
                <Text style={styles.sheetMeta}>
                  Leia o QR no app do banco: o primeiro mês é pago agora e os próximos ({money(authQr.amount)} todo dia {authQr.dayOfMonth}) ficam autorizados.
                </Text>
                {authQr.qrDataUrl ? <Image source={{ uri: authQr.qrDataUrl }} style={styles.qr} resizeMode="contain" /> : null}
                {authQr.authorizationPayload ? (
                  <>
                    <Text style={styles.codeLabel}>Pix copia e cola</Text>
                    <Text style={styles.code} numberOfLines={3} selectable>{authQr.authorizationPayload}</Text>
                    <TouchableOpacity style={styles.primaryBtn} onPress={() => void copyCode(authQr.authorizationPayload!)}>
                      <Text style={styles.primaryBtnText}>📋 Copiar</Text>
                    </TouchableOpacity>
                  </>
                ) : null}
                <Text style={styles.hint}>Depois da autorização, o status muda para “Ativo” sozinho.</Text>
                <TouchableOpacity style={styles.closeBtn} onPress={() => setAuthQr(null)}>
                  <Text style={styles.closeBtnText}>Fechar</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Campanhas: promessa (valor + observação) */}
      <Modal visible={!!pledgeTarget} transparent animationType="fade" onRequestClose={() => setPledgeTarget(null)}>
        <Pressable style={styles.overlay} onPress={() => setPledgeTarget(null)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>{pledgeTarget?.myPledge ? 'Alterar promessa' : 'Prometer contribuição'}</Text>
            <Text style={styles.sheetMeta}>
              {pledgeTarget ? `${CAMPAIGN_KIND_LABELS[pledgeTarget.kind]} “${pledgeTarget.name}”` : ''}
              {pledgeTarget && pledgeTarget.myTotal > 0 ? ` · você já contribuiu ${money(pledgeTarget.myTotal)}` : ''}
            </Text>
            <Text style={styles.hint}>
              A promessa é um compromisso pessoal, sem cobrança automática: você contribui quando puder e o app mostra
              quanto falta.
            </Text>
            <Text style={styles.label}>Valor prometido</Text>
            <View style={styles.amountRow}>
              <Text style={styles.amountPrefix}>R$</Text>
              <TextInput
                style={styles.amountInput}
                keyboardType="decimal-pad"
                placeholder="0,00"
                placeholderTextColor={colors.textTertiary}
                value={pledgeAmount}
                onChangeText={setPledgeAmount}
                maxLength={10}
              />
            </View>
            <Text style={styles.label}>Observação (opcional)</Text>
            <TextInput
              style={styles.pledgeInput}
              placeholder="Ex.: em memória de minha mãe"
              placeholderTextColor={colors.textTertiary}
              value={pledgeNote}
              onChangeText={setPledgeNote}
              maxLength={200}
              multiline
            />
            <Text style={[styles.hint, { marginTop: 6 }]}>
              A tesouraria vê sua promessa e o quanto você já contribuiu — ofertas anônimas não entram nesse total.
            </Text>
            <TouchableOpacity style={styles.primaryBtn} disabled={pledgeBusy} onPress={() => void submitPledge()}>
              <Text style={styles.primaryBtnText}>
                {pledgeBusy ? 'Salvando...' : pledgeTarget?.myPledge ? 'Salvar promessa' : 'Prometer'}
              </Text>
            </TouchableOpacity>
            {pledgeTarget?.myPledge ? (
              <TouchableOpacity disabled={pledgeBusy} onPress={() => handleCancelPledge(pledgeTarget)}>
                <Text style={styles.cancelLink}>Cancelar promessa</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.closeBtn} onPress={() => setPledgeTarget(null)}>
              <Text style={styles.closeBtnText}>Fechar</Text>
            </TouchableOpacity>
          </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Transparência: detalhe do balancete publicado */}
      <Modal visible={!!statementTarget} transparent animationType="fade" onRequestClose={() => setStatementTarget(null)}>
        <Pressable style={styles.overlay} onPress={() => setStatementTarget(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            {statementTarget && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.sheetTitle}>Balancete de {statementTarget.monthLabel}</Text>
                <Text style={styles.sheetMeta}>
                  {statementTarget.community?.name ?? 'Paróquia'} · aprovado por {statementTarget.approvedByName} em{' '}
                  {dateBR(statementTarget.approvedAt)} · publicado em {dateBR(statementTarget.publishedAt)}
                </Text>
                {renderStatementTotals(statementTarget.snapshot)}
                {renderStatementLines('Receitas por categoria', statementTarget.snapshot.income.byCategory ?? [])}
                {renderStatementLines('Despesas por categoria', statementTarget.snapshot.expense.byCategory ?? [])}
                {renderStatementLines('Despesas por centro de custo', statementTarget.snapshot.expense.byCostCenter ?? [])}
                {(statementTarget.snapshot.campaigns ?? []).length > 0
                  ? renderStatementLines('Campanhas', statementTarget.snapshot.campaigns)
                  : null}
                {statementTarget.notes ? (
                  <View style={styles.statementGroup}>
                    <Text style={styles.label}>Mensagem do Conselho</Text>
                    <Text style={styles.statementNotes}>{statementTarget.notes}</Text>
                  </View>
                ) : null}
                <TouchableOpacity
                  style={[styles.primaryBtn, { marginTop: 14 }, statementPdfBusy && styles.btnDisabled]}
                  disabled={statementPdfBusy}
                  onPress={() => void handleStatementPdf(statementTarget)}
                >
                  <Text style={styles.primaryBtnText}>{statementPdfBusy ? 'Gerando...' : '📄 Baixar PDF'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.closeBtn} onPress={() => setStatementTarget(null)}>
                  <Text style={styles.closeBtnText}>Fechar</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Contestação */}
      <Modal visible={!!contestTarget} transparent animationType="fade" onRequestClose={() => setContestTarget(null)}>
        <Pressable style={styles.overlay} onPress={() => setContestTarget(null)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>{contestCopy.title}</Text>
            <Text style={styles.sheetMeta}>
              {contestTarget ? `${money(contestTarget.amount)} · id ${contestTarget.txid}` : ''}
            </Text>
            <Text style={styles.hint}>
              Conte onde e quando pagou ({contestCopy.details}). A tesouraria confere de novo. Se preferir, fale com a
              secretaria pelo Perfil.
            </Text>
            <TextInput
              style={styles.contestInput}
              placeholder={contestCopy.placeholder}
              placeholderTextColor={colors.textTertiary}
              value={contestText}
              onChangeText={setContestText}
              maxLength={300}
              multiline
            />
            <TouchableOpacity style={styles.primaryBtn} disabled={busyId !== null} onPress={() => void submitContest()}>
              <Text style={styles.primaryBtnText}>{busyId ? 'Enviando...' : 'Enviar contestação'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setContestTarget(null)}>
              <Text style={styles.closeBtnText}>Fechar</Text>
            </TouchableOpacity>
          </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    // Modo agente (tesouraria)
    agentBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.primary, padding: 14 },
    agentTitle: { fontSize: 14, fontWeight: '800', color: colors.primary, marginBottom: 2 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    headerBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
    scroll: { padding: 16, paddingBottom: 40, gap: 12 },
    emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 40 },
    card: {
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      gap: 8,
    },
    cardTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
    cardBody: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
    meta: { fontSize: 12, color: colors.textTertiary, fontWeight: '600' },
    sectionTitle: { fontSize: 14.5, fontWeight: '800', color: colors.text, marginBottom: 2 },
    label: { fontSize: 12, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase', marginTop: 4 },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    rowGap: { flexDirection: 'row', gap: 8, marginTop: 4 },
    kindRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    kindChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
    monthChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
    kindChipOn: { borderColor: colors.primary, backgroundColor: colors.primary + '18' },
    kindChipText: { fontSize: 12.5, fontWeight: '600', color: colors.textSecondary },
    kindChipTextOn: { color: colors.primary },
    anonRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
    anonText: { flex: 1, fontSize: 13, color: colors.text },
    // Opção do WhatsApp dentro do card do lembrete: um filete a separa do bloco dos dias
    whatsappRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 10,
      marginTop: 2,
    },
    whatsappTitle: { fontSize: 13.5, fontWeight: '700', color: colors.text, marginBottom: 2 },
    // "Convidar alguém a doar" no fim do card "Contribuir agora": um filete o separa dos avisos do pagamento
    inviteBlock: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, marginTop: 2, gap: 8 },
    // flexBasis + wrap: campanhas podem sugerir mais de 4 valores — quebra a linha em vez de espremer
    presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    preset: { flexGrow: 1, flexBasis: 70, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
    presetOn: { borderColor: colors.primary, backgroundColor: colors.primary + '18' },
    presetText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
    presetTextOn: { color: colors.primary },
    amountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      backgroundColor: colors.surface,
    },
    amountPrefix: { fontSize: 18, fontWeight: '800', color: colors.textSecondary, marginRight: 6 },
    amountInput: { flex: 1, fontSize: 22, fontWeight: '800', color: colors.text, paddingVertical: 10 },
    primaryBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
    primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    secondaryBtn: { borderWidth: 1.5, borderColor: colors.success, borderRadius: 12, paddingVertical: 11, alignItems: 'center', marginTop: 10 },
    secondaryBtnText: { color: colors.success, fontWeight: '800', fontSize: 14.5 },
    secondaryBtnSm: { borderWidth: 1, borderColor: colors.primary, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, alignItems: 'center' },
    secondaryBtnSmText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
    hint: { fontSize: 12, color: colors.textTertiary, lineHeight: 17 },
    intentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingVertical: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    intentTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
    intentMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    intentMethod: { fontSize: 11, fontWeight: '700', color: colors.textTertiary },
    providerHint: { fontSize: 11, fontWeight: '700', color: '#b45309', textAlign: 'right', maxWidth: 170 },
    badge: { fontSize: 11, fontWeight: '800', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
    badge_CREATED: { backgroundColor: colors.border, color: colors.textSecondary },
    badge_DECLARED: { backgroundColor: '#fdf3e4', color: '#b45309' },
    badge_CONFIRMED: { backgroundColor: '#eaf7ef', color: '#15803d' },
    badge_CANCELLED: { backgroundColor: '#fdecec', color: '#b91c1c' },
    sbadge_PENDING_AUTHORIZATION: { backgroundColor: '#fdf3e4', color: '#b45309' },
    sbadge_ACTIVE: { backgroundColor: '#eaf7ef', color: '#15803d' },
    sbadge_PAUSED: { backgroundColor: colors.border, color: colors.textSecondary },
    sbadge_CANCELLED: { backgroundColor: '#fdecec', color: '#b91c1c' },
    sbadge_FAILED: { backgroundColor: '#fdecec', color: '#b91c1c' },
    link: { fontSize: 12.5, fontWeight: '700', color: colors.primary, marginTop: 2 },
    notice: { fontSize: 12.5, fontWeight: '600', color: colors.textSecondary, lineHeight: 18, marginTop: 2 },
    expiredHint: { fontSize: 12.5, fontWeight: '700', color: '#b91c1c' },
    expiredText: { textAlign: 'center', fontSize: 13, color: '#b91c1c', marginTop: 12, fontWeight: '700' },
    btnDisabled: { opacity: 0.45 },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 18 },
    sheet: { backgroundColor: colors.card, borderRadius: 18, padding: 18, maxHeight: '92%' },
    sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text, textAlign: 'center' },
    sheetMeta: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginTop: 2, marginBottom: 8 },
    beneficiary: { backgroundColor: colors.surface, borderRadius: 10, padding: 10, marginBottom: 10, gap: 2 },
    beneficiaryLabel: { fontSize: 11, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase' },
    beneficiaryText: { fontSize: 12.5, color: colors.text },
    qr: { width: 230, height: 230, alignSelf: 'center', backgroundColor: '#fff', borderRadius: 12 },
    codeLabel: { fontSize: 11.5, fontWeight: '700', color: colors.textTertiary, marginTop: 12, textTransform: 'uppercase' },
    code: { fontSize: 11, color: colors.text, backgroundColor: colors.surface, borderRadius: 8, padding: 8, marginTop: 4 },
    declared: { textAlign: 'center', fontSize: 13, color: '#b45309', marginTop: 12, fontWeight: '600' },
    cancelLink: { textAlign: 'center', fontSize: 12.5, color: colors.textTertiary, marginTop: 12, textDecorationLine: 'underline' },
    closeBtn: { alignItems: 'center', paddingVertical: 10, marginTop: 6 },
    closeBtnText: { color: colors.textSecondary, fontWeight: '700' },
    // Campanhas e fundos
    targetChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      alignSelf: 'flex-start',
      maxWidth: '100%',
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.primary + '18',
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    targetChipText: { flexShrink: 1, fontSize: 12.5, fontWeight: '700', color: colors.primary },
    targetChipClose: { fontSize: 13, fontWeight: '800', color: colors.primary },
    campaign: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 10, gap: 6 },
    campaignName: { flex: 1, fontSize: 14.5, fontWeight: '800', color: colors.text },
    tag: { fontSize: 10.5, fontWeight: '800', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden', textTransform: 'uppercase' },
    tagCampaign: { backgroundColor: colors.primary + '18', color: colors.primary },
    tagFund: { backgroundColor: '#eaf7ef', color: '#15803d' },
    progressTrack: { height: 8, borderRadius: 999, backgroundColor: colors.border, overflow: 'hidden', marginTop: 2 },
    progressFill: { height: '100%', borderRadius: 999, backgroundColor: colors.success },
    campaignRaised: { fontSize: 13, fontWeight: '700', color: colors.text },
    campaignMine: { fontSize: 12.5, fontWeight: '700', color: '#15803d' },
    campaignPledge: { fontSize: 12.5, fontWeight: '600', color: colors.textSecondary },
    campaignActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
    primaryBtnSm: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
    primaryBtnSmText: { color: '#fff', fontWeight: '800', fontSize: 13 },
    intentCampaign: { fontSize: 12, fontWeight: '600', color: colors.primary, marginTop: 2 },
    pledgeInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 10,
      minHeight: 64,
      textAlignVertical: 'top',
      fontSize: 14,
      color: colors.text,
      backgroundColor: colors.surface,
      marginTop: 4,
    },
    contestInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 10,
      minHeight: 90,
      textAlignVertical: 'top',
      fontSize: 14,
      color: colors.text,
      backgroundColor: colors.surface,
      marginTop: 8,
    },
    // Transparência (balancetes publicados)
    statement: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 10, gap: 6 },
    statementMonth: { flex: 1, fontSize: 14.5, fontWeight: '800', color: colors.text, textTransform: 'capitalize' },
    statementScope: { flexShrink: 1, maxWidth: '55%' },
    statementTotals: { flexDirection: 'row', gap: 8 },
    statementTotal: { flex: 1, backgroundColor: colors.surface, borderRadius: 10, padding: 8, gap: 2 },
    statementTotalLabel: { fontSize: 10.5, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase' },
    statementTotalValue: { fontSize: 13, fontWeight: '800', color: colors.text },
    statementIncome: { color: colors.success },
    statementExpense: { color: colors.error },
    statementGroup: { marginTop: 10, gap: 2 },
    statementRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingVertical: 6,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    statementRowName: { flex: 1, fontSize: 13, color: colors.text },
    statementRowValue: { fontSize: 13, fontWeight: '700', color: colors.text },
    statementNotes: { fontSize: 13.5, color: colors.text, lineHeight: 20, backgroundColor: colors.surface, borderRadius: 10, padding: 10, marginTop: 4 },
  });
