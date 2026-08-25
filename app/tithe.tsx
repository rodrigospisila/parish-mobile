import React, { useCallback, useRef, useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useColors } from '../src/context/ThemeContext';
import {
  MyTithe,
  TitheIntent,
  TitheIntentKind,
  STATUS_LABELS,
  getMyTithe,
  createTitheIntent,
  declareTitheIntent,
  cancelTitheIntent,
  shareTitheReceipt,
  getTitheIntent,
} from '../src/services/titheService';

const PRESETS = [20, 50, 100, 200];

const money = (value: number) => `R$ ${value.toFixed(2).replace('.', ',')}`;
const monthLabel = (iso: string) => {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, 1)).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

/**
 * Dízimo e ofertas pelo app (Fase 1): Pix copia-e-cola com a chave da
 * paróquia. O fiel paga no próprio banco e avisa; a tesouraria confirma.
 */
export default function TitheScreen() {
  const router = useRouter();
  const colors = useColors();
  const styles = createStyles(colors);

  const [data, setData] = useState<MyTithe | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [kind, setKind] = useState<TitheIntentKind>('TITHE');
  const [amountText, setAmountText] = useState('');
  const [creating, setCreating] = useState(false);
  const [active, setActive] = useState<TitheIntent | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Sugere o último valor UMA vez — depois o campo é do usuário (inclusive vazio)
  const prefilledRef = useRef(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true);
    try {
      const result = await getMyTithe();
      setData(result);
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
    try {
      const intent = await createTitheIntent({ amount, kind, referenceMonth: data?.currentMonth });
      setActive(intent);
      await load(true);
    } catch (error: any) {
      Alert.alert('Não foi possível gerar o Pix', error?.message ?? 'Tente novamente.');
    } finally {
      setCreating(false);
    }
  };

  const copyCode = async (code: string) => {
    await Clipboard.setStringAsync(code);
    Alert.alert('Copiado ✓', 'Abra o app do seu banco, escolha "Pix copia e cola" e cole o código.');
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
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = (intent: TitheIntent) => {
    Alert.alert('Cancelar este Pix?', 'Só cancele se você NÃO fez o pagamento.', [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Cancelar Pix',
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

  const openIntent = async (intent: TitheIntent) => {
    if (intent.status !== 'CREATED' && intent.status !== 'DECLARED') return;
    try {
      setActive(await getTitheIntent(intent.id));
    } catch (error: any) {
      Alert.alert('Dízimo', error?.message ?? 'Não foi possível abrir.');
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

  const parish = data?.parish;
  const enabled = !!parish?.titheEnabled;

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
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => load(true)} />}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
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

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Contribuir agora</Text>
              <View style={styles.kindRow}>
                {(['TITHE', 'OFFERING'] as TitheIntentKind[]).map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[styles.kindChip, kind === option && styles.kindChipOn]}
                    onPress={() => setKind(option)}
                  >
                    <Text style={[styles.kindChipText, kind === option && styles.kindChipTextOn]}>
                      {option === 'TITHE' ? `Dízimo · ${monthLabel(data.currentMonth)}` : 'Oferta avulsa'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
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
                  maxLength={9}
                />
              </View>
              <TouchableOpacity style={styles.primaryBtn} disabled={creating} onPress={() => void handleCreate()}>
                <Text style={styles.primaryBtnText}>{creating ? 'Gerando...' : 'Gerar Pix'}</Text>
              </TouchableOpacity>
              <Text style={styles.hint}>
                Você paga no app do seu banco (QR ou copia e cola). Depois toque em “Já fiz o Pix” — a tesouraria
                confere e confirma.
              </Text>
            </View>

            {data.intents.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Meus Pix</Text>
                {data.intents.map((intent) => (
                  <TouchableOpacity
                    key={intent.id}
                    style={styles.intentRow}
                    activeOpacity={0.8}
                    onPress={() => void openIntent(intent)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.intentTitle}>
                        {intent.kind === 'TITHE' ? 'Dízimo' : 'Oferta'} · {monthLabel(intent.referenceMonth)}
                      </Text>
                      <Text style={styles.intentMeta}>
                        {money(intent.amount)} · {new Date(intent.createdAt).toLocaleDateString('pt-BR')}
                        {intent.note && intent.status === 'CANCELLED' ? ` · ${intent.note}` : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      <Text style={[styles.badge, styles[`badge_${intent.status}` as const]]}>{STATUS_LABELS[intent.status]}</Text>
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

            {data.contributions.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Contribuições registradas</Text>
                {data.contributions.map((contribution) => (
                  <View key={contribution.id} style={styles.intentRow}>
                    <Text style={styles.intentTitle}>{monthLabel(contribution.referenceMonth)}</Text>
                    <Text style={styles.intentMeta}>
                      {money(contribution.amount)} · {contribution.method}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Pix gerado: QR + copia e cola + ações */}
      <Modal visible={!!active} transparent animationType="fade" onRequestClose={() => setActive(null)}>
        <Pressable style={styles.overlay} onPress={() => setActive(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            {active && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.sheetTitle}>
                  {active.kind === 'TITHE' ? 'Dízimo' : 'Oferta'} · {money(active.amount)}
                </Text>
                <Text style={styles.sheetMeta}>
                  {monthLabel(active.referenceMonth)} · {parish?.merchantName ?? parish?.name} · id {active.txid}
                </Text>
                {active.qrDataUrl ? (
                  <Image source={{ uri: active.qrDataUrl }} style={styles.qr} resizeMode="contain" />
                ) : null}
                {active.brCode ? (
                  <>
                    <Text style={styles.codeLabel}>Pix copia e cola</Text>
                    <Text style={styles.code} numberOfLines={3} selectable>
                      {active.brCode}
                    </Text>
                    <TouchableOpacity style={styles.primaryBtn} onPress={() => void copyCode(active.brCode!)}>
                      <Text style={styles.primaryBtnText}>📋 Copiar código</Text>
                    </TouchableOpacity>
                  </>
                ) : null}
                {active.status === 'CREATED' && (
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
                  <Text style={styles.declared}>⏳ Pix informado — aguardando a conferência da tesouraria.</Text>
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
    kindRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    kindChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
    kindChipOn: { borderColor: colors.primary, backgroundColor: colors.primary + '18' },
    kindChipText: { fontSize: 12.5, fontWeight: '600', color: colors.textSecondary },
    kindChipTextOn: { color: colors.primary },
    presetRow: { flexDirection: 'row', gap: 8 },
    preset: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingVertical: 8,
      alignItems: 'center',
    },
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
    secondaryBtn: {
      borderWidth: 1.5,
      borderColor: colors.success,
      borderRadius: 12,
      paddingVertical: 11,
      alignItems: 'center',
      marginTop: 10,
    },
    secondaryBtnText: { color: colors.success, fontWeight: '800', fontSize: 14.5 },
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
    badge_CREATED: { backgroundColor: colors.border, color: colors.textSecondary },
    badge_DECLARED: { backgroundColor: '#fdf3e4', color: '#b45309' },
    badge_CONFIRMED: { backgroundColor: '#eaf7ef', color: '#15803d' },
    badge_CANCELLED: { backgroundColor: '#fdecec', color: '#b91c1c' },
    link: { fontSize: 12.5, fontWeight: '700', color: colors.primary },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 18 },
    sheet: { backgroundColor: colors.card, borderRadius: 18, padding: 18, maxHeight: '90%' },
    sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text, textAlign: 'center' },
    sheetMeta: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginTop: 2, marginBottom: 10 },
    qr: { width: 240, height: 240, alignSelf: 'center', backgroundColor: '#fff', borderRadius: 12 },
    codeLabel: { fontSize: 11.5, fontWeight: '700', color: colors.textTertiary, marginTop: 12, textTransform: 'uppercase' },
    code: {
      fontSize: 11,
      color: colors.text,
      backgroundColor: colors.surface,
      borderRadius: 8,
      padding: 8,
      marginTop: 4,
      fontFamily: undefined,
    },
    declared: { textAlign: 'center', fontSize: 13, color: '#b45309', marginTop: 12, fontWeight: '600' },
    cancelLink: { textAlign: 'center', fontSize: 12.5, color: colors.textTertiary, marginTop: 12, textDecorationLine: 'underline' },
    closeBtn: { alignItems: 'center', paddingVertical: 10, marginTop: 6 },
    closeBtnText: { color: colors.textSecondary, fontWeight: '700' },
  });
