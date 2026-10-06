import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useColors } from '../context/ThemeContext';
import { privacyService, TermsStatus } from '../services/privacyService';
import { AUTH_WEB_URL } from './auth/authPalette';

/**
 * Aviso BLOQUEANTE de aceite dos termos de uso e da política de privacidade
 * (M3/M4 da auditoria): quem entrou sem aceite gravado (conta criada pela
 * gestão, cadastro antigo) ou com aceite de versão anterior só segue depois
 * de aceitar. Consulta o GET /users/me a cada usuário logado; servidor antigo,
 * sem o campo, não bloqueia ninguém.
 */
export default function TermsAcceptanceGate() {
  const { user, isAuthenticated, signOut } = useAuth();
  const colors = useColors();
  const styles = createStyles(colors);
  const [status, setStatus] = useState<TermsStatus | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);

  const userId = user?.id ?? null;

  const load = useCallback(async () => {
    try {
      setStatus(await privacyService.getTermsStatus());
    } catch {
      // Sem rede ou sessão caindo: não bloqueia (tenta de novo no próximo login)
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    setChecked(false);
    if (isAuthenticated && userId) void load();
    else setStatus(null);
  }, [isAuthenticated, userId, load]);

  const visible = isAuthenticated && !!status?.termsAcceptanceRequired;

  const accept = async () => {
    if (!checked || busy) return;
    setBusy(true);
    try {
      await privacyService.acceptTerms(status?.termsVersion);
      setStatus({ ...status, termsAcceptanceRequired: false });
    } catch (error: any) {
      Alert.alert('Não foi possível registrar o aceite', error?.message ?? 'Tente novamente.');
      // Termos atualizados enquanto a tela estava aberta: recarrega a versão
      setChecked(false);
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => undefined}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <Text style={styles.title} accessibilityRole="header">
            Termos de uso e privacidade
          </Text>
          <Text style={styles.body}>
            Para continuar usando o Parish, leia e aceite os termos de uso e a política de privacidade. Eles
            explicam quais dados pessoais tratamos, para quê e como você exerce os seus direitos (LGPD).
          </Text>

          <View style={styles.links}>
            <TouchableOpacity onPress={() => Linking.openURL(`${AUTH_WEB_URL}/termos`)} accessibilityRole="link">
              <Text style={styles.link}>Termos de uso</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => Linking.openURL(`${AUTH_WEB_URL}/privacidade`)} accessibilityRole="link">
              <Text style={styles.link}>Política de privacidade</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.checkRow}
            onPress={() => setChecked((value) => !value)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
          >
            <Ionicons
              name={checked ? 'checkbox' : 'square-outline'}
              size={24}
              color={checked ? colors.primary : colors.textSecondary}
            />
            <Text style={styles.checkText}>Li e aceito os termos de uso e a política de privacidade.</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primaryBtn, (!checked || busy) && styles.primaryBtnDisabled]}
            onPress={accept}
            disabled={!checked || busy}
            accessibilityRole="button"
          >
            {busy ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text style={styles.primaryBtnText}>Aceitar e continuar</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => void signOut()} disabled={busy}>
            <Text style={styles.secondaryBtnText}>Sair</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(11, 28, 44, 0.72)',
      justifyContent: 'center',
      padding: 20,
    },
    card: { backgroundColor: colors.card, borderRadius: 16, padding: 20 },
    title: { fontSize: 19, fontWeight: '800', color: colors.text, marginBottom: 10 },
    body: { fontSize: 15, lineHeight: 21, color: colors.textSecondary },
    links: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, marginTop: 14, marginBottom: 6 },
    link: { fontSize: 15, fontWeight: '700', color: colors.primary, textDecorationLine: 'underline' },
    checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
    checkText: { flex: 1, fontSize: 15, color: colors.text },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 6,
    },
    primaryBtnDisabled: { opacity: 0.5 },
    primaryBtnText: { color: colors.textInverse, fontSize: 16, fontWeight: '800' },
    secondaryBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
    secondaryBtnText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
  });
