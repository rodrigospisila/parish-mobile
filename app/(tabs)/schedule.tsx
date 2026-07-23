import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Modal,
  FlatList,
  TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../src/context/AuthContext';
import { useColors } from '../../src/context/ThemeContext';
import {
  UserRoster,
  ScheduleTeamMember,
  getUserUpcomingRosters,
  getUserRosterHistory,
  confirmRosterPresence,
  declineRosterPresence,
  getScheduleTeam,
  RosterConfirmationStatus,
} from '../../src/services/pastoralService';
import {
  MySwaps,
  SwapRequest,
  getMySwaps,
  requestSwap,
  acceptSwap,
  rejectSwap,
  cancelSwap,
} from '../../src/services/swapService';
import { getEventTypeColor } from '../../src/services/eventService';
import { formatToBrazilianDate } from '../../src/utils/dateUtils';

export default function ScheduleScreen() {
  const { user } = useAuth();
  const colors = useColors();
  const [userRosters, setUserRosters] = useState<UserRoster[]>([]);
  const [historyRosters, setHistoryRosters] = useState<UserRoster[]>([]);
  const [isLoadingRosters, setIsLoadingRosters] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [processingRosterId, setProcessingRosterId] = useState<string | null>(null);
  const [teamModal, setTeamModal] = useState<{ roster: UserRoster; team: ScheduleTeamMember[]; loading: boolean } | null>(null);

  // Troca de escala (4.6)
  const [swaps, setSwaps] = useState<MySwaps | null>(null);
  const [processingSwapId, setProcessingSwapId] = useState<string | null>(null);
  const [swapModalRoster, setSwapModalRoster] = useState<UserRoster | null>(null);
  const [swapMessage, setSwapMessage] = useState('');
  const [swapSubmitting, setSwapSubmitting] = useState(false);

  const loadSwaps = useCallback(() => {
    getMySwaps()
      .then(setSwaps)
      .catch(() => setSwaps(null));
  }, []);

  const loadUserRosters = useCallback(
    async (refresh = false) => {
      if (!user?.id) {
        setIsLoadingRosters(false);
        return;
      }

      if (refresh) {
        setIsRefreshing(true);
        setHistoryLoaded(false);
        setHistoryRosters([]);
      } else {
        setIsLoadingRosters(true);
      }

      try {
        const rosters = await getUserUpcomingRosters(user.id);
        setUserRosters(rosters);
      } catch (error) {
        console.error('Erro ao carregar escalas:', error);
      } finally {
        setIsLoadingRosters(false);
        setIsRefreshing(false);
      }
      loadSwaps();
    },
    [user?.id, loadSwaps],
  );

  const loadHistory = useCallback(async () => {
    if (!user?.id || historyLoaded || isLoadingHistory) return;
    setIsLoadingHistory(true);
    try {
      const history = await getUserRosterHistory(user.id);
      setHistoryRosters(history);
      setHistoryLoaded(true);
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [user?.id, historyLoaded, isLoadingHistory]);

  useFocusEffect(
    useCallback(() => {
      loadUserRosters();
    }, [loadUserRosters]),
  );

  const handleConfirmPresence = async (roster: UserRoster) => {
    setProcessingRosterId(roster.id);
    try {
      const outcome = await confirmRosterPresence(roster.id);
      if (outcome !== 'error') {
        setUserRosters((prev) =>
          prev.map((r) =>
            r.id === roster.id
              ? { ...r, confirmationStatus: 'confirmed' as RosterConfirmationStatus, confirmedAt: new Date().toISOString() }
              : r
          )
        );
        if (outcome === 'queued') {
          Alert.alert(
            'Sem conexão',
            `Sua confirmação em "${roster.eventTitle}" foi salva no aparelho e será enviada automaticamente quando a internet voltar.`,
          );
        } else {
          Alert.alert('Presença Confirmada', `Você confirmou presença em "${roster.eventTitle}".`);
        }
      } else {
        Alert.alert('Erro', 'Não foi possível confirmar sua presença. Tente novamente.');
      }
    } catch {
      Alert.alert('Erro', 'Ocorreu um erro ao confirmar presença.');
    } finally {
      setProcessingRosterId(null);
    }
  };

  const handleDeclinePresence = (roster: UserRoster) => {
    const wasConfirmed = roster.confirmationStatus === 'confirmed';

    Alert.alert(
      wasConfirmed ? 'Cancelar Presença' : 'Declinar Presença',
      wasConfirmed
        ? `Tem certeza que deseja cancelar sua presença confirmada em "${roster.eventTitle}"?\n\nO coordenador da pastoral será notificado para reorganizar a escala.`
        : `Tem certeza que deseja declinar sua presença em "${roster.eventTitle}"?\n\nO coordenador da pastoral será notificado.`,
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: wasConfirmed ? 'Cancelar presença' : 'Declinar',
          style: 'destructive',
          onPress: async () => {
            setProcessingRosterId(roster.id);
            try {
              const outcome = await declineRosterPresence(roster.id);
              if (outcome !== 'error') {
                setUserRosters((prev) =>
                  prev.map((r) =>
                    r.id === roster.id
                      ? { ...r, confirmationStatus: 'declined' as RosterConfirmationStatus }
                      : r
                  )
                );
                if (outcome === 'queued') {
                  Alert.alert(
                    'Sem conexão',
                    'Sua resposta foi salva no aparelho e será enviada automaticamente quando a internet voltar.',
                  );
                } else {
                  Alert.alert('Presença Declinada', 'O coordenador foi notificado sobre sua ausência.');
                }
              } else {
                Alert.alert('Erro', 'Não foi possível atualizar sua presença. Tente novamente.');
              }
            } catch {
              Alert.alert('Erro', 'Ocorreu um erro ao atualizar sua presença.');
            } finally {
              setProcessingRosterId(null);
            }
          },
        },
      ]
    );
  };

  const openTeamModal = async (roster: UserRoster) => {
    setTeamModal({ roster, team: [], loading: true });
    const team = await getScheduleTeam(roster.scheduleId);
    setTeamModal({ roster, team, loading: false });
  };

  // ===== Troca de escala (4.6) =====

  const handleRequestSwap = async () => {
    if (!swapModalRoster) return;
    setSwapSubmitting(true);
    try {
      await requestSwap(swapModalRoster.id, { message: swapMessage.trim() || undefined });
      Alert.alert(
        'Pedido enviado',
        'Seu pedido de troca ficou aberto à pastoral. Quando alguém aceitar, a escala passa a ser dessa pessoa.',
      );
      setSwapModalRoster(null);
      setSwapMessage('');
      loadSwaps();
    } catch (error: any) {
      Alert.alert('Erro', error?.message || 'Não foi possível pedir a troca.');
    } finally {
      setSwapSubmitting(false);
    }
  };

  const handleSwapAction = async (swap: SwapRequest, action: 'accept' | 'reject' | 'cancel') => {
    setProcessingSwapId(swap.id);
    try {
      if (action === 'accept') {
        await acceptSwap(swap.id);
        Alert.alert('Troca aceita', 'A escala agora é sua — ela já aparece nas suas próximas participações.');
      } else if (action === 'reject') {
        await rejectSwap(swap.id);
      } else {
        await cancelSwap(swap.id);
      }
      loadSwaps();
      loadUserRosters(true);
    } catch (error: any) {
      Alert.alert('Erro', error?.message || 'Não foi possível concluir a ação.');
    } finally {
      setProcessingSwapId(null);
    }
  };

  const pendingInvites = (swaps?.invited ?? []).filter((s) => s.status === 'PENDING');
  const myPendingRequests = (swaps?.requested ?? []).filter((s) => s.status === 'PENDING');

  const getStatusColor = (status: RosterConfirmationStatus) => {
    if (status === 'checked_in') return colors.success;
    if (status === 'confirmed') return colors.primary;
    if (status === 'declined') return colors.error;
    return colors.warning;
  };

  const getStatusText = (status: RosterConfirmationStatus) => {
    if (status === 'checked_in') return 'Presente';
    if (status === 'confirmed') return 'Confirmado';
    if (status === 'declined') return 'Declinado';
    return 'Pendente';
  };

  const styles = createStyles(colors);

  const renderRosterCard = (roster: UserRoster, isHistory = false) => {
    const isProcessing = processingRosterId === roster.id;
    const statusColor = getStatusColor(roster.confirmationStatus);

    return (
      <View key={roster.id} style={styles.rosterCard}>
        <View
          style={[styles.rosterTypeIndicator, { backgroundColor: getEventTypeColor(roster.eventType) }]}
        />
        <View style={styles.rosterContent}>
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

          {/* Ações: apenas em escalas futuras e não finalizadas */}
          {!isHistory && roster.confirmationStatus === 'pending' && (
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

          {!isHistory && roster.confirmationStatus === 'confirmed' && (
            <>
              <View style={styles.confirmedMessage}>
                <Text style={styles.confirmedMessageText}>✓ Presença confirmada</Text>
              </View>
              <TouchableOpacity
                style={[styles.actionButton, styles.declineButton, styles.cancelConfirmedButton]}
                onPress={() => handleDeclinePresence(roster)}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color={colors.error} />
                ) : (
                  <Text style={styles.declineButtonText}>Cancelar presença</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {roster.confirmationStatus === 'checked_in' && (
            <View style={[styles.confirmedMessage, { backgroundColor: colors.success + '15' }]}>
              <Text style={[styles.confirmedMessageText, { color: colors.success }]}>
                ✓ Presença registrada pelo coordenador
              </Text>
            </View>
          )}

          {roster.confirmationStatus === 'declined' && (
            <View style={styles.declinedMessage}>
              <Text style={styles.declinedMessageText}>✗ Presença declinada</Text>
            </View>
          )}

          <TouchableOpacity style={styles.teamButton} onPress={() => openTeamModal(roster)}>
            <Text style={styles.teamButtonText}>Ver equipe escalada</Text>
          </TouchableOpacity>

          {/* Troca de escala (4.6): apenas escalas futuras não declinadas */}
          {!isHistory && roster.confirmationStatus !== 'declined' && roster.confirmationStatus !== 'checked_in' && (
            <TouchableOpacity
              style={styles.swapButton}
              onPress={() => { setSwapModalRoster(roster); setSwapMessage(''); }}
            >
              <Text style={styles.swapButtonText}>🔄 Pedir troca</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const renderSwapRow = (swap: SwapRequest, kind: 'invite' | 'mine') => {
    const isProcessing = processingSwapId === swap.id;
    const scheduleInfo = swap.assignment?.schedule;
    return (
      <View key={swap.id} style={styles.swapCard}>
        <Text style={styles.swapCardTitle} numberOfLines={1}>
          {scheduleInfo?.title ?? 'Escala'}
          {swap.assignment?.role ? ` · ${swap.assignment.role}` : ''}
        </Text>
        {scheduleInfo?.date && (
          <Text style={styles.swapCardDate}>
            {formatToBrazilianDate(scheduleInfo.date, 'dd/MM/yyyy')} às {formatToBrazilianDate(scheduleInfo.date, 'HH:mm')}
          </Text>
        )}
        {kind === 'invite' && (
          <Text style={styles.swapCardMeta}>Pedido por {swap.requesterName ?? 'membro da pastoral'}</Text>
        )}
        {swap.message ? <Text style={styles.swapCardMessage}>"{swap.message}"</Text> : null}
        <View style={styles.actionButtons}>
          {kind === 'invite' ? (
            <>
              <TouchableOpacity
                style={[styles.actionButton, styles.confirmButton]}
                disabled={isProcessing}
                onPress={() => handleSwapAction(swap, 'accept')}
              >
                {isProcessing ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.confirmButtonText}>Assumir escala</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.declineButton]}
                disabled={isProcessing}
                onPress={() => handleSwapAction(swap, 'reject')}
              >
                <Text style={styles.declineButtonText}>Recusar</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={[styles.actionButton, styles.declineButton]}
              disabled={isProcessing}
              onPress={() => handleSwapAction(swap, 'cancel')}
            >
              {isProcessing ? <ActivityIndicator size="small" color={colors.error} /> : <Text style={styles.declineButtonText}>Cancelar pedido</Text>}
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => loadUserRosters(true)} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>Minha Escala</Text>
          <Text style={styles.subtitle}>Suas próximas participações nas pastorais</Text>
        </View>

        {/* Próximas escalas */}
        <View style={styles.section}>
          {isLoadingRosters ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.loadingText}>Carregando escalas...</Text>
            </View>
          ) : userRosters.length > 0 ? (
            <View style={styles.rostersContainer}>{userRosters.map((r) => renderRosterCard(r, false))}</View>
          ) : (
            <View style={styles.emptyRostersCard}>
              <Text style={styles.emptyRostersText}>
                Você não está escalado(a) para nenhum evento próximo.
              </Text>
            </View>
          )}
        </View>

        {/* Trocas de escala (4.6) */}
        {(pendingInvites.length > 0 || myPendingRequests.length > 0) && (
          <View style={styles.section}>
            <View style={styles.historySectionHeader}>
              <Text style={styles.historySectionTitle}>Trocas de escala</Text>
            </View>
            {pendingInvites.length > 0 && (
              <View style={styles.rostersContainer}>
                <Text style={styles.swapGroupLabel}>Pedidos abertos na sua pastoral</Text>
                {pendingInvites.map((swap) => renderSwapRow(swap, 'invite'))}
              </View>
            )}
            {myPendingRequests.length > 0 && (
              <View style={[styles.rostersContainer, pendingInvites.length > 0 && { marginTop: 12 }]}>
                <Text style={styles.swapGroupLabel}>Meus pedidos aguardando</Text>
                {myPendingRequests.map((swap) => renderSwapRow(swap, 'mine'))}
              </View>
            )}
          </View>
        )}

        {/* Histórico */}
        <View style={styles.section}>
          <View style={styles.historySectionHeader}>
            <Text style={styles.historySectionTitle}>Histórico</Text>
            {!historyLoaded && !isLoadingHistory && (
              <TouchableOpacity onPress={loadHistory}>
                <Text style={styles.historyLoadLink}>Carregar</Text>
              </TouchableOpacity>
            )}
          </View>

          {isLoadingHistory && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.loadingText}>Carregando histórico...</Text>
            </View>
          )}

          {historyLoaded && historyRosters.length === 0 && (
            <View style={styles.emptyRostersCard}>
              <Text style={styles.emptyRostersText}>Nenhuma participação registrada nos últimos 30 dias.</Text>
            </View>
          )}

          {historyLoaded && historyRosters.length > 0 && (
            <View style={styles.rostersContainer}>{historyRosters.map((r) => renderRosterCard(r, true))}</View>
          )}
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Modal de equipe escalada */}
      <Modal
        visible={!!teamModal}
        animationType="slide"
        transparent
        onRequestClose={() => setTeamModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderText}>
                <Text style={styles.modalTitle}>{teamModal?.roster.eventTitle}</Text>
                <Text style={styles.modalSubtitle}>Equipe escalada</Text>
              </View>
              <TouchableOpacity onPress={() => setTeamModal(null)} style={styles.modalCloseButton}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {teamModal?.loading ? (
              /* Skeleton loader */
              <View style={styles.skeletonContainer}>
                {[1, 2, 3].map((i) => (
                  <View key={i} style={styles.skeletonRow}>
                    <View style={styles.skeletonAvatar} />
                    <View style={styles.skeletonLines}>
                      <View style={[styles.skeletonLine, { width: '60%' }]} />
                      <View style={[styles.skeletonLine, { width: '40%', opacity: 0.5 }]} />
                    </View>
                    <View style={styles.skeletonBadge} />
                  </View>
                ))}
              </View>
            ) : teamModal?.team.length === 0 ? (
              <View style={styles.modalLoading}>
                <Text style={styles.emptyRostersText}>Nenhum membro encontrado.</Text>
              </View>
            ) : (
              <FlatList
                data={teamModal?.team}
                keyExtractor={(item: ScheduleTeamMember) => item.assignmentId}
                contentContainerStyle={styles.teamList}
                renderItem={({ item }) => {
                  const memberStatusColor =
                    item.checkedIn
                      ? colors.success
                      : item.status === 'CONFIRMED'
                        ? colors.primary
                        : item.status === 'DECLINED'
                          ? colors.error
                          : colors.warning;
                  const memberStatusLabel =
                    item.checkedIn
                      ? 'Presente'
                      : item.status === 'CONFIRMED'
                        ? 'Confirmado'
                        : item.status === 'DECLINED'
                          ? 'Declinado'
                          : 'Pendente';
                  return (
                    <View style={styles.teamMemberRow}>
                      <View style={styles.teamMemberAvatar}>
                        <Text style={styles.teamMemberAvatarText}>
                          {item.memberName.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.teamMemberInfo}>
                        <Text style={styles.teamMemberName}>{item.memberName}</Text>
                        <Text style={styles.teamMemberRole}>{item.role}</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: memberStatusColor + '20' }]}>
                        <View style={[styles.statusDot, { backgroundColor: memberStatusColor }]} />
                        <Text style={[styles.statusText, { color: memberStatusColor }]}>
                          {memberStatusLabel}
                        </Text>
                      </View>
                    </View>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Modal de pedido de troca (4.6) */}
      <Modal
        visible={!!swapModalRoster}
        animationType="slide"
        transparent
        onRequestClose={() => setSwapModalRoster(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderText}>
                <Text style={styles.modalTitle}>Pedir troca</Text>
                <Text style={styles.modalSubtitle}>
                  {swapModalRoster?.eventTitle} · {swapModalRoster ? formatToBrazilianDate(swapModalRoster.eventDate, 'dd/MM/yyyy') : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSwapModalRoster(null)} style={styles.modalCloseButton}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.swapModalBody}>
              <Text style={styles.swapModalHint}>
                O pedido fica aberto aos membros da sua pastoral. Quem aceitar assume a sua vaga —
                com validação automática de conflito de horário.
              </Text>
              <TextInput
                style={styles.swapModalInput}
                placeholder="Mensagem (opcional) — ex.: Preciso viajar neste domingo, alguém cobre?"
                placeholderTextColor={colors.textTertiary}
                multiline
                numberOfLines={3}
                value={swapMessage}
                onChangeText={setSwapMessage}
              />
              <TouchableOpacity
                style={[styles.actionButton, styles.confirmButton, { marginTop: 12 }]}
                disabled={swapSubmitting}
                onPress={handleRequestSwap}
              >
                {swapSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.confirmButtonText}>Enviar pedido de troca</Text>
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
    safeArea: { flex: 1, backgroundColor: colors.background },
    scrollView: { flex: 1 },
    header: {
      padding: 20,
      paddingBottom: 10,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: { fontSize: 28, fontWeight: 'bold', color: colors.text },
    subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
    section: { marginTop: 20, paddingHorizontal: 16 },
    loadingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 20,
    },
    loadingText: { marginLeft: 10, color: colors.textSecondary },
    rostersContainer: { gap: 12, paddingBottom: 4 },
    rosterCard: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 12, overflow: 'hidden' },
    rosterTypeIndicator: { width: 4 },
    rosterContent: { flex: 1, padding: 15 },
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
    statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 4 },
    statusText: { fontSize: 11, fontWeight: '600' },
    rosterDate: { fontSize: 14, color: colors.highlight, fontWeight: '500', marginBottom: 2 },
    rosterLocation: { fontSize: 13, color: colors.textSecondary, marginBottom: 8 },
    rosterPastoralContainer: {
      backgroundColor: colors.highlightLight,
      borderRadius: 8,
      padding: 10,
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
      marginBottom: 12,
    },
    rosterPastoralName: { fontSize: 13, fontWeight: '600', color: colors.text },
    rosterResponsibilities: { fontSize: 12, color: colors.textSecondary, marginTop: 2, fontStyle: 'italic' },
    actionButtons: { flexDirection: 'row', gap: 10 },
    actionButton: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    confirmButton: { backgroundColor: colors.success },
    confirmButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
    declineButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.error },
    declineButtonText: { color: colors.error, fontWeight: '600', fontSize: 14 },
    cancelConfirmedButton: { marginTop: 8 },
    confirmedMessage: {
      backgroundColor: colors.primary + '15',
      borderRadius: 8,
      padding: 10,
      alignItems: 'center',
    },
    confirmedMessageText: { color: colors.primary, fontWeight: '500', fontSize: 13 },
    declinedMessage: {
      backgroundColor: colors.error + '15',
      borderRadius: 8,
      padding: 10,
      alignItems: 'center',
    },
    declinedMessageText: { color: colors.error, fontWeight: '500', fontSize: 13 },
    teamButton: {
      marginTop: 10,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.primary,
      alignItems: 'center',
    },
    teamButtonText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
    // Troca de escala (4.6)
    swapButton: {
      marginTop: 8,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.warning,
      alignItems: 'center',
    },
    swapButtonText: { fontSize: 13, color: colors.warning, fontWeight: '600' },
    swapGroupLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 4,
    },
    swapCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 14,
      borderLeftWidth: 3,
      borderLeftColor: colors.warning,
    },
    swapCardTitle: { fontSize: 15, fontWeight: 'bold', color: colors.text },
    swapCardDate: { fontSize: 13, color: colors.highlight, marginTop: 2 },
    swapCardMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    swapCardMessage: { fontSize: 13, color: colors.textSecondary, fontStyle: 'italic', marginTop: 6 },
    swapModalBody: { padding: 20 },
    swapModalHint: { fontSize: 13, color: colors.textSecondary, marginBottom: 12, lineHeight: 19 },
    swapModalInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 12,
      minHeight: 80,
      textAlignVertical: 'top',
      color: colors.text,
      backgroundColor: colors.background,
    },
    emptyRostersCard: { backgroundColor: colors.card, borderRadius: 12, padding: 20, alignItems: 'center' },
    emptyRostersText: { fontSize: 14, color: colors.textTertiary, textAlign: 'center' },
    historySectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    historySectionTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    historyLoadLink: { fontSize: 13, color: colors.primary, fontWeight: '700' },
    // Modal
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalContainer: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '75%',
      paddingBottom: 32,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalHeaderText: { flex: 1 },
    modalTitle: { fontSize: 17, fontWeight: 'bold', color: colors.text },
    modalSubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    modalCloseButton: { padding: 4 },
    modalCloseText: { fontSize: 18, color: colors.textSecondary },
    modalLoading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
    // Skeleton
    skeletonContainer: { padding: 16, gap: 16 },
    skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    skeletonAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.border,
    },
    skeletonLines: { flex: 1, gap: 8 },
    skeletonLine: {
      height: 12,
      borderRadius: 6,
      backgroundColor: colors.border,
    },
    skeletonBadge: {
      width: 64,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.border,
    },
    // Team list
    teamList: { paddingHorizontal: 16, paddingTop: 8 },
    teamMemberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 12,
    },
    teamMemberAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    teamMemberAvatarText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
    teamMemberInfo: { flex: 1 },
    teamMemberName: { fontSize: 15, fontWeight: '600', color: colors.text },
    teamMemberRole: { fontSize: 12, color: colors.textSecondary, marginTop: 2, fontStyle: 'italic' },
  });
