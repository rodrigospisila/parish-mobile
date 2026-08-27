import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Image,
  Alert,
  ActivityIndicator,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '../src/context/AuthContext';
import { useColors } from '../src/context/ThemeContext';
import {
  securityService,
  TwoFactorStatus,
  TwoFactorSetup,
  KnownDevice,
} from '../src/services/securityService';
import { formatDateBR, formatDateTimeBR } from '../src/utils/dateUtils';

/**
 * Segurança da conta (Dízimo D4.7): verificação em duas etapas (TOTP) e
 * aparelhos conhecidos. Recomendado para quem administra finanças.
 */
export default function SecurityScreen() {
  const router = useRouter();
  const colors = useColors();
  const { refreshUser } = useAuth();
  const styles = createStyles(colors);

  // ---------- estado principal ----------
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [devices, setDevices] = useState<KnownDevice[]>([]);
  const [devicesError, setDevicesError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ---------- ativação ----------
  const [setupVisible, setSetupVisible] = useState(false);
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const [enableCode, setEnableCode] = useState('');
  const [enabling, setEnabling] = useState(false);
  const [secretCopied, setSecretCopied] = useState(false);

  // ---------- códigos de recuperação ----------
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [codesCopied, setCodesCopied] = useState(false);

  // ---------- desativação ----------
  const [disableVisible, setDisableVisible] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [disabling, setDisabling] = useState(false);

  // ---------- dispositivos ----------
  const [forgettingId, setForgettingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [statusResult, devicesResult] = await Promise.allSettled([
      securityService.getTwoFactorStatus(),
      securityService.listDevices(),
    ]);

    if (statusResult.status === 'fulfilled') {
      setStatus(statusResult.value);
      setStatusError(null);
    } else {
      setStatusError(statusResult.reason?.message ?? 'Não foi possível carregar a situação do 2FA.');
    }

    if (devicesResult.status === 'fulfilled') {
      setDevices(devicesResult.value);
      setDevicesError(null);
    } else {
      setDevicesError(devicesResult.reason?.message ?? 'Não foi possível carregar os dispositivos.');
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  // ============================================
  // ATIVAR 2FA
  // ============================================

  const openSetup = async () => {
    if (status && !status.serverReady) {
      Alert.alert(
        'Servidor não preparado',
        'O servidor ainda não está configurado para a verificação em duas etapas. Avise o administrador do sistema.',
      );
      return;
    }

    setSetup(null);
    setEnableCode('');
    setSecretCopied(false);
    setSetupVisible(true);
    setSetupLoading(true);
    try {
      const data = await securityService.setupTwoFactor();
      setSetup(data);
    } catch (error: any) {
      setSetupVisible(false);
      Alert.alert('Erro', error?.message ?? 'Não foi possível iniciar a ativação.');
    } finally {
      setSetupLoading(false);
    }
  };

  const copySecret = async () => {
    if (!setup) return;
    try {
      await Clipboard.setStringAsync(setup.secret);
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 2500);
    } catch {
      Alert.alert('Erro', 'Não foi possível copiar o segredo.');
    }
  };

  const confirmEnable = async () => {
    const cleanCode = enableCode.replace(/\s/g, '');
    if (!/^\d{6}$/.test(cleanCode)) {
      Alert.alert('Código incompleto', 'Digite os 6 dígitos mostrados no app autenticador.');
      return;
    }

    setEnabling(true);
    try {
      const result = await securityService.enableTwoFactor(cleanCode);
      setSetupVisible(false);
      setSetup(null);
      setEnableCode('');
      setCodesCopied(false);
      setBackupCodes(result.backupCodes ?? []);
      await load();
      // user.twoFactorEnabled no contexto (o Perfil mostra a situação)
      refreshUser().catch(() => undefined);
    } catch (error: any) {
      Alert.alert('Código não aceito', error?.message ?? 'Confira o código e tente de novo.');
    } finally {
      setEnabling(false);
    }
  };

  const cancelSetup = () => {
    if (enabling) return;
    setSetupVisible(false);
    setSetup(null);
    setEnableCode('');
  };

  // ============================================
  // CÓDIGOS DE RECUPERAÇÃO
  // ============================================

  const copyBackupCodes = async () => {
    if (!backupCodes?.length) return;
    try {
      await Clipboard.setStringAsync(backupCodes.join('\n'));
      setCodesCopied(true);
      setTimeout(() => setCodesCopied(false), 2500);
    } catch {
      Alert.alert('Erro', 'Não foi possível copiar os códigos.');
    }
  };

  const closeBackupCodes = () => {
    Alert.alert(
      'Guardou os códigos?',
      'Eles não serão mostrados de novo. Sem eles, se perder o celular, só um administrador poderá redefinir o segundo fator.',
      [
        { text: 'Voltar', style: 'cancel' },
        { text: 'Já guardei', onPress: () => setBackupCodes(null) },
      ],
    );
  };

  // ============================================
  // DESATIVAR 2FA
  // ============================================

  const openDisable = () => {
    setDisablePassword('');
    setDisableCode('');
    setDisableVisible(true);
  };

  const confirmDisable = async () => {
    if (!disablePassword.trim() || !disableCode.trim()) {
      Alert.alert('Campos obrigatórios', 'Informe sua senha atual e um código válido.');
      return;
    }

    setDisabling(true);
    try {
      await securityService.disableTwoFactor(disablePassword, disableCode);
      setDisableVisible(false);
      await load();
      refreshUser().catch(() => undefined);
      Alert.alert('Segundo fator desativado', 'Sua conta voltou a entrar só com e-mail e senha.');
    } catch (error: any) {
      Alert.alert('Não foi possível desativar', error?.message ?? 'Confira a senha e o código.');
    } finally {
      setDisabling(false);
    }
  };

  // ============================================
  // DISPOSITIVOS
  // ============================================

  const forgetDevice = (device: KnownDevice) => {
    const label = device.label || 'Este dispositivo';
    Alert.alert(
      'Esquecer aparelho',
      `${label} deixará de ser reconhecido: o próximo acesso nele gera um novo aviso de segurança. As sessões abertas da conta também são encerradas — pode ser preciso entrar de novo.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Esquecer',
          style: 'destructive',
          onPress: async () => {
            setForgettingId(device.id);
            try {
              await securityService.forgetDevice(device.id);
              await load();
            } catch (error: any) {
              Alert.alert('Erro', error?.message ?? 'Não foi possível esquecer o aparelho.');
            } finally {
              setForgettingId(null);
            }
          },
        },
      ],
    );
  };

  // ============================================
  // RENDER
  // ============================================

  const twoFactorEnabled = !!status?.enabled;
  const serverReady = status ? status.serverReady : true;

  const renderTwoFactorSection = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Verificação em duas etapas</Text>
      <View style={styles.card}>
        {statusError ? (
          <View style={styles.cardBody}>
            <Text style={styles.errorText}>{statusError}</Text>
          </View>
        ) : (
          <>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusIcon,
                  { backgroundColor: twoFactorEnabled ? colors.success : colors.border },
                ]}
              >
                <Ionicons
                  name={twoFactorEnabled ? 'shield-checkmark' : 'shield-outline'}
                  size={20}
                  color={twoFactorEnabled ? '#fff' : colors.textSecondary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.statusTitle}>
                  {twoFactorEnabled ? 'Ativada' : 'Desativada'}
                </Text>
                <Text style={styles.statusDescription}>
                  {twoFactorEnabled
                    ? `${status?.enabledAt ? `Desde ${formatDateBR(status.enabledAt)} · ` : ''}${
                        status?.backupCodesLeft ?? 0
                      } código(s) de recuperação restante(s)`
                    : 'Ao entrar, além da senha, pedimos um código do app autenticador.'}
                </Text>
              </View>
            </View>

            {!serverReady && (
              <View style={[styles.notice, styles.noticeWarning]}>
                <Ionicons name="warning-outline" size={18} color={colors.warning} />
                <Text style={styles.noticeText}>
                  O servidor ainda não está configurado para a verificação em duas etapas. Avise o
                  administrador do sistema.
                </Text>
              </View>
            )}

            {serverReady && status?.recommended && !twoFactorEnabled && (
              <View style={[styles.notice, styles.noticeWarning]}>
                <Ionicons name="alert-circle-outline" size={18} color={colors.warning} />
                <Text style={styles.noticeText}>
                  Recomendado para quem administra finanças. Ative para proteger o acesso ao dízimo e
                  às ofertas da comunidade.
                </Text>
              </View>
            )}

            {twoFactorEnabled && (status?.backupCodesLeft ?? 0) <= 2 && (
              <View style={[styles.notice, styles.noticeInfo]}>
                <Ionicons name="information-circle-outline" size={18} color={colors.info} />
                <Text style={styles.noticeText}>
                  Poucos códigos de recuperação restantes. Para gerar novos, desative e ative a
                  verificação de novo.
                </Text>
              </View>
            )}

            <View style={styles.cardActions}>
              {twoFactorEnabled ? (
                <TouchableOpacity style={styles.dangerButton} onPress={openDisable} activeOpacity={0.8}>
                  <Text style={styles.dangerButtonText}>Desativar</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.primaryButton, !serverReady && styles.buttonDisabled]}
                  onPress={openSetup}
                  disabled={!serverReady}
                  activeOpacity={0.8}
                >
                  <Ionicons name="shield-checkmark-outline" size={18} color={colors.textInverse} />
                  <Text style={styles.primaryButtonText}>Ativar</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </View>
    </View>
  );

  const renderDevicesSection = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Dispositivos</Text>
      <Text style={styles.sectionHint}>
        Aparelhos que já acessaram sua conta. Não reconhece algum? Esqueça-o e troque a senha.
      </Text>
      <View style={styles.card}>
        {devicesError ? (
          <View style={styles.cardBody}>
            <Text style={styles.errorText}>{devicesError}</Text>
          </View>
        ) : devices.length === 0 ? (
          <View style={styles.cardBody}>
            <Text style={styles.emptyText}>Nenhum dispositivo registrado ainda.</Text>
          </View>
        ) : (
          devices.map((device, index) => (
            <React.Fragment key={device.id}>
              {index > 0 && <View style={styles.divider} />}
              <View style={styles.deviceRow}>
                <Ionicons
                  name={device.current ? 'phone-portrait' : 'phone-portrait-outline'}
                  size={22}
                  color={device.current ? colors.primary : colors.textSecondary}
                  style={{ marginRight: 12 }}
                />
                <View style={{ flex: 1 }}>
                  <View style={styles.deviceTitleRow}>
                    <Text style={styles.deviceLabel} numberOfLines={1}>
                      {device.label || 'Dispositivo'}
                    </Text>
                    {device.current && (
                      <View style={styles.currentBadge}>
                        <Text style={styles.currentBadgeText}>este aparelho</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.deviceMeta} numberOfLines={2}>
                    Último acesso {formatDateTimeBR(device.lastSeenAt)}
                    {device.lastIp ? ` · IP ${device.lastIp}` : ''}
                  </Text>
                  <Text style={styles.deviceMeta}>
                    Primeiro acesso {formatDateBR(device.firstSeenAt)}
                  </Text>
                </View>
                {!device.current && (
                  <TouchableOpacity
                    style={styles.forgetButton}
                    onPress={() => forgetDevice(device)}
                    disabled={forgettingId === device.id}
                    hitSlop={8}
                  >
                    {forgettingId === device.id ? (
                      <ActivityIndicator size="small" color={colors.error} />
                    ) : (
                      <Text style={styles.forgetButtonText}>Esquecer</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </React.Fragment>
          ))
        )}
      </View>
    </View>
  );

  const renderSetupModal = () => (
    <Modal visible={setupVisible} animationType="slide" transparent onRequestClose={cancelSetup}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Ativar verificação em duas etapas</Text>
            <TouchableOpacity onPress={cancelSetup} hitSlop={10} disabled={enabling}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.sheetBody}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {setupLoading || !setup ? (
              <View style={styles.centered}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>Gerando o código QR...</Text>
              </View>
            ) : (
              <>
                <Text style={styles.stepText}>
                  <Text style={styles.stepNumber}>1. </Text>
                  Abra um app autenticador (Google Authenticator, Microsoft Authenticator, Authy…)
                  e escaneie o código abaixo.
                </Text>

                <View style={styles.qrWrapper}>
                  <Image
                    source={{ uri: setup.qrDataUrl }}
                    style={styles.qrImage}
                    resizeMode="contain"
                    accessibilityLabel="Código QR para o app autenticador"
                  />
                </View>

                <Text style={styles.stepText}>
                  Não consegue escanear? Digite este segredo no app:
                </Text>
                <TouchableOpacity style={styles.secretBox} onPress={copySecret} activeOpacity={0.7}>
                  <Text style={styles.secretText} selectable>
                    {setup.secret}
                  </Text>
                  <View style={styles.copyRow}>
                    <Ionicons
                      name={secretCopied ? 'checkmark' : 'copy-outline'}
                      size={16}
                      color={colors.primary}
                    />
                    <Text style={styles.copyText}>{secretCopied ? 'Copiado!' : 'Copiar'}</Text>
                  </View>
                </TouchableOpacity>

                <Text style={[styles.stepText, { marginTop: 18 }]}>
                  <Text style={styles.stepNumber}>2. </Text>
                  Digite o código de 6 dígitos que o app mostra para confirmar.
                </Text>
                <TextInput
                  style={[styles.input, styles.codeInput]}
                  placeholder="000000"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  maxLength={6}
                  value={enableCode}
                  onChangeText={setEnableCode}
                  onSubmitEditing={confirmEnable}
                  returnKeyType="done"
                  editable={!enabling}
                />

                <TouchableOpacity
                  style={[styles.primaryButton, enabling && styles.buttonDisabled]}
                  onPress={confirmEnable}
                  disabled={enabling}
                  activeOpacity={0.8}
                >
                  {enabling ? (
                    <ActivityIndicator color={colors.textInverse} />
                  ) : (
                    <Text style={styles.primaryButtonText}>Confirmar e ativar</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  const renderBackupCodesModal = () => (
    <Modal
      visible={backupCodes !== null}
      animationType="slide"
      transparent
      onRequestClose={closeBackupCodes}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Códigos de recuperação</Text>
          </View>
          <ScrollView contentContainerStyle={styles.sheetBody} showsVerticalScrollIndicator={false}>
            <View style={[styles.notice, styles.noticeWarning, { marginTop: 0 }]}>
              <Ionicons name="key-outline" size={18} color={colors.warning} />
              <Text style={styles.noticeText}>
                Guarde estes códigos em lugar seguro. Cada um vale uma única vez e serve para entrar
                se você perder o celular. Eles não serão mostrados de novo.
              </Text>
            </View>

            <View style={styles.codesGrid}>
              {(backupCodes ?? []).map((code) => (
                <View key={code} style={styles.codeChip}>
                  <Text style={styles.codeChipText} selectable>
                    {code}
                  </Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={copyBackupCodes}
              activeOpacity={0.8}
            >
              <Ionicons
                name={codesCopied ? 'checkmark' : 'copy-outline'}
                size={18}
                color={colors.primary}
              />
              <Text style={styles.secondaryButtonText}>
                {codesCopied ? 'Copiado!' : 'Copiar códigos'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={closeBackupCodes}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>Concluir</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  const renderDisableModal = () => (
    <Modal
      visible={disableVisible}
      animationType="slide"
      transparent
      onRequestClose={() => !disabling && setDisableVisible(false)}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Desativar verificação em duas etapas</Text>
            <TouchableOpacity
              onPress={() => setDisableVisible(false)}
              hitSlop={10}
              disabled={disabling}
            >
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView
            contentContainerStyle={styles.sheetBody}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.stepText}>
              Para confirmar, informe sua senha atual e um código do autenticador (ou um código de
              recuperação).
            </Text>

            <Text style={styles.label}>Senha atual</Text>
            <TextInput
              style={styles.input}
              placeholder="Sua senha"
              placeholderTextColor={colors.placeholder}
              secureTextEntry
              value={disablePassword}
              onChangeText={setDisablePassword}
              editable={!disabling}
            />

            <Text style={[styles.label, { marginTop: 14 }]}>Código</Text>
            <TextInput
              style={styles.input}
              placeholder="000000 ou XXXXX-XXXXX"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="characters"
              autoCorrect={false}
              value={disableCode}
              onChangeText={setDisableCode}
              onSubmitEditing={confirmDisable}
              returnKeyType="done"
              editable={!disabling}
            />

            <TouchableOpacity
              style={[styles.dangerButton, styles.dangerButtonFull, disabling && styles.buttonDisabled]}
              onPress={confirmDisable}
              disabled={disabling}
              activeOpacity={0.8}
            >
              {disabling ? (
                <ActivityIndicator color={colors.error} />
              ) : (
                <Text style={styles.dangerButtonText}>Desativar</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()} hitSlop={10}>
          <FontAwesome5 name="arrow-left" size={17} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Segurança da conta</Text>
        <View style={styles.headerBtn} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
          }
        >
          {renderTwoFactorSection()}
          {renderDevicesSection()}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}

      {renderSetupModal()}
      {renderBackupCodesModal()}
      {renderDisableModal()}
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
    scroll: { paddingBottom: 24 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
    loadingText: { marginTop: 12, color: colors.textSecondary, fontSize: 14 },

    section: { marginTop: 20, paddingHorizontal: 16 },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
      textTransform: 'uppercase',
    },
    sectionHint: { fontSize: 13, color: colors.textTertiary, marginTop: 4, marginBottom: 2, lineHeight: 18 },
    card: { backgroundColor: colors.card, borderRadius: 12, overflow: 'hidden', marginTop: 8 },
    cardBody: { padding: 16 },
    cardActions: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 4 },
    errorText: { color: colors.error, fontSize: 14 },
    emptyText: { color: colors.textSecondary, fontSize: 14 },
    divider: { height: 1, backgroundColor: colors.border, marginLeft: 16 },

    statusRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
    statusIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statusTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
    statusDescription: { fontSize: 13, color: colors.textSecondary, marginTop: 2, lineHeight: 18 },

    notice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      marginHorizontal: 16,
      marginTop: 4,
      marginBottom: 12,
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
    },
    noticeWarning: { backgroundColor: colors.goldSoft, borderColor: colors.warning },
    noticeInfo: { backgroundColor: colors.highlightLight, borderColor: colors.info },
    noticeText: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 18 },

    primaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingVertical: 14,
      marginTop: 12,
    },
    primaryButtonText: { color: colors.textInverse, fontSize: 15, fontWeight: '700' },
    secondaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.highlightLight,
      borderRadius: 10,
      paddingVertical: 13,
      marginTop: 16,
    },
    secondaryButtonText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
    dangerButton: {
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: colors.error,
      marginTop: 12,
    },
    dangerButtonFull: { marginTop: 20 },
    dangerButtonText: { color: colors.error, fontSize: 15, fontWeight: '700' },
    buttonDisabled: { opacity: 0.5 },

    deviceRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
    deviceTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    deviceLabel: { fontSize: 15, fontWeight: '600', color: colors.text, flexShrink: 1 },
    deviceMeta: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
    currentBadge: {
      backgroundColor: colors.highlightLight,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    currentBadgeText: { fontSize: 11, fontWeight: '700', color: colors.primary },
    forgetButton: { marginLeft: 8, paddingVertical: 6, paddingHorizontal: 8, minWidth: 64, alignItems: 'center' },
    forgetButtonText: { color: colors.error, fontSize: 14, fontWeight: '600' },

    modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.modalBackground,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '92%',
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    sheetTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.text },
    sheetBody: { padding: 20, paddingBottom: 36 },

    stepText: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
    stepNumber: { fontWeight: '800', color: colors.text },
    qrWrapper: {
      alignSelf: 'center',
      marginVertical: 16,
      padding: 10,
      backgroundColor: '#FFFFFF',
      borderRadius: 12,
    },
    qrImage: { width: 200, height: 200 },
    secretBox: {
      marginTop: 8,
      backgroundColor: colors.inputBackground,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 12,
      gap: 6,
    },
    secretText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: 1.5,
      textAlign: 'center',
    },
    copyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    copyText: { color: colors.primary, fontSize: 13, fontWeight: '700' },

    label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8 },
    input: {
      backgroundColor: colors.inputBackground,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 12,
      fontSize: 16,
      color: colors.text,
    },
    codeInput: {
      marginTop: 10,
      fontSize: 22,
      letterSpacing: 6,
      textAlign: 'center',
      fontWeight: '700',
    },

    codesGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      justifyContent: 'center',
      marginTop: 16,
    },
    codeChip: {
      backgroundColor: colors.inputBackground,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingVertical: 10,
      paddingHorizontal: 14,
      minWidth: '45%',
      alignItems: 'center',
    },
    codeChipText: { fontSize: 16, fontWeight: '700', color: colors.text, letterSpacing: 1.5 },
  });
