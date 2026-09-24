import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColors } from '../../../src/context/ThemeContext';
import { useAuth } from '../../../src/context/AuthContext';
import type { ThemeColors } from '../../../src/constants/Colors';
import {
  CelebrationType,
  PublicCommunity,
  SuggestionKind,
  SuggestionPayload,
  getPublicCommunity,
  sendSuggestion,
} from '../../../src/services/publicMapService';
import { readCache } from '../../../src/utils/offlineCache';
import { setPostLoginRoute } from '../../../src/utils/postLoginRoute';

/**
 * Sugerir correção numa comunidade (pino, horários ou outras informações).
 * A sugestão NÃO altera nada: vai para a fila de conferência da equipe.
 * Sem login, o texto fica salvo como rascunho enquanto a pessoa entra.
 */

const KIND_OPTIONS: { key: SuggestionKind; icon: string; title: string; sub: string }[] = [
  { key: 'LOCATION', icon: 'map-marker-alt', title: 'Localização do pino', sub: 'O pino está no lugar errado' },
  {
    key: 'SCHEDULE',
    icon: 'clock',
    title: 'Horários de missa, adoração ou confissão',
    sub: 'Algum horário mudou ou não existe mais',
  },
  { key: 'INFO', icon: 'info-circle', title: 'Outras informações', sub: 'Nome, telefone, endereço, padroeiro…' },
];

const SCHEDULE_TYPES: { key: CelebrationType; label: string }[] = [
  { key: 'MASS', label: 'Missa' },
  { key: 'CONFESSION', label: 'Confissão' },
  { key: 'ADORATION', label: 'Adoração' },
  { key: 'ROSARY', label: 'Terço' },
];

const MAX_MESSAGE = 1000;
const draftKey = (id: string) => `@parish:suggestion-draft:${id}`;

interface GpsFix {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
}

interface Draft {
  kind: SuggestionKind | null;
  scheduleType: CelebrationType;
  message: string;
  gps: GpsFix | null;
}

