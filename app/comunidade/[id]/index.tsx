import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useColors } from '../../../src/context/ThemeContext';
import { useAuth } from '../../../src/context/AuthContext';
import type { ThemeColors } from '../../../src/constants/Colors';
import { CommunitySchedule, PublicCommunity, getPublicCommunity } from '../../../src/services/publicMapService';
import { cachedFetch } from '../../../src/utils/offlineCache';
import { descreverRecorrencia, ehMensal } from '../../../src/utils/recorrencia';
import { formatMassTime, isSoon, typeLabel } from '../../../src/components/map/format';
import { openDirectionsTo } from '../../../src/components/map/directions';

/** Ordem de exibição: domingo primeiro, como nos murais de paróquia. */
const DAY_ORDER = [0, 1, 2, 3, 4, 5, 6];
const DAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const TYPE_ORDER = ['MASS', 'CONFESSION', 'ADORATION', 'ROSARY'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const typeRank = (t: string) => {
  const i = TYPE_ORDER.indexOf(t);
  return i === -1 ? TYPE_ORDER.length : i;
};

const withScheme = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);
const phoneDigits = (p: string) => p.replace(/[^\d+]/g, '');

interface DayGroup {
  day: number;
  types: { type: string; items: CommunitySchedule[] }[];
}

/** Semanais agrupados por dia → tipo; mensais descritos à parte ("1º domingo do mês"). */
function groupSchedules(schedules: CommunitySchedule[]) {
  const weekly = schedules.filter((s) => !ehMensal(s) && typeof s.dayOfWeek === 'number');
  const monthly = schedules
    .filter((s) => ehMensal(s))
    .sort((a, b) => typeRank(a.type) - typeRank(b.type) || (a.time || '').localeCompare(b.time || ''));

  const days: DayGroup[] = DAY_ORDER.map((day) => {
    const ofDay = weekly.filter((s) => s.dayOfWeek === day);
    const byType = new Map<string, CommunitySchedule[]>();
    ofDay.forEach((s) => byType.set(s.type, [...(byType.get(s.type) || []), s]));
    const types = [...byType.entries()]
      .sort((a, b) => typeRank(a[0]) - typeRank(b[0]))
      .map(([type, items]) => ({ type, items: items.sort((a, b) => (a.time || '').localeCompare(b.time || '')) }));
    return { day, types };
  }).filter((g) => g.types.length > 0);

  return { days, monthly };
}

