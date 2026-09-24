import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '../src/context/AuthContext';
import { useCommunity } from '../src/context/CommunityContext';
import { useColors } from '../src/context/ThemeContext';
import type { ThemeColors } from '../src/constants/Colors';
import type { ScheduleCancellation } from '../src/types';
import {
  FixedOccurrence,
  canManageScheduleCancellations,
  cancelScheduleDates,
  getFixedOccurrencesBetween,
  getScheduleCancellations,
  reactivateScheduleDate,
} from '../src/services/massScheduleService';
import { parseLocal, typeLabel } from '../src/components/map/format';
import { chaveDaquiA } from '../src/utils/suspensoes';

/**
 * Horários da semana (gestão pelo celular).
 *
 * O padre, a secretaria ou a coordenação da comunidade desliga o horário fixo
 * que não vai acontecer num dia ("não haverá"), com um motivo curto. O fiel vê
 * o aviso no mapa, na página da comunidade e na tela inicial. Religar desfaz.
 */

const DAYS_AHEAD = 7;
const REASON_MAX = 140;
const REASON_PRESETS = ['Agenda dos padres', 'Feriado', 'Padre em viagem/retiro', 'Outro'] as const;
type Preset = (typeof REASON_PRESETS)[number];

const TYPE_ICONS: Record<string, string> = {
  MASS: 'church',
  CONFESSION: 'praying-hands',
  ADORATION: 'sun',
  ROSARY: 'pray',
};

const dayKeyOf = (o: FixedOccurrence) => o.start.slice(0, 10);
const hourOf = (o: FixedOccurrence) => o.start.slice(11, 16);

/** "Hoje", "Amanhã", "Quinta-feira, 26/09". */
function dayTitle(key: string): string {
  if (key === chaveDaquiA(0)) return 'Hoje';
  if (key === chaveDaquiA(1)) return 'Amanhã';
  const [y, m, d] = key.split('-').map(Number);
  const txt = format(new Date(y, m - 1, d), "EEEE, dd/MM", { locale: ptBR });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

/** "quinta-feira, 26/09 às 15:00" (ou "hoje às 15:00"). */
function whenPhrase(o: FixedOccurrence): string {
  const key = dayKeyOf(o);
  const dia = key === chaveDaquiA(0) ? 'hoje' : key === chaveDaquiA(1) ? 'amanhã' : dayTitle(key).toLowerCase();
  return `${dia} às ${hourOf(o)}`;
}

/** Título curto da linha: tipo + observação do horário ("Missa — das crianças"). */
const rowTitle = (o: FixedOccurrence) => {
  const tipo = typeLabel(o.type);
  const notes = (o.notes || '').trim();
  if (!notes) return tipo;
  // "Missa das famílias" já diz o tipo: não repete ("Missa — Missa das famílias")
  return notes.toLowerCase().startsWith(tipo.toLowerCase()) ? notes : `${tipo} — ${notes}`;
};

const composeReason = (preset: Preset | null, text: string): string => {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!preset || preset === 'Outro') return t.slice(0, REASON_MAX);
  return (t ? `${preset} — ${t}` : preset).slice(0, REASON_MAX);
};

const createdLine = (c: ScheduleCancellation | undefined) => {
  if (!c) return null;
  const quem = c.createdBy?.name?.trim().split(/\s+/).slice(0, 2).join(' ');
  let quando = '';
  try {
    const d = new Date(c.createdAt);
    if (!Number.isNaN(d.getTime())) quando = format(d, "dd/MM 'às' HH:mm");
  } catch {
    quando = '';
  }
  if (!quem && !quando) return null;
  return `Avisado${quem ? ` por ${quem}` : ''}${quando ? ` em ${quando}` : ''}`;
};

type Sheet =
  | { mode: 'cancel'; occ: FixedOccurrence }
  | { mode: 'reactivate'; occ: FixedOccurrence }
  | null;