export default function SuggestCorrectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const communityId = String(id || '');
  const colors = useColors();
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [community, setCommunity] = useState<Pick<PublicCommunity, 'id' | 'name'> | null>(null);
  const [kind, setKind] = useState<SuggestionKind | null>(null);
  const [scheduleType, setScheduleType] = useState<CelebrationType>('MASS');
  const [message, setMessage] = useState('');
  const [gps, setGps] = useState<GpsFix | null>(null);
  const [locating, setLocating] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const draftLoaded = useRef(false);

  // Nome da comunidade (do cache da página, ou da API pública)
  useEffect(() => {
    if (!communityId) return;
    let alive = true;
    (async () => {
      const cached = await readCache<PublicCommunity>(`community-public:${communityId}`);
      if (alive && cached?.data) setCommunity({ id: cached.data.id, name: cached.data.name });
      try {
        const fresh = await getPublicCommunity(communityId);
        if (alive) setCommunity({ id: fresh.id, name: fresh.name });
      } catch {
        // o nome é só contexto; a tela funciona sem ele
      }
    })();
    return () => {
      alive = false;
    };
  }, [communityId]);

  // Rascunho: restaura ao abrir (ex.: voltou do login) e guarda a cada mudança
  useEffect(() => {
    if (!communityId) return;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(draftKey(communityId));
        if (raw) {
          const d = JSON.parse(raw) as Partial<Draft>;
          if (d.kind === 'LOCATION' || d.kind === 'SCHEDULE' || d.kind === 'INFO') setKind(d.kind);
          if (d.scheduleType && SCHEDULE_TYPES.some((t) => t.key === d.scheduleType)) setScheduleType(d.scheduleType);
          if (typeof d.message === 'string') setMessage(d.message.slice(0, MAX_MESSAGE));
          if (d.gps && Number.isFinite(d.gps.latitude) && Number.isFinite(d.gps.longitude)) setGps(d.gps);
        }
      } catch {
        // rascunho corrompido: ignora
      } finally {
        draftLoaded.current = true;
      }
    })();
  }, [communityId]);

  useEffect(() => {
    if (!draftLoaded.current || !communityId || sent) return;
    const t = setTimeout(() => {
      const d: Draft = { kind, scheduleType, message, gps };
      AsyncStorage.setItem(draftKey(communityId), JSON.stringify(d)).catch(() => undefined);
    }, 400);
    return () => clearTimeout(t);
  }, [kind, scheduleType, message, gps, communityId, sent]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(`/comunidade/${communityId}` as never);
  };

  const captureGps = async () => {
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert(
          'Localização desativada',
          'Para enviar a posição da igreja, permita o acesso à localização nas configurações do aparelho.',
          [
            { text: 'Agora não', style: 'cancel' },
            { text: 'Abrir configurações', onPress: () => Linking.openSettings().catch(() => undefined) },
          ],
        );
        return;
      }
      // Precisão alta: a ideia é marcar a porta da igreja, não o bairro
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      setGps({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracyM: pos.coords.accuracy != null ? Math.round(pos.coords.accuracy) : null,
      });
    } catch {
      Alert.alert('Localização', 'Não foi possível obter sua posição agora. Tente de novo em área aberta.');
    } finally {
      setLocating(false);
    }
  };

  const trimmed = message.trim();
  const canSend =
    !!kind && !sending && (trimmed.length >= 5 || (kind === 'LOCATION' && gps != null && trimmed.length === 0));

  const goLogin = async () => {
    try {
      await AsyncStorage.setItem(draftKey(communityId), JSON.stringify({ kind, scheduleType, message, gps }));
    } catch {
      // segue mesmo assim
    }
    setPostLoginRoute(`/comunidade/${communityId}/sugerir`);
    router.push('/(auth)/login' as never);
  };

  const submit = async () => {
    if (!kind || !canSend) return;
    if (!isAuthenticated) {
      goLogin();
      return;
    }
    const payload: SuggestionPayload = {
      kind,
      message: (trimmed || 'Posição marcada pelo GPS, na igreja.').slice(0, MAX_MESSAGE),
    };
    if (kind === 'SCHEDULE') payload.scheduleType = scheduleType;
    if (kind === 'LOCATION' && gps) {
      payload.latitude = gps.latitude;
      payload.longitude = gps.longitude;
      if (gps.accuracyM != null) payload.accuracyM = gps.accuracyM;
      payload.atChurch = true;
    }
    setSending(true);
    try {
      await sendSuggestion(communityId, payload);
      setSent(true);
      AsyncStorage.removeItem(draftKey(communityId)).catch(() => undefined);
    } catch (e: any) {
      Alert.alert('Não foi possível enviar', e?.message || 'Tente novamente em instantes.');
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.doneBox}>
          <View style={styles.doneIcon}>
            <FontAwesome5 name="check" size={28} color="#fff" />
          </View>
          <Text style={styles.doneTitle}>Obrigado!</Text>
          <Text style={styles.doneText}>
            Sua sugestão foi enviada para conferência da equipe. Nada muda na hora: depois de conferida, a
            correção aparece no mapa para todos.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={goBack} activeOpacity={0.85}>
            <Text style={styles.primaryBtnText}>Voltar</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const placeholder =
    kind === 'SCHEDULE'
      ? 'O que está errado e qual é o certo? Ex.: a missa de domingo é às 9h, não às 8h.'
      : kind === 'LOCATION'
        ? 'Onde fica a igreja? Ex.: na esquina da Rua X com a Rua Y, ao lado da praça.'
        : 'Conte o que precisa ser corrigido.';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={goBack} hitSlop={10} accessibilityLabel="Voltar">
          <FontAwesome5 name="arrow-left" size={17} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Sugerir correção
        </Text>
        <View style={styles.headerBtn} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {!!community && (
            <Text style={styles.community} numberOfLines={2}>
              {community.name}
            </Text>
          )}

          <View style={styles.notice}>
            <FontAwesome5 name="user-check" size={13} color={colors.primary} />
            <Text style={styles.noticeText}>Sua sugestão vai para conferência da equipe; nada muda na hora.</Text>
          </View>

          <Text style={styles.label}>O que você quer corrigir?</Text>
          {KIND_OPTIONS.map((o) => {
            const active = kind === o.key;
            return (
              <TouchableOpacity
                key={o.key}
                style={[styles.option, active && styles.optionActive]}
                onPress={() => setKind(o.key)}
                activeOpacity={0.85}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <View style={[styles.optionIcon, active && { backgroundColor: colors.primary }]}>
                  <FontAwesome5 name={o.icon as never} size={14} color={active ? '#fff' : colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionTitle}>{o.title}</Text>
                  <Text style={styles.optionSub}>{o.sub}</Text>
                </View>
                <FontAwesome5
                  name={active ? 'dot-circle' : 'circle'}
                  size={18}
                  color={active ? colors.primary : colors.textTertiary}
                />
              </TouchableOpacity>
            );
          })}

          {kind === 'LOCATION' && (
            <View style={styles.block}>
              <TouchableOpacity style={styles.gpsBtn} onPress={captureGps} disabled={locating} activeOpacity={0.85}>
                {locating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <FontAwesome5 name="crosshairs" size={15} color="#fff" />
                )}
                <Text style={styles.gpsBtnText}>
                  {gps ? 'Capturar de novo' : 'Estou na igreja agora — usar meu GPS'}
                </Text>
              </TouchableOpacity>
              {gps ? (
                <View style={styles.gpsInfo}>
                  <FontAwesome5 name="map-pin" size={12} color={colors.success} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.gpsText}>
                      Posição capturada
                      {gps.accuracyM != null ? ` · precisão de ${gps.accuracyM} m` : ''}
                    </Text>
                    <Text style={styles.gpsCoords}>
                      {gps.latitude.toFixed(6)}, {gps.longitude.toFixed(6)}
                    </Text>
                    {gps.accuracyM != null && gps.accuracyM > 50 && (
                      <Text style={styles.gpsWarn}>
                        Precisão baixa. Se puder, chegue perto da porta da igreja, em área aberta, e capture de novo.
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => setGps(null)} hitSlop={8} accessibilityLabel="Descartar posição">
                    <FontAwesome5 name="times" size={14} color={colors.textTertiary} />
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.hint}>
                  Só use o GPS se você estiver na igreja (de preferência na porta). Se não estiver, descreva o
                  lugar abaixo.
                </Text>
              )}
            </View>
          )}

          {kind === 'SCHEDULE' && (
            <View style={styles.block}>
              <Text style={styles.label}>Qual celebração?</Text>
              <View style={styles.chips}>
                {SCHEDULE_TYPES.map((t) => {
                  const active = scheduleType === t.key;
                  return (
                    <TouchableOpacity
                      key={t.key}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setScheduleType(t.key)}
                    >
                      <Text style={[styles.chipText, active && { color: '#fff' }]}>{t.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {!!kind && (
            <View style={styles.block}>
              <Text style={styles.label}>
                {kind === 'SCHEDULE' ? 'O que está errado e qual é o certo?' : 'Detalhes'}
                {kind === 'LOCATION' && gps ? ' (opcional)' : ''}
              </Text>
              <TextInput
                style={styles.input}
                value={message}
                onChangeText={(t) => setMessage(t.slice(0, MAX_MESSAGE))}
                placeholder={placeholder}
                placeholderTextColor={colors.placeholder}
                multiline
                textAlignVertical="top"
                maxLength={MAX_MESSAGE}
              />
              <Text style={styles.counter}>
                {message.length}/{MAX_MESSAGE}
              </Text>
            </View>
          )}

          {!isAuthenticated && !!kind && (
            <View style={styles.loginBox}>
              <FontAwesome5 name="lock" size={13} color={colors.textSecondary} />
              <Text style={styles.loginText}>
                Para enviar, entre na sua conta — assim a equipe consegue conferir e evitar abusos. O que você
                escreveu fica guardado neste aparelho.
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.primaryBtn, !canSend && styles.btnDisabled]}
            onPress={submit}
            disabled={!canSend}
            activeOpacity={0.85}
          >
            {sending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>{isAuthenticated ? 'Enviar sugestão' : 'Entrar para enviar'}</Text>
            )}
          </TouchableOpacity>
          {!!kind && !canSend && !sending && (
            <Text style={styles.hintCenter}>
              {kind === 'LOCATION' ? 'Capture a posição ou escreva ao menos 5 letras.' : 'Escreva ao menos 5 letras.'}
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
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
    content: { padding: 16, paddingBottom: 48 },
    community: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 10 },
    notice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.highlightLight,
      marginBottom: 18,
    },
    noticeText: { flex: 1, fontSize: 13.5, color: colors.text, fontWeight: '600', lineHeight: 19 },
    label: { fontSize: 14, fontWeight: '800', color: colors.text, marginBottom: 8 },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 8,
    },
    optionActive: { borderColor: colors.primary, borderWidth: 2, padding: 11 },
    optionIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.highlightLight,
    },
    optionTitle: { fontSize: 14.5, fontWeight: '700', color: colors.text },
    optionSub: { fontSize: 12.5, color: colors.textSecondary, marginTop: 1 },
    block: { marginTop: 14 },
    gpsBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingVertical: 13,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: colors.primary,
    },
    gpsBtnText: { color: '#fff', fontWeight: '800', fontSize: 14.5, flexShrink: 1, textAlign: 'center' },
    gpsInfo: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      marginTop: 10,
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    gpsText: { fontSize: 13.5, fontWeight: '700', color: colors.text },
    gpsCoords: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
    gpsWarn: { fontSize: 12.5, color: colors.warning, marginTop: 6, fontWeight: '600' },
    hint: { fontSize: 12.5, color: colors.textTertiary, marginTop: 8, lineHeight: 18 },
    hintCenter: { fontSize: 12.5, color: colors.textTertiary, marginTop: 8, textAlign: 'center' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 18,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
    input: {
      minHeight: 120,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.inputBackground,
      color: colors.text,
      fontSize: 15,
      padding: 12,
    },
    counter: { fontSize: 11.5, color: colors.textTertiary, textAlign: 'right', marginTop: 4 },
    loginBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      marginTop: 16,
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    loginText: { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
    primaryBtn: {
      marginTop: 18,
      paddingVertical: 15,
      borderRadius: 12,
      alignItems: 'center',
      backgroundColor: colors.primary,
    },
    btnDisabled: { backgroundColor: colors.disabled },
    primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
    doneBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
    doneIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.success,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    doneTitle: { fontSize: 22, fontWeight: '800', color: colors.text },
    doneText: { fontSize: 14.5, color: colors.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 21 },
  });
}
