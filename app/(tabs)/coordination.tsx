import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../src/context/AuthContext';
import { useColors } from '../../src/context/ThemeContext';
import {
  CoordinatorAssignmentSummary,
  CoordinatorScheduleSummary,
  getCoordinatorScheduleOverview,
} from '../../src/services/coordinatorService';
import { formatToBrazilianDate } from '../../src/utils/dateUtils';

type AssignmentFilter = 'all' | 'PENDING' | 'CONFIRMED' | 'DECLINED' | 'CHECKED_IN';
type DateRange = 'next7' | 'next30' | 'next90' | 'all';

const coordinatorRoles = [
  'SYSTEM_ADMIN',
  'DIOCESAN_ADMIN',
  'PARISH_ADMIN',
  'COMMUNITY_COORDINATOR',
  'PASTORAL_COORDINATOR',
];

export default function CoordinationScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user } = useAuth();
  const [schedules, setSchedules] = useState<CoordinatorScheduleSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>('all');
  const [dateRange, setDateRange] = useState<DateRange>('next30');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  // Mesma regra da tab: papel gestor OU coordenação/vice de alguma pastoral
  const coordinatorPastoralRoles = ['COORDINATOR', 'Coordenador', 'Vice-Coordenador'];
  const isCoordinator =
    (!!user?.role && coordinatorRoles.includes(user.role)) ||
    !!user?.pastorals?.some((pastoral) => coordinatorPastoralRoles.includes(pastoral.role));
  const styles = createStyles(colors);

  const getDateRangeParams = useCallback(() => {
    if (dateRange === 'all') return {};
    const now = new Date();
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    const to = new Date(now);
    if (dateRange === 'next7') to.setDate(to.getDate() + 7);
    else if (dateRange === 'next30') to.setDate(to.getDate() + 30);
    else if (dateRange === 'next90') to.setDate(to.getDate() + 90);
    to.setHours(23, 59, 59, 999);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [dateRange]);

  const loadOverview = useCallback(
    async (refresh = false) => {
      if (!isCoordinator) {
        setSchedules([]);
        setIsLoading(false);
        return;
      }

      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const data = await getCoordinatorScheduleOverview(getDateRangeParams());
        setSchedules(data);
      } catch (error) {
        console.error('Erro ao carregar painel de coordenacao:', error);
        setSchedules([]);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [isCoordinator, getDateRangeParams],
  );

  useFocusEffect(
    useCallback(() => {
      loadOverview();
    }, [loadOverview]),
  );

  const summary = useMemo(
    () =>
      schedules.reduce(
        (acc, s) => {
          acc.total += s.counts.total;
          acc.pending += s.counts.pending;
          acc.confirmed += s.counts.confirmed;
          acc.declined += s.counts.declined;
          acc.checkedIn += s.counts.checkedIn;
          return acc;
        },
        { total: 0, pending: 0, confirmed: 0, declined: 0, checkedIn: 0 },
      ),
    [schedules],
  );

  const attendanceRate =
    summary.total > 0 ? Math.round((summary.checkedIn / summary.total) * 100) : 0;

  const sortedSchedules = useMemo(
    () => schedules.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [schedules],
  );

  const getFilteredAssignments = (assignments: CoordinatorAssignmentSummary[]) => {
    if (assignmentFilter === 'all') return assignments;
    if (assignmentFilter === 'CHECKED_IN') return assignments.filter((a) => a.checkedIn);
    return assignments.filter((a) => a.status === assignmentFilter);
  };

  const toggleExpand = (scheduleId: string) => {
    setExpandedIds((prev) => ({ ...prev, [scheduleId]: !prev[scheduleId] }));
  };

  const getStatusColor = (assignment: CoordinatorAssignmentSummary) => {
    if (assignment.checkedIn) return colors.success;
    if (assignment.status === 'CONFIRMED') return colors.success;
    if (assignment.status === 'DECLINED') return colors.error;
    return colors.warning;
  };

  const getStatusLabel = (assignment: CoordinatorAssignmentSummary) => {
    if (assignment.checkedIn) return 'Presente';
    if (assignment.status === 'CONFIRMED') return 'Confirmado';
    if (assignment.status === 'DECLINED') return 'Recusou';
    return 'Pendente';
  };

  if (!isCoordinator) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerState}>
          <Text style={styles.centerTitle}>Coordenação indisponível</Text>
          <Text style={styles.centerText}>
            Este painel aparece apenas para perfis com gestão de escalas.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => loadOverview(true)} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Painel operacional</Text>
          <Text style={styles.title}>Coordenação de escalas</Text>
          <Text style={styles.subtitle}>Pendências, confirmações e presenças da sua pastoral.</Text>
        </View>

        {/* Filtro de período */}
        <View style={styles.filterRow}>
          {([
            { label: 'Próximos 7 dias', value: 'next7' },
            { label: 'Próximos 30 dias', value: 'next30' },
            { label: 'Próximos 90 dias', value: 'next90' },
            { label: 'Todos', value: 'all' },
          ] as { label: string; value: DateRange }[]).map((item) => (
            <TouchableOpacity
              key={item.value}
              style={[styles.filterChip, dateRange === item.value && styles.filterChipActive]}
              onPress={() => setDateRange(item.value)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  dateRange === item.value && styles.filterChipTextActive,
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* KPI cards */}
        <View style={styles.kpiGrid}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{summary.total}</Text>
            <Text style={styles.kpiLabel}>Membros{'\n'}escalados</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{summary.pending}</Text>
            <Text style={styles.kpiLabel}>Pendentes</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{summary.confirmed}</Text>
            <Text style={styles.kpiLabel}>Confirmados</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{summary.declined}</Text>
            <Text style={styles.kpiLabel}>Declinados</Text>
          </View>
        </View>

        <View style={styles.kpiRowSingle}>
          <View style={[styles.kpiCardAccent, { borderLeftColor: colors.success }]}>
            <Text style={styles.kpiValue}>{summary.checkedIn}</Text>
            <Text style={styles.kpiLabel}>Check-ins</Text>
          </View>
          <View style={[styles.kpiCardAccent, { borderLeftColor: colors.highlight }]}>
            <Text style={styles.kpiValue}>{attendanceRate}%</Text>
            <Text style={styles.kpiLabel}>Taxa de presença</Text>
          </View>
        </View>

        {/* Filtro de status dos membros */}
        <View style={[styles.filterRow, styles.filterRowSpaced]}>
          {([
            { label: 'Todos', value: 'all' },
            { label: 'Pendentes', value: 'PENDING' },
            { label: 'Confirmados', value: 'CONFIRMED' },
            { label: 'Declinados', value: 'DECLINED' },
            { label: 'Presenças', value: 'CHECKED_IN' },
          ] as { label: string; value: AssignmentFilter }[]).map((item) => (
            <TouchableOpacity
              key={item.value}
              style={[
                styles.filterChip,
                assignmentFilter === item.value && styles.filterChipActive,
              ]}
              onPress={() => setAssignmentFilter(item.value)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  assignmentFilter === item.value && styles.filterChipTextActive,
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Lista de escalas */}
        {isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.centerText}>Carregando escalas...</Text>
          </View>
        ) : sortedSchedules.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Nenhuma escala encontrada</Text>
            <Text style={styles.centerText}>
              Ajuste o período ou aguarde novas movimentações.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {sortedSchedules.map((schedule) => {
              const isExpanded = expandedIds[schedule.scheduleId];
              const filtered = getFilteredAssignments(schedule.assignments);
              const shown = isExpanded ? filtered : filtered.slice(0, 3);

              return (
                <View key={schedule.scheduleId} style={styles.scheduleCard}>
                  <View style={styles.scheduleHeader}>
                    <View style={styles.scheduleHeaderText}>
                      <Text style={styles.scheduleTitle}>{schedule.title}</Text>
                      <Text style={styles.scheduleEvent}>{schedule.event.title}</Text>
                      <Text style={styles.scheduleMeta}>
                        {formatToBrazilianDate(schedule.date, 'dd/MM/yyyy')} às{' '}
                        {formatToBrazilianDate(schedule.date, 'HH:mm')}
                      </Text>
                      <Text style={styles.scheduleMeta}>
                        {schedule.event.location || 'Local a definir'}
                      </Text>
                      {(schedule.counts.total === 0 || (schedule.counts.swapsPending ?? 0) > 0) && (
                        <View style={styles.alertChipsRow}>
                          {schedule.counts.total === 0 && (
                            <View style={[styles.alertChip, styles.alertChipWarn]}>
                              <Text style={styles.alertChipWarnText}>⚠ Sem atribuições</Text>
                            </View>
                          )}
                          {(schedule.counts.swapsPending ?? 0) > 0 && (
                            <View style={[styles.alertChip, styles.alertChipSwap]}>
                              <Text style={styles.alertChipSwapText}>
                                🔁 {schedule.counts.swapsPending} troca(s)
                              </Text>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                    <View style={styles.rateBadge}>
                      <Text style={styles.rateBadgeValue}>
                        {Math.round(schedule.attendanceRate)}%
                      </Text>
                      <Text style={styles.rateBadgeLabel}>presença</Text>
                    </View>
                  </View>

                  {/* Mini KPIs por escala */}
                  <View style={styles.scheduleKpiRow}>
                    <View style={styles.scheduleKpiItem}>
                      <Text style={styles.scheduleKpiValue}>{schedule.counts.total}</Text>
                      <Text style={styles.scheduleKpiLabel}>Convocados</Text>
                    </View>
                    <View style={styles.scheduleKpiItem}>
                      <Text style={styles.scheduleKpiValue}>{schedule.counts.confirmed}</Text>
                      <Text style={styles.scheduleKpiLabel}>Confirmados</Text>
                    </View>
                    <View style={styles.scheduleKpiItem}>
                      <Text style={styles.scheduleKpiValue}>{schedule.counts.declined}</Text>
                      <Text style={styles.scheduleKpiLabel}>Declinados</Text>
                    </View>
                    <View style={styles.scheduleKpiItem}>
                      <Text style={styles.scheduleKpiValue}>{schedule.counts.checkedIn}</Text>
                      <Text style={styles.scheduleKpiLabel}>Presenças</Text>
                    </View>
                  </View>

                  {/* Membros */}
                  {filtered.length > 0 ? (
                    <View style={styles.assignmentList}>
                      {shown.map((a) => (
                        <View key={a.id} style={styles.assignmentRow}>
                          <View style={styles.assignmentInfo}>
                            <Text style={styles.assignmentName}>
                              {a.memberName}
                              {a.spouseId &&
                              schedule.assignments.some((x) => x.memberId === a.spouseId)
                                ? ' 💍'
                                : ''}
                            </Text>
                            <Text style={styles.assignmentRole}>{a.role}</Text>
                          </View>
                          {a.hasPendingSwap && (
                            <TouchableOpacity
                              hitSlop={8}
                              onPress={() =>
                                Alert.alert(
                                  '🔁 Pedido de troca',
                                  a.pendingSwapMessage
                                    ? `“${a.pendingSwapMessage}”`
                                    : `${a.memberName} pediu troca desta escala (sem mensagem).`,
                                )
                              }
                            >
                              <Text style={styles.swapMini}>🔁</Text>
                            </TouchableOpacity>
                          )}
                          <View style={styles.statusBadge}>
                            <View
                              style={[styles.statusDot, { backgroundColor: getStatusColor(a) }]}
                            />
                            <Text style={[styles.statusText, { color: getStatusColor(a) }]}>
                              {getStatusLabel(a)}
                            </Text>
                          </View>
                        </View>
                      ))}
                      {filtered.length > 3 && (
                        <TouchableOpacity
                          style={styles.expandButton}
                          onPress={() => toggleExpand(schedule.scheduleId)}
                        >
                          <Text style={styles.expandButtonText}>
                            {isExpanded
                              ? 'Ver menos'
                              : `Ver mais ${filtered.length - 3}`}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ) : (
                    <Text style={styles.noAssignments}>Nenhum membro com esse filtro.</Text>
                  )}

                  {/* Botão de operação */}
                  <TouchableOpacity
                    style={styles.openAction}
                    activeOpacity={0.85}
                    onPress={() =>
                      router.push({
                        pathname: '/coordination/[scheduleId]',
                        params: { scheduleId: schedule.scheduleId },
                      })
                    }
                  >
                    <Text style={styles.openActionText}>Abrir operação da escala</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    scrollView: { flex: 1 },
    header: {
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 12,
      gap: 4,
    },
    eyebrow: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    title: { fontSize: 26, fontWeight: '700', color: colors.text },
    subtitle: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
    filterRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingHorizontal: 18,
      marginBottom: 12,
    },
    filterRowSpaced: { marginTop: 4 },
    filterChip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    filterChipActive: {
      backgroundColor: `${colors.primary}18`,
      borderColor: colors.primary,
    },
    filterChipText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
    filterChipTextActive: { color: colors.primary },
    kpiGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      paddingHorizontal: 18,
      marginBottom: 10,
    },
    kpiCard: {
      flex: 1,
      minWidth: '22%',
      backgroundColor: colors.card,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    kpiValue: { fontSize: 22, fontWeight: '700', color: colors.text },
    kpiLabel: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 4,
      textTransform: 'uppercase',
    },
    kpiRowSingle: {
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: 18,
      marginBottom: 14,
    },
    kpiCardAccent: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: 14,
      padding: 14,
      borderLeftWidth: 4,
      borderWidth: 1,
      borderColor: colors.border,
    },
    list: { paddingHorizontal: 18, paddingBottom: 24, gap: 14 },
    scheduleCard: {
      backgroundColor: colors.card,
      borderRadius: 18,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 12,
    },
    scheduleHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    scheduleHeaderText: { flex: 1, gap: 2 },
    scheduleTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
    scheduleEvent: { fontSize: 14, color: colors.primary, fontWeight: '600' },
    scheduleMeta: { fontSize: 13, color: colors.textSecondary },
    rateBadge: {
      minWidth: 68,
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: colors.highlightLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rateBadgeValue: { fontSize: 17, fontWeight: '700', color: colors.highlight },
    rateBadgeLabel: { fontSize: 10, color: colors.highlight, textTransform: 'uppercase' },
    scheduleKpiRow: {
      flexDirection: 'row',
      gap: 8,
    },
    scheduleKpiItem: {
      flex: 1,
      alignItems: 'center',
      backgroundColor: colors.background,
      borderRadius: 10,
      padding: 8,
    },
    scheduleKpiValue: { fontSize: 15, fontWeight: '700', color: colors.text },
    scheduleKpiLabel: {
      fontSize: 10,
      color: colors.textSecondary,
      marginTop: 2,
      textAlign: 'center',
    },
    assignmentList: { gap: 8 },
    assignmentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.background,
      borderRadius: 10,
      padding: 10,
    },
    assignmentInfo: { flex: 1, marginRight: 8 },
    assignmentName: { fontSize: 14, fontWeight: '600', color: colors.text },
    assignmentRole: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    swapMini: {
      fontSize: 14,
      marginRight: 8,
    },
    alertChipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 6,
    },
    alertChip: {
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    alertChipWarn: {
      backgroundColor: `${colors.warning}18`,
      borderColor: colors.warning,
    },
    alertChipWarnText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.warning,
    },
    alertChipSwap: {
      backgroundColor: '#6d43a518',
      borderColor: '#6d43a5',
    },
    alertChipSwapText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#6d43a5',
    },
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    statusText: { fontSize: 12, fontWeight: '700' },
    expandButton: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      alignSelf: 'flex-start',
      backgroundColor: colors.highlightLight,
      borderRadius: 8,
    },
    expandButtonText: { color: colors.highlight, fontSize: 12, fontWeight: '600' },
    noAssignments: {
      color: colors.textTertiary,
      fontSize: 13,
      textAlign: 'center',
      paddingVertical: 4,
    },
    openAction: {
      backgroundColor: colors.primary,
      paddingVertical: 12,
      borderRadius: 12,
      alignItems: 'center',
    },
    openActionText: { fontSize: 14, fontWeight: '700', color: colors.textInverse },
    centerState: {
      padding: 24,
      alignItems: 'center',
      justifyContent: 'center',
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
    emptyCard: {
      marginHorizontal: 18,
      backgroundColor: colors.card,
      borderRadius: 18,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      gap: 8,
    },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  });
