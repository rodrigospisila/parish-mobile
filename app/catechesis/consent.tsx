import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';
import {
  FamilyCatechesisItem,
  getMyFamilyCatechesis,
  isConsentPending,
  recordCatechesisConsent,
} from '../../src/services/catechesisService';
import { CATECHESIS_CONSENT_TEXT as T } from '../../src/constants/catechesisConsent';
import { AUTH_WEB_URL } from '../../src/components/auth/authPalette';

/**
 * Termo da catequese (M8): o responsável (ou o próprio adulto) registra pelo
 * app o consentimento do tratamento de dados da matrícula e responde, em
 * separado, sobre o uso de imagem. Nada vem marcado: as duas respostas são
 * escolha explícita. Textos em src/constants/catechesisConsent.ts.
 */
export default function CatechesisConsentScreen() {
  const router = useRouter();
  const colors = useColors();
  const styles = createStyles(colors);
  const { enrollmentId } = useLocalSearchParams<{ enrollmentId?: string }>();

  const [item, setItem] = useState<FamilyCatechesisItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dataConsent, setDataConsent] = useState(false);
  const [imageConsent, setImageConsent] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const family = await getMyFamilyCatechesis();
      const found = family.find((entry) => entry.enrollmentId === enrollmentId) ?? null;
      setItem(found && isConsentPending(found) ? found : null);
    } catch (error: any) {
      setLoadError(error?.message ?? 'Não foi possível carregar.');
    } finally {
      setIsLoading(false);
    }
  }, [enrollmentId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const handleSubmit = async () => {
    if (!item || submitting) return;
    if (!dataConsent) {
      Alert.alert(T.screenTitle, T.missingData);
      return;
    }
    if (imageConsent === null) {
      Alert.alert(T.screenTitle, T.missingImage);
      return;
    }
    setSubmitting(true);
    try {
      await recordCatechesisConsent(item.enrollmentId, { consentGiven: true, imageConsent });
      Alert.alert(T.successTitle, T.successBody, [{ text: 'OK', onPress: () => router.back() }]);
    } catch (error: any) {
      Alert.alert('Não foi possível registrar', error?.message ?? 'Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const isSelf = !!item?.member.isSelf;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <FontAwesome5 name="arrow-left" size={17} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{T.screenTitle}</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : loadError ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{loadError}</Text>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => void load()}>
              <Text style={styles.secondaryBtnText}>Tentar de novo</Text>
            </TouchableOpacity>
          </View>
        ) : !item ? (
          <View style={styles.empty}>
            <FontAwesome5 name="check-circle" size={28} color={colors.success} />
            <Text style={styles.emptyText}>{T.notFound}</Text>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.back()}>
              <Text style={styles.secondaryBtnText}>Voltar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.who}>
              <Text style={styles.whoName}>{isSelf ? 'Você' : item.member.fullName}</Text>
              <Text style={styles.whoMeta}>
                {item.class.name} · {item.class.year} · {item.class.community.name}
              </Text>
            </View>
            <Text style={styles.intro}>{T.intro(item.member.fullName, isSelf)}</Text>

            <Text style={styles.sectionTitle}>{T.dataTitle}</Text>
            <Text style={styles.body}>{T.dataBody}</Text>
            <TouchableOpacity
              style={styles.checkRow}
              onPress={() => setDataConsent((value) => !value)}
              activeOpacity={0.8}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: dataConsent }}
            >
              <View style={[styles.checkbox, dataConsent && styles.checkboxChecked]}>
                {dataConsent && <Ionicons name="checkmark" size={15} color="#fff" />}
              </View>
              <Text style={styles.checkText}>{T.dataCheckbox(isSelf)}</Text>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>{T.imageTitle}</Text>
            <Text style={styles.body}>{T.imageBody}</Text>
            {typeof item.imageConsent === 'boolean' && (
              <Text style={styles.hint}>{T.previousImageAnswer(item.imageConsent)}</Text>
            )}
            {([true, false] as const).map((value) => {
              const on = imageConsent === value;
              return (
                <TouchableOpacity
                  key={String(value)}
                  style={[styles.option, on && styles.optionOn]}
                  activeOpacity={0.8}
                  onPress={() => setImageConsent(value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                >
                  <View style={[styles.radio, on && styles.radioOn]}>{on && <View style={styles.radioDot} />}</View>
                  <Text style={styles.optionText}>{value ? T.imageYes : T.imageNo}</Text>
                </TouchableOpacity>
              );
            })}

            <Text style={styles.rights}>{T.rights}</Text>
            <View style={styles.links}>
              <TouchableOpacity onPress={() => Linking.openURL(`${AUTH_WEB_URL}/privacidade`)} accessibilityRole="link">
                <Text style={styles.link}>{T.privacyLink}</Text>
              </TouchableOpacity>
              <Text style={styles.linkSep}>·</Text>
              <TouchableOpacity onPress={() => Linking.openURL(`${AUTH_WEB_URL}/termos`)} accessibilityRole="link">
                <Text style={styles.link}>{T.termsLink}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, submitting && { opacity: 0.6 }]}
              disabled={submitting}
              onPress={() => void handleSubmit()}
              accessibilityRole="button"
            >
              <Text style={styles.primaryBtnText}>{submitting ? T.submitting : T.submit}</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
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
    scroll: { padding: 16, paddingBottom: 40 },
    empty: { alignItems: 'center', gap: 12, marginTop: 48, paddingHorizontal: 24 },
    emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
    who: {
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
    },
    whoName: { fontSize: 15.5, fontWeight: '800', color: colors.text },
    whoMeta: { fontSize: 12.5, color: colors.textSecondary, marginTop: 2 },
    intro: { fontSize: 14, color: colors.text, lineHeight: 20, marginTop: 14 },
    sectionTitle: { fontSize: 14.5, fontWeight: '800', color: colors.text, marginTop: 18, marginBottom: 4 },
    body: { fontSize: 13, color: colors.textSecondary, lineHeight: 19, marginBottom: 10 },
    hint: { fontSize: 12.5, color: colors.textTertiary, lineHeight: 18, marginBottom: 8 },
    checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 7,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
    checkText: { flex: 1, fontSize: 13.5, color: colors.text, lineHeight: 19 },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 8,
      backgroundColor: colors.card,
    },
    optionOn: { borderColor: colors.primary, backgroundColor: colors.primary + '10' },
    optionText: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 18 },
    radio: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioOn: { borderColor: colors.primary },
    radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
    rights: { fontSize: 12.5, color: colors.textSecondary, lineHeight: 18, marginTop: 14 },
    links: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
    link: { fontSize: 13, fontWeight: '700', color: colors.primary, textDecorationLine: 'underline' },
    linkSep: { color: colors.textTertiary },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 20,
    },
    primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
    secondaryBtn: {
      borderWidth: 1.5,
      borderColor: colors.primary,
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    secondaryBtnText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  });
