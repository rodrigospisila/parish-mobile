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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
  notifyClassFamilies,
  approveCatechesisEnrollment,
  rejectCatechesisEnrollment,
  CatechesisAssessment,
  CatechesisRating,
  RATING_LABELS,
  getEnrollmentAssessments,
  upsertEnrollmentAssessment,
  upsertClassAssessmentsBatch,
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
  // Dentro de <Modal> o SafeAreaView não recebe os insets nativos (árvore
  // separada) — o header colidia com a status bar; o hook resolve.
  const insets = useSafeAreaInsets();

  const [report, setReport] = useState<CatechesisClassReport | null>(null);
  const [sessions, setSessions] = useState<CatechesisSessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Novo encontro
  const [showNewSession, setShowNewSession] = useState(false);
  const [newDate, setNewDate] = useState(todayIso());
  const [newTopic, setNewTopic] = useState('');
  const [creating, setCreating] = useState(false);

  // Mensagem às famílias
  const [showNotify, setShowNotify] = useState(false);
  const [notifyText, setNotifyText] = useState('');
  const [notifying, setNotifying] = useState(false);

  // Parecer por período (Fase 5)
  const [assessTarget, setAssessTarget] = useState<{ enrollmentId: string; fullName: string } | null>(null);
  const [assessList, setAssessList] = useState<CatechesisAssessment[]>([]);
  const [assessPeriod, setAssessPeriod] = useState('');
  const [assessRating, setAssessRating] = useState<CatechesisRating | null>(null);
  const [assessNotes, setAssessNotes] = useState('');
  const [savingAssess, setSavingAssess] = useState(false);

  const openAssessments = async (enrollmentId: string, fullName: string) => {
    try {
      const list = await getEnrollmentAssessments(enrollmentId);
      setAssessList(list);
      setAssessPeriod('');
      setAssessRating(null);
      setAssessNotes('');
      setAssessTarget({ enrollmentId, fullName });
    } catch (error: any) {
      Alert.alert('Pareceres', error?.message ?? 'Não foi possível carregar.');
    }
  };

  const handleSaveAssessment = async () => {
    if (!assessTarget) return;
    if (assessPeriod.trim().length < 3) {
      Alert.alert('Período', 'Informe o período (ex.: 1º semestre 2026).');
      return;
    }
    if (assessNotes.trim().length < 5) {
      Alert.alert('Parecer', 'Escreva o parecer (mínimo 5 caracteres).');
      return;
    }
    setSavingAssess(true);
    try {
      await upsertEnrollmentAssessment(assessTarget.enrollmentId, {
        period: assessPeriod.trim(),
        rating: assessRating ?? undefined,
        notes: assessNotes.trim(),
      });
      const list = await getEnrollmentAssessments(assessTarget.enrollmentId);
      setAssessList(list);
      setAssessPeriod('');
      setAssessRating(null);
      setAssessNotes('');
      Alert.alert('Parecer salvo ✓', 'A família foi avisada.');
    } catch (error: any) {
      Alert.alert('Erro', error?.message ?? 'Não foi possível salvar.');
    } finally {
      setSavingAssess(false);
    }
  };

  // Parecer em lote (mesmo texto para vários)
  const [showBatch, setShowBatch] = useState(false);
  const [batchSelected, setBatchSelected] = useState<Record<string, boolean>>({});
  const [batchPeriod, setBatchPeriod] = useState('');
  const [batchRating, setBatchRating] = useState<CatechesisRating | null>(null);
  const [batchNotes, setBatchNotes] = useState('');
  const [savingBatch, setSavingBatch] = useState(false);

  const openBatch = () => {
    const selection: Record<string, boolean> = {};
    (report?.students ?? [])
      .filter((student) => student.status === 'ACTIVE' || student.status === 'COMPLETED')
      .forEach((student) => {
        selection[student.enrollmentId] = student.status === 'ACTIVE';
      });
    setBatchSelected(selection);
    setBatchPeriod('');
    setBatchRating(null);
    setBatchNotes('');
    setShowBatch(true);
  };

  const handleSaveBatch = async () => {
    if (!classId) return;
    const enrollmentIds = Object.entries(batchSelected)
      .filter(([, checked]) => checked)
      .map(([id]) => id);
    if (!enrollmentIds.length) {
      Alert.alert('Seleção', 'Toque nos nomes para escolher os catequizandos.');
      return;
    }
    if (batchPeriod.trim().length < 3) {
      Alert.alert('Período', 'Informe o período (ex.: 1º semestre 2026).');
      return;
    }
    if (batchNotes.trim().length < 5) {
      Alert.alert('Parecer', 'Escreva o parecer (mínimo 5 caracteres).');
      return;
    }
    setSavingBatch(true);
    try {
      const result = await upsertClassAssessmentsBatch(classId, {
        period: batchPeriod.trim(),
        rating: batchRating ?? undefined,
        notes: batchNotes.trim(),
        enrollmentIds,
      });
      setShowBatch(false);
      Alert.alert('Parecer salvo ✓', `${result.saved} catequizando(s) — as famílias foram avisadas.`);
    } catch (error: any) {
      Alert.alert('Erro', error?.message ?? 'Não foi possível salvar.');
    } finally {
      setSavingBatch(false);
    }
  };

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

  // Com agenda anual gerada a lista fica longa — colapsada mostra só o que
  // importa agora: os próximos encontros e os últimos realizados.
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [studentFilter, setStudentFilter] = useState('');

  const sessionGroups = useMemo(() => {
    const now = new Date();
    const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const upcoming = sessions
      .filter((session) => new Date(session.date).getTime() >= todayUtc)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const past = sessions
      .filter((session) => new Date(session.date).getTime() < todayUtc)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return { upcoming, past };
  }, [sessions]);

  const collapsedSessions = useMemo(
    () => ({
      upcoming: sessionGroups.upcoming.slice(0, 2),
      past: sessionGroups.past.slice(0, 2),
    }),
    [sessionGroups],
  );
  const hiddenCount =
    sessions.length - collapsedSessions.upcoming.length - collapsedSessions.past.length;

  const activeStudents = useMemo(
    () =>
      (report?.students ?? []).filter(
        (student) => student.status === 'ACTIVE' || student.status === 'COMPLETED',
      ),
    [report],
  );
  const pendingStudents = useMemo(
    () => (report?.students ?? []).filter((student) => student.status === 'PENDING_APPROVAL'),
    [report],
  );
  const filteredStudents = useMemo(() => {
    const query = studentFilter.trim().toLowerCase();
    if (!query) return activeStudents;
    return activeStudents.filter((student) =>
      student.member.fullName.toLowerCase().includes(query),
    );
  }, [activeStudents, studentFilter]);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const handleApprove = (enrollmentId: string, name: string) => {
    Alert.alert('Aprovar matrícula', `Confirmar a matrícula de ${name} nesta turma?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Aprovar',
        onPress: () => {
          void (async () => {
            setDecidingId(enrollmentId);
            try {
              await approveCatechesisEnrollment(enrollmentId);
              await load(true);
            } catch (error: any) {
              Alert.alert('Erro', error?.message ?? 'Não foi possível aprovar.');
            } finally {
              setDecidingId(null);
            }
          })();
        },
      },
    ]);
  };

  const handleReject = (enrollmentId: string, name: string) => {
    Alert.alert(
      'Recusar inscrição',
      `A família de ${name} será avisada. Para registrar o motivo, use a área da coordenação na web.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Recusar',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setDecidingId(enrollmentId);
              try {
                await rejectCatechesisEnrollment(enrollmentId);
                await load(true);
              } catch (error: any) {
                Alert.alert('Erro', error?.message ?? 'Não foi possível recusar.');
              } finally {
                setDecidingId(null);
              }
            })();
          },
        },
      ],
    );
  };
  const averageAttendance = useMemo(() => {
    const rates = activeStudents
      .map((student) => student.attendanceRate)
      .filter((rate): rate is number => rate !== null);
    if (!rates.length) return null;
    return Math.round(rates.reduce((sum, rate) => sum + rate, 0) / rates.length);
  }, [activeStudents]);

  const renderSessionCard = (session: CatechesisSessionSummary) => (
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
  );

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

  const handleNotifyFamilies = async () => {
    if (!classId) return;
    if (!notifyText.trim()) {
      Alert.alert('Mensagem vazia', 'Escreva o aviso para as famílias.');
      return;
    }
    setNotifying(true);
    try {
      const result = await notifyClassFamilies(classId, notifyText.trim());
      setShowNotify(false);
      setNotifyText('');
      Alert.alert(
        result.notified > 0 ? 'Aviso enviado ✓' : 'Sem destinatários',
        result.notified > 0
          ? `Enviado para ${result.notified} conta(s) (catequizandos e responsáveis com app).`
          : 'Nenhuma família desta turma tem conta no app para receber o aviso.',
      );
    } catch (error: any) {
      Alert.alert('Erro', error?.message ?? 'Não foi possível enviar o aviso.');
    } finally {
      setNotifying(false);
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

            {/* Equipe da turma */}
            {(report?.catechists ?? []).length > 0 && (
              <View style={styles.teamRow}>
                <FontAwesome5 name="hands-helping" size={13} color={colors.textSecondary} />
                <Text style={styles.teamText} numberOfLines={2}>
                  {(report?.catechists ?? [])
                    .map((catechist) => `${catechist.fullName} (${catechist.role})`)
                    .join(' · ')}
                </Text>
              </View>
            )}

            {/* Inscrições aguardando aprovação */}
            {pendingStudents.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>
                  Inscrições aguardando ({pendingStudents.length})
                </Text>
                {pendingStudents.map((student) => (
                  <View key={student.enrollmentId} style={styles.pendingCard}>
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
                    <TouchableOpacity
                      style={[styles.decisionBtn, { backgroundColor: colors.success }]}
                      disabled={decidingId === student.enrollmentId}
                      onPress={() => handleApprove(student.enrollmentId, student.member.fullName)}
                    >
                      <FontAwesome5 name="check" size={13} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.decisionBtn, { backgroundColor: colors.error ?? '#d9534f' }]}
                      disabled={decidingId === student.enrollmentId}
                      onPress={() => handleReject(student.enrollmentId, student.member.fullName)}
                    >
                      <FontAwesome5 name="times" size={13} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
                <View style={{ height: 14 }} />
              </>
            )}

            {/* Encontros */}
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Encontros</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={[styles.newBtn, { backgroundColor: colors.warning }]}
                  onPress={() => setShowNotify(true)}
                >
                  <FontAwesome5 name="bullhorn" size={11} color="#fff" />
                  <Text style={styles.newBtnText}>Avisar famílias</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.newBtn} onPress={() => setShowNewSession(true)}>
                  <FontAwesome5 name="plus" size={11} color="#fff" />
                  <Text style={styles.newBtnText}>Novo encontro</Text>
                </TouchableOpacity>
              </View>
            </View>
            {sessions.length === 0 ? (
              <Text style={styles.emptyLine}>
                Nenhum encontro registrado — crie o primeiro e faça a chamada.
              </Text>
            ) : showAllSessions ? (
              <>
                {[...sessionGroups.upcoming, ...sessionGroups.past].map((session) =>
                  renderSessionCard(session),
                )}
                <TouchableOpacity style={styles.showAllBtn} onPress={() => setShowAllSessions(false)}>
                  <Text style={styles.showAllText}>▲ Mostrar menos</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {collapsedSessions.upcoming.length > 0 && (
                  <>
                    <Text style={styles.groupLabel}>Próximos</Text>
                    {collapsedSessions.upcoming.map((session) => renderSessionCard(session))}
                  </>
                )}
                {collapsedSessions.past.length > 0 && (
                  <>
                    <Text style={styles.groupLabel}>Recentes</Text>
                    {collapsedSessions.past.map((session) => renderSessionCard(session))}
                  </>
                )}
                {hiddenCount > 0 && (
                  <TouchableOpacity style={styles.showAllBtn} onPress={() => setShowAllSessions(true)}>
                    <Text style={styles.showAllText}>
                      ▼ Ver todos os {sessions.length} encontros
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            {/* Catequizandos */}
            <View style={[styles.sectionHead, { marginTop: 18 }]}>
              <Text style={styles.sectionTitle}>Catequizandos</Text>
              {activeStudents.length > 0 && (
                <TouchableOpacity style={styles.newBtn} onPress={openBatch}>
                  <FontAwesome5 name="users" size={11} color="#fff" />
                  <Text style={styles.newBtnText}>Parecer em lote</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.emptyLine}>Toque no catequizando para ver/escrever o parecer.</Text>
            {activeStudents.length > 8 && (
              <TextInput
                style={[styles.input, { marginBottom: 8 }]}
                value={studentFilter}
                onChangeText={setStudentFilter}
                placeholder={`Buscar entre ${activeStudents.length} catequizandos...`}
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
              />
            )}
            {filteredStudents.length === 0 && studentFilter.trim() !== '' && (
              <Text style={styles.emptyLine}>Nenhum catequizando com esse nome.</Text>
            )}
            {filteredStudents.map((student) => (
              <TouchableOpacity
                key={student.enrollmentId}
                style={styles.studentRow}
                activeOpacity={0.75}
                onPress={() => void openAssessments(student.enrollmentId, student.member.fullName)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.studentName} numberOfLines={1}>
                    {student.member.fullName}
                    {student.status === 'COMPLETED' ? '  ✅' : ''}
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
              </TouchableOpacity>
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

      {/* Aviso às famílias */}
      <Modal visible={showNotify} transparent animationType="fade" onRequestClose={() => setShowNotify(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowNotify(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Avisar as famílias</Text>
            <Text style={styles.fieldLabel}>
              A mensagem chega por notificação aos catequizandos e responsáveis da turma.
            </Text>
            <TextInput
              style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]}
              value={notifyText}
              onChangeText={setNotifyText}
              placeholder="Ex.: Domingo o encontro será na capela. Trazer a Bíblia!"
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[styles.primaryBtn, notifying && { opacity: 0.6 }]}
              disabled={notifying}
              onPress={() => void handleNotifyFamilies()}
            >
              <Text style={styles.primaryBtnText}>{notifying ? 'Enviando...' : 'Enviar aviso'}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Parecer em lote */}
      <Modal visible={showBatch} animationType="slide" onRequestClose={() => setShowBatch(false)}>
        <View style={[styles.safe, { paddingTop: insets.top }]}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.headerBtn} onPress={() => setShowBatch(false)} hitSlop={10}>
              <FontAwesome5 name="times" size={18} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Parecer em lote</Text>
            <View style={styles.headerBtn} />
          </View>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.subtitle}>
              O mesmo período, conceito e texto valem para todos os selecionados — quem já tem
              parecer no período terá o texto substituído. Toque nos nomes para marcar/desmarcar.
            </Text>
            {activeStudents.map((student) => {
              const selected = !!batchSelected[student.enrollmentId];
              return (
                <TouchableOpacity
                  key={student.enrollmentId}
                  style={[styles.callRow, selected && styles.callPresent]}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() =>
                    setBatchSelected((prev) => ({ ...prev, [student.enrollmentId]: !prev[student.enrollmentId] }))
                  }
                >
                  <Text style={styles.callName} numberOfLines={1}>
                    {student.member.fullName}
                    {student.status === 'COMPLETED' ? '  ✅' : ''}
                  </Text>
                  <Text style={styles.callMark}>{selected ? '✓ Incluído' : '·'}</Text>
                </TouchableOpacity>
              );
            })}

            <Text style={styles.fieldLabel}>Período *</Text>
            <TextInput
              style={styles.input}
              value={batchPeriod}
              onChangeText={setBatchPeriod}
              placeholder="1º semestre 2026"
              placeholderTextColor={colors.textTertiary}
            />
            <Text style={styles.fieldLabel}>Conceito (opcional)</Text>
            <View style={styles.ratingRow}>
              {(Object.keys(RATING_LABELS) as CatechesisRating[]).map((value) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.ratingChip, batchRating === value && styles.ratingChipSelected]}
                  onPress={() => setBatchRating(batchRating === value ? null : value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: batchRating === value }}
                  accessibilityLabel={`Conceito ${RATING_LABELS[value]}`}
                >
                  <Text
                    style={[styles.ratingChipText, batchRating === value && { color: '#fff' }]}
                    numberOfLines={1}
                  >
                    {RATING_LABELS[value]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.fieldLabel}>Parecer * (as famílias veem no app)</Text>
            <TextInput
              style={[styles.input, { minHeight: 110, textAlignVertical: 'top' }]}
              value={batchNotes}
              onChangeText={setBatchNotes}
              placeholder="Como a turma caminhou neste período..."
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={2000}
            />
            <TouchableOpacity
              style={[styles.primaryBtn, savingBatch && { opacity: 0.6 }]}
              disabled={savingBatch}
              onPress={() => void handleSaveBatch()}
            >
              <Text style={styles.primaryBtnText}>
                {savingBatch
                  ? 'Salvando...'
                  : `Salvar para ${Object.values(batchSelected).filter(Boolean).length} catequizando(s)`}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Parecer por período */}
      <Modal
        visible={!!assessTarget}
        animationType="slide"
        onRequestClose={() => setAssessTarget(null)}
      >
        <View style={[styles.safe, { paddingTop: insets.top }]}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.headerBtn} onPress={() => setAssessTarget(null)} hitSlop={10}>
              <FontAwesome5 name="times" size={18} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle} numberOfLines={1}>
              Parecer · {assessTarget?.fullName ?? ''}
            </Text>
            <View style={styles.headerBtn} />
          </View>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {assessList.length === 0 ? (
              <Text style={styles.emptyLine}>Nenhum parecer registrado ainda.</Text>
            ) : (
              assessList.map((assessment) => (
                <View key={assessment.id} style={styles.assessCard}>
                  <Text style={styles.assessPeriod}>
                    {assessment.period}
                    {assessment.rating ? ` · ${RATING_LABELS[assessment.rating]}` : ''}
                  </Text>
                  <Text style={styles.assessNotes}>{assessment.notes}</Text>
                </View>
              ))
            )}

            <Text style={[styles.sectionTitle, { marginTop: 16, marginBottom: 8 }]}>Novo parecer</Text>
            <Text style={styles.fieldLabel}>Período *</Text>
            <TextInput
              style={styles.input}
              value={assessPeriod}
              onChangeText={setAssessPeriod}
              placeholder="1º semestre 2026"
              placeholderTextColor={colors.textTertiary}
            />
            <Text style={styles.fieldLabel}>Conceito (opcional)</Text>
            <View style={styles.ratingRow}>
              {(Object.keys(RATING_LABELS) as CatechesisRating[]).map((value) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.ratingChip, assessRating === value && styles.ratingChipSelected]}
                  onPress={() => setAssessRating(assessRating === value ? null : value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: assessRating === value }}
                  accessibilityLabel={`Conceito ${RATING_LABELS[value]}`}
                >
                  <Text
                    style={[styles.ratingChipText, assessRating === value && { color: '#fff' }]}
                    numberOfLines={1}
                  >
                    {RATING_LABELS[value]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.fieldLabel}>Parecer * (a família vê no app)</Text>
            <TextInput
              style={[styles.input, { minHeight: 110, textAlignVertical: 'top' }]}
              value={assessNotes}
              onChangeText={setAssessNotes}
              placeholder="Como o catequizando caminhou neste período..."
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={2000}
            />
            <TouchableOpacity
              style={[styles.primaryBtn, savingAssess && { opacity: 0.6 }]}
              disabled={savingAssess}
              onPress={() => void handleSaveAssessment()}
            >
              <Text style={styles.primaryBtnText}>{savingAssess ? 'Salvando...' : 'Salvar parecer'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Chamada */}
      <Modal
        visible={!!attendance}
        animationType="slide"
        onRequestClose={() => setAttendance(null)}
      >
        <View style={[styles.safe, { paddingTop: insets.top }]}>
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
    teamRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      backgroundColor: colors.card,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 9,
      marginTop: -8,
      marginBottom: 16,
    },
    teamText: { flex: 1, fontSize: 12.5, color: colors.textSecondary, lineHeight: 18 },
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
    groupLabel: {
      fontSize: 11.5,
      fontWeight: '800',
      color: colors.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 6,
      marginTop: 2,
    },
    showAllBtn: {
      alignItems: 'center',
      paddingVertical: 10,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderStyle: 'dashed',
      borderRadius: 12,
      marginTop: 2,
    },
    showAllText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
    sessionMeta: { fontSize: 12.5, color: colors.textSecondary, marginTop: 2 },

    pendingCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.warning,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 8,
    },
    decisionBtn: {
      width: 38,
      height: 38,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
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

    assessCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      marginBottom: 8,
    },
    assessPeriod: { fontSize: 13.5, fontWeight: '800', color: colors.text },
    assessNotes: { fontSize: 13.5, color: colors.textSecondary, marginTop: 4, lineHeight: 19 },
    ratingRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4, marginBottom: 4 },
    ratingChip: {
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 11,
      paddingVertical: 6,
    },
    ratingChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    ratingChipText: { fontSize: 12.5, fontWeight: '700', color: colors.textSecondary },

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