export default function WeeklySchedulesScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { user } = useAuth();
  const { activeCommunityId, activeCommunityName } = useCommunity();

  const allowed = canManageScheduleCancellations(user?.role);
  // Coordenação de comunidade só gerencia a própria; os demais seguem a comunidade em foco
  const communityId =
    user?.role === 'COMMUNITY_COORDINATOR' ? user?.communityId : activeCommunityId ?? user?.communityId;
  const communityName =
    user?.role === 'COMMUNITY_COORDINATOR' || !activeCommunityId
      ? user?.community?.name
      : activeCommunityName ?? user?.community?.name;

  const [items, setItems] = useState<FixedOccurrence[]>([]);
  const [details, setDetails] = useState<Record<string, ScheduleCancellation>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [sheet, setSheet] = useState<Sheet>(null);
  const [preset, setPreset] = useState<Preset | null>(null);
  const [text, setText] = useState('');
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const loadSeq = useRef(0);

  const load = useCallback(
    async (mode: 'first' | 'refresh' | 'silent' = 'first') => {
      if (!allowed || !communityId) {
        setLoading(false);
        return;
      }
      const seq = ++loadSeq.current;
      if (mode === 'first') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);
      try {
        const list = await getFixedOccurrencesBetween(communityId, chaveDaquiA(0), chaveDaquiA(DAYS_AHEAD - 1));
        const first = chaveDaquiA(0);
        const last = chaveDaquiA(DAYS_AHEAD - 1);
        const week = list
          .filter((o) => {
            const k = dayKeyOf(o);
            return k >= first && k <= last;
          })
          .sort((a, b) => a.start.localeCompare(b.start));
        if (seq !== loadSeq.current) return;
        setItems(week);
        setError(null);

        // Quem suspendeu e quando: só dos horários que têm alguma suspensão na semana
        const ids = [...new Set(week.filter((o) => o.cancelled === true).map((o) => o.massScheduleId))];
        if (ids.length === 0) {
          setDetails({});
        } else {
          const results = await Promise.all(ids.map((id) => getScheduleCancellations(id).catch(() => [])));
          if (seq !== loadSeq.current) return;
          const map: Record<string, ScheduleCancellation> = {};
          results.forEach((arr, i) => {
            arr.forEach((c) => {
              map[`${ids[i]}|${String(c.date).slice(0, 10)}`] = c;
            });
          });
          setDetails(map);
        }
      } catch (e: any) {
        if (seq !== loadSeq.current) return;
        setError(e?.message || 'Não foi possível carregar os horários.');
      } finally {
        if (seq === loadSeq.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [allowed, communityId],
  );

  useFocusEffect(
    useCallback(() => {
      load('first');
    }, [load]),
  );

  const groups = useMemo(() => {
    const map = new Map<string, FixedOccurrence[]>();
    items.forEach((o) => {
      const k = dayKeyOf(o);
      map.set(k, [...(map.get(k) || []), o]);
    });
    return [...map.entries()].map(([key, list]) => ({ key, title: dayTitle(key), list }));
  }, [items]);

  const openCancel = (occ: FixedOccurrence) => {
    setPreset(null);
    setText('');
    setSheetError(null);
    setSheet({ mode: 'cancel', occ });
  };

  const openReactivate = (occ: FixedOccurrence) => {
    setSheetError(null);
    setSheet({ mode: 'reactivate', occ });
  };

  const closeSheet = () => {
    if (sending) return;
    setSheet(null);
  };

  const onToggle = (occ: FixedOccurrence, on: boolean) => {
    if (on) openReactivate(occ);
    else openCancel(occ);
  };

  const confirmSheet = async () => {
    if (!sheet) return;
    const { occ } = sheet;
    const date = dayKeyOf(occ);
    setSending(true);
    setSheetError(null);
    setSavingId(occ.id);
    try {
      if (sheet.mode === 'cancel') {
        const reason = composeReason(preset, text);
        await cancelScheduleDates(occ.massScheduleId, [date], reason || undefined);
        setItems((prev) =>
          prev.map((o) => (o.id === occ.id ? { ...o, cancelled: true, cancelReason: reason || null } : o)),
        );
      } else {
        await reactivateScheduleDate(occ.massScheduleId, date);
        setItems((prev) => prev.map((o) => (o.id === occ.id ? { ...o, cancelled: false, cancelReason: null } : o)));
      }
      setSheet(null);
      load('silent');
    } catch (e: any) {
      setSheetError(e?.message || 'Não foi possível salvar. Tente de novo.');
    } finally {
      setSending(false);
      setSavingId(null);
    }
  };

  const header = (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.headerBtn}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/coordination' as never))}
        hitSlop={10}
        accessibilityLabel="Voltar"
      >
        <FontAwesome5 name="arrow-left" size={17} color={colors.text} />
      </TouchableOpacity>
      <Text style={styles.headerTitle} numberOfLines={1}>
        Horários da semana
      </Text>
      <View style={styles.headerBtn} />
    </View>
  );

  if (!allowed || !communityId) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Stack.Screen options={{ headerShown: false }} />
        {header}
        <View style={styles.center}>
          <FontAwesome5 name="lock" size={32} color={colors.textTertiary} />
          <Text style={styles.centerTitle}>{allowed ? 'Sem comunidade' : 'Acesso restrito'}</Text>
          <Text style={styles.centerText}>
            {allowed
              ? 'Sua conta ainda não está ligada a uma comunidade.'
              : 'Esta tela é para o padre, a secretaria e a coordenação da comunidade.'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const renderRow = (o: FixedOccurrence) => {
    const off = o.cancelled === true;
    const start = parseLocal(o.start);
    const past = !!start && start.getTime() < Date.now();
    const saving = savingId === o.id;
    const reason = (o.cancelReason || '').trim();
    const who = off ? createdLine(details[`${o.massScheduleId}|${dayKeyOf(o)}`]) : null;
    return (
      <View key={o.id} style={[styles.row, off && styles.rowOff]}>
        <View style={[styles.typeIcon, off && { backgroundColor: colors.error + '1F' }]}>
          <FontAwesome5
            name={(TYPE_ICONS[o.type] || 'church') as never}
            size={16}
            color={off ? colors.error : colors.primary}
          />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.rowTop}>
            <Text style={[styles.hour, off && styles.struck]}>{hourOf(o)}</Text>
            <Text style={[styles.rowTitle, off && styles.struck]} numberOfLines={2}>
              {rowTitle(o)}
            </Text>
          </View>
          {off ? (
            <>
              <Text style={styles.offText}>
                Não haverá{reason ? ` — ${reason}` : ''}
              </Text>
              {!!who && <Text style={styles.whoText}>{who}</Text>}
            </>
          ) : past ? (
            <Text style={styles.pastText}>Já passou</Text>
          ) : null}
        </View>
        <View style={styles.switchBox}>
          {saving ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <>
              <Switch
                value={!off}
                onValueChange={(v) => onToggle(o, v)}
                disabled={past}
                trackColor={{ false: colors.error + '88', true: colors.success }}
                thumbColor={Platform.OS === 'android' ? colors.surface : undefined}
                accessibilityLabel={`${typeLabel(o.type)} ${whenPhrase(o)}: ${off ? 'não vai acontecer' : 'acontece'}`}
              />
              <Text style={[styles.switchLabel, off && { color: colors.error }]}>{off ? 'Não haverá' : 'Acontece'}</Text>
            </>
          )}
        </View>
      </View>
    );
  };

  const reasonMax =
    preset && preset !== 'Outro' ? Math.max(0, REASON_MAX - preset.length - 3) : REASON_MAX;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      {header}

      {loading && items.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.centerText}>Carregando os horários…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load('refresh')}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        >
          <View style={styles.intro}>
            {!!communityName && <Text style={styles.community}>{communityName}</Text>}
            <Text style={styles.introText}>
              Desligue o horário que não vai acontecer. Os fiéis veem o aviso no app, com o motivo.
            </Text>
          </View>

          {!!error && (
            <View style={styles.errorBox}>
              <FontAwesome5 name="exclamation-triangle" size={14} color={colors.error} style={{ marginTop: 2 }} />
              <View style={{ flex: 1, gap: 8 }}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={() => load('first')} activeOpacity={0.85}>
                  <Text style={styles.retryText}>Tentar de novo</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {!error && groups.length === 0 && (
            <View style={styles.empty}>
              <FontAwesome5 name="calendar-check" size={32} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>Nenhum horário fixo nesta semana</Text>
              <Text style={styles.centerText}>
                Os horários fixos são cadastrados no painel da paróquia.
              </Text>
            </View>
          )}

          {groups.map((g) => (
            <View key={g.key} style={styles.dayBlock}>
              <Text style={styles.dayTitle}>{g.title}</Text>
              <View style={styles.dayCard}>
                {g.list.map((o, i) => (
                  <React.Fragment key={o.id}>
                    {i > 0 && <View style={styles.sep} />}
                    {renderRow(o)}
                  </React.Fragment>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Folha: suspender (motivo) ou reativar (confirmação) */}
      <Modal visible={!!sheet} transparent animationType="slide" onRequestClose={closeSheet}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.backdrop} onPress={closeSheet} accessibilityLabel="Fechar" />
          {!!sheet && (
            <View style={styles.sheet}>
              <View style={styles.handle} />
              {sheet.mode === 'cancel' ? (
                <>
                  <Text style={styles.sheetTitle}>Não vai acontecer</Text>
                  <Text style={styles.sheetSub}>
                    {rowTitle(sheet.occ)} · {whenPhrase(sheet.occ)}
                  </Text>

                  <Text style={styles.label}>Por quê?</Text>
                  <View style={styles.chips}>
                    {REASON_PRESETS.map((p) => {
                      const on = preset === p;
                      return (
                        <TouchableOpacity
                          key={p}
                          style={[styles.chip, on && styles.chipOn]}
                          onPress={() => setPreset(on ? null : p)}
                          activeOpacity={0.85}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                        >
                          <Text style={[styles.chipText, on && styles.chipTextOn]}>{p}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={styles.label}>
                    {preset === 'Outro' ? 'Escreva o motivo' : 'Recado para os fiéis (opcional)'}
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={text}
                    onChangeText={(v) => setText(v.slice(0, reasonMax))}
                    maxLength={reasonMax}
                    placeholder={preset === 'Outro' ? 'Ex.: reforma na igreja' : 'Ex.: volta na próxima semana'}
                    placeholderTextColor={colors.placeholder}
                    multiline
                  />
                  <Text style={styles.counter}>
                    {text.length}/{reasonMax}
                  </Text>

                  {!!composeReason(preset, text) && (
                    <Text style={styles.preview}>
                      Os fiéis vão ver: “Não haverá — {composeReason(preset, text)}”
                    </Text>
                  )}
                </>
              ) : (
                <>
                  <Text style={styles.sheetTitle}>Vai acontecer, sim?</Text>
                  <Text style={styles.sheetSub}>
                    {rowTitle(sheet.occ)} · {whenPhrase(sheet.occ)}
                  </Text>
                  <Text style={styles.sheetBody}>
                    O aviso de “não haverá” sai do app e o horário volta a aparecer normalmente para os fiéis.
                  </Text>
                </>
              )}

              {!!sheetError && (
                <View style={[styles.errorBox, { marginTop: 12, marginBottom: 0 }]}>
                  <FontAwesome5 name="exclamation-triangle" size={14} color={colors.error} style={{ marginTop: 2 }} />
                  <Text style={[styles.errorText, { flex: 1 }]}>{sheetError}</Text>
                </View>
              )}

              <View style={styles.sheetActions}>
                <TouchableOpacity
                  style={[styles.btn, styles.btnGhost]}
                  onPress={closeSheet}
                  disabled={sending}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.btnText, { color: colors.text }]}>Voltar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.btn,
                    { backgroundColor: sheet.mode === 'cancel' ? colors.error : colors.success },
                    sending && { opacity: 0.7 },
                  ]}
                  onPress={confirmSheet}
                  disabled={sending}
                  activeOpacity={0.85}
                >
                  {sending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={[styles.btnText, { color: '#fff' }]}>
                      {sheet.mode === 'cancel' ? 'Avisar os fiéis' : 'Sim, vai acontecer'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
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
    headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: colors.text },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
    centerTitle: { fontSize: 17, fontWeight: '800', color: colors.text, textAlign: 'center' },
    centerText: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 21 },
    content: { padding: 16, paddingBottom: 48 },
    intro: { marginBottom: 6, gap: 4 },
    community: { fontSize: 13, fontWeight: '800', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
    introText: { fontSize: 15, color: colors.textSecondary, lineHeight: 21 },
    errorBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.error + '14',
      borderWidth: 1,
      borderColor: colors.error + '55',
      marginVertical: 10,
    },
    errorText: { fontSize: 15, color: colors.text, lineHeight: 21 },
    retryBtn: {
      alignSelf: 'flex-start',
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 16,
      borderRadius: 12,
      backgroundColor: colors.primary,
    },
    retryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    empty: { alignItems: 'center', gap: 10, paddingVertical: 48, paddingHorizontal: 24 },
    emptyTitle: { fontSize: 17, fontWeight: '800', color: colors.text, textAlign: 'center' },
    dayBlock: { marginTop: 16 },
    dayTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 8, marginLeft: 2 },
    dayCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.borderLight,
      overflow: 'hidden',
    },
    sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 64 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 64,
      paddingVertical: 10,
      paddingLeft: 14,
      paddingRight: 10,
    },
    rowOff: { backgroundColor: colors.error + '0D' },
    typeIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.highlightLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowTop: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    hour: { fontSize: 17, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
    rowTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
    struck: { textDecorationLine: 'line-through', color: colors.textTertiary },
    offText: { fontSize: 14, fontWeight: '700', color: colors.error, marginTop: 3 },
    whoText: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    pastText: { fontSize: 13, color: colors.textTertiary, marginTop: 2 },
    switchBox: { minWidth: 72, minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: 2 },
    switchLabel: { fontSize: 11.5, fontWeight: '700', color: colors.textSecondary },
    backdrop: { flex: 1, backgroundColor: colors.overlay },
    sheet: {
      backgroundColor: colors.modalBackground,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 18,
      paddingTop: 10,
      paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.border,
      marginBottom: 12,
    },
    sheetTitle: { fontSize: 19, fontWeight: '800', color: colors.text },
    sheetSub: { fontSize: 15, color: colors.textSecondary, marginTop: 4, lineHeight: 21 },
    sheetBody: { fontSize: 15, color: colors.text, marginTop: 14, lineHeight: 22 },
    label: { fontSize: 14, fontWeight: '800', color: colors.text, marginTop: 16, marginBottom: 8 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipOn: { borderColor: colors.primary, backgroundColor: colors.highlightLight },
    chipText: { fontSize: 15, fontWeight: '600', color: colors.text },
    chipTextOn: { color: colors.primary, fontWeight: '800' },
    input: {
      minHeight: 64,
      maxHeight: 120,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.inputBackground,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.text,
      textAlignVertical: 'top',
    },
    counter: { alignSelf: 'flex-end', fontSize: 12, color: colors.textTertiary, marginTop: 4 },
    preview: { fontSize: 14, color: colors.textSecondary, marginTop: 6, fontStyle: 'italic', lineHeight: 20 },
    sheetActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
    btn: {
      flex: 1,
      minHeight: 50,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      paddingHorizontal: 12,
    },
    btnGhost: { backgroundColor: colors.inputBackground },
    btnText: { fontSize: 16, fontWeight: '800' },
  });
}
