import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Switch,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { useColors, useTheme } from '../../src/context/ThemeContext';
import { useNotifications } from '../../src/context/NotificationContext';
import { authService } from '../../src/services/authService';
import { useCommunity } from '../../src/context/CommunityContext';
import { removeMyCommunity } from '../../src/services/memberCommunitiesService';
import { getMyCatechesisClasses, getMyFamilyCatechesis } from '../../src/services/catechesisService';
import { getParishById } from '../../src/services/churchService';
import { Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import UserAvatar from '../../src/components/UserAvatar';
import { uploadMyAvatar, deleteMyAvatar } from '../../src/services/avatarService';

export default function ProfileScreen() {
  const { user, signOut, updateCommunity, refreshUser } = useAuth();
  const { links, activeCommunityId, setActiveCommunity, refreshLinks } = useCommunity();

  const [catechesisClassCount, setCatechesisClassCount] = React.useState(0);

  // Revalida os vínculos ao abrir o perfil (cobre revogações feitas pela web)
  useFocusEffect(
    React.useCallback(() => {
      void refreshLinks();
      // Após o login a resposta traz só os IDs — sem isto a Comunidade fica
      // "Definir" até o app ir a background e voltar
      void refreshUser();
      Promise.all([
        getMyCatechesisClasses().catch(() => []),
        getMyFamilyCatechesis().catch(() => []),
      ])
        .then(([classes, family]) => setCatechesisClassCount(classes.length + family.length))
        .catch(() => setCatechesisClassCount(0));
    }, [refreshLinks, refreshUser]),
  );

  // Fallback: usuários antigos podem ter parishId nulo no cadastro — o vínculo
  // principal de comunidade resolve a paróquia para exibição
  const primaryLink = links.find((link) => link.isPrimary) ?? links[0];

  // Contato da secretaria paroquial (telefone/e-mail da paróquia)
  const [parishContact, setParishContact] = React.useState<{
    phone?: string | null;
    email?: string | null;
    website?: string | null;
  } | null>(null);
  const parishIdForContact = user?.parishId ?? (primaryLink?.community as any)?.parish?.id;
  React.useEffect(() => {
    if (!parishIdForContact) return;
    getParishById(parishIdForContact)
      .then((parish: any) =>
        setParishContact({ phone: parish?.phone, email: parish?.email, website: parish?.website }),
      )
      .catch(() => setParishContact(null));
  }, [parishIdForContact]);
  const router = useRouter();
  const colors = useColors();
  const { theme, setTheme, isDark } = useTheme();
  const { settings, isPermissionGranted, scheduledCount, updateSettings, testNotification } =
    useNotifications();

  const handleSignOut = () => {
    Alert.alert(
      'Sair',
      'Tem certeza que deseja sair?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sair', onPress: signOut, style: 'destructive' },
      ],
      { cancelable: true }
    );
  };

  const confirmDeleteAccount = async () => {
    try {
      await authService.deleteAccount();
      // Encerra a sessão local; o RootLayout redireciona para o login.
      await signOut();
    } catch {
      Alert.alert(
        'Erro',
        'Não foi possível excluir a conta agora. Tente novamente ou fale com o suporte.',
      );
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Excluir minha conta',
      'Esta ação é permanente. Sua conta e seus dados pessoais serão removidos e você não poderá mais acessar o app.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Continuar',
          style: 'destructive',
          onPress: () =>
            Alert.alert('Confirmação final', 'Tem certeza? Esta ação não pode ser desfeita.', [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Excluir definitivamente', style: 'destructive', onPress: confirmDeleteAccount },
            ]),
        },
      ],
      { cancelable: true },
    );
  };

  const handleThemeChange = (value: boolean) => setTheme(value ? 'dark' : 'light');

  const handleNotificationToggle = async (value: boolean) => {
    if (value && !isPermissionGranted) {
      Alert.alert(
        'Permissão Necessária',
        'Para receber notificações, você precisa permitir nas configurações do dispositivo.',
        [{ text: 'OK' }]
      );
      return;
    }
    await updateSettings({ enabled: value });
  };

  const handleEventRemindersToggle = async (value: boolean) => {
    await updateSettings({ eventReminders: value });
  };

  const handleRosterRemindersToggle = async (value: boolean) => {
    await updateSettings({ rosterReminders: value });
  };

  const handleReminderTimeChange = () => {
    Alert.alert(
      'Tempo de Antecedência',
      'Escolha quanto tempo antes do evento você deseja ser notificado:',
      [
        { text: '15 minutos', onPress: () => updateSettings({ reminderTime: 15 }) },
        { text: '30 minutos', onPress: () => updateSettings({ reminderTime: 30 }) },
        { text: '1 hora', onPress: () => updateSettings({ reminderTime: 60 }) },
        { text: '2 horas', onPress: () => updateSettings({ reminderTime: 120 }) },
        { text: '1 dia', onPress: () => updateSettings({ reminderTime: 1440 }) },
        { text: 'Cancelar', style: 'cancel' },
      ]
    );
  };

  const handleTestNotification = async () => {
    if (!isPermissionGranted) {
      Alert.alert('Permissão Necessária', 'Você precisa permitir notificações para testar.', [{ text: 'OK' }]);
      return;
    }
    await testNotification();
    Alert.alert('Notificação Enviada', 'Verifique a central de notificações do seu dispositivo.');
  };

  const formatReminderTime = (minutes: number): string => {
    if (minutes >= 1440) return `${Math.floor(minutes / 1440)} dia(s)`;
    if (minutes >= 60) return `${Math.floor(minutes / 60)} hora(s)`;
    return `${minutes} minutos`;
  };

  /** Trocar/remover a foto de perfil (aparece em todos os avatares do app). */
  const handleChangeAvatar = () => {
    const send = async (asset: { uri: string; mimeType?: string | null; fileName?: string | null }) => {
      try {
        await uploadMyAvatar(asset);
        Alert.alert('Foto atualizada ✓', 'Sua foto de perfil foi trocada.');
      } catch (error: any) {
        Alert.alert('Não foi possível', error?.response?.data?.message ?? 'Tente novamente.');
      }
    };
    Alert.alert('Foto de perfil', 'O que deseja fazer?', [
      {
        text: 'Tirar foto',
        onPress: async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) return;
          const picked = await ImagePicker.launchCameraAsync({
            quality: 0.6,
            allowsEditing: true,
            aspect: [1, 1],
          });
          const asset = picked.assets?.[0];
          if (asset) void send({ uri: asset.uri, mimeType: asset.mimeType, fileName: asset.fileName ?? 'avatar.jpg' });
        },
      },
      {
        text: 'Escolher da galeria',
        onPress: async () => {
          const picked = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.6,
            allowsEditing: true,
            aspect: [1, 1],
          });
          const asset = picked.assets?.[0];
          if (asset) void send({ uri: asset.uri, mimeType: asset.mimeType, fileName: asset.fileName ?? 'avatar.jpg' });
        },
      },
      {
        text: 'Remover foto',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMyAvatar();
          } catch (error: any) {
            Alert.alert('Não foi possível', error?.response?.data?.message ?? 'Tente novamente.');
          }
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const styles = createStyles(colors);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity activeOpacity={0.8} onPress={handleChangeAvatar}>
            <UserAvatar
              userId={user?.id}
              name={user?.name}
              size={84}
              style={{ backgroundColor: colors.primary }}
            />
            <View style={styles.avatarEditBadge}>
              <Ionicons name="camera" size={13} color="#fff" />
            </View>
          </TouchableOpacity>
          <Text style={styles.avatarHint}>Toque para trocar a foto</Text>
          <Text style={styles.userName}>{user?.name || 'Usuário'}</Text>
          <Text style={styles.userEmail}>{user?.email || ''}</Text>
          <TouchableOpacity style={styles.headerAction} onPress={() => router.push('/member-availability')}>
            <Text style={styles.headerActionText}>Minha disponibilidade</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerAction, { marginTop: 8 }]}
            onPress={() => router.push('/catechesis' as never)}
          >
            <Text style={styles.headerActionText}>Catequese</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informações</Text>
          <View style={styles.card}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Nome</Text>
              <Text style={styles.infoValue}>{user?.name || 'Não informado'}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>E-mail</Text>
              <Text style={styles.infoValue}>{user?.email || 'Não informado'}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Paróquia</Text>
              <Text style={styles.infoValue} numberOfLines={1}>
                {user?.parish?.name || primaryLink?.community?.parish?.name || 'Não informada'}
              </Text>
            </View>
            {parishContact?.phone || parishContact?.email ? (
              <>
                <View style={styles.divider} />
                <TouchableOpacity
                  style={styles.infoRow}
                  activeOpacity={0.7}
                  onPress={() => {
                    // Android mostra no máximo 3 botões num Alert — priorize
                    const options: any[] = [];
                    if (parishContact?.phone) {
                      const digits = (parishContact.phone ?? '').replace(/\D/g, '');
                      const intl = digits.startsWith('55') ? digits : `55${digits}`;
                      options.push({
                        text: '💬 WhatsApp',
                        onPress: () => Linking.openURL(`https://wa.me/${intl}`),
                      });
                      options.push({
                        text: `📞 Ligar`,
                        onPress: () => Linking.openURL(`tel:${parishContact.phone}`),
                      });
                    } else if (parishContact?.email) {
                      options.push({
                        text: '✉️ E-mail',
                        onPress: () => Linking.openURL(`mailto:${parishContact.email}`),
                      });
                    }
                    options.push({ text: 'Fechar', style: 'cancel' });
                    Alert.alert('Falar com a secretaria', 'Como prefere entrar em contato?', options);
                  }}
                >
                  <Text style={styles.infoLabel}>Secretaria</Text>
                  <View style={styles.infoValueLink}>
                    <Text style={[styles.infoValue, { color: colors.primary }]}>Falar com a secretaria</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                  </View>
                </TouchableOpacity>
              </>
            ) : null}
            <View style={styles.divider} />
            <TouchableOpacity style={styles.infoRow} onPress={() => router.push('/tithe' as never)}>
              <Text style={styles.infoLabel}>Dízimo</Text>
              <View style={styles.infoValueLink}>
                <Text style={[styles.infoValue, { color: colors.primary }]}>Dízimo e ofertas pelo Pix</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </View>
            </TouchableOpacity>
            <View style={styles.divider} />
            {/* Governança de acesso (D4.7): 2FA e dispositivos conhecidos */}
            <TouchableOpacity style={styles.infoRow} onPress={() => router.push('/security' as never)}>
              <Text style={styles.infoLabel}>Segurança</Text>
              <View style={styles.infoValueLink}>
                <Text style={[styles.infoValue, { color: colors.primary }]} numberOfLines={1}>
                  {user?.twoFactorEnabled ? 'Duas etapas ativas' : 'Duas etapas e dispositivos'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </View>
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.infoRow}
              onPress={() => router.push('/change-community' as never)}
              activeOpacity={0.7}
            >
              <Text style={styles.infoLabel}>Comunidade</Text>
              <View style={styles.infoValueLink}>
                <Text style={[styles.infoValue, { color: colors.primary }]} numberOfLines={1}>
                  {user?.community?.name || primaryLink?.community?.name || 'Definir'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </View>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.changeCommunityBtn}
            onPress={() => router.push('/change-community' as never)}
            activeOpacity={0.8}
          >
            <Ionicons name="swap-horizontal" size={16} color={colors.primary} />
            <Text style={styles.changeCommunityText}>Trocar paróquia / comunidade</Text>
          </TouchableOpacity>
        </View>

        {/* Minhas comunidades (multi-comunidade, Fase 3) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Minhas comunidades</Text>
          <View style={styles.card}>
            {links.length === 0 ? (
              <View style={styles.infoRow}>
                <Text style={[styles.infoValue, { textAlign: 'left', flex: 1 }]}>
                  {user?.community?.name
                    ? `⭐ ${user.community.name} (principal)`
                    : 'Nenhuma comunidade vinculada ainda.'}
                </Text>
              </View>
            ) : (
              links.map((link, index) => (
                <React.Fragment key={link.id}>
                  {index > 0 && <View style={styles.divider} />}
                  <View style={styles.infoRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.infoValue, { textAlign: 'left', color: colors.text }]} numberOfLines={1}>
                        {link.isPrimary ? '⭐ ' : '🔗 '}
                        {link.community.name}
                        {link.isPrimary ? ' · principal' : ''}
                        {link.communityId === activeCommunityId ? ' · em foco' : ''}
                      </Text>
                      {link.community.parish?.name ? (
                        <Text
                          style={[styles.infoValue, { textAlign: 'left', fontSize: 13 }]}
                          numberOfLines={1}
                        >
                          {link.community.parish.name}
                        </Text>
                      ) : null}
                    </View>
                    {!link.isPrimary && (
                      <TouchableOpacity
                        hitSlop={8}
                        onPress={() => {
                          Alert.alert(link.community.name, 'O que deseja fazer com este vínculo?', [
                            {
                              text: 'Tornar principal',
                              onPress: () => {
                                Alert.alert(
                                  'Trocar comunidade principal',
                                  `${link.community.name} vira sua comunidade principal e a atual passa a ser um vínculo secundário.`,
                                  [
                                    { text: 'Cancelar', style: 'cancel' },
                                    {
                                      text: 'Confirmar',
                                      onPress: async () => {
                                        try {
                                          await updateCommunity(link.communityId, true);
                                          await refreshLinks();
                                          await setActiveCommunity(link.communityId);
                                        } catch (error: any) {
                                          Alert.alert('Erro', error?.message ?? 'Não foi possível trocar.');
                                        }
                                      },
                                    },
                                  ],
                                );
                              },
                            },
                            {
                              text: 'Remover vínculo',
                              style: 'destructive',
                              onPress: async () => {
                                try {
                                  await removeMyCommunity(link.communityId);
                                  await refreshLinks();
                                  if (activeCommunityId === link.communityId && user?.communityId) {
                                    await setActiveCommunity(user.communityId);
                                  }
                                } catch (error: any) {
                                  Alert.alert('Erro', error?.message ?? 'Não foi possível remover.');
                                }
                              },
                            },
                            { text: 'Cancelar', style: 'cancel' },
                          ]);
                        }}
                      >
                        <Ionicons name="ellipsis-horizontal" size={18} color={colors.textSecondary} />
                      </TouchableOpacity>
                    )}
                  </View>
                </React.Fragment>
              ))
            )}
          </View>
          <TouchableOpacity
            style={styles.changeCommunityBtn}
            onPress={() => router.push('/link-community' as never)}
            activeOpacity={0.8}
          >
            <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
            <Text style={styles.changeCommunityText}>Vincular outra comunidade</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notificações</Text>
          <View style={styles.card}>
            <View style={styles.preferenceRow}>
              <View style={styles.preferenceTextContainer}>
                <Text style={styles.preferenceLabel}>Notificações</Text>
                <Text style={styles.preferenceDescription}>
                  {isPermissionGranted
                    ? settings.enabled
                      ? `${scheduledCount} notificações agendadas`
                      : 'Desativadas'
                    : 'Permissão não concedida'}
                </Text>
              </View>
              <Switch
                value={settings.enabled && isPermissionGranted}
                onValueChange={handleNotificationToggle}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={settings.enabled ? colors.textInverse : colors.card}
              />
            </View>

            {settings.enabled && isPermissionGranted && (
              <>
                <View style={styles.divider} />
                <View style={styles.preferenceRow}>
                  <View style={styles.preferenceTextContainer}>
                    <Text style={styles.preferenceLabel}>Lembretes de Eventos</Text>
                    <Text style={styles.preferenceDescription}>Receber lembretes antes dos eventos</Text>
                  </View>
                  <Switch
                    value={settings.eventReminders}
                    onValueChange={handleEventRemindersToggle}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor={settings.eventReminders ? colors.textInverse : colors.card}
                  />
                </View>
                <View style={styles.divider} />
                <View style={styles.preferenceRow}>
                  <View style={styles.preferenceTextContainer}>
                    <Text style={styles.preferenceLabel}>Lembretes de Escalas</Text>
                    <Text style={styles.preferenceDescription}>Receber lembretes quando estiver escalado</Text>
                  </View>
                  <Switch
                    value={settings.rosterReminders}
                    onValueChange={handleRosterRemindersToggle}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor={settings.rosterReminders ? colors.textInverse : colors.card}
                  />
                </View>
                <View style={styles.divider} />
                <TouchableOpacity style={styles.preferenceRow} onPress={handleReminderTimeChange}>
                  <View style={styles.preferenceTextContainer}>
                    <Text style={styles.preferenceLabel}>Tempo de Antecedência</Text>
                    <Text style={styles.preferenceDescription}>
                      Notificar {formatReminderTime(settings.reminderTime)} antes
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
                <View style={styles.divider} />
                <TouchableOpacity style={styles.preferenceRow} onPress={handleTestNotification}>
                  <View style={styles.preferenceTextContainer}>
                    <Text style={styles.preferenceLabel}>Testar Notificação</Text>
                    <Text style={styles.preferenceDescription}>Enviar uma notificação de teste</Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Aparência</Text>
          <View style={styles.card}>
            <View style={styles.preferenceRow}>
              <View style={styles.preferenceTextContainer}>
                <Text style={styles.preferenceLabel}>Modo Escuro</Text>
                <Text style={styles.preferenceDescription}>
                  {theme === 'system' ? 'Seguindo o sistema' : isDark ? 'Ativado' : 'Desativado'}
                </Text>
              </View>
              <Switch
                value={isDark}
                onValueChange={handleThemeChange}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={isDark ? colors.textInverse : colors.card}
              />
            </View>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.preferenceRow} onPress={() => setTheme('system')}>
              <View style={styles.preferenceTextContainer}>
                <Text style={styles.preferenceLabel}>Usar tema do sistema</Text>
                <Text style={styles.preferenceDescription}>
                  Alternar automaticamente entre claro e escuro
                </Text>
              </View>
              {theme === 'system' && <Text style={styles.checkmark}>✓</Text>}
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sair da Conta</Text>
        </TouchableOpacity>

        {/* Zona de risco — exclusão da conta (App Store 5.1.1(v) / LGPD) */}
        <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteAccount} activeOpacity={0.7}>
          <Text style={styles.deleteText}>Excluir minha conta</Text>
        </TouchableOpacity>
        <Text style={styles.deleteHint}>
          Remove permanentemente sua conta e seus dados pessoais.
        </Text>

        <View style={styles.versionContainer}>
          <Text style={styles.versionText}>Parish App v1.0.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    scrollView: { flex: 1 },
    header: {
      alignItems: 'center',
      paddingVertical: 30,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    avatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 12,
    },
    avatarText: { fontSize: 32, fontWeight: 'bold', color: colors.textInverse },
    avatarEditBadge: {
      position: 'absolute',
      right: -2,
      bottom: -2,
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: colors.primary,
      borderWidth: 2,
      borderColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarHint: { fontSize: 11.5, color: colors.textSecondary, marginTop: 6, marginBottom: 6 },
    userName: { fontSize: 22, fontWeight: 'bold', color: colors.text },
    userEmail: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
    headerAction: {
      marginTop: 14,
      backgroundColor: colors.primary,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
    },
    headerActionText: { color: colors.textInverse, fontSize: 13, fontWeight: '700' },
    section: { marginTop: 20, paddingHorizontal: 16 },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
      textTransform: 'uppercase',
    },
    card: { backgroundColor: colors.card, borderRadius: 12, overflow: 'hidden' },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
    },
    infoLabel: { fontSize: 16, color: colors.text },
    infoValue: { fontSize: 16, color: colors.textSecondary, flexShrink: 1, textAlign: 'right' },
    infoValueLink: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1, marginLeft: 12 },
    changeCommunityBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 10,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: colors.highlightLight,
    },
    changeCommunityText: { color: colors.primary, fontWeight: '700', fontSize: 14.5 },
    divider: { height: 1, backgroundColor: colors.border, marginLeft: 16 },
    preferenceRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
    },
    preferenceTextContainer: { flex: 1, marginRight: 10 },
    preferenceLabel: { fontSize: 16, color: colors.text },
    preferenceDescription: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
    checkmark: { fontSize: 18, color: colors.primary, fontWeight: 'bold' },
    chevron: { fontSize: 20, color: colors.textTertiary },
    signOutButton: {
      marginTop: 30,
      marginHorizontal: 16,
      backgroundColor: colors.error,
      padding: 16,
      borderRadius: 12,
      alignItems: 'center',
    },
    signOutText: { color: '#fff', fontSize: 16, fontWeight: '600' },
    deleteButton: {
      marginTop: 14,
      marginHorizontal: 16,
      padding: 14,
      borderRadius: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.error,
    },
    deleteText: { color: colors.error, fontSize: 15, fontWeight: '600' },
    deleteHint: {
      fontSize: 12,
      color: colors.textTertiary,
      textAlign: 'center',
      marginTop: 6,
      marginHorizontal: 24,
    },
    versionContainer: { alignItems: 'center', paddingVertical: 20, marginBottom: 20 },
    versionText: { fontSize: 12, color: colors.textTertiary },
  });
