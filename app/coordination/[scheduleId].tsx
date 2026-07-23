import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useColors } from '../../src/context/ThemeContext';
import {
  CandidateRecommendationLevel,
  CoordinatorScheduleAssignment,
  CoordinatorScheduleDetail,
  ScheduleCandidateMember,
  ScheduleCandidatesResponse,
  checkInCoordinatorAssignment,
  getCoordinatorScheduleDetail,
  getScheduleCandidates,
  notifyScheduleTeam,
  replaceCoordinatorAssignment,
  undoCheckInCoordinatorAssignment,
} from '../../src/services/coordinatorService';
import { formatToBrazilianDate } from '../../src/utils/dateUtils';

type CandidateFilter = 'all' | CandidateRecommendationLevel;

export default function CoordinationScheduleDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ scheduleId: string | string[] }>();
  const scheduleId = Array.isArray(params.scheduleId) ? params.scheduleId[0] : params.scheduleId;
  const [schedule, setSchedule] = useState<CoordinatorScheduleDetail | null>(null);
  const [candidates, setCandidates] = useState<ScheduleCandidatesResponse | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<CoordinatorScheduleAssignment | null>(null);
  const [candidateFilter, setCandidateFilter] = useState<CandidateFilter>('RECOMMENDED');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCandidatesLoading, setIsCandidatesLoading] = useState(false);
  const [actionAssignmentId, setActionAssignmentId] = useState<string | null>(null);
  const [replacingMemberId, setReplacingMemberId] = useState<string | null>(null);
  const [isNotifyModalVisible, setIsNotifyModalVisible] = useState(false);
  const [notifyMessage, setNotifyMessage] = useState('');
  const [isSendingNotify, setIsSendingNotify] = useState(false);
  const styles = createStyles(colors);

  const loadSchedule = useCallback(async (refresh = false) => {
    if (!scheduleId) {
      setIsLoading(false);
      return;
    }

    if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const data = await getCoordinatorScheduleDetail(scheduleId);
      setSchedule(data);
    } catch (error) {
      console.error('Erro ao carregar detalhe da escala:', error);
      setSchedule(null);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [scheduleId]);

  useFocusEffect(
    useCallback(() => {
      loadSchedule();
    }, [loadSchedule]),
  );

  const openReplacement = useCallback(
    async (assignment: CoordinatorScheduleAssignment) => {
      if (!scheduleId) {
        return;
      }

      setSelectedAssignment(assignment);
      setCandidateFilter('RECOMMENDED');
      setIsCandidatesLoading(true);

      try {
        const data = await getScheduleCandidates(scheduleId);
        setCandidates(data);
      } catch (error) {
        console.error('Erro ao carregar candidatos:', error);
        setCandidates(null);
      } finally {
        setIsCandidatesLoading(false);
      }
    },
    [scheduleId],
  );

  const handleCheckIn = useCallback(
    async (assignment: CoordinatorScheduleAssignment, undo = false) => {
      setActionAssignmentId(assignment.id);
      try {
        if (undo) {
          await undoCheckInCoordinatorAssignment(assignment.id);
        } else {
          await checkInCoordinatorAssignment(assignment.id);
        }
        await loadSchedule(true);
        Alert.alert(
          undo ? 'Check-in desfeito' : 'Check-in registrado',
          undo
            ? `Presença de ${assignment.member.fullName} foi removida.`
            : `Presença de ${assignment.member.fullName} registrada com sucesso.`,
        );
      } catch (error) {
        console.error('Erro ao atualizar check-in:', error);
        Alert.alert('Erro', 'Não foi possível atualizar o check-in. Tente novamente.');
      } finally {
        setActionAssignmentId(null);
      }
    },
    [loadSchedule],
  );

  const handleReplace = useCallback(
    async (memberId: string) => {
      if (!selectedAssignment) {
        return;
      }

      const previousName = selectedAssignment.member.fullName;
      setReplacingMemberId(memberId);
      try {
        const result = await replaceCoordinatorAssignment(selectedAssignment.id, memberId);
        const newName = (result as any)?.member?.fullName || 'novo membro';
        setSelectedAssignment(null);
        setCandidates(null);
        await loadSchedule(true);
        Alert.alert('Substituição realizada', `${previousName} foi substituído(a) por ${newName}.`);
      } catch (error) {
        console.error('Erro ao substituir membro da escala:', error);
        Alert.alert('Erro', 'Não foi possível realizar a substituição. Tente novamente.');
      } finally {
        setReplacingMemberId(null);
      }
    },
    [loadSchedule, selectedAssignment],
  );

  const handleSendNotifyTeam = useCallback(async () => {
    if (!scheduleId || !notifyMessage.trim()) {
      return;
    }

    setIsSendingNotify(true);
    try {
      const result = await notifyScheduleTeam(scheduleId, notifyMessage.trim());
      setIsNotifyModalVisible(false);
      setNotifyMessage('');
      Alert.alert(
        'Aviso enviado',
        result.notified > 0
          ? `${result.notified} pessoa(s) da equipe foram notificadas.`
          : 'Nenhum membro escalado possui notificacoes habilitadas.',
      );
    } catch (error) {
      Alert.alert('Erro ao enviar aviso', error instanceof Error ? error.message : 'Tente novamente.');
    } finally {
      setIsSendingNotify(false);
    }
  }, [notifyMessage, scheduleId]);

  const assignmentSections = useMemo(() => {
    if (!schedule) {
      return [];
    }

    const sections = schedule.event.eventPastorals.map((pastoral) => {
      const assignments = schedule.assignments.filter(
        (assignment) => assignment.communityPastoral?.id === pastoral.communityPastoralId,
      );

      return {
        key: pastoral.communityPastoralId,
        title: pastoral.communityPastoral.globalPastoral?.name || 'Pastoral',
        subtitle: pastoral.role || 'Equipe vinculada ao evento',
        requiredPeople: pastoral.requiredPeople,
        assignments,
      };
    });

    const unscopedAssignments = schedule.assignments.filter((assignment) => !assignment.communityPastoral?.id);
    if (unscopedAssignments.length > 0 || sections.length === 0) {
      sections.push({
        key: 'general',
        title: sections.length === 0 ? 'Equipe da escala' : 'Sem pastoral definida',
        subtitle: 'Atribuicoes sem pastoral vinculada',
        requiredPeople: 0,
        assignments: unscopedAssignments,
      });
    }

    return sections;
  }, [schedule]);

  const filteredCandidates = useMemo(() => {
    if (!selectedAssignment || !candidates) {
      return [];
    }

    const samePastoralId = selectedAssignment.communityPastoral?.id;
    return candidates.members.filter((candidate) => {
      if (candidate.id === selectedAssignment.member.id) {
        return false;
      }

      if (
        samePastoralId &&
        !candidate.pastorals.some((pastoral) => pastoral.communityPastoralId === samePastoralId)
      ) {
        return false;
      }

      if (candidateFilter !== 'all' && candidate.recommendation.level !== candidateFilter) {
        return false;
      }

      return true;
    });
  }, [candidateFilter, candidates, selectedAssignment]);

  const getStatusColor = (assignment: CoordinatorScheduleAssignment) => {
    if (assignment.checkedIn) {
      return colors.success;
    }

    if (assignment.status === 'DECLINED') {
      return colors.error;
    }

    if (assignment.status === 'CONFIRMED') {
      return colors.primary;
    }

    return colors.warning;
  };

  const getStatusLabel = (assignment: CoordinatorScheduleAssignment) => {
    if (assignment.checkedIn) {
      return assignment.checkedInAt
        ? `Presente às ${formatToBrazilianDate(assignment.checkedInAt, 'HH:mm')}`
        : 'Presente';
    }

    if (assignment.status === 'DECLINED') {
      return 'Recusou';
    }

    if (assignment.status === 'CONFIRMED') {
      return 'Confirmado';
    }

    return 'Pendente';
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerState}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.centerText}>Carregando operação da escala...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!schedule) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerState}>
          <Text style={styles.centerTitle}>Escala não encontrada</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.back()}>
            <Text style={styles.primaryButtonText}>Voltar</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => loadSchedule(true)} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backLink}>Voltar</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{schedule.title}</Text>
          <Text style={styles.subtitle}>{schedule.event.title}</Text>
          <Text style={styles.meta}>
            {formatToBrazilianDate(schedule.date, 'dd/MM/yyyy')} às{' '}
            {formatToBrazilianDate(schedule.date, 'HH:mm')}
          </Text>
          <Text style={styles.meta}>{schedule.event.location || 'Local a definir'}</Text>
          <TouchableOpacity
            style={styles.notifyTeamButton}
            onPress={() => setIsNotifyModalVisible(true)}
          >
            <Text style={styles.notifyTeamButtonText}>Avisar equipe</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pastorais e vagas</Text>
          <View style={styles.summaryGrid}>
            {assignmentSections.map((section) => (
              <View key={section.key} style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>{section.title}</Text>
                <Text style={styles.summarySubtitle}>{section.subtitle}</Text>
                <Text style={styles.summaryValue}>
                  {section.assignments.length}
                  {section.requiredPeople > 0 ? `/${section.requiredPeople}` : ''}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Operação por equipe</Text>
          <View style={styles.list}>
            {assignmentSections.map((section) => (
              <View key={section.key} style={styles.groupCard}>
                <View style={styles.groupHeader}>
                  <View style={styles.groupHeaderText}>
                    <Text style={styles.groupTitle}>{section.title}</Text>
                    <Text style={styles.groupSubtitle}>{section.subtitle}</Text>
                  </View>
                  {section.requiredPeople > 0 ? (
                    <Text style={styles.groupCapacity}>
                      {section.assignments.length}/{section.requiredPeople}
                    </Text>
                  ) : null}
                </View>

                {section.assignments.length === 0 ? (
                  <Text style={styles.emptyInline}>Sem membros atribuídos nesta equipe.</Text>
                ) : (
                  section.assignments.map((assignment) => (
                    <View key={assignment.id} style={styles.assignmentCard}>
                      <View style={styles.assignmentHeader}>
                        <View style={styles.assignmentText}>
                          <Text style={styles.assignmentName}>{assignment.member.fullName}</Text>
                          <Text style={styles.assignmentRole}>{assignment.role}</Text>
                        </View>
                        <Text style={[styles.assignmentStatus, { color: getStatusColor(assignment) }]}>
                          {getStatusLabel(assignment)}
                        </Text>
                      </View>

                      <View style={styles.assignmentActions}>
                        {assignment.status === 'CONFIRMED' && !assignment.checkedIn ? (
                          <TouchableOpacity
                            style={styles.smallPrimaryButton}
                            onPress={() => handleCheckIn(assignment)}
                            disabled={actionAssignmentId === assignment.id}
                          >
                            <Text style={styles.smallPrimaryButtonText}>
                              {actionAssignmentId === assignment.id ? 'Processando...' : 'Check-in'}
                            </Text>
                          </TouchableOpacity>
                        ) : null}

                        {assignment.checkedIn ? (
                          <TouchableOpacity
                            style={styles.smallSecondaryButton}
                            onPress={() => handleCheckIn(assignment, true)}
                            disabled={actionAssignmentId === assignment.id}
                          >
                            <Text style={styles.smallSecondaryButtonText}>Desfazer</Text>
                          </TouchableOpacity>
                        ) : null}

                        <TouchableOpacity
                          style={styles.smallSecondaryButton}
                          onPress={() => openReplacement(assignment)}
                        >
                          <Text style={styles.smallSecondaryButtonText}>Substituir</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <Modal
        animationType="slide"
        transparent
        visible={!!selectedAssignment}
        onRequestClose={() => {
          setSelectedAssignment(null);
          setCandidates(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderText}>
                <Text style={styles.modalTitle}>Substituição rápida</Text>
                <Text style={styles.modalSubtitle}>
                  {selectedAssignment?.member.fullName} • {selectedAssignment?.role}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setSelectedAssignment(null);
                  setCandidates(null);
                }}
              >
                <Text style={styles.closeText}>Fechar</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.filterRow}>
              {[
                { key: 'RECOMMENDED', label: 'Prontos' },
                { key: 'ATTENTION', label: 'Atenção' },
                { key: 'CONFLICT', label: 'Conflitos' },
                { key: 'all', label: 'Todos' },
              ].map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={[
                    styles.filterChip,
                    candidateFilter === item.key && styles.filterChipActive,
                  ]}
                  onPress={() => setCandidateFilter(item.key as CandidateFilter)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      candidateFilter === item.key && styles.filterChipTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {isCandidatesLoading ? (
                <View style={styles.centerState}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.centerText}>Carregando candidatos...</Text>
                </View>
              ) : filteredCandidates.length === 0 ? (
                <View style={styles.centerState}>
                  <Text style={styles.centerTitle}>Nenhum candidato disponível</Text>
                  <Text style={styles.centerText}>
                    Verifique o filtro ou cadastre disponibilidade dos membros.
                  </Text>
                </View>
              ) : (
                <View style={styles.candidateList}>
                  {filteredCandidates.map((candidate) => (
                    <View key={candidate.id} style={styles.candidateCard}>
                      <View style={styles.candidateHeader}>
                        <View style={styles.candidateHeaderText}>
                          <Text style={styles.candidateName}>{candidate.fullName}</Text>
                          <Text style={styles.candidateMeta}>
                            Score {candidate.recommendation.score} • {candidate.availability.summary[0]}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.candidateBadge,
                            candidate.recommendation.level === 'RECOMMENDED'
                              ? { color: colors.success }
                              : candidate.recommendation.level === 'ATTENTION'
                                ? { color: colors.warning }
                                : { color: colors.error },
                          ]}
                        >
                          {candidate.recommendation.level === 'RECOMMENDED'
                            ? 'Pronto'
                            : candidate.recommendation.level === 'ATTENTION'
                              ? 'Atenção'
                              : 'Conflito'}
                        </Text>
                      </View>

                      <Text style={styles.candidateDetail}>
                        Próximas escalas: {candidate.load.upcoming30DaysCount} • Faltas recentes:{' '}
                        {candidate.history.noShowCount}
                      </Text>
                      <Text style={styles.candidateDetail}>
                        Confirmações: {candidate.history.respondedCount} • Presença:{' '}
                        {Math.round(candidate.history.attendanceRate)}%
                      </Text>
                      {candidate.recommendation.reasons[0] ? (
                        <Text style={styles.candidateReason}>{candidate.recommendation.reasons[0]}</Text>
                      ) : null}

                      <TouchableOpacity
                        style={styles.primaryButton}
                        disabled={replacingMemberId === candidate.id}
                        onPress={() => handleReplace(candidate.id)}
                      >
                        <Text style={styles.primaryButtonText}>
                          {replacingMemberId === candidate.id ? 'Substituindo...' : 'Substituir por este membro'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent
        visible={isNotifyModalVisible}
        onRequestClose={() => setIsNotifyModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderText}>
                <Text style={styles.modalTitle}>Avisar equipe</Text>
                <Text style={styles.modalSubtitle}>
                  Envia uma notificacao para todos os membros escalados nesta escala
                </Text>
              </View>
              <TouchableOpacity onPress={() => setIsNotifyModalVisible(false)}>
                <Text style={styles.closeText}>Fechar</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.notifyInput}
              placeholder="Ex: Missa adiantada 15 minutos hoje"
              placeholderTextColor={colors.textSecondary}
              multiline
              value={notifyMessage}
              onChangeText={setNotifyMessage}
              maxLength={500}
            />

            <TouchableOpacity
              style={styles.primaryButton}
              disabled={isSendingNotify || !notifyMessage.trim()}
              onPress={handleSendNotifyTeam}
            >
              <Text style={styles.primaryButtonText}>
                {isSendingNotify ? 'Enviando...' : 'Enviar aviso'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
      paddingHorizontal: 18,
      paddingTop: 18,
      gap: 4,
    },
    backLink: {
      fontSize: 14,
      color: colors.primary,
      fontWeight: '700',
      marginBottom: 6,
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text,
    },
    subtitle: {
      fontSize: 16,
      color: colors.primary,
      fontWeight: '600',
    },
    meta: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    notifyTeamButton: {
      alignSelf: 'flex-start',
      marginTop: 10,
      backgroundColor: `${colors.primary}18`,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    notifyTeamButtonText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.primary,
    },
    notifyInput: {
      minHeight: 90,
      maxHeight: 160,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 12,
      fontSize: 14,
      color: colors.text,
      textAlignVertical: 'top',
      marginBottom: 14,
    },
    section: {
      paddingHorizontal: 18,
      marginTop: 18,
    },
    sectionTitle: {
      fontSize: 13,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      fontWeight: '700',
      marginBottom: 10,
    },
    summaryGrid: {
      gap: 10,
    },
    summaryCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    summaryTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    summarySubtitle: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    summaryValue: {
      marginTop: 12,
      fontSize: 26,
      fontWeight: '700',
      color: colors.primary,
    },
    list: {
      gap: 12,
      paddingBottom: 24,
    },
    groupCard: {
      backgroundColor: colors.card,
      borderRadius: 18,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 12,
    },
    groupHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 10,
    },
    groupHeaderText: {
      flex: 1,
    },
    groupTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
    },
    groupSubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
    groupCapacity: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.primary,
    },
    assignmentCard: {
      backgroundColor: colors.background,
      borderRadius: 14,
      padding: 12,
      gap: 10,
    },
    assignmentHeader: {
      gap: 6,
    },
    assignmentText: {
      gap: 2,
    },
    assignmentName: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
    },
    assignmentRole: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    assignmentStatus: {
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    assignmentActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    smallPrimaryButton: {
      backgroundColor: colors.primary,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 10,
    },
    smallPrimaryButtonText: {
      color: colors.textInverse,
      fontSize: 12,
      fontWeight: '700',
    },
    smallSecondaryButton: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 10,
    },
    smallSecondaryButtonText: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '700',
    },
    emptyInline: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end',
    },
    modalCard: {
      maxHeight: '84%',
      backgroundColor: colors.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 24,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 12,
    },
    modalHeaderText: {
      flex: 1,
      gap: 2,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
    },
    modalSubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    closeText: {
      fontSize: 14,
      color: colors.primary,
      fontWeight: '700',
    },
    filterRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 12,
    },
    filterChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    filterChipActive: {
      borderColor: colors.primary,
      backgroundColor: `${colors.primary}18`,
    },
    filterChipText: {
      fontSize: 12,
      color: colors.textSecondary,
      fontWeight: '700',
    },
    filterChipTextActive: {
      color: colors.primary,
    },
    candidateList: {
      gap: 12,
      paddingBottom: 16,
    },
    candidateCard: {
      backgroundColor: colors.background,
      borderRadius: 16,
      padding: 14,
      gap: 8,
    },
    candidateHeader: {
      gap: 4,
    },
    candidateHeaderText: {
      gap: 2,
    },
    candidateName: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
    },
    candidateMeta: {
      fontSize: 12,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    candidateBadge: {
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    candidateDetail: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    candidateReason: {
      fontSize: 12,
      color: colors.text,
      fontWeight: '600',
    },
    primaryButton: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
    },
    primaryButtonText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textInverse,
    },
    centerState: {
      padding: 24,
      alignItems: 'center',
      gap: 10,
    },
    centerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
    },
    centerText: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
    },
  });
