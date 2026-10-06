import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  Linking,
  RefreshControl,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useAuth } from '../src/context/AuthContext';
import { useColors } from '../src/context/ThemeContext';
import { authService } from '../src/services/authService';
import { privacyService, ConsentRow, ConsentType } from '../src/services/privacyService';
import { AUTH_WEB_URL } from '../src/components/auth/authPalette';

const CONSENT_COPY: Record<ConsentType, { title: string; description: string }> = {
  COMMUNICATIONS: {
    title: 'Comunicações não essenciais',
    description:
      'Notícias, liturgia do dia e lembretes de eventos. Avisos de escala e do dízimo que você pediu continuam chegando.',
  },
  IMAGE_USE: {
    title: 'Uso de imagem',
    description: 'Fotos suas em publicações da comunidade (site, redes sociais, murais).',
  },
  DATA_PROCESSING: {
    title: 'Tratamento do cadastro',
    description:
      'Uso do seu cadastro pela comunidade (pastorais, escalas, sacramentos). Para apagar tudo, exclua a conta.',
  },
};

const CONSENT_ORDER: ConsentType[] = ['COMMUNICATIONS', 'IMAGE_USE', 'DATA_PROCESSING'];

/**
 * Privacidade e meus dados (B62 da auditoria): o titular revoga
 * consentimentos, sai das comunicações, baixa os próprios dados e exclui a
 * conta — direitos do art. 18 da LGPD, pelas rotas que a API já tinha.
 */
