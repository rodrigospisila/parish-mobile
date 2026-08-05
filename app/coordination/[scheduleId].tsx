import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
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
  RotationResponse,
  ScheduleCandidateMember,
  ScheduleCandidatesResponse,
  ScheduleStatus,
  checkInCoordinatorAssignment,
  createScheduleAssignment,
  generateScheduleRotation,
  getCoordinatorScheduleDetail,
  getScheduleCandidates,
  notifyScheduleTeam,
  removeCoordinatorAssignment,
  replaceCoordinatorAssignment,
  undoCheckInCoordinatorAssignment,
  updateSchedulePastorals,
  updateScheduleStatus,
} from '../../src/services/coordinatorService';
import { formatToBrazilianDate } from '../../src/utils/dateUtils';

type CandidateFilter = 'all' | CandidateRecommendationLevel;
type PickerMode = 'replace' | 'add';

const STATUS_OPTIONS: { value: ScheduleStatus; label: string }[] = [
  { value: 'OPEN', label: 'Aberta' },
  { value: 'CLOSED', label: 'Fechada' },
  { value: 'COMPLETED', label: 'Concluída' },
  { value: 'CANCELLED', label: 'Cancelada' },
];

/** Link do WhatsApp a partir de um telefone BR (adiciona 55 quando faltar DDI). */
const whatsappUrl = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  const full = digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`;
  return `https://wa.me/${full}`;
};

