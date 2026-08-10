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
  FixedPendingItem,
  createScheduleFromFixed,
  getCoordinatorScheduleOverview,
  getFixedSchedulePending,
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

const FIXED_TYPE_LABELS: Record<string, string> = {
  MASS: 'Missa',
  CONFESSION: 'Confissão',
  ADORATION: 'Adoração',
  ROSARY: 'Terço',
};

const FIXED_WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** Formata 'YYYY-MM-DD' sem deslocar o dia por fuso. */
const fixedDateLabel = (isoDate: string) => {
  const [year, month, day] = isoDate.split('-').map(Number);
  const weekday = FIXED_WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday}., ${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
};

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
  // Visão do painel: lista (padrão) ou calendário mensal
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [calSelectedDay, setCalSelectedDay] = useState<string | null>(null);
  // Agenda fixa sem escala (pendencias dos proximos 30 dias)
  const [fixedPending, setFixedPending] = useState<FixedPendingItem[]>([]);
  const [creatingFixedKey, setCreatingFixedKey] = useState<string | null>(null);

  // Mesma regra da tab: papel gestor OU coordenação/vice de alguma pastoral
  const coordinatorPastoralRoles = ['COORDINATOR', 'Coordenador', 'Vice-Coordenador'];
  const isCoordinator =
    (!!user?.role && coordinatorRoles.includes(user.role)) ||
    !!user?.pastorals?.some((pastoral) => coordinatorPastoralRoles.includes(pastoral.role));
  const styles = createStyles(colors);

  const getDateRangeParams = useCallback(() => {
    // Calendário: carrega o mês exibido inteiro
    if (view === 'calendar') {
      const from = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1, 0, 0, 0);
      const to = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0, 23, 59, 59);
      return { from: from.toISOString(), to: to.toISOString() };
    }
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
  }, [calMonth, dateRange, view]);

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
        const [data, pending] = await Promise.all([
          getCoordinatorScheduleOverview(getDateRangeParams()),
          getFixedSchedulePending(30).catch(() => [] as FixedPendingItem[]),
        ]);
        setSchedules(data);
        setFixedPending(pending);
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

  // Coordenador de pastoral ve apenas pendencias que envolvem suas pastorais
  const visibleFixedPending = useMemo(() => {
    const myIds = new Set((user?.pastorals ?? []).map((pastoral) => pastoral.id));
    if (user?.role !== 'PASTORAL_COORDINATOR' || myIds.size === 0) return fixedPending;
    return fixedPending.filter((item) => item.pastorals.some((p) => myIds.has(p.id)));
  }, [fixedPending, user]);

  const handleCreateFixedSchedule = (item: FixedPendingItem) => {
    const key = `${item.massScheduleId}-${item.date}`;
    const label = FIXED_TYPE_LABELS[item.type] ?? item.type;
    Alert.alert(
      'Criar escala',
      `Criar a escala de ${label} de ${fixedDateLabel(item.date)} às ${item.time}? As pastorais do horário fixo serão copiadas.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Criar escala',
          onPress: async () => {
            setCreatingFixedKey(key);
            try {
              const created = await createScheduleFromFixed(item.massScheduleId, item.date);
              await loadOverview(true);
              Alert.alert('Escala criada ✓', 'Deseja abrir a operação para escalar os membros?', [
                { text: 'Depois', style: 'cancel' },
                {
                  text: 'Abrir operação',
                  onPress: () => router.push(`/coordination/${created.id}` as never),
                },
              ]);
            } catch (error: any) {
              Alert.alert('Erro', error?.message ?? 'Erro ao criar a escala');
            } finally {
              setCreatingFixedKey(null);
            }
          },
        },
      ],
    );
  };

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

  // ===== Calendário =====
  const toDayKey = (value: string | Date) => {
    const date = new Date(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate(),
    ).padStart(2, '0')}`;
  };

  const schedulesByDay = useMemo(() => {
    const map = new Map<string, CoordinatorScheduleSummary[]>();
    for (const schedule of schedules) {
      const key = toDayKey(schedule.date);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(schedule);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }
    return map;
  }, [schedules]);

  const calCells = useMemo(() => {
    const first = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return { date, key: toDayKey(date), inMonth: date.getMonth() === calMonth.getMonth() };
    });
  }, [calMonth]);

  /** Dias do mês exibido que têm escalas (para a agenda com nomes). */
  const agendaDays = useMemo(
    () =>
      Array.from(schedulesByDay.keys())
        .filter((key) => {
          const [year, month] = key.split('-').map(Number);
          return year === calMonth.getFullYear() && month === calMonth.getMonth() + 1;
        })
        .sort(),
    [calMonth, schedulesByDay],
  );

  const agendaDayLabel = (dayKey: string) => {
    const [year, month, day] = dayKey.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const weekdays = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    return `${weekdays[date.getDay()]}, ${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
  };

  const monthLabel = calMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

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

        {/* Alternância Lista | Calendário */}
        <View style={styles.filterRow}>
          {([
            { label: '☰ Lista', value: 'list' },
            { label: '🗓 Calendário', value: 'calendar' },
          ] as { label: string; value: 'list' | 'calendar' }[]).map((item) => (
            <TouchableOpacity
              key={item.value}
              style={[styles.filterChip, view === item.value && styles.filterChipActive]}
              onPress={() => {
                setView(item.value);
                setCalSelectedDay(null);
              }}
            >
              <Text
                style={[styles.filterChipText, view === item.value && styles.filterChipTextActive]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Filtro de período */}
        {view === 'list' && (
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
        )}

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

        {/* Agenda fixa sem escala */}
        {view === 'list' && visibleFixedPending.length > 0 && (
          <View style={styles.fixedPendingCard}>
            <Text style={styles.fixedPendingTitle}>
              📌 Agenda fixa sem escala ({visibleFixedPending.length})
            </Text>
            <Text style={styles.fixedPendingHint}>
              Horários fixos dos próximos 30 dias que ainda não receberam escala.
            </Text>
            {visibleFixedPending.slice(0, 6).map((item) => {
              const key = `${item.massScheduleId}-${item.date}`;
              const label = FIXED_TYPE_LABELS[item.type] ?? item.type;
              return (
                <View key={key} style={styles.fixedPendingRow}>
                  <View style={styles.fixedPendingInfo}>
                    <Text style={styles.fixedPendingWhen}>
                      {label} · {fixedDateLabel(item.date)} às {item.time}
                      {item.notes ? ` — ${item.notes}` : ''}
                    </Text>
                    <Text style={styles.fixedPendingPastorals} numberOfLines={1}>
                      {item.pastorals.map((p) => p.name).join(' · ')}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.fixedPendingButton,
                      creatingFixedKey === key && styles.fixedPendingButtonDisabled,
                    ]}
                    disabled={creatingFixedKey === key}
                    onPress={() => handleCreateFixedSchedule(item)}
                  >
                    <Text style={styles.fixedPendingButtonText}>
                      {creatingFixedKey === key ? '...' : 'Criar escala'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
            {visibleFixedPending.length > 6 && (
              <Text style={styles.fixedPendingMore}>
                + {visibleFixedPending.length - 6} pendência(s) além das listadas
              </Text>
            )}
          </View>
        )}

        {/* Filtro de status dos membros */}
        {view === 'list' && (
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
        )}

        {/* Calendário mensal: grade compacta + agenda com os nomes */}
        {view === 'calendar' && (
          <View style={styles.calWrap}>
            <View style={styles.calToolbar}>
              <TouchableOpacity
                style={styles.calNavButton}
                onPress={() => {
                  setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1));
                  setCalSelectedDay(null);
                }}
              >
                <Text style={styles.calNavButtonText}>‹</Text>
              </TouchableOpacity>
              <Text style={styles.calMonthLabel}>{monthLabel}</Text>
              <TouchableOpacity
                style={styles.calNavButton}
                onPress={() => {
                  setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1));
                  setCalSelectedDay(null);
                }}
              >
                <Text style={styles.calNavButtonText}>›</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.calTodayButton}
                onPress={() => {
                  const now = new Date();
                  setCalMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                  setCalSelectedDay(null);
                }}
              >
                <Text style={styles.calTodayButtonText}>Hoje</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.calWeekHead}>
              {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((weekday, index) => (
                <Text key={index} style={styles.calWeekday}>
                  {weekday}
                </Text>
              ))}
            </View>

            {isLoading ? (
              <View style={styles.centerState}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : (
              <View style={styles.calGrid}>
                {calCells.map((cell) => {
                  const daySchedules = schedulesByDay.get(cell.key) ?? [];
                  const isToday = cell.key === toDayKey(new Date());
                  const isSelected = calSelectedDay === cell.key;
                  return (
                    <TouchableOpacity
                      key={cell.key}
                      disabled={daySchedules.length === 0}
                      onPress={() => setCalSelectedDay(isSelected ? null : cell.key)}
                      style={[
                        styles.calCell,
                        !cell.inMonth && styles.calCellOut,
                        isToday && styles.calCellToday,
                        isSelected && styles.calCellSelected,
                      ]}
                    >
                      <Text style={[styles.calDayNum, !cell.inMonth && styles.calDayNumOut]}>
                        {cell.date.getDate()}
                      </Text>
                      {daySchedules.map((schedule) => (
                        <View
                          key={schedule.scheduleId}
                          style={[
                            styles.calPill,
                            schedule.counts.total === 0 && styles.calPillEmpty,
                          ]}
                        >
                          <Text
                            style={[
                              styles.calPillText,
                              schedule.counts.total === 0 && styles.calPillTextEmpty,
                            ]}
                            numberOfLines={1}
                          >
                            {schedule.counts.total === 0 ? '⚠' : schedule.counts.total}
                            {(schedule.counts.swapsPending ?? 0) > 0 ? ' 🔁' : ''}
                          </Text>
                        </View>
                      ))}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Agenda do mês: nomes dos escalados dia a dia */}
            {!isLoading && agendaDays.length === 0 ? (
              <Text style={styles.calHint}>Nenhuma escala neste mês.</Text>
            ) : null}
            {!isLoading &&
              (calSelectedDay ? [calSelectedDay] : agendaDays).map((dayKey) => {
                const dayList = schedulesByDay.get(dayKey) ?? [];
                if (dayList.length === 0) return null;
                return (
                  <View key={dayKey} style={styles.agendaDay}>
                    <View style={styles.agendaDayHeader}>
                      <Text style={styles.agendaDayTitle}>{agendaDayLabel(dayKey)}</Text>
                      {calSelectedDay === dayKey ? (
                        <TouchableOpacity onPress={() => setCalSelectedDay(null)} hitSlop={8}>
                          <Text style={styles.agendaShowAll}>Ver mês inteiro</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    {dayList.map((schedule) => (
                      <View key={schedule.scheduleId} style={styles.agendaCard}>
                        <View style={styles.agendaCardHeader}>
                          <View style={styles.agendaCardHeaderText}>
                            <Text style={styles.agendaCardTitle}>{schedule.title}</Text>
                            <Text style={styles.agendaCardMeta}>
                              {formatToBrazilianDate(schedule.date, 'HH:mm')} •{' '}
                              {schedule.event.location || 'Local a definir'}
                            </Text>
                          </View>
                          {(schedule.counts.swapsPending ?? 0) > 0 ? (
                            <View style={[styles.alertChip, styles.alertChipSwap]}>
                              <Text style={styles.alertChipSwapText}>
                                🔁 {schedule.counts.swapsPending}
                              </Text>
                            </View>
                          ) : null}
                        </View>

                        {schedule.assignments.length === 0 ? (
                          <View style={[styles.alertChip, styles.alertChipWarn, styles.agendaEmptyChip]}>
                            <Text style={styles.alertChipWarnText}>⚠ Nenhum membro escalado</Text>
                          </View>
                        ) : (
                          <View style={styles.agendaMemberList}>
                            {schedule.assignments.map((a) => (
                              <View key={a.id} style={styles.agendaMemberRow}>
                                <View style={styles.assignmentInfo}>
                                  <Text style={styles.agendaMemberName}>
                                    {a.memberName}
                                    {a.spouseId &&
                                    schedule.assignments.some((x) => x.memberId === a.spouseId)
                                      ? ' 💍'
                                      : ''}
                                    {a.hasPendingSwap ? ' 🔁' : ''}
                                  </Text>
                                  <Text style={styles.assignmentRole}>{a.role}</Text>
                                </View>
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
                          </View>
                        )}

                        <TouchableOpacity
                          style={styles.agendaOpenAction}
                          activeOpacity={0.85}
                          onPress={() =>
                            router.push({
                              pathname: '/coordination/[scheduleId]',
                              params: { scheduleId: schedule.scheduleId },
                            })
                          }
                        >
                          <Text style={styles.agendaOpenActionText}>Abrir operação</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                );
              })}
          </View>
        )}

        {/* Lista de escalas */}
        {view === 'list' &&
          (isLoading ? (
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
        ))}
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
    fixedPendingCard: {
      marginHorizontal: 18,
      marginBottom: 12,
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.warning,
      borderLeftWidth: 4,
      padding: 14,
      gap: 8,
    },
    fixedPendingTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
    fixedPendingHint: { fontSize: 12, color: colors.textSecondary, marginBottom: 2 },
    fixedPendingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 10,
    },
    fixedPendingInfo: { flex: 1, gap: 2 },
    fixedPendingWhen: { fontSize: 13, fontWeight: '600', color: colors.text },
    fixedPendingPastorals: { fontSize: 12, color: colors.textSecondary },
    fixedPendingButton: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    fixedPendingButtonDisabled: { opacity: 0.5 },
    fixedPendingButtonText: { color: '#fff', fontSize: 12, fontWeight: '700' },
    fixedPendingMore: { fontSize: 12, color: colors.textSecondary, paddingTop: 8 },
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
    calWrap: {
      paddingHorizontal: 18,
      paddingBottom: 24,
    },
    calToolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 8,
    },
    calNavButton: {
      width: 34,
      height: 34,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    calNavButtonText: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    calMonthLabel: {
      flex: 1,
      textAlign: 'center',
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
      textTransform: 'capitalize',
    },
    calTodayButton: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: `${colors.primary}18`,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    calTodayButtonText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
    },
    calWeekHead: {
      flexDirection: 'row',
      marginBottom: 4,
    },
    calWeekday: {
      flex: 1,
      textAlign: 'center',
      fontSize: 11,
      fontWeight: '700',
      color: colors.textTertiary,
    },
    calGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    calCell: {
      width: `${100 / 7}%`,
      minHeight: 58,
      padding: 2,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderLight,
      backgroundColor: colors.card,
    },
    calCellOut: {
      backgroundColor: colors.background,
    },
    calCellToday: {
      borderColor: colors.primary,
      borderWidth: 1.5,
    },
    calDayNum: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textSecondary,
      marginBottom: 2,
    },
    calDayNumOut: {
      color: colors.textTertiary,
    },
    calPill: {
      backgroundColor: colors.highlightLight,
      borderRadius: 6,
      paddingHorizontal: 3,
      paddingVertical: 2,
      marginBottom: 2,
    },
    calPillEmpty: {
      backgroundColor: `${colors.warning}22`,
    },
    calPillActive: {
      backgroundColor: colors.primary,
    },
    calPillText: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.highlight,
      textAlign: 'center',
    },
    calPillTextEmpty: {
      color: colors.warning,
    },
    calPillTextActive: {
      color: colors.textInverse,
    },
    calCellSelected: {
      borderColor: colors.primary,
      borderWidth: 2,
      backgroundColor: `${colors.primary}10`,
    },
    agendaDay: {
      marginTop: 14,
      gap: 8,
    },
    agendaDayHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    agendaDayTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    agendaShowAll: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
    },
    agendaCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      gap: 10,
    },
    agendaCardHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 8,
    },
    agendaCardHeaderText: {
      flex: 1,
      gap: 2,
    },
    agendaCardTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
    },
    agendaCardMeta: {
      fontSize: 12.5,
      color: colors.textSecondary,
    },
    agendaEmptyChip: {
      alignSelf: 'flex-start',
    },
    agendaMemberList: {
      gap: 6,
    },
    agendaMemberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.background,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    agendaMemberName: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    agendaOpenAction: {
      backgroundColor: `${colors.primary}18`,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: 10,
      paddingVertical: 9,
      alignItems: 'center',
    },
    agendaOpenActionText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.primary,
    },
    calHint: {
      marginTop: 12,
      fontSize: 13,
      color: colors.textTertiary,
      textAlign: 'center',
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
