import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';
import {
  CatechesisClassReport,
  CatechesisSessionSummary,
  SessionAttendance,
  createCatechesisSession,
  getCatechesisClassReport,
  getCatechesisSessions,
  getSessionAttendance,
  markSessionAttendance,
} from '../../src/services/catechesisService';

/** Estado cíclico da chamada: null (sem marcação) → presente → atrasado → ausente. */
type Mark = 'present' | 'late' | 'absent' | null;

const nextMark = (mark: Mark): Mark => {
  if (mark === null || mark === 'absent') return 'present';
  if (mark === 'present') return 'late';
  return 'absent';
};

const markVisual = (mark: Mark): { label: string; icon: string } => {
  if (mark === 'present') return { label: 'Presente', icon: '✓' };
  if (mark === 'late') return { label: 'Atrasado', icon: '🕒' };
  if (mark === 'absent') return { label: 'Ausente', icon: '✗' };
  return { label: 'Marcar', icon: '·' };
};

const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
};

const dateLabel = (iso: string) => {
  const date = new Date(iso);
  return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(
    2,
    '0',
  )}/${date.getUTCFullYear()}`;
};

/** Painel da turma: encontros, chamada e acompanhamento (app do catequista). */
export default function CatechesisClassScreen() {
  const { classId } = useLocalSearchParams<{ classId: string }>();
  const router = useRouter();
  const colors = useColors();
  const styles = createStyles(colors);

  const [report, setReport] = useState<CatechesisClassReport | null>(null);
  const [sessions, setSessions] = useState<CatechesisSessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Novo encontro
  const [showNewSession, setShowNewSession] = useState(false);
  const [newDate, setNewDate] = useState(todayIso());
  const [newTopic, setNewTopic] = useState('');
  const [creating, setCreating] = useState(false);

  // Chamada
  const [attendance, setAttendance] = useState<SessionAttendance | null>(null);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [savingAttendance, setSavingAttendance] = useState(false);

  const load = useCallback(
    async (refresh = false) => {
      if (!classId) return;
      if (refresh) setIsRefreshing(true);
      try {
        const [reportData, sessionsData] = await Promise.all([
          getCatechesisClassReport(classId),
          getCatechesisSessions(classId),
        ]);
        setReport(reportData);
        setSessions(sessionsData);
      } catch (error) {
        console.error('Erro ao carregar a turma:', error);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [classId],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const activeStudents = useMemo(
    () => (report?.students ?? []).filter((student) => student.status === 'ACTIVE'),
    [report],
  );
  const averageAttendance = useMemo(() => {
    const rates = activeStudents
      .map((student) => student.attendanceRate)
      .filter((rate): rate is number => rate !== null);
    if (!rates.length) return null;
    return Math.round(rates.reduce((sum, rate) => sum + rate, 0) / rates.length);
  }, [activeStudents]);

  const openAttendance = async (sessionId: string) => {
    try {
      const data = await getSessionAttendance(sessionId);
      const initial: Record<string, Mark> = {};
      for (const student of data.students) {
        initial[student.enrollmentId] =
          student.present === null ? null : student.late ? 'late' : student.present ? 'present' : 'absent';
      }
      setMarks(initial);
      setAttendance(data);
    } catch (error: any) {
      Alert.alert('Erro', error?.message ?? 'Não foi possível abrir a chamada.');
    }
  };

  const handleCreateSession = async () => {
    if (!classId) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate.trim())) {
      Alert.alert('Data inválida', 'Use o formato AAAA-MM-DD (ex.: 2026-08-23).');
      return;
    }
    setCreating(true);
    try {
      const created = await createCatechesisSession(classId, newDate.trim(), newTopic.trim() || undefined);
      setShowNewSession(false);
      setNewTopic('');
      setNewDate(todayIso());
      await load(true);
      // Abre a chamada do encontro recém-criado
      await openAttendance(created.id);
    } catch (error: any) {
      Alert.alert('Erro', error?.message ?? 'Não foi possível criar o encontro.');
    } finally {
      setCreating(false);
    }
  };

  const handleSaveAttendance = async () => {
    if (!attendance) return;
    const entries = attendance.students
      .map((student) => ({ enrollmentId: student.enrollmentId, mark: marks[student.enrollmentId] }))
      .filter((item) => item.mark !== null)
      .map((item) => ({
        enrollmentId: item.enrollmentId,
        present: item.mark === 'present' || item.mark === 'late',
        late: item.mark === 'late',
      }));
    if (entries.length === 0) {
      Alert.alert('Chamada vazia', 'Toque nos nomes para marcar presente, atrasado ou ausente.');
      return;
    }
    setSavingAttendance(true);
    try {
      await markSessionAttendance(attendance.sessionId, entries);
      setAttendance(null);
      await load(true);
    } catch (error: any) {
      Alert.alert('Erro', error?.message ?? 'Não foi possível salvar a chamada.');
    } finally {
      setSavingAttendance(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()} hitSlop={10}>
          <FontAwesome5 name="arrow-left" size={17} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Turma</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => load(true)} />}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* KPIs */}
            <View style={styles.kpiRow}>
              <View style={styles.kpi}>
                <Text style={styles.kpiValue}>{report?.active ?? 0}</Text>
                <Text style={styles.kpiLabel}>Ativos</Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiValue}>
                  {averageAttendance === null ? '—' : `${averageAttendance}%`}
                </Text>
                <Text style={styles.kpiLabel}>Presença média</Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiValue}>{report?.dropouts ?? 0}</Text>
                <Text style={styles.kpiLabel}>Desistências</Text>
              </View>
            </View>

            {/* Encontros */}
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Encontros</Text>
              <TouchableOpacity style={styles.newBtn} onPress={() => setShowNewSession(true)}>
                <FontAwesome5 name="plus" size={11} color="#fff" />
                <Text style={styles.newBtnText}>Novo encontro</Text>
              </TouchableOpacity>
            </View>
            {sessions.length === 0 ? (
              <Text style={styles.emptyLine}>
                Nenhum encontro registrado — crie o primeiro e faça a chamada.
              </Text>
            ) : (
              sessions.map((session) => (
                <TouchableOpacity
                  key={session.id}
                  style={styles.sessionCard}
                  activeOpacity={0.85}
                  onPress={() => void openAttendance(session.id)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sessionDate}>
                      {dateLabel(session.date)}
                      {session.topic ? ` · ${session.topic}` : ''}
                    </Text>
                    <Text style={styles.sessionMeta}>
                      {session.marked === 0
                        ? 'Chamada não realizada'
                        : `${session.present}/${session.marked} presentes${
                            session.late ? ` · ${session.late} atrasado(s)` : ''
                          }`}
                    </Text>
                  </View>
                  <FontAwesome5
                    name={session.marked === 0 ? 'clipboard-list' : 'clipboard-check'}
                    size={16}
                    color={session.marked === 0 ? colors.warning : colors.success}
                  />
                </TouchableOpacity>
              ))
            )}

            {/* Catequizandos */}
            <Text style={[styles.sectionTitle, { marginTop: 18 }]}>Catequizandos</Text>
            {activeStudents.map((student) => (
              <View key={student.enrollmentId} style={styles.studentRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.studentName} numberOfLines={1}>
                    {student.member.fullName}
                  </Text>
                  {student.pendingDocuments ? (
                    <Text style={styles.studentPending} numberOfLines={1}>
                      📄 Pendente: {student.pendingDocuments}
                    </Text>
                  ) : null}
                </View>
                <Text
                  style={[
                    styles.studentRate,
                    student.attendanceRate !== null && student.attendanceRate < 60
                      ? { color: colors.error ?? '#d9534f' }
                      : null,
                  ]}
                >
                  {student.attendanceRate === null ? '—' : `${student.attendanceRate}%`}
                </Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* Novo encontro */}
      <Modal visible={showNewSession} transparent animationType="fade" onRequestClose={() => setShowNewSession(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowNewSession(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Novo encontro</Text>
            <Text style={styles.fieldLabel}>Data (AAAA-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={newDate}
              onChangeText={setNewDate}
              placeholder="2026-08-23"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
            />
            <Text style={styles.fieldLabel}>Tema (opcional)</Text>
            <TextInput
              style={styles.input}
              value={newTopic}
              onChangeText={setNewTopic}
              placeholder="Ex.: Parábolas de Jesus"
              placeholderTextColor={colors.textTertiary}
            />
            <TouchableOpacity
              style={[styles.primaryBtn, creating && { opacity: 0.6 }]}
              disabled={creating}
              onPress={() => void handleCreateSession()}
            >
              <Text style={styles.primaryBtnText}>
                {creating ? 'Criando...' : 'Criar e fazer a chamada'}
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Chamada */}
      <Modal
        visible={!!attendance}
        animationType="slide"
        onRequestClose={() => setAttendance(null)}
      >
        <SafeAreaView style={styles.safe} edges={['top']}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.headerBtn} onPress={() => setAttendance(null)} hitSlop={10}>
              <FontAwesome5 name="times" size={18} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>
              Chamada · {attendance ? dateLabel(attendance.date) : ''}
            </Text>
            <View style={styles.headerBtn} />
          </View>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.subtitle}>
              Toque no nome para alternar: presente ✓ → atrasado 🕒 → ausente ✗
            </Text>
            {(attendance?.students ?? []).map((student) => {
              const mark = marks[student.enrollmentId] ?? null;
              const visual = markVisual(mark);
              return (
                <TouchableOpacity
                  key={student.enrollmentId}
                  style={[
                    styles.callRow,
                    mark === 'present' && styles.callPresent,
                    mark === 'late' && styles.callLate,
                    mark === 'absent' && styles.callAbsent,
                  ]}
                  activeOpacity={0.8}
                  onPress={() =>
                    setMarks((prev) => ({
                      ...prev,
                      [student.enrollmentId]: nextMark(prev[student.enrollmentId] ?? null),
                    }))
                  }
                >
                  <Text style={styles.callName} numberOfLines={1}>
                    {student.member.fullName}
                  </Text>
                  <Text style={styles.callMark}>
                    {visual.icon} {visual.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[styles.primaryBtn, savingAttendance && { opacity: 0.6 }, { marginTop: 14 }]}
              disabled={savingAttendance}
              onPress={() => void handleSaveAttendance()}
            >
              <Text style={styles.primaryBtnText}>
                {savingAttendance ? 'Salvando...' : 'Salvar chamada'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
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
    scroll: { padding: 16, paddingBottom: 40 },
    subtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 12 },

    kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
    kpi: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      alignItems: 'center',
    },
    kpiValue: { fontSize: 20, fontWeight: '800', color: colors.text },
    kpiLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2, textTransform: 'uppercase' },

    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
    newBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    newBtnText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
    emptyLine: { fontSize: 13, color: colors.textSecondary, fontStyle: 'italic', marginBottom: 8 },

    sessionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      marginBottom: 8,
    },
    sessionDate: { fontSize: 14, fontWeight: '700', color: colors.text },
    sessionMeta: { fontSize: 12.5, color: colors.textSecondary, marginTop: 2 },

    studentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 9,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    studentName: { fontSize: 14.5, color: colors.text, fontWeight: '600' },
    studentPending: { fontSize: 12, color: colors.warning, marginTop: 1 },
    studentRate: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },

    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      padding: 24,
    },
    modalCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 18,
      gap: 6,
    },
    modalTitle: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: 6 },
    fieldLabel: { fontSize: 12.5, fontWeight: '700', color: colors.textSecondary, marginTop: 6 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.text,
      fontSize: 15,
      backgroundColor: colors.surface,
    },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 13,
      alignItems: 'center',
      marginTop: 12,
    },
    primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },

    callRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 13,
      marginBottom: 8,
    },
    callPresent: { borderColor: colors.success },
    callLate: { borderColor: colors.warning },
    callAbsent: { borderColor: colors.error ?? '#d9534f' },
    callName: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
    callMark: { fontSize: 13.5, fontWeight: '700', color: colors.textSecondary },
  });