export default function PrivacyScreen() {
  const router = useRouter();
  const colors = useColors();
  const styles = createStyles(colors);
  const { signOut } = useAuth();

  const [memberId, setMemberId] = useState<string | null>(null);
  const [consents, setConsents] = useState<ConsentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingType, setSavingType] = useState<ConsentType | null>(null);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [askPassword, setAskPassword] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');

  const load = useCallback(async () => {
    try {
      const id = await privacyService.getMyMemberId();
      setMemberId(id);
      setConsents(id ? await privacyService.getConsents(id) : []);
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? 'Não foi possível carregar os seus dados.');
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const saveConsent = async (type: ConsentType, granted: boolean) => {
    if (!memberId) return;
    setSavingType(type);
    try {
      await privacyService.setConsent(memberId, type, granted);
      setConsents((previous) => [...previous.filter((row) => row.type !== type), { type, granted }]);
    } catch (err: any) {
      Alert.alert('Não foi possível salvar', err?.message ?? 'Tente novamente.');
    } finally {
      setSavingType(null);
    }
  };

  const toggleConsent = (type: ConsentType, granted: boolean) => {
    if (type === 'DATA_PROCESSING' && !granted) {
      Alert.alert('Revogar o tratamento do cadastro?', CONSENT_COPY.DATA_PROCESSING.description, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Revogar', style: 'destructive', onPress: () => void saveConsent(type, granted) },
      ]);
      return;
    }
    void saveConsent(type, granted);
  };

  const exportData = async () => {
    setExporting(true);
    try {
      const payload = await privacyService.exportMyData(memberId);
      const filename = `meus-dados-parish-${new Date().toISOString().slice(0, 10)}.json`;
      const target = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(target, JSON.stringify(payload, null, 2));
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Arquivo gerado', 'Este aparelho não permite compartilhar o arquivo.');
        return;
      }
      await Sharing.shareAsync(target, { mimeType: 'application/json', dialogTitle: filename });
    } catch (err: any) {
      Alert.alert('Não foi possível gerar o arquivo', err?.message ?? 'Tente novamente.');
    } finally {
      setExporting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletePassword) return;
    setDeleting(true);
    try {
      await authService.deleteAccount(deletePassword);
      setAskPassword(false);
      setDeletePassword('');
      await signOut();
    } catch (err: any) {
      setDeleting(false);
      const status = err?.response?.status;
      const msg = err?.response?.data?.message;
      Alert.alert(
        'Não foi possível excluir',
        status === 400 || status === 401 || status === 409 || status === 429
          ? (Array.isArray(msg) ? msg.join(' ') : msg) || 'Confira a senha e tente de novo.'
          : 'Não foi possível excluir a conta agora. Tente novamente ou fale com o suporte.',
      );
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Excluir minha conta',
      'A conta é apagada e o seu cadastro anonimizado: você sai das pastorais, das escalas futuras e das comunidades.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Continuar',
          style: 'destructive',
          onPress: () =>
            Alert.alert('Confirmação final', 'Tem certeza? Esta ação não pode ser desfeita.', [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Excluir definitivamente', style: 'destructive', onPress: () => setAskPassword(true) },
            ]),
        },
      ],
    );
  };

  const consentOf = (type: ConsentType) => consents.find((row) => row.type === type);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()} hitSlop={10} accessibilityLabel="Voltar">
          <FontAwesome5 name="arrow-left" size={17} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacidade e meus dados</Text>
        <View style={styles.headerBtn} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        >
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Consentimentos</Text>
            <View style={styles.card}>
              {error ? (
                <Text style={[styles.cardBody, styles.errorText]}>{error}</Text>
              ) : !memberId ? (
                <Text style={[styles.cardBody, styles.mutedText]}>
                  Sua conta não tem cadastro de membro numa comunidade, então não há consentimentos a gerir aqui.
                </Text>
              ) : (
                CONSENT_ORDER.map((type, index) => (
                  <View key={type}>
                    {index > 0 && <View style={styles.divider} />}
                    <View style={styles.consentRow}>
                      <View style={styles.consentText}>
                        <Text style={styles.consentTitle}>{CONSENT_COPY[type].title}</Text>
                        <Text style={styles.consentDescription}>{CONSENT_COPY[type].description}</Text>
                      </View>
                      {savingType === type ? (
                        <ActivityIndicator color={colors.primary} />
                      ) : (
                        <Switch
                          value={!!consentOf(type)?.granted}
                          onValueChange={(value) => toggleConsent(type, value)}
                          accessibilityLabel={CONSENT_COPY[type].title}
                        />
                      )}
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Seus dados</Text>
            <View style={styles.card}>
              <TouchableOpacity style={styles.actionRow} onPress={exportData} disabled={exporting}>
                <Ionicons name="download-outline" size={20} color={colors.primary} />
                <View style={styles.consentText}>
                  <Text style={styles.actionText}>{exporting ? 'Gerando arquivo...' : 'Baixar meus dados'}</Text>
                  <Text style={styles.consentDescription}>
                    Conta, cadastro, consentimentos, catequese, dízimo e notificações recebidas.
                  </Text>
                </View>
              </TouchableOpacity>
              <View style={styles.divider} />
              <TouchableOpacity style={styles.actionRow} onPress={() => Linking.openURL(`${AUTH_WEB_URL}/privacidade`)}>
                <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
                <Text style={[styles.actionText, styles.consentText]}>Política de privacidade</Text>
              </TouchableOpacity>
              <View style={styles.divider} />
              <TouchableOpacity style={styles.actionRow} onPress={() => Linking.openURL(`${AUTH_WEB_URL}/termos`)}>
                <Ionicons name="document-text-outline" size={20} color={colors.primary} />
                <Text style={[styles.actionText, styles.consentText]}>Termos de uso</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.section}>
            <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} disabled={deleting}>
              {deleting ? (
                <ActivityIndicator color={colors.error} />
              ) : (
                <Text style={styles.deleteText}>Excluir minha conta</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
      <Modal visible={askPassword} transparent animationType="fade" onRequestClose={() => setAskPassword(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Confirme a sua senha</Text>
            <Text style={styles.modalText}>Para excluir a conta, digite a senha atual.</Text>
            <TextInput
              style={styles.modalInput}
              value={deletePassword}
              onChangeText={setDeletePassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Senha atual"
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel="Senha atual"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => {
                  setAskPassword(false);
                  setDeletePassword('');
                }}
                disabled={deleting}
                accessibilityRole="button"
              >
                <Text style={styles.modalCancel}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => void confirmDelete()} disabled={deleting || !deletePassword} accessibilityRole="button">
                {deleting ? (
                  <ActivityIndicator color={colors.error} />
                ) : (
                  <Text style={[styles.modalDanger, !deletePassword && { opacity: 0.4 }]}>Excluir</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
    scroll: { paddingBottom: 32 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
    section: { marginTop: 20, paddingHorizontal: 16 },
    sectionTitle: { fontSize: 14, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase' },
    card: { backgroundColor: colors.card, borderRadius: 12, overflow: 'hidden', marginTop: 8 },
    cardBody: { padding: 16 },
    errorText: { color: colors.error, fontSize: 14 },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
    modalCard: { backgroundColor: colors.card, borderRadius: 14, padding: 20 },
    modalTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
    modalText: { fontSize: 14, color: colors.textSecondary, marginTop: 6 },
    modalInput: {
      marginTop: 14,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      color: colors.text,
    },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 24, marginTop: 18 },
    modalCancel: { fontSize: 16, color: colors.textSecondary, fontWeight: '600' },
    modalDanger: { fontSize: 16, color: colors.error, fontWeight: '800' },
    mutedText: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
    divider: { height: 1, backgroundColor: colors.border, marginLeft: 16 },
    consentRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
    consentText: { flex: 1 },
    consentTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
    consentDescription: { fontSize: 13, color: colors.textSecondary, marginTop: 3, lineHeight: 18 },
    actionRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
    actionText: { fontSize: 15, fontWeight: '700', color: colors.primary },
    deleteBtn: {
      borderWidth: 1,
      borderColor: colors.error,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    deleteText: { color: colors.error, fontSize: 15, fontWeight: '700' },
  });
