import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { FontAwesome5 } from '@expo/vector-icons';
import { useColors } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/Colors';
import { getAppConfig } from '../services/appConfigService';
import { evaluateAppVersion, type AppVersionStatus } from '../utils/appVersion';
import { SUPPORT_EMAIL, supportMailto } from '../config/links';

/**
 * Versão mínima do app (Onda 1, contrato C4 — eng-qualidade-12, parte do app).
 *
 * Ao abrir (e ao voltar ao primeiro plano depois de algumas horas) consulta
 * `GET /public/app-config`:
 * - versão instalada < minSupportedVersion → tela "Atualize o Parish" no lugar
 *   do app inteiro, com botão para a loja;
 * - versão instalada < latestVersion → aviso discreto no topo, dispensável
 *   (lembrado por versão no AsyncStorage);
 * - sem resposta / sem campos / versão inválida → nada acontece.
 *
 * A versão instalada é a do app.json embutida no pacote (Constants.expoConfig):
 * com runtimeVersion "appVersion", uma atualização pelo ar só roda no binário
 * da mesma versão — então ela é a versão do binário instalado.
 */

const INSTALLED_VERSION: string | undefined = Constants.expoConfig?.version ?? undefined;
const DISMISS_KEY_PREFIX = '@parish:updateNotice:dismissed:';
/** Nova consulta ao voltar do segundo plano só depois disto */
const RECHECK_AFTER_MS = 6 * 60 * 60_000;

const storeName = Platform.OS === 'ios' ? 'App Store' : 'Google Play';

const openStore = (url: string | null) => {
  if (!url) {
    Alert.alert('Atualize o Parish', `Abra a ${storeName}, procure por "Parish" e toque em Atualizar.`);
    return;
  }
  Linking.openURL(url).catch(() =>
    Alert.alert('Atualize o Parish', `Não foi possível abrir a loja. Abra a ${storeName} e atualize o Parish.`),
  );
};

export default function AppVersionGate({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [status, setStatus] = useState<AppVersionStatus>({ kind: 'ok' });
  const [noticeDismissed, setNoticeDismissed] = useState(true);
  const lastCheckRef = useRef(0);
  const checkingRef = useRef(false);

  const check = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    lastCheckRef.current = Date.now();
    try {
      const config = await getAppConfig();
      // Sem resposta: mantém o que já se sabia (nunca libera nem bloqueia por erro de rede)
      if (!config) return;
      const next = evaluateAppVersion(INSTALLED_VERSION, config, Platform.OS);
      if (next.kind === 'available') {
        let dismissed = false;
        try {
          dismissed = !!(await AsyncStorage.getItem(DISMISS_KEY_PREFIX + next.latest));
        } catch {
          dismissed = false;
        }
        setNoticeDismissed(dismissed);
      }
      setStatus(next);
    } finally {
      checkingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && Date.now() - lastCheckRef.current > RECHECK_AFTER_MS) void check();
    });
    return () => sub.remove();
  }, [check]);

  const dismissNotice = () => {
    setNoticeDismissed(true);
    if (status.kind === 'available') {
      AsyncStorage.setItem(DISMISS_KEY_PREFIX + status.latest, String(Date.now())).catch(() => undefined);
    }
  };

  if (status.kind === 'required') {
    return (
      <View
        style={[styles.blocked, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
        accessibilityViewIsModal
      >
        <View style={styles.blockedIcon}>
          <FontAwesome5 name="sync-alt" size={30} color="#fff" />
        </View>
        <Text style={styles.blockedTitle} accessibilityRole="header">
          Atualize o Parish
        </Text>
        <Text style={styles.blockedText}>
          Esta versão do app ({status.installed}) não funciona mais. Instale a versão mais nova na {storeName} para
          continuar — seus dados e sua conta continuam os mesmos.
        </Text>
        <TouchableOpacity
          style={styles.blockedBtn}
          onPress={() => openStore(status.storeUrl)}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <Text style={styles.blockedBtnText}>Atualizar agora</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() =>
            Linking.openURL(
              supportMailto('Ajuda para atualizar o Parish', `Versão instalada: ${status.installed} (${Platform.OS})`),
            ).catch(() => Alert.alert('Suporte', `Escreva para ${SUPPORT_EMAIL}`))
          }
          accessibilityRole="link"
          style={styles.blockedHelp}
        >
          <Text style={styles.blockedHelpText}>Precisa de ajuda? {SUPPORT_EMAIL}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      {children}
      {status.kind === 'available' && !noticeDismissed && (
        <View style={[styles.notice, { top: insets.top + 8 }]} accessibilityRole="alert">
          <FontAwesome5 name="arrow-circle-up" size={16} color={colors.primary} />
          <TouchableOpacity
            style={{ flex: 1 }}
            onPress={() => openStore(status.storeUrl)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`Nova versão ${status.latest} disponível. Atualizar`}
          >
            <Text style={styles.noticeTitle}>Nova versão do Parish ({status.latest})</Text>
            <Text style={styles.noticeText}>Toque para atualizar na {storeName}.</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={dismissNotice} hitSlop={12} accessibilityRole="button" accessibilityLabel="Dispensar aviso">
            <FontAwesome5 name="times" size={15} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    fill: { flex: 1 },
    blocked: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 28,
    },
    blockedIcon: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
    },
    blockedTitle: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center', marginBottom: 10 },
    blockedText: { fontSize: 15, lineHeight: 22, color: colors.textSecondary, textAlign: 'center', marginBottom: 26 },
    blockedBtn: {
      alignSelf: 'stretch',
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 15,
      alignItems: 'center',
    },
    blockedBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
    blockedHelp: { marginTop: 18, padding: 6 },
    blockedHelpText: { fontSize: 13, color: colors.textTertiary, textAlign: 'center' },
    notice: {
      position: 'absolute',
      left: 12,
      right: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 6,
      zIndex: 1000,
    },
    noticeTitle: { fontSize: 13.5, fontWeight: '800', color: colors.text },
    noticeText: { fontSize: 12.5, color: colors.textSecondary, marginTop: 1 },
  });
}
