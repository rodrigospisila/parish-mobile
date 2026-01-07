import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Switch,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../../src/context/AuthContext';
import { useColors, useTheme } from '../../src/context/ThemeContext';
import { useNotifications } from '../../src/context/NotificationContext';
import {
  UserRoster,
  getUserUpcomingRosters,
  confirmRosterPresence,
  declineRosterPresence,
  RosterConfirmationStatus,
} from '../../src/services/pastoralService';
import { formatToBrazilianDate } from '../../src/utils/dateUtils';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const colors = useColors();
  const { theme, setTheme, isDark } = useTheme();
  const { settings, isPermissionGranted, scheduledCount, updateSettings, testNotification } =
    useNotifications();

  const [userRosters, setUserRosters] = useState<UserRoster[]>([]);
  const [isLoadingRosters, setIsLoadingRosters] = useState(true);
  const [processingRosterId, setProcessingRosterId] = useState<string | null>(null);

  // Carregar escalas do usuário
  const loadUserRosters = useCallback(async () => {
    if (!user?.id) {
      setIsLoadingRosters(false);
      return;
    }

    setIsLoadingRosters(true);
    try {
      const rosters = await getUserUpcomingRosters(user.id);
      setUserRosters(rosters);
    } catch (error) {
      console.error('Erro ao carregar escalas:', error);
    } finally {
      setIsLoadingRosters(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadUserRosters();
  }, [loadUserRosters]);

  const handleConfirmPresence = async (roster: UserRoster) => {
    setProcessingRosterId(roster.id);
    try {
      const success = await confirmRosterPresence(roster.id);
      if (success) {
        // Atualiza o estado local
        setUserRosters((prev) =>
          prev.map((r) =>
            r.id === roster.id
              ? { ...r, confirmationStatus: 'confirmed' as RosterConfirmationStatus, confirmedAt: new Date().toISOString() }
              : r
          )
        );
        Alert.alert('Presença Confirmada', `Você confirmou presença em "${roster.eventTitle}".`);
      } else {
        Alert.alert('Erro', 'Não foi possível confirmar sua presença. Tente novamente.');
      }
    } catch (error) {
      Alert.alert('Erro', 'Ocorreu um erro ao confirmar presença.');
    } finally {
      setProcessingRosterId(null);
    }
  };

  const handleDeclinePresence = (roster: UserRoster) => {
    Alert.alert(
      'Declinar Presença',
      `Tem certeza que deseja declinar sua presença em "${roster.eventTitle}"?\n\nO coordenador da pastoral será notificado.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Declinar',
          style: 'destructive',
          onPress: async () => {
            setProcessingRosterId(roster.id);
            try {
              const success = await declineRosterPresence(roster.id);
              if (success) {
                setUserRosters((prev) =>
                  prev.map((r) =>
                    r.id === roster.id
                      ? { ...r, confirmationStatus: 'declined' as RosterConfirmationStatus, confirmedAt: new Date().toISOString() }
                      : r
                  )
                );
                Alert.alert('Presença Declinada', 'O coordenador foi notificado sobre sua ausência.');
              } else {
                Alert.alert('Erro', 'Não foi possível declinar sua presença. Tente novamente.');
              }
            } catch (error) {
              Alert.alert('Erro', 'Ocorreu um erro ao declinar presença.');
            } finally {
              setProcessingRosterId(null);
            }
          },
        },
      ]
    );
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sair',
      'Tem certeza que deseja sair?',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Sair',
          onPress: signOut,
          style: 'destructive',
        },
      ],
      { cancelable: true }
    );
  };

  const handleThemeChange = (value: boolean) => {
    setTheme(value ? 'dark' : 'light');
  };

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
      Alert.alert(
        'Permissão Necessária',
        'Você precisa permitir notificações para testar.',
        [{ text: 'OK' }]
      );
      return;
    }
    await testNotification();
    Alert.alert('Notificação Enviada', 'Verifique a central de notificações do seu dispositivo.');
  };

  const formatReminderTime = (minutes: number): string => {
    if (minutes >= 1440) {
      return `${Math.floor(minutes / 1440)} dia(s)`;
    } else if (minutes >= 60) {
      return `${Math.floor(minutes / 60)} hora(s)`;
    }
    return `${minutes} minutos`;
  };

  // Cores para os tipos de evento
  const eventTypeColors: { [key: string]: string } = {
    MISSA: colors.eventMissa,
    REUNIAO: colors.eventReuniao,
    ATIVIDADE: colors.eventAtividade,
  };

  // Cores para status de confirmação
  const getStatusColor = (status: RosterConfirmationStatus) => {
    switch (status) {
      case 'confirmed':
        return colors.success;
      case 'declined':
        return colors.error;
      default:
        return colors.warning;
    }
  };

  const getStatusText = (status: RosterConfirmationStatus) => {
    switch (status) {
      case 'confirmed':
        return 'Confirmado';
      case 'declined':
        return 'Declinado';
      default:
        return 'Pendente';
    }
  };

  const styles = createStyles(colors);

  const renderRosterCard = (roster: UserRoster) => {
    const isProcessing = processingRosterId === roster.id;
    const statusColor = getStatusColor(roster.confirmationStatus);

    return (
      <View key={roster.id} style={styles.rosterCard}>
        <View
          style={[
            styles.rosterTypeIndicator,
            { backgroundColor: eventTypeColors[roster.eventType] || colors.primary },
          ]}
        />
        <View style={styles.rosterContent}>
          {/* Header com título e status */}
          <View style={styles.rosterHeader}>
            <Text style={styles.rosterEventTitle} numberOfLines={1}>
              {roster.eventTitle}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusText, { color: statusColor }]}>
                {getStatusText(roster.confirmationStatus)}
              </Text>
            </View>
          </View>

          <Text style={styles.rosterDate}>
            {formatToBrazilianDate(roster.eventDate, 'dd/MM/yyyy')} às{' '}
            {formatToBrazilianDate(roster.eventDate, 'HH:mm')}
          </Text>
          <Text style={styles.rosterLocation}>{roster.eventLocation}</Text>

          <View style={styles.rosterPastoralContainer}>
            <Text style={styles.rosterPastoralName}>{roster.pastoralName}</Text>
            <Text style={styles.rosterResponsibilities}>{roster.responsibilities}</Text>
          </View>

          {/* Botões de ação */}
          {roster.confirmationStatus === 'pending' && (
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.actionButton, styles.confirmButton]}
                onPress={() => handleConfirmPresence(roster)}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.confirmButtonText}>Confirmar</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.declineButton]}
                onPress={() => handleDeclinePresence(roster)}
                disabled={isProcessing}
              >
                <Text style={styles.declineButtonText}>Declinar</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Mensagem de status confirmado/declinado */}
          {roster.confirmationStatus === 'confirmed' && (
            <View style={styles.confirmedMessage}>
              <Text style={styles.confirmedMessageText}>
                ✓ Presença confirmada
              </Text>
            </View>
          )}

          {roster.confirmationStatus === 'declined' && (
            <View style={styles.declinedMessage}>
              <Text style={styles.declinedMessageText}>
                ✗ Presença declinada
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.name?.charAt(0).toUpperCase() || 'U'}</Text>
          </View>
          <Text style={styles.userName}>{user?.name || 'Usuário'}</Text>
          <Text style={styles.userEmail}>{user?.email || ''}</Text>
        </View>

        {/* Seção Minha Escala */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Minha Escala</Text>
            <TouchableOpacity onPress={loadUserRosters} disabled={isLoadingRosters}>
              <Text style={styles.refreshText}>Atualizar</Text>
            </TouchableOpacity>
          </View>

          {isLoadingRosters ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.loadingText}>Carregando escalas...</Text>
            </View>
          ) : userRosters.length > 0 ? (
            <View style={styles.rostersContainer}>
              {userRosters.map(renderRosterCard)}
            </View>
          ) : (
            <View style={styles.emptyRostersCard}>
              <Text style={styles.emptyRostersText}>
                Você não está escalado(a) para nenhum evento próximo.
              </Text>
            </View>
          )}
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
              <Text style={styles.infoLabel}>Comunidade</Text>
              <Text style={styles.infoValue}>{user?.communityId || 'Nenhuma'}</Text>
            </View>
          </View>
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
                    <Text style={styles.preferenceDescription}>
                      Receber lembretes antes dos eventos
                    </Text>
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
                    <Text style={styles.preferenceDescription}>
                      Receber lembretes quando estiver escalado
                    </Text>
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
                    <Text style={styles.preferenceDescription}>
                      Enviar uma notificação de teste
                    </Text>
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

        <View style={styles.versionContainer}>
          <Text style={styles.versionText}>Parish App v1.0.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollView: {
      flex: 1,
    },
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
    avatarText: {
      fontSize: 32,
      fontWeight: 'bold',
      color: colors.textInverse,
    },
    userName: {
      fontSize: 22,
      fontWeight: 'bold',
      color: colors.text,
    },
    userEmail: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 4,
    },
    section: {
      marginTop: 20,
      paddingHorizontal: 16,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
      marginLeft: 4,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
      textTransform: 'uppercase',
    },
    refreshText: {
      fontSize: 14,
      color: colors.primary,
      fontWeight: '500',
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
      overflow: 'hidden',
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
    },
    infoLabel: {
      fontSize: 16,
      color: colors.text,
    },
    infoValue: {
      fontSize: 16,
      color: colors.textSecondary,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginLeft: 16,
    },
    preferenceRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
    },
    preferenceTextContainer: {
      flex: 1,
      marginRight: 10,
    },
    preferenceLabel: {
      fontSize: 16,
      color: colors.text,
    },
    preferenceDescription: {
      fontSize: 12,
      color: colors.textTertiary,
      marginTop: 2,
    },
    checkmark: {
      fontSize: 18,
      color: colors.primary,
      fontWeight: 'bold',
    },
    chevron: {
      fontSize: 20,
      color: colors.textTertiary,
    },
    signOutButton: {
      marginTop: 30,
      marginHorizontal: 16,
      backgroundColor: colors.error,
      padding: 16,
      borderRadius: 12,
      alignItems: 'center',
    },
    signOutText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    versionContainer: {
      alignItems: 'center',
      paddingVertical: 20,
      marginBottom: 20,
    },
    versionText: {
      fontSize: 12,
      color: colors.textTertiary,
    },
    // Estilos para Minha Escala
    loadingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 20,
    },
    loadingText: {
      marginLeft: 10,
      color: colors.textSecondary,
    },
    rostersContainer: {
      gap: 12,
    },
    rosterCard: {
      flexDirection: 'row',
      backgroundColor: colors.card,
      borderRadius: 12,
      overflow: 'hidden',
    },
    rosterTypeIndicator: {
      width: 4,
    },
    rosterContent: {
      flex: 1,
      padding: 15,
    },
    rosterHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    rosterEventTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      color: colors.text,
      flex: 1,
      marginRight: 8,
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      marginRight: 4,
    },
    statusText: {
      fontSize: 11,
      fontWeight: '600',
    },
    rosterDate: {
      fontSize: 14,
      color: colors.highlight,
      fontWeight: '500',
      marginBottom: 2,
    },
    rosterLocation: {
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 8,
    },
    rosterPastoralContainer: {
      backgroundColor: colors.highlightLight,
      borderRadius: 8,
      padding: 10,
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
      marginBottom: 12,
    },
    rosterPastoralName: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
    },
    rosterResponsibilities: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
      fontStyle: 'italic',
    },
    actionButtons: {
      flexDirection: 'row',
      gap: 10,
    },
    actionButton: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    confirmButton: {
      backgroundColor: colors.success,
    },
    confirmButtonText: {
      color: '#fff',
      fontWeight: '600',
      fontSize: 14,
    },
    declineButton: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.error,
    },
    declineButtonText: {
      color: colors.error,
      fontWeight: '600',
      fontSize: 14,
    },
    confirmedMessage: {
      backgroundColor: colors.success + '15',
      borderRadius: 8,
      padding: 10,
      alignItems: 'center',
    },
    confirmedMessageText: {
      color: colors.success,
      fontWeight: '500',
      fontSize: 13,
    },
    declinedMessage: {
      backgroundColor: colors.error + '15',
      borderRadius: 8,
      padding: 10,
      alignItems: 'center',
    },
    declinedMessageText: {
      color: colors.error,
      fontWeight: '500',
      fontSize: 13,
    },
    emptyRostersCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 20,
      alignItems: 'center',
    },
    emptyRostersText: {
      fontSize: 14,
      color: colors.textTertiary,
      textAlign: 'center',
    },
  });