export default function CommunityPublicScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [data, setData] = useState<PublicCommunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cachedAt, setCachedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await cachedFetch(`community-public:${id}`, () => getPublicCommunity(String(id)));
      setData(res.data);
      setCachedAt(res.fromCache ? res.cachedAt ?? null : null);
    } catch (e: any) {
      setError(e?.message || 'Não foi possível carregar a comunidade.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/nearby-masses' as never);
  };

  const grouped = useMemo(() => (data ? groupSchedules(data.schedules || []) : null), [data]);

  const phone = data?.phone || data?.parish?.phone || null;
  const website = data?.website || data?.parish?.website || null;
  const hasCoords = data != null && Number.isFinite(data.latitude as number) && Number.isFinite(data.longitude as number);
  const addressLine = data
    ? [data.address, [data.city, data.state].filter(Boolean).join('/'), data.zipCode ? `CEP ${data.zipCode}` : null]
        .filter(Boolean)
        .join(' · ')
    : '';

  const onCall = () => {
    if (!phone) return;
    Linking.openURL(`tel:${phoneDigits(phone)}`).catch(() => Alert.alert('Ligar', `Telefone: ${phone}`));
  };
  const onRoute = () => {
    if (data && hasCoords) openDirectionsTo(data.latitude as number, data.longitude as number, data.name);
  };
  const onSite = () => {
    if (!website) return;
    Linking.openURL(withScheme(website)).catch(() => Alert.alert('Site', 'Não foi possível abrir o site.'));
  };
  const onShare = () => {
    if (!data) return;
    const lines = [
      data.name,
      data.parish?.name && data.parish.name !== data.name ? data.parish.name : null,
      addressLine || null,
      hasCoords ? `https://www.google.com/maps/search/?api=1&query=${data.latitude},${data.longitude}` : null,
    ].filter(Boolean);
    Share.share({ message: lines.join('\n') }).catch(() => undefined);
  };

  const patronLine = (p: PublicCommunity['patrons'][number]) => {
    const feast =
      p.feastDay && p.feastMonth && p.feastMonth >= 1 && p.feastMonth <= 12
        ? ` · festa em ${p.feastDay} de ${MONTHS[p.feastMonth - 1]}`
        : '';
    return `${p.name}${feast}`;
  };

  const renderAction = (icon: string, label: string, onPress: () => void, enabled: boolean) => (
    <TouchableOpacity
      style={[styles.action, !enabled && { opacity: 0.4 }]}
      onPress={onPress}
      disabled={!enabled}
      activeOpacity={0.8}
      accessibilityLabel={label}
    >
      <View style={styles.actionIcon}>
        <FontAwesome5 name={icon as never} size={16} color={colors.primary} />
      </View>
      <Text style={styles.actionText}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={goBack} hitSlop={10} accessibilityLabel="Voltar">
          <FontAwesome5 name="arrow-left" size={17} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Comunidade
        </Text>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={onShare}
          hitSlop={10}
          disabled={!data}
          accessibilityLabel="Compartilhar"
        >
          <FontAwesome5 name="share-alt" size={16} color={data ? colors.text : colors.textTertiary} />
        </TouchableOpacity>
      </View>

      {loading && !data ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error && !data ? (
        <View style={styles.center}>
          <FontAwesome5 name="church" size={40} color={colors.textTertiary} />
          <Text style={styles.centerText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : data ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {!!cachedAt && (
            <View style={styles.offline}>
              <FontAwesome5 name="wifi" size={11} color={colors.warning} />
              <Text style={styles.offlineText}>
                Sem conexão — dados salvos em {format(new Date(cachedAt), 'dd/MM HH:mm')}
              </Text>
            </View>
          )}

          {/* CABEÇALHO */}
          <View style={styles.hero}>
            {data.logoUrl && /^https:\/\//i.test(data.logoUrl) ? (
              <Image source={{ uri: data.logoUrl }} style={styles.logo} resizeMode="cover" />
            ) : (
              <View style={[styles.logo, styles.logoFallback]}>
                <FontAwesome5 name="church" size={28} color="#fff" />
              </View>
            )}
            <Text style={styles.name}>{data.name}</Text>
            {!!data.parish && data.parish.name !== data.name && <Text style={styles.parish}>{data.parish.name}</Text>}
            {!!data.diocese && <Text style={styles.diocese}>{data.diocese.name}</Text>}
            {(data.patrons?.length ?? 0) > 0 && (
              <View style={styles.patrons}>
                {data.patrons.map((p, i) => (
                  <Text key={`${p.name}-${i}`} style={styles.patron}>
                    <FontAwesome5 name="star-of-life" size={10} color={colors.gold} /> {patronLine(p)}
                  </Text>
                ))}
              </View>
            )}
          </View>

          {/* AÇÕES */}
          <View style={styles.actions}>
            {renderAction('phone-alt', 'Ligar', onCall, !!phone)}
            {renderAction('directions', 'Rota', onRoute, hasCoords)}
            {renderAction('globe', 'Site', onSite, !!website)}
            {renderAction('share-alt', 'Compartilhar', onShare, true)}
          </View>
          {!!phone && (
            <TouchableOpacity onPress={onCall} style={styles.phoneRow} activeOpacity={0.7}>
              <FontAwesome5 name="phone-alt" size={12} color={colors.textSecondary} />
              <Text style={styles.phoneText} selectable>
                {phone}
              </Text>
            </TouchableOpacity>
          )}

          {/* PRÓXIMAS CELEBRAÇÕES */}
          {(data.nextMasses?.length ?? 0) > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Próximas celebrações</Text>
              {data.nextMasses.slice(0, 5).map((m) => {
                const soon = isSoon(m);
                return (
                  <View key={m.id} style={styles.nextRow}>
                    <View style={[styles.dot, { backgroundColor: soon ? colors.success : colors.border }]} />
                    <Text style={[styles.nextText, soon && { color: colors.success, fontWeight: '800' }]}>
                      {formatMassTime(m.start)}
                    </Text>
                    <Text style={styles.nextType}>
                      {typeLabel(m.type)}
                      {m.source === 'event' ? ' · especial' : ''}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* HORÁRIOS DA SEMANA */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Horários</Text>
            {grouped && grouped.days.length === 0 && grouped.monthly.length === 0 ? (
              <Text style={styles.muted}>Nenhum horário cadastrado ainda.</Text>
            ) : (
              <>
                {grouped?.days.map((g) => (
                  <View key={g.day} style={styles.dayBlock}>
                    <Text style={styles.dayName}>{DAY_NAMES[g.day]}</Text>
                    {g.types.map((t) => (
                      <View key={t.type} style={styles.typeRow}>
                        <Text style={styles.typeName}>{typeLabel(t.type)}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.times}>{t.items.map((s) => s.time).join('  ·  ')}</Text>
                          {t.items
                            .filter((s) => s.notes)
                            .map((s) => (
                              <Text key={s.id} style={styles.note}>
                                {s.time} — {s.notes}
                              </Text>
                            ))}
                        </View>
                      </View>
                    ))}
                  </View>
                ))}
                {grouped && grouped.monthly.length > 0 && (
                  <View style={styles.dayBlock}>
                    <Text style={styles.dayName}>Mensais</Text>
                    {grouped.monthly.map((s) => (
                      <View key={s.id} style={styles.typeRow}>
                        <Text style={styles.typeName}>{typeLabel(s.type)}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.times}>
                            {descreverRecorrencia(s)}, {s.time}
                          </Text>
                          {!!s.notes && <Text style={styles.note}>{s.notes}</Text>}
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>

          {/* ENDEREÇO */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Endereço</Text>
            <Text style={styles.address} selectable>
              {addressLine || 'Endereço não informado'}
            </Text>
            {data.approximate ? (
              <View style={[styles.geoBadge, { backgroundColor: colors.goldSoft }]}>
                <FontAwesome5 name="exclamation-triangle" size={11} color={colors.warning} />
                <Text style={[styles.geoText, { color: colors.text }]}>
                  Localização aproximada — o pino no mapa pode estar a quilômetros da igreja.
                </Text>
              </View>
            ) : data.verified ? (
              <View style={[styles.geoBadge, { backgroundColor: colors.highlightLight }]}>
                <FontAwesome5 name="check-circle" size={11} color={colors.success} solid />
                <Text style={[styles.geoText, { color: colors.success }]}>Localização conferida</Text>
              </View>
            ) : null}
          </View>

          {/* CONTATOS DA PARÓQUIA */}
          {!!data.parish && !!(data.parish.priestName || data.parish.email || data.email) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Contato</Text>
              {!!data.parish.priestName && (
                <Text style={styles.infoLine}>
                  <Text style={styles.infoLabel}>Pároco: </Text>
                  {data.parish.priestName}
                </Text>
              )}
              {!!(data.email || data.parish.email) && (
                <Text style={styles.infoLine} selectable>
                  <Text style={styles.infoLabel}>E-mail: </Text>
                  {data.email || data.parish.email}
                </Text>
              )}
            </View>
          )}

          {/* EM BREVE */}
          <View style={styles.soon}>
            <Text style={styles.soonTitle}>Em breve</Text>
            <Text style={styles.soonText}>Agenda do pároco, secretaria e avisos da paróquia</Text>
          </View>

          {/* SUGERIR CORREÇÃO */}
          <TouchableOpacity
            style={styles.suggestBtn}
            onPress={() => router.push(`/comunidade/${data.id}/sugerir` as never)}
            activeOpacity={0.85}
          >
            <FontAwesome5 name="edit" size={14} color={colors.primary} />
            <Text style={styles.suggestText}>Sugerir correção</Text>
          </TouchableOpacity>
          <Text style={styles.suggestHint}>
            Pino no lugar errado ou horário desatualizado? Conte para a equipe
            {isAuthenticated ? '.' : ' (é preciso entrar na sua conta).'}
          </Text>
        </ScrollView>
      ) : null}
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
    headerBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: colors.text },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
    centerText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
    retryBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.primary },
    retryText: { color: '#fff', fontWeight: '700' },
    content: { padding: 16, paddingBottom: 40 },
    offline: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 10,
      borderRadius: 10,
      backgroundColor: colors.highlightLight,
      marginBottom: 12,
    },
    offlineText: { fontSize: 12.5, color: colors.textSecondary, fontWeight: '600' },
    hero: { alignItems: 'center', paddingVertical: 8 },
    logo: { width: 76, height: 76, borderRadius: 38, marginBottom: 12, backgroundColor: colors.card },
    logoFallback: { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    name: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' },
    parish: { fontSize: 15, color: colors.textSecondary, marginTop: 4, textAlign: 'center', fontWeight: '600' },
    diocese: { fontSize: 13, color: colors.textTertiary, marginTop: 2, textAlign: 'center' },
    patrons: { marginTop: 10, alignItems: 'center', gap: 2 },
    patron: { fontSize: 13.5, color: colors.text, textAlign: 'center' },
    actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
    action: { flex: 1, alignItems: 'center', gap: 6 },
    actionIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.highlightLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionText: { fontSize: 12.5, fontWeight: '700', color: colors.text },
    phoneRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 },
    phoneText: { fontSize: 15, fontWeight: '700', color: colors.text },
    section: {
      marginTop: 18,
      backgroundColor: colors.card,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 10 },
    muted: { fontSize: 13.5, color: colors.textTertiary, fontStyle: 'italic' },
    nextRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    nextText: { fontSize: 14, fontWeight: '600', color: colors.text },
    nextType: { fontSize: 12.5, color: colors.textSecondary },
    dayBlock: {
      paddingVertical: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    dayName: { fontSize: 14, fontWeight: '800', color: colors.primary, marginBottom: 4 },
    typeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 2 },
    typeName: { width: 86, fontSize: 13, color: colors.textSecondary, fontWeight: '700' },
    times: { fontSize: 14, color: colors.text, fontWeight: '600' },
    note: { fontSize: 12, color: colors.textTertiary, marginTop: 1 },
    address: { fontSize: 14, color: colors.text, lineHeight: 20 },
    geoBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 10,
    },
    geoText: { flex: 1, fontSize: 12.5, fontWeight: '700' },
    infoLine: { fontSize: 14, color: colors.text, marginBottom: 4 },
    infoLabel: { fontWeight: '700', color: colors.textSecondary },
    soon: { marginTop: 18, paddingHorizontal: 4 },
    soonTitle: { fontSize: 12, fontWeight: '800', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6 },
    soonText: { fontSize: 13, color: colors.textTertiary, marginTop: 2 },
    suggestBtn: {
      marginTop: 22,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 13,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    suggestText: { fontSize: 15, fontWeight: '800', color: colors.primary },
    suggestHint: { fontSize: 12.5, color: colors.textTertiary, textAlign: 'center', marginTop: 8 },
  });
}
