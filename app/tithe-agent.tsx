import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TextInput,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useColors } from '../src/context/ThemeContext';
import { useAuth } from '../src/context/AuthContext';
import {
  AgentContribution,
  AgentMember,
  ManagedCampaign,
  PresentialMethod,
  TitheIntentKind,
  PRESENTIAL_METHOD_LABELS,
  CAMPAIGN_KIND_LABELS,
  isFinancialRole,
  searchAgentMembers,
  registerAgentContribution,
  getAgentRecent,
  undoAgentContribution,
  getManagedCampaigns,
  shareTitheReceipt,
} from '../src/services/titheService';

const PRESETS = [20, 50, 100, 200];
// Ordem fixa dos chips de meio; Dinheiro é o padrão
const METHODS: PresentialMethod[] = ['CASH', 'ENVELOPE', 'POS', 'PIX', 'TRANSFER', 'CHECK'];
const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_MIN_CHARS = 2;
// Janela de meses de referência (mesma do fiel em tithe.tsx: 12 atrás … 1 à frente)
const MONTHS_BACK = 12;
const MONTHS_AHEAD = 1;
const TITHER_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Dizimista ativo',
  INACTIVE: 'Dizimista inativo',
  SUSPENDED: 'Dizimista suspenso',
  PENDING: 'Cadastro pendente',
};

const money = (value: number) => `R$ ${value.toFixed(2).replace('.', ',')}`;
const dateBR = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');
const dateTimeBR = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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
const currentMonthIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};
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
const methodLabel = (method: string) => PRESENTIAL_METHOD_LABELS[method as PresentialMethod] ?? method;
/** lastContribution.method é o rótulo livre do histórico ('PIX', 'Dinheiro', 'Envelope'…): só o Pix ganha grafia amigável */
const historyMethodLabel = (method: string) => (method === 'PIX' ? 'Pix' : method);
/** Rótulo de histórico de um meio presencial recém-lançado — o mesmo que o backend devolve em lastContribution.method */
const historyMethodOf = (paymentMethod: string) => (paymentMethod === 'PIX' ? 'PIX' : methodLabel(paymentMethod));
const titherStatusLabel = (status: string) => TITHER_STATUS_LABELS[status] ?? status;
/**
 * Campanha que aceita lançamento para este fiel: dentro do prazo, já iniciada, da paróquia dele
 * (quando os dois lados informam parishId) e da paróquia inteira ou da comunidade dele.
 */
const campaignEligible = (campaign: ManagedCampaign, member: AgentMember, now: number) => {
  if (campaign.expired) return false;
  if (campaign.startsAt && Date.parse(campaign.startsAt) > now) return false;
  if (campaign.parishId && member.parishId && campaign.parishId !== member.parishId) return false;
  return !campaign.communityId || campaign.communityId === member.community?.id;
};
const kindText = (item: AgentContribution) =>
  item.campaign ? `Oferta · ${item.campaign.name}` : item.kind === 'TITHE' ? `Dízimo · ${monthLabel(item.referenceMonth)}` : 'Oferta';
const lastContributionText = (member: AgentMember) =>
  member.lastContribution
    ? `Última: ${money(member.lastContribution.amount)} · ${monthLabel(member.lastContribution.referenceMonth, true)} · ${historyMethodLabel(member.lastContribution.method)} · ${dateBR(member.lastContribution.date)}`
    : 'Nenhuma contribuição registrada';

/**
 * Modo agente (D4.2): a tesouraria registra na hora uma contribuição presencial
 * (envelope, dinheiro, maquininha, Pix visto no extrato, transferência, cheque)
 * em nome de um fiel. Entra confirmada; dá para desfazer em até 24 h.
 */