export default function CoordinationScheduleDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ scheduleId: string | string[] }>();
  const scheduleId = Array.isArray(params.scheduleId) ? params.scheduleId[0] : params.scheduleId;
  const [schedule, setSchedule] = useState<CoordinatorScheduleDetail | null>(null);
  const [candidates, setCandidates] = useState<ScheduleCandidatesResponse | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<CoordinatorScheduleAssignment | null>(null);
  const [pickerMode, setPickerMode] = useState<PickerMode>('replace');
  const [addPastoralId, setAddPastoralId] = useState<string | null>(null);
  const [addRole, setAddRole] = useState('');
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const [candidateFilter, setCandidateFilter] = useState<CandidateFilter>('RECOMMENDED');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCandidatesLoading, setIsCandidatesLoading] = useState(false);
  const [actionAssignmentId, setActionAssignmentId] = useState<string | null>(null);
  const [pickingMemberId, setPickingMemberId] = useState<string | null>(null);
  const [isNotifyModalVisible, setIsNotifyModalVisible] = useState(false);
  const [notifyMessage, setNotifyMessage] = useState('');
  const [isSendingNotify, setIsSendingNotify] = useState(false);
  // ⚡ Preencher automático (rodízio da escala)
  const [isRotationVisible, setIsRotationVisible] = useState(false);
  const [rotationPreview, setRotationPreview] = useState<RotationResponse | null>(null);
  const [rotationCouples, setRotationCouples] = useState(true);
  const [isRotationLoading, setIsRotationLoading] = useState(false);
  // ✏️ Vagas por pastoral
  const [isSlotsVisible, setIsSlotsVisible] = useState(false);
  const [slotsDraft, setSlotsDraft] = useState<
    Array<{ communityPastoralId: string; name: string; requiredPeople: number }>
  >([]);
  const [isSavingSlots, setIsSavingSlots] = useState(false);
  const [isSavingStatus, setIsSavingStatus] = useState(false);
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

  const loadCandidates = useCallback(async () => {
    if (!scheduleId) return;
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
  }, [scheduleId]);

  const openReplacement = useCallback(
    (assignment: CoordinatorScheduleAssignment) => {
      setPickerMode('replace');
      setSelectedAssignment(assignment);
      setAddPastoralId(null);
      setCandidateFilter('RECOMMENDED');
      setIsPickerVisible(true);
      void loadCandidates();
    },
    [loadCandidates],
  );

  const openAddMember = useCallback(
    (pastoralId: string | null, defaultRole?: string) => {
      setPickerMode('add');
      setSelectedAssignment(null);
      setAddPastoralId(pastoralId);
      setAddRole(defaultRole || '');
      setCandidateFilter('RECOMMENDED');
      setIsPickerVisible(true);
      void loadCandidates();
    },
    [loadCandidates],
  );

  const closePicker = useCallback(() => {
    setIsPickerVisible(false);
    setSelectedAssignment(null);
    setCandidates(null);
    setAddPastoralId(null);
    setAddRole('');
  }, []);

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

  const handleRemove = useCallback(
    (assignment: CoordinatorScheduleAssignment) => {
      Alert.alert(
        'Remover da escala',
        `Remover ${assignment.member.fullName} desta escala?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Remover',
            style: 'destructive',
            onPress: async () => {
              setActionAssignmentId(assignment.id);
              try {
                await removeCoordinatorAssignment(assignment.id);
                await loadSchedule(true);
              } catch (error) {
                Alert.alert('Erro', error instanceof Error ? error.message : 'Tente novamente.');
              } finally {
                setActionAssignmentId(null);
              }
            },
          },
        ],
      );
    },
    [loadSchedule],
  );

  const handleReplace = useCallback(
    async (memberId: string) => {
      if (!selectedAssignment) {
        return;
      }

      const previousName = selectedAssignment.member.fullName;
      setPickingMemberId(memberId);
      try {
        const result = await replaceCoordinatorAssignment(selectedAssignment.id, memberId);
        const newName = (result as any)?.member?.fullName || 'novo membro';
        closePicker();
        await loadSchedule(true);
        Alert.alert('Substituição realizada', `${previousName} foi substituído(a) por ${newName}.`);
      } catch (error) {
        console.error('Erro ao substituir membro da escala:', error);
        Alert.alert('Erro', 'Não foi possível realizar a substituição. Tente novamente.');
      } finally {
        setPickingMemberId(null);
      }
    },
    [closePicker, loadSchedule, selectedAssignment],
  );

  /** Regra "casais servem juntos" da pastoral (fonte: pastorais da escala). */
  const coupleRuleFor = useCallback(
    (pastoralId?: string | null) => {
      if (!pastoralId) return false;
      const source = schedule?.pastorals?.length ? schedule.pastorals : schedule?.event.eventPastorals;
      return Boolean(
        source?.find((p) => p.communityPastoralId === pastoralId)?.communityPastoral
          ?.scheduleCouplesTogether,
      );
    },
    [schedule],
  );

  const assignMember = useCallback(
    async (member: ScheduleCandidateMember, role: string, pastoralId: string | null) => {
      if (!scheduleId) return;
      await createScheduleAssignment({
        scheduleId,
        memberId: member.id,
        role,
        communityPastoralId: pastoralId || undefined,
      });
    },
    [scheduleId],
  );

  const handleAdd = useCallback(
    async (member: ScheduleCandidateMember) => {
      if (!scheduleId || !schedule) return;
      const role = addRole.trim();
      if (!role) {
        Alert.alert('Função obrigatória', 'Informe a função para esta vaga (ex.: Leitor, Cantor).');
        return;
      }

      // 💍 Cônjuge candidato da MESMA pastoral, ainda não escalado, com a regra ativa
      const spouse = member.spouseId
        ? candidates?.members.find((m) => m.id === member.spouseId)
        : null;
      const spouseSamePastoral =
        spouse && addPastoralId
          ? spouse.pastorals.some((p) => p.communityPastoralId === addPastoralId)
          : false;
      const spouseAssigned = spouse
        ? schedule.assignments.some((a) => a.member.id === spouse.id)
        : false;
      const pastoralInfo = candidates?.pastorals.find(
        (p) => p.communityPastoralId === addPastoralId,
      );
      const remaining =
        pastoralInfo && pastoralInfo.requiredPeople > 0
          ? Math.max(0, pastoralInfo.requiredPeople - pastoralInfo.assignedCount)
          : null;
      const ruleOn = coupleRuleFor(addPastoralId);

      const finish = async () => {
        closePicker();
        await loadSchedule(true);
      };

      setPickingMemberId(member.id);
      try {
        if (ruleOn && spouse && spouseSamePastoral && !spouseAssigned) {
          if (remaining === null || remaining >= 2) {
            // Oferece escalar o casal junto
            Alert.alert(
              '💍 Escalar o casal junto?',
              `${member.fullName} é casado(a) com ${spouse.fullName}, também candidato(a) desta pastoral. Há vagas para os dois.`,
              [
                {
                  text: 'Só este membro',
                  onPress: async () => {
                    try {
                      await assignMember(member, role, addPastoralId);
                      Alert.alert(
                        '💍 Atenção',
                        `${member.fullName} ficou escalado(a) sem o cônjuge (${spouse.fullName}).`,
                      );
                      await finish();
                    } catch (error) {
                      Alert.alert('Erro', error instanceof Error ? error.message : 'Tente novamente.');
                    } finally {
                      setPickingMemberId(null);
                    }
                  },
                },
                {
                  text: '💍 Escalar casal (2)',
                  onPress: async () => {
                    try {
                      await assignMember(member, role, addPastoralId);
                      await assignMember(spouse, role, addPastoralId);
                      Alert.alert(
                        'Casal escalado',
                        `💍 ${member.fullName} e ${spouse.fullName} escalados juntos.`,
                      );
                      await finish();
                    } catch (error) {
                      Alert.alert('Erro', error instanceof Error ? error.message : 'Tente novamente.');
                    } finally {
                      setPickingMemberId(null);
                    }
                  },
                },
                { text: 'Cancelar', style: 'cancel', onPress: () => setPickingMemberId(null) },
              ],
            );
            return;
          }
          // Só 1 vaga: escala e avisa
          await assignMember(member, role, addPastoralId);
          Alert.alert(
            '💍 Sem vaga para o casal',
            `${member.fullName} foi escalado(a), mas só havia 1 vaga — o cônjuge (${spouse.fullName}) ficou de fora.`,
          );
          await finish();
          return;
        }

        await assignMember(member, role, addPastoralId);
        Alert.alert('Membro escalado', `${member.fullName} entrou na escala como ${role}.`);
        await finish();
      } catch (error) {
        Alert.alert('Erro', error instanceof Error ? error.message : 'Tente novamente.');
      } finally {
        setPickingMemberId(null);
      }
    },
    [addPastoralId, addRole, assignMember, candidates, closePicker, coupleRuleFor, loadSchedule, schedule, scheduleId],
  );

  /** 💍 Escala o cônjuge do membro em 1 toque (mesma pastoral e função). */
  const handleQuickAssignSpouse = useCallback(
    async (assignment: CoordinatorScheduleAssignment) => {
      if (!scheduleId || !assignment.member.spouseId) return;
      setActionAssignmentId(assignment.id);
      try {
        await createScheduleAssignment({
          scheduleId,
          memberId: assignment.member.spouseId,
          role: assignment.role,
          communityPastoralId: assignment.communityPastoral?.id || undefined,
        });
        Alert.alert(
          'Casal completo',
          `💍 ${assignment.member.spouse?.fullName || 'Cônjuge'} escalado(a) junto de ${assignment.member.fullName}.`,
        );
        await loadSchedule(true);
      } catch (error) {
        Alert.alert('Erro', error instanceof Error ? error.message : 'Tente novamente.');
      } finally {
        setActionAssignmentId(null);
      }
    },
    [loadSchedule, scheduleId],
  );

  const handleStatusChange = useCallback(
    async (status: ScheduleStatus) => {
      if (!scheduleId || !schedule || schedule.status === status) return;
      setIsSavingStatus(true);
      try {
        await updateScheduleStatus(scheduleId, status);
        await loadSchedule(true);
      } catch (error) {
        Alert.alert('Erro', error instanceof Error ? error.message : 'Tente novamente.');
      } finally {
        setIsSavingStatus(false);
      }
    },
    [loadSchedule, schedule, scheduleId],
  );

  // ===== ⚡ Preencher automático =====
  const openRotation = useCallback(() => {
    setRotationPreview(null);
    setRotationCouples(true);
    setIsRotationVisible(true);
  }, []);

  const runRotation = useCallback(
    async (dryRun: boolean) => {
      if (!scheduleId) return;
      setIsRotationLoading(true);
      try {
        const response = await generateScheduleRotation({
          scheduleIds: [scheduleId],
          dryRun,
          couplesTogether: rotationCouples,
        });
        setRotationPreview(response);
        if (!dryRun) {
          const warnings = response.preview.flatMap((item) => item.coupleWarnings ?? []);
          setIsRotationVisible(false);
          setRotationPreview(null);
          await loadSchedule(true);
          Alert.alert(
            'Rodízio publicado',
            `${response.created ?? 0} atribuição(ões) criada(s) como pendentes.` +
              (warnings.length > 0 ? `\n\n💍 ${warnings.join('\n💍 ')}` : ''),
          );
        }
      } catch (error) {
        Alert.alert('Erro', error instanceof Error ? error.message : 'Tente novamente.');
      } finally {
        setIsRotationLoading(false);
      }
    },
    [loadSchedule, rotationCouples, scheduleId],
  );

  // ===== ✏️ Vagas =====
  const openSlots = useCallback(() => {
    const source = schedule?.pastorals?.length ? schedule.pastorals : schedule?.event.eventPastorals;
    setSlotsDraft(
      (source ?? []).map((pastoral) => ({
        communityPastoralId: pastoral.communityPastoralId,
        name: pastoral.communityPastoral.globalPastoral?.name || 'Pastoral',
        requiredPeople: Number(pastoral.requiredPeople || 0),
      })),
    );
    setIsSlotsVisible(true);
  }, [schedule]);

  const handleSaveSlots = useCallback(async () => {
    if (!scheduleId) return;
    setIsSavingSlots(true);
    try {
      await updateSchedulePastorals(
        scheduleId,
        slotsDraft.map((item) => ({
          communityPastoralId: item.communityPastoralId,
          requiredPeople: item.requiredPeople,
        })),
      );
      setIsSlotsVisible(false);
      await loadSchedule(true);
      Alert.alert('Vagas atualizadas', 'As vagas por pastoral foram salvas nesta escala.');
    } catch (error) {
      Alert.alert('Erro', error instanceof Error ? error.message : 'Tente novamente.');
    } finally {
      setIsSavingSlots(false);
    }
  }, [loadSchedule, scheduleId, slotsDraft]);

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

    // Fonte preferida: pastorais da PRÓPRIA escala (vagas/regra por escala)
    const source = schedule.pastorals?.length ? schedule.pastorals : schedule.event.eventPastorals;

    const sections = (source ?? []).map((pastoral) => {
      const assignments = schedule.assignments.filter(
        (assignment) => assignment.communityPastoral?.id === pastoral.communityPastoralId,
      );

      return {
        key: pastoral.communityPastoralId,
        title: pastoral.communityPastoral.globalPastoral?.name || 'Pastoral',
        subtitle: pastoral.role || 'Equipe vinculada à escala',
        requiredPeople: pastoral.requiredPeople,
        defaultRole: pastoral.role || '',
        couplesTogether: Boolean(pastoral.communityPastoral.scheduleCouplesTogether),
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
        defaultRole: '',
        couplesTogether: false,
        assignments: unscopedAssignments,
      });
    }

    return sections;
  }, [schedule]);

  const kpis = useMemo(() => {
    const assignments = schedule?.assignments ?? [];
    return {
      total: assignments.length,
      pending: assignments.filter((a) => a.status === 'PENDING').length,
      confirmed: assignments.filter((a) => a.status === 'CONFIRMED').length,
      checkedIn: assignments.filter((a) => a.checkedIn).length,
      swaps: assignments.filter((a) => (a.swapRequests?.length ?? 0) > 0).length,
    };
  }, [schedule]);

  const filteredCandidates = useMemo(() => {
    if (!candidates) {
      return [];
    }

    const pastoralScope =
      pickerMode === 'replace' ? selectedAssignment?.communityPastoral?.id : addPastoralId;

    return candidates.members.filter((candidate) => {
      if (pickerMode === 'replace' && candidate.id === selectedAssignment?.member.id) {
        return false;
      }

      // No modo adicionar, esconde quem já está na escala
      if (pickerMode === 'add' && schedule?.assignments.some((a) => a.member.id === candidate.id)) {
        return false;
      }

      if (
        pastoralScope &&
        pastoralScope !== 'general' &&
        !candidate.pastorals.some((pastoral) => pastoral.communityPastoralId === pastoralScope)
      ) {
        return false;
      }

      if (candidateFilter !== 'all' && candidate.recommendation.level !== candidateFilter) {
        return false;
      }

      return true;
    });
  }, [addPastoralId, candidateFilter, candidates, pickerMode, schedule, selectedAssignment]);

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

          {/* Status da escala */}
          <View style={styles.statusRow}>
            {STATUS_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[styles.filterChip, schedule.status === option.value && styles.filterChipActive]}
                disabled={isSavingStatus}
                onPress={() => handleStatusChange(option.value)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    schedule.status === option.value && styles.filterChipTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Ações principais */}
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.autoFillButton} onPress={openRotation}>
              <Text style={styles.autoFillButtonText}>⚡ Preencher automático</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.notifyTeamButton}
              onPress={() => setIsNotifyModalVisible(true)}
            >
              <Text style={styles.notifyTeamButtonText}>📣 Avisar equipe</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.notifyTeamButton} onPress={openSlots}>
              <Text style={styles.notifyTeamButtonText}>✏️ Vagas</Text>
            </TouchableOpacity>
          </View>

          {/* KPIs */}
          <View style={styles.kpiRow}>
            <View style={styles.kpiItem}>
              <Text style={styles.kpiValue}>{kpis.total}</Text>
              <Text style={styles.kpiLabel}>Escalados</Text>
            </View>
            <View style={styles.kpiItem}>
              <Text style={[styles.kpiValue, { color: colors.warning }]}>{kpis.pending}</Text>
              <Text style={styles.kpiLabel}>Pendentes</Text>
            </View>
            <View style={styles.kpiItem}>
              <Text style={[styles.kpiValue, { color: colors.primary }]}>{kpis.confirmed}</Text>
              <Text style={styles.kpiLabel}>Confirm.</Text>
            </View>
            <View style={styles.kpiItem}>
              <Text style={[styles.kpiValue, { color: colors.success }]}>{kpis.checkedIn}</Text>
              <Text style={styles.kpiLabel}>Presentes</Text>
            </View>
            {kpis.swaps > 0 ? (
              <View style={styles.kpiItem}>
                <Text style={[styles.kpiValue, { color: '#6d43a5' }]}>{kpis.swaps}</Text>
                <Text style={styles.kpiLabel}>🔁 Trocas</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pastorais e vagas</Text>
          <View style={styles.summaryGrid}>
            {assignmentSections.map((section) => {
              const open =
                section.requiredPeople > 0
                  ? Math.max(0, section.requiredPeople - section.assignments.length)
                  : null;
              return (
                <View
                  key={section.key}
                  style={[styles.summaryCard, open ? styles.summaryCardOpen : null]}
                >
                  <Text style={styles.summaryTitle}>
                    {section.title}
                    {section.couplesTogether ? ' 💍' : ''}
                  </Text>
                  <Text style={styles.summarySubtitle}>{section.subtitle}</Text>
                  <Text style={styles.summaryValue}>
                    {section.assignments.length}
                    {section.requiredPeople > 0 ? `/${section.requiredPeople}` : ''}
                  </Text>
                  {open ? (
                    <TouchableOpacity
                      style={styles.openSlotButton}
                      onPress={() => openAddMember(section.key === 'general' ? null : section.key, section.defaultRole)}
                    >
                      <Text style={styles.openSlotButtonText}>
                        ➕ Preencher {open} vaga{open > 1 ? 's' : ''} em aberto
                      </Text>
                    </TouchableOpacity>
                  ) : section.requiredPeople > 0 ? (
                    <Text style={styles.summaryComplete}>✓ Completa</Text>
                  ) : null}
                </View>
              );
            })}
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
                  <TouchableOpacity
                    style={styles.addMemberButton}
                    onPress={() => openAddMember(section.key === 'general' ? null : section.key, section.defaultRole)}
                  >
                    <Text style={styles.addMemberButtonText}>➕ Escalar</Text>
                  </TouchableOpacity>
                </View>

                {section.assignments.length === 0 ? (
                  <Text style={styles.emptyInline}>Sem membros atribuídos nesta equipe.</Text>
                ) : (
                  section.assignments.map((assignment) => {
                    const swap = assignment.swapRequests?.[0];
                    const spouseTogether =
                      assignment.member.spouseId &&
                      schedule.assignments.some((a) => a.member.id === assignment.member.spouseId);
                    const showSpouseAction =
                      !spouseTogether &&
                      assignment.member.spouseId &&
                      assignment.spouseInSamePastoral &&
                      coupleRuleFor(assignment.communityPastoral?.id);

                    return (
                      <View key={assignment.id} style={styles.assignmentCard}>
                        <View style={styles.assignmentHeader}>
                          <View style={styles.assignmentText}>
                            <Text style={styles.assignmentName}>
                              {assignment.member.fullName}
                              {spouseTogether ? ' 💍' : ''}
                            </Text>
                            <Text style={styles.assignmentRole}>{assignment.role}</Text>
                            {assignment.member.phone ? (
                              <TouchableOpacity
                                onPress={() => Linking.openURL(whatsappUrl(assignment.member.phone!))}
                                hitSlop={6}
                              >
                                <Text style={styles.whatsappLink}>
                                  💬 {assignment.member.phone}
                                </Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                          <Text style={[styles.assignmentStatus, { color: getStatusColor(assignment) }]}>
                            {getStatusLabel(assignment)}
                          </Text>
                        </View>

                        {swap ? (
                          <View style={styles.swapNote}>
                            <Text style={styles.swapNoteText}>
                              🔁 Pediu troca{swap.message ? `: “${swap.message}”` : ' (sem mensagem)'}
                            </Text>
                          </View>
                        ) : null}

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

                          {showSpouseAction ? (
                            <TouchableOpacity
                              style={styles.coupleButton}
                              onPress={() => handleQuickAssignSpouse(assignment)}
                              disabled={actionAssignmentId === assignment.id}
                            >
                              <Text style={styles.coupleButtonText}>
                                💍 Escalar cônjuge
                                {assignment.member.spouse?.fullName
                                  ? `: ${assignment.member.spouse.fullName.split(' ')[0]}`
                                  : ''}
                              </Text>
                            </TouchableOpacity>
                          ) : null}

                          <TouchableOpacity
                            style={styles.smallSecondaryButton}
                            onPress={() => openReplacement(assignment)}
                          >
                            <Text style={styles.smallSecondaryButtonText}>Substituir</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.smallDangerButton}
                            onPress={() => handleRemove(assignment)}
                            disabled={actionAssignmentId === assignment.id}
                          >
                            <Text style={styles.smallDangerButtonText}>Remover</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Picker de candidatos: substituição OU preencher vaga */}
      <Modal animationType="slide" transparent visible={isPickerVisible} onRequestClose={closePicker}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderText}>
                <Text style={styles.modalTitle}>
                  {pickerMode === 'replace' ? 'Substituição rápida' : 'Escalar membro'}
                </Text>
                <Text style={styles.modalSubtitle}>
                  {pickerMode === 'replace'
                    ? `${selectedAssignment?.member.fullName} • ${selectedAssignment?.role}`
                    : 'Escolha o membro para preencher a vaga'}
                </Text>
              </View>
              <TouchableOpacity onPress={closePicker}>
                <Text style={styles.closeText}>Fechar</Text>
              </TouchableOpacity>
            </View>

            {pickerMode === 'add' ? (
              <TextInput
                style={styles.roleInput}
                placeholder="Função para esta vaga (ex.: Leitor, Cantor)"
                placeholderTextColor={colors.textSecondary}
                value={addRole}
                onChangeText={setAddRole}
                maxLength={60}
              />
            ) : null}

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
                  {filteredCandidates.map((candidate) => {
                    const spouseCandidate = candidate.spouseId
                      ? candidates?.members.find((m) => m.id === candidate.spouseId)
                      : null;
                    const pastoralScope =
                      pickerMode === 'replace'
                        ? selectedAssignment?.communityPastoral?.id
                        : addPastoralId;
                    const spouseSamePastoral =
                      spouseCandidate && pastoralScope
                        ? spouseCandidate.pastorals.some(
                            (p) => p.communityPastoralId === pastoralScope,
                          )
                        : false;

                    return (
                      <View key={candidate.id} style={styles.candidateCard}>
                        <View style={styles.candidateHeader}>
                          <View style={styles.candidateHeaderText}>
                            <Text style={styles.candidateName}>
                              {candidate.fullName}
                              {spouseSamePastoral ? ' 💍' : ''}
                            </Text>
                            <Text style={styles.candidateMeta}>
                              Score {candidate.recommendation.score} • {candidate.availability.summary[0]}
                            </Text>
                            {spouseSamePastoral && spouseCandidate ? (
                              <Text style={styles.candidateCouple}>
                                💍 Cônjuge: {spouseCandidate.fullName}
                              </Text>
                            ) : null}
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
                          disabled={pickingMemberId === candidate.id}
                          onPress={() =>
                            pickerMode === 'replace'
                              ? handleReplace(candidate.id)
                              : handleAdd(candidate)
                          }
                        >
                          <Text style={styles.primaryButtonText}>
                            {pickingMemberId === candidate.id
                              ? 'Processando...'
                              : pickerMode === 'replace'
                                ? 'Substituir por este membro'
                                : 'Escalar este membro'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ⚡ Preencher automático */}
      <Modal
        animationType="slide"
        transparent
        visible={isRotationVisible}
        onRequestClose={() => setIsRotationVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderText}>
                <Text style={styles.modalTitle}>⚡ Preencher automático</Text>
                <Text style={styles.modalSubtitle}>
                  Sugere membros para as vagas em aberto pelas regras do rodízio, sem alterar quem já está
                  escalado.
                </Text>
              </View>
              <TouchableOpacity onPress={() => setIsRotationVisible(false)}>
                <Text style={styles.closeText}>Fechar</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.coupleToggle}
              onPress={() => {
                setRotationCouples((prev) => !prev);
                setRotationPreview(null);
              }}
            >
              <Text style={styles.coupleToggleText}>
                {rotationCouples ? '☑' : '☐'} 💍 Escalar casais juntos (nas pastorais com a regra ativa)
              </Text>
            </TouchableOpacity>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.rotationScroll}>
              {rotationPreview ? (
                rotationPreview.preview.map((item) => (
                  <View key={item.scheduleId} style={styles.rotationCard}>
                    {item.suggestions.length > 0 ? (
                      item.suggestions.map((suggestion, index) => {
                        const coupleTogether = suggestion.spouseId
                          ? item.suggestions.some((s2) => s2.memberId === suggestion.spouseId)
                          : false;
                        return (
                          <Text key={index} style={styles.rotationSuggestion}>
                            • {suggestion.memberName} — {suggestion.role}
                            {coupleTogether ? ' 💍' : ''}
                          </Text>
                        );
                      })
                    ) : item.allFilled ? (
                      <Text style={[styles.rotationNote, { color: colors.success }]}>
                        ✓ Todas as vagas desta escala já estão preenchidas.
                      </Text>
                    ) : item.noPastorals ? (
                      <Text style={styles.rotationNote}>⚠️ Sem pastorais vinculadas a esta escala.</Text>
                    ) : item.noSlots ? (
                      <Text style={styles.rotationNote}>
                        ⚠️ As pastorais estão com 0 vagas — ajuste em “✏️ Vagas”.
                      </Text>
                    ) : (
                      <Text style={styles.rotationNote}>Sem candidatos elegíveis para as vagas.</Text>
                    )}

                    {(item.coupleWarnings?.length ?? 0) > 0
                      ? item.coupleWarnings!.map((warning, index) => (
                          <Text key={`w-${index}`} style={styles.rotationWarning}>
                            💍 {warning}
                          </Text>
                        ))
                      : null}
                    {item.gaps.length > 0 ? (
                      <Text style={styles.rotationWarning}>
                        ⚠️ Vagas sem candidato:{' '}
                        {item.gaps.map((gap) => `${gap.role} (${gap.missing})`).join(', ')}
                      </Text>
                    ) : null}
                  </View>
                ))
              ) : (
                <Text style={styles.rotationNote}>
                  Gere a prévia para revisar as sugestões antes de publicar.
                </Text>
              )}
            </ScrollView>

            <View style={styles.rotationActions}>
              <TouchableOpacity
                style={styles.smallSecondaryButton}
                disabled={isRotationLoading}
                onPress={() => runRotation(true)}
              >
                <Text style={styles.smallSecondaryButtonText}>
                  {isRotationLoading ? 'Gerando...' : 'Gerar prévia'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, styles.rotationPublish]}
                disabled={
                  isRotationLoading ||
                  !rotationPreview ||
                  rotationPreview.preview.every((item) => item.suggestions.length === 0)
                }
                onPress={() => runRotation(false)}
              >
                <Text style={styles.primaryButtonText}>Publicar atribuições</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ✏️ Vagas por pastoral */}
      <Modal
        animationType="slide"
        transparent
        visible={isSlotsVisible}
        onRequestClose={() => setIsSlotsVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderText}>
                <Text style={styles.modalTitle}>Vagas por pastoral</Text>
                <Text style={styles.modalSubtitle}>
                  Valem só para esta escala. O rodízio usa esses números para sugerir membros.
                </Text>
              </View>
              <TouchableOpacity onPress={() => setIsSlotsVisible(false)}>
                <Text style={styles.closeText}>Fechar</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {slotsDraft.map((item, index) => (
                <View key={item.communityPastoralId} style={styles.slotRow}>
                  <Text style={styles.slotName}>{item.name}</Text>
                  <View style={styles.slotStepper}>
                    <TouchableOpacity
                      style={styles.slotStepButton}
                      onPress={() =>
                        setSlotsDraft((prev) =>
                          prev.map((entry, entryIndex) =>
                            entryIndex === index
                              ? { ...entry, requiredPeople: Math.max(0, entry.requiredPeople - 1) }
                              : entry,
                          ),
                        )
                      }
                    >
                      <Text style={styles.slotStepButtonText}>−</Text>
                    </TouchableOpacity>
                    <Text style={styles.slotValue}>{item.requiredPeople}</Text>
                    <TouchableOpacity
                      style={styles.slotStepButton}
                      onPress={() =>
                        setSlotsDraft((prev) =>
                          prev.map((entry, entryIndex) =>
                            entryIndex === index
                              ? { ...entry, requiredPeople: entry.requiredPeople + 1 }
                              : entry,
                          ),
                        )
                      }
                    >
                      <Text style={styles.slotStepButtonText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={styles.primaryButton}
              disabled={isSavingSlots || slotsDraft.length === 0}
              onPress={handleSaveSlots}
            >
              <Text style={styles.primaryButtonText}>
                {isSavingSlots ? 'Salvando...' : 'Salvar vagas'}
              </Text>
            </TouchableOpacity>
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
    statusRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 10,
    },
    headerActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 10,
    },
    autoFillButton: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    autoFillButtonText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textInverse,
    },
    notifyTeamButton: {
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
    kpiRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 12,
    },
    kpiItem: {
      flex: 1,
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 12,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    kpiValue: { fontSize: 17, fontWeight: '700', color: colors.text },
    kpiLabel: {
      fontSize: 10,
      color: colors.textSecondary,
      marginTop: 2,
      textTransform: 'uppercase',
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
    roleInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 12,
      fontSize: 14,
      color: colors.text,
      marginBottom: 12,
      backgroundColor: colors.background,
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
    summaryCardOpen: {
      borderColor: colors.warning,
      borderLeftWidth: 4,
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
    summaryComplete: {
      marginTop: 6,
      fontSize: 13,
      fontWeight: '700',
      color: colors.success,
    },
    openSlotButton: {
      marginTop: 10,
      alignSelf: 'flex-start',
      backgroundColor: `${colors.warning}22`,
      borderWidth: 1,
      borderColor: colors.warning,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    openSlotButtonText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.warning,
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
      alignItems: 'center',
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
    addMemberButton: {
      backgroundColor: `${colors.primary}18`,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    addMemberButtonText: {
      fontSize: 12,
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
    whatsappLink: {
      fontSize: 13,
      color: colors.primary,
      fontWeight: '600',
      marginTop: 2,
    },
    assignmentStatus: {
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    swapNote: {
      backgroundColor: '#6d43a51a',
      borderWidth: 1,
      borderColor: '#6d43a555',
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    swapNoteText: {
      fontSize: 12,
      color: '#6d43a5',
      fontWeight: '600',
      lineHeight: 17,
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
    smallDangerButton: {
      backgroundColor: `${colors.error}15`,
      borderWidth: 1,
      borderColor: colors.error,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 10,
    },
    smallDangerButtonText: {
      color: colors.error,
      fontSize: 12,
      fontWeight: '700',
    },
    coupleButton: {
      backgroundColor: '#c45f8318',
      borderWidth: 1,
      borderColor: '#c45f83',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 10,
    },
    coupleButtonText: {
      color: '#c45f83',
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
      maxHeight: '86%',
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
    candidateCouple: {
      fontSize: 12,
      color: '#c45f83',
      fontWeight: '700',
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
    coupleToggle: {
      marginBottom: 10,
    },
    coupleToggleText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    rotationScroll: {
      maxHeight: 320,
    },
    rotationCard: {
      backgroundColor: colors.background,
      borderRadius: 14,
      padding: 12,
      gap: 6,
      marginBottom: 10,
    },
    rotationSuggestion: {
      fontSize: 14,
      color: colors.text,
    },
    rotationNote: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 19,
    },
    rotationWarning: {
      fontSize: 12.5,
      color: colors.warning,
      fontWeight: '600',
      lineHeight: 18,
    },
    rotationActions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 12,
      alignItems: 'center',
    },
    rotationPublish: {
      flex: 1,
      marginTop: 0,
    },
    slotRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    slotName: {
      flex: 1,
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
    },
    slotStepper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    slotStepButton: {
      width: 36,
      height: 36,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    slotStepButtonText: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    slotValue: {
      minWidth: 28,
      textAlign: 'center',
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
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