export default function TitheAgentScreen() {
  const router = useRouter();
  const colors = useColors();
  const styles = createStyles(colors);
  const { user } = useAuth();
  const allowed = isFinancialRole(user?.role);

  // Busca do fiel
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AgentMember[]>([]);
  const [searching, setSearching] = useState(false);
  /** Já respondeu para o texto atual — distingue "nenhum resultado" de "ainda não buscou" */
  const [searched, setSearched] = useState(false);
  // Número da última busca disparada: respostas de buscas antigas são ignoradas
  const searchSeq = useRef(0);
  const [member, setMember] = useState<AgentMember | null>(null);

  // Formulário
  const currentMonth = useMemo(currentMonthIso, []);
  const monthOptions = useMemo(
    () => Array.from({ length: MONTHS_BACK + MONTHS_AHEAD + 1 }, (_, i) => shiftMonth(currentMonth, MONTHS_AHEAD - i)),
    [currentMonth],
  );
  const [kind, setKind] = useState<TitheIntentKind>('TITHE');
  const [referenceMonth, setReferenceMonth] = useState(currentMonth);
  const [amountText, setAmountText] = useState('');
  const [method, setMethod] = useState<PresentialMethod>('CASH');
  const [campaigns, setCampaigns] = useState<ManagedCampaign[]>([]);
  const [campaignTarget, setCampaignTarget] = useState<ManagedCampaign | null>(null);
  const [note, setNote] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [saving, setSaving] = useState(false);
  /** Lançamento recém-registrado — abre a sheet de resumo */
  const [done, setDone] = useState<AgentContribution | null>(null);
  const [receiptBusyId, setReceiptBusyId] = useState<string | null>(null);

  // Lançados por mim (48 h)
  const [recent, setRecent] = useState<AgentContribution[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [undoingId, setUndoingId] = useState<string | null>(null);

  /** Com campanha escolhida, a contribuição é sempre oferta (o backend também força) */
  const effectiveKind: TitheIntentKind = campaignTarget ? 'OFFERING' : kind;
  const now = Date.now();
  const visibleCampaigns = member ? campaigns.filter((c) => campaignEligible(c, member, now)) : [];

  const load = useCallback(
    async (refresh = false) => {
      if (!allowed) {
        setRecentLoading(false);
        return;
      }
      if (refresh) setIsRefreshing(true);
      try {
        // Campanhas são acessório: se falharem, a tela segue com a lista anterior (null = não atualizar)
        const [list, campaignList] = await Promise.all([
          getAgentRecent(),
          getManagedCampaigns('ACTIVE').then(
            (items) => items,
            (): ManagedCampaign[] | null => null,
          ),
        ]);
        setRecent(list);
        if (campaignList) {
          setCampaigns(campaignList);
          // Some se deixou de estar ativa
          setCampaignTarget((current) => (current && campaignList.some((c) => c.id === current.id) ? current : null));
        }
      } catch (error: any) {
        Alert.alert('Modo agente', error?.message ?? 'Não foi possível carregar.');
      } finally {
        setRecentLoading(false);
        setIsRefreshing(false);
      }
    },
    [allowed],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Busca com debounce (300 ms) a partir de 2 caracteres
  useEffect(() => {
    const q = query.trim();
    if (q.length < SEARCH_MIN_CHARS) {
      searchSeq.current += 1;
      setResults([]);
      setSearching(false);
      setSearched(false);
      return;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const list = await searchAgentMembers(q);
        if (seq !== searchSeq.current) return;
        setResults(list);
        setSearched(true);
      } catch (error: any) {
        if (seq !== searchSeq.current) return;
        setResults([]);
        setSearched(true);
        Alert.alert('Buscar fiel', error?.message ?? 'Não foi possível buscar.');
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const resetForm = () => {
    setAmountText('');
    setNote('');
    setReceiptNumber('');
    // A campanha vale para um lançamento; o próximo volta ao dízimo (evita mandar o dízimo do mês para a campanha sem querer)
    setCampaignTarget(null);
  };

  const selectMember = (chosen: AgentMember) => {
    setMember(chosen);
    setQuery('');
    setResults([]);
    setSearched(false);
    resetForm();
  };

  /** "Registrar outro": mesmo fiel, limpa só valor/observação/recibo/campanha */
  const registerAnother = () => {
    setDone(null);
    resetForm();
  };

  /** "Novo fiel" / "Trocar": volta à busca com o formulário zerado */
  const newMember = () => {
    setDone(null);
    resetForm();
    setKind('TITHE');
    setReferenceMonth(currentMonth);
    setMethod('CASH');
    setMember(null);
    setQuery('');
    setResults([]);
    setSearched(false);
  };

  const handleRegister = async () => {
    if (!member) return;
    const amount = parseAmount(amountText);
    if (amount < 1) {
      Alert.alert('Valor', 'Informe um valor a partir de R$ 1,00.');
      return;
    }
    const target = campaignTarget;
    const trimmedNote = note.trim();
    const trimmedReceipt = receiptNumber.trim();
    setSaving(true);
    try {
      const result = await registerAgentContribution({
        memberId: member.id,
        amount,
        kind: effectiveKind,
        method,
        ...(effectiveKind === 'TITHE' ? { referenceMonth } : {}),
        ...(target ? { campaignId: target.id } : {}),
        ...(trimmedNote ? { note: trimmedNote } : {}),
        ...(trimmedReceipt ? { receiptNumber: trimmedReceipt } : {}),
      });
      setDone(target && !result.campaign ? { ...result, campaign: { id: target.id, name: target.name } } : result);
      // Card do fiel já mostra este lançamento como o último
      setMember((current) =>
        current && current.id === member.id
          ? {
              ...current,
              lastContribution: {
                referenceMonth: result.referenceMonth,
                amount: result.amount,
                date: result.confirmedAt ?? new Date().toISOString(),
                method: historyMethodOf(result.paymentMethod),
              },
            }
          : current,
      );
      void load();
    } catch (error: any) {
      Alert.alert('Não foi possível registrar', error?.message ?? 'Tente novamente.');
      // Campanha saiu do ar entre o toque e o envio: solta o chip e recarrega a lista
      if (target && error?.status === 400 && /campanha/i.test(String(error?.message ?? ''))) {
        setCampaignTarget(null);
        void load();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleReceipt = async (item: AgentContribution) => {
    setReceiptBusyId(item.id);
    try {
      await shareTitheReceipt(item);
    } catch (error: any) {
      Alert.alert('Comprovante', error?.message ?? 'Não foi possível gerar.');
    } finally {
      setReceiptBusyId(null);
    }
  };

  /**
   * Depois de desfazer o lançamento que o card do fiel mostrava como "Última": busca o fiel de novo para trazer a
   * última contribuição real (best-effort — sem resposta, limpa para não exibir o lançamento desfeito).
   */
  const refreshLastContribution = async (selected: AgentMember) => {
    const q = (selected.registrationNumber ?? selected.fullName).trim();
    let fresh: AgentMember | undefined;
    try {
      fresh = q.length >= SEARCH_MIN_CHARS ? (await searchAgentMembers(q)).find((m) => m.id === selected.id) : undefined;
    } catch {
      fresh = undefined;
    }
    setMember((current) => (current && current.id === selected.id ? (fresh ?? { ...current, lastContribution: null }) : current));
  };

  const handleUndo = (item: AgentContribution) => {
    Alert.alert(
      'Desfazer lançamento?',
      `${money(item.amount)} de ${item.member.fullName} será cancelado. Use só se registrou por engano.`,
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Desfazer',
          style: 'destructive',
          onPress: async () => {
            setUndoingId(item.id);
            try {
              await undoAgentContribution(item.id);
              setRecent((list) => list.map((r) => (r.id === item.id ? { ...r, status: 'CANCELLED', canUndo: false } : r)));
              if (done?.id === item.id) setDone(null);
              // O card do fiel selecionado mostrava este lançamento como "Última"? Atualiza para não exibir o desfeito
              const last = member?.lastContribution;
              if (member && last && member.id === item.member.id && last.referenceMonth === item.referenceMonth && last.amount === item.amount) {
                await refreshLastContribution(member);
              }
              await load();
            } catch (error: any) {
              Alert.alert('Desfazer', error?.message ?? 'Não foi possível desfazer.');
              await load();
            } finally {
              setUndoingId(null);
            }
          },
        },
      ],
    );
  };

  const header = (
    <View style={styles.header}>
      <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()} hitSlop={10}>
        <FontAwesome5 name="arrow-left" size={17} color={colors.text} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>🧾 Registrar contribuição</Text>
      <View style={styles.headerBtn} />
    </View>
  );

  if (!allowed) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Stack.Screen options={{ headerShown: false }} />
        {header}
        <View style={styles.scroll}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Acesso restrito</Text>
            <Text style={styles.cardBody}>
              O modo agente é para a tesouraria e a coordenação da comunidade. Se você faz parte da equipe financeira,
              peça à secretaria para ajustar o seu perfil.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const summaryRows: Array<[string, string | null]> = done
    ? [
        ['Tipo', done.campaign ? `Oferta · ${done.campaign.name}` : done.kind === 'TITHE' ? 'Dízimo' : 'Oferta'],
        ['Valor', money(done.amount)],
        ['Mês', done.campaign ? null : monthLabel(done.referenceMonth)],
        ['Meio', methodLabel(done.paymentMethod)],
        ['Recibo/envelope', receiptNumber.trim() || null],
        ['Registrado em', done.confirmedAt ? dateTimeBR(done.confirmedAt) : null],
        ['Identificador', done.txid ?? null],
      ]
    : [];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      {header}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => load(true)} />}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {!member ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Quem está contribuindo?</Text>
              <View style={styles.searchRow}>
                <FontAwesome5 name="search" size={14} color={colors.textTertiary} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Buscar fiel"
                  placeholderTextColor={colors.textTertiary}
                  value={query}
                  onChangeText={setQuery}
                  autoCorrect={false}
                  autoCapitalize="none"
                  returnKeyType="search"
                  maxLength={60}
                />
                {query ? (
                  <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                    <Text style={styles.searchClear}>✕</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <Text style={styles.hint}>
                Busque por nome, nº de dizimista, CPF ou telefone (últimos 8 dígitos) — a partir de 2 caracteres.
              </Text>
              {searching ? <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} /> : null}
              {results.map((item) => (
                <TouchableOpacity key={item.id} style={styles.resultRow} activeOpacity={0.8} onPress={() => selectMember(item)}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.resultName}>{item.fullName}</Text>
                    <Text style={styles.intentMeta}>
                      {[item.community?.name ?? 'Sem comunidade', item.registrationNumber ? `nº ${item.registrationNumber}` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                    {item.cpfMasked || item.phoneMasked ? (
                      <Text style={styles.intentMeta}>
                        {[item.cpfMasked ? `CPF ${item.cpfMasked}` : null, item.phoneMasked].filter(Boolean).join(' · ')}
                      </Text>
                    ) : null}
                    <Text style={styles.hint}>{lastContributionText(item)}</Text>
                    {item.titherStatus ? (
                      <Text style={[styles.badge, styles.badgeTither, { alignSelf: 'flex-start' }]}>
                        {titherStatusLabel(item.titherStatus)}
                      </Text>
                    ) : null}
                  </View>
                  <FontAwesome5 name="chevron-right" size={12} color={colors.textTertiary} />
                </TouchableOpacity>
              ))}
              {searched && !searching && results.length === 0 ? (
                <Text style={styles.hint}>Nenhum fiel encontrado. Confira o nome ou peça o nº de dizimista.</Text>
              ) : null}
            </View>
          ) : (
            <>
              <View style={styles.card}>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.cardTitle}>{member.fullName}</Text>
                    <Text style={styles.meta}>
                      {[member.community?.name ?? 'Sem comunidade', member.registrationNumber ? `Dizimista nº ${member.registrationNumber}` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                    {member.cpfMasked || member.phoneMasked ? (
                      <Text style={styles.meta}>
                        {[member.cpfMasked ? `CPF ${member.cpfMasked}` : null, member.phoneMasked].filter(Boolean).join(' · ')}
                      </Text>
                    ) : null}
                    <Text style={styles.hint}>{lastContributionText(member)}</Text>
                  </View>
                  <TouchableOpacity style={styles.secondaryBtnSm} onPress={newMember}>
                    <Text style={styles.secondaryBtnSmText}>Trocar</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Contribuição</Text>
                {campaignTarget ? (
                  <>
                    <TouchableOpacity style={styles.targetChip} onPress={() => setCampaignTarget(null)} hitSlop={6}>
                      <Text style={styles.targetChipText} numberOfLines={1}>
                        Para: {campaignTarget.name}
                      </Text>
                      <Text style={styles.targetChipClose}>✕</Text>
                    </TouchableOpacity>
                    <Text style={styles.hint}>
                      Oferta com finalidade: entra {campaignTarget.kind === 'FUND' ? 'no fundo' : 'na campanha'} “{campaignTarget.name}”
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
                          {option === 'TITHE' ? 'Dízimo' : 'Oferta'}
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
                          style={[styles.monthChip, referenceMonth === m && styles.kindChipOn]}
                          onPress={() => setReferenceMonth(m)}
                        >
                          <Text style={[styles.kindChipText, referenceMonth === m && styles.kindChipTextOn]}>
                            {monthLabel(m, true)}
                            {m === currentMonth ? ' · atual' : ''}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </>
                ) : null}

                <Text style={styles.label}>Valor</Text>
                <View style={styles.presetRow}>
                  {PRESETS.map((preset) => (
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

                <Text style={styles.label}>Como recebeu</Text>
                <View style={styles.kindRow}>
                  {METHODS.map((option) => (
                    <TouchableOpacity
                      key={option}
                      style={[styles.kindChip, method === option && styles.kindChipOn]}
                      onPress={() => setMethod(option)}
                    >
                      <Text style={[styles.kindChipText, method === option && styles.kindChipTextOn]}>
                        {PRESENTIAL_METHOD_LABELS[option]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {visibleCampaigns.length > 0 ? (
                  <>
                    <Text style={styles.label}>Campanha ou fundo (opcional)</Text>
                    <View style={styles.kindRow}>
                      {visibleCampaigns.map((campaign) => {
                        const on = campaignTarget?.id === campaign.id;
                        return (
                          <TouchableOpacity
                            key={campaign.id}
                            style={[styles.kindChip, on && styles.kindChipOn]}
                            onPress={() => setCampaignTarget(on ? null : campaign)}
                          >
                            <Text style={[styles.kindChipText, on && styles.kindChipTextOn]} numberOfLines={1}>
                              {CAMPAIGN_KIND_LABELS[campaign.kind] === 'Fundo' ? '🏦 ' : '🎯 '}
                              {campaign.name}
                              {campaign.community ? ` · ${campaign.community.name}` : ''}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <Text style={styles.hint}>
                      Só campanhas em andamento da paróquia inteira ou da comunidade do fiel. Ao escolher, o lançamento vira
                      oferta com finalidade.
                    </Text>
                  </>
                ) : null}

                <Text style={styles.label}>Nº do recibo / envelope (opcional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex.: 0451"
                  placeholderTextColor={colors.textTertiary}
                  value={receiptNumber}
                  onChangeText={setReceiptNumber}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={40}
                />
                <Text style={styles.label}>Observação (opcional)</Text>
                <TextInput
                  style={[styles.input, styles.inputMultiline]}
                  placeholder="Ex.: envelope entregue na missa das 19h"
                  placeholderTextColor={colors.textTertiary}
                  value={note}
                  onChangeText={setNote}
                  maxLength={200}
                  multiline
                />

                <TouchableOpacity style={[styles.primaryBtn, saving && styles.btnDisabled]} disabled={saving} onPress={() => void handleRegister()}>
                  <Text style={styles.primaryBtnText}>{saving ? 'Registrando...' : 'Registrar'}</Text>
                </TouchableOpacity>
                <Text style={styles.hint}>
                  Entra confirmada na hora, em nome de {member.fullName}. Registrou por engano? Dá para desfazer em até 24 h
                  na lista abaixo.
                </Text>
              </View>
            </>
          )}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Lançados por mim (48 h)</Text>
            {recent.length > 0 ? (
              <Text style={styles.hint}>Dá para desfazer em até 24 h depois do lançamento; os mais antigos ficam só para consulta.</Text>
            ) : null}
            {recentLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />
            ) : recent.length === 0 ? (
              <Text style={styles.hint}>Nenhum lançamento nas últimas 48 horas.</Text>
            ) : (
              recent.map((item) => {
                const cancelled = item.status === 'CANCELLED';
                return (
                  <View key={item.id} style={styles.intentRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.intentTitle}>{item.member.fullName}</Text>
                      <Text style={styles.intentMeta}>
                        {kindText(item)} · {money(item.amount)}
                      </Text>
                      <Text style={styles.hint}>
                        {methodLabel(item.paymentMethod)}
                        {item.confirmedAt ? ` · ${dateTimeBR(item.confirmedAt)}` : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      <Text style={[styles.badge, cancelled ? styles.badge_CANCELLED : styles.badge_CONFIRMED]}>
                        {cancelled ? 'Desfeito' : 'Confirmado'}
                      </Text>
                      {!cancelled ? (
                        <TouchableOpacity disabled={receiptBusyId === item.id} onPress={() => void handleReceipt(item)} hitSlop={6}>
                          <Text style={styles.link}>{receiptBusyId === item.id ? 'Gerando...' : '📄 Comprovante'}</Text>
                        </TouchableOpacity>
                      ) : null}
                      {item.canUndo && !cancelled ? (
                        <TouchableOpacity disabled={undoingId === item.id} onPress={() => handleUndo(item)} hitSlop={6}>
                          <Text style={styles.undoLink}>{undoingId === item.id ? 'Desfazendo...' : 'Desfazer'}</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Resumo do lançamento: comprovante, registrar outro (mesmo fiel) ou novo fiel */}
      <Modal visible={!!done} transparent animationType="fade" onRequestClose={registerAnother}>
        <Pressable style={styles.overlay} onPress={registerAnother}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            {done && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.sheetTitle}>Registrado ✓</Text>
                <Text style={styles.sheetMeta}>{done.member.fullName}</Text>
                <View style={styles.summary}>
                  {summaryRows
                    .filter((row): row is [string, string] => !!row[1])
                    .map(([label, value]) => (
                      <View key={label} style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>{label}</Text>
                        <Text style={styles.summaryValue}>{value}</Text>
                      </View>
                    ))}
                </View>
                <TouchableOpacity
                  style={[styles.primaryBtn, receiptBusyId === done.id && styles.btnDisabled]}
                  disabled={receiptBusyId === done.id}
                  onPress={() => void handleReceipt(done)}
                >
                  <Text style={styles.primaryBtnText}>{receiptBusyId === done.id ? 'Gerando...' : '📄 Comprovante'}</Text>
                </TouchableOpacity>
                <View style={styles.rowGap}>
                  <TouchableOpacity style={[styles.secondaryBtnSm, { flex: 1, marginTop: 4 }]} onPress={registerAnother}>
                    <Text style={styles.secondaryBtnSmText}>Registrar outro</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.secondaryBtnSm, { flex: 1, marginTop: 4 }]} onPress={newMember}>
                    <Text style={styles.secondaryBtnSmText}>Novo fiel</Text>
                  </TouchableOpacity>
                </View>
                <Text style={[styles.hint, { textAlign: 'center', marginTop: 10 }]}>
                  Registrou por engano? Dá para desfazer em até 24 h em “Lançados por mim”.
                </Text>
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
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
    kindChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, maxWidth: '100%' },
    monthChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
    kindChipOn: { borderColor: colors.primary, backgroundColor: colors.primary + '18' },
    kindChipText: { fontSize: 12.5, fontWeight: '600', color: colors.textSecondary },
    kindChipTextOn: { color: colors.primary },
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
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      backgroundColor: colors.surface,
    },
    searchInput: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 10 },
    searchClear: { fontSize: 14, fontWeight: '800', color: colors.textTertiary, paddingHorizontal: 2 },
    resultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    resultName: { fontSize: 14.5, fontWeight: '700', color: colors.text },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 10,
      fontSize: 14,
      color: colors.text,
      backgroundColor: colors.surface,
      marginTop: 4,
    },
    inputMultiline: { minHeight: 64, textAlignVertical: 'top' },
    primaryBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
    primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
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
    badge: { fontSize: 11, fontWeight: '800', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
    badge_CONFIRMED: { backgroundColor: '#eaf7ef', color: '#15803d' },
    badge_CANCELLED: { backgroundColor: '#fdecec', color: '#b91c1c' },
    badgeTither: { backgroundColor: colors.primary + '18', color: colors.primary, marginTop: 2 },
    link: { fontSize: 12.5, fontWeight: '700', color: colors.primary, marginTop: 2 },
    undoLink: { fontSize: 12.5, fontWeight: '700', color: colors.error, marginTop: 2 },
    btnDisabled: { opacity: 0.45 },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 18 },
    sheet: { backgroundColor: colors.card, borderRadius: 18, padding: 18, maxHeight: '92%' },
    sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text, textAlign: 'center' },
    sheetMeta: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginTop: 2, marginBottom: 8 },
    summary: { backgroundColor: colors.surface, borderRadius: 10, padding: 10, gap: 6, marginBottom: 10 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
    summaryLabel: { fontSize: 11, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase', paddingTop: 1 },
    summaryValue: { flex: 1, fontSize: 13.5, fontWeight: '600', color: colors.text, textAlign: 'right' },
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
  });
