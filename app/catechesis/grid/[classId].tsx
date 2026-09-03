import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useColors } from '../../../src/context/ThemeContext';
import {
  AttendanceGrid,
  AttendanceGridMark,
  getAttendanceGrid,
  markSessionAttendance,
} from '../../../src/services/catechesisService';

const NAME_WIDTH = 132;
const CELL_WIDTH = 46;
const ROW_HEIGHT = 40;

/** Estado de uma célula ('empty' = sem chamada). */
type CellState = 'present' | 'late' | 'absent' | 'justified' | 'empty';
const NEXT_STATE: Record<CellState, CellState> = {
  empty: 'present',
  present: 'late',
  late: 'absent',
  absent: 'justified',
  justified: 'empty',
};

/**
 * Folha de presença (alunos × encontros), como o formulário de papel.
 * Toque na célula lança na hora: presente → falta → falta justificada.
 * O atestado da falta é anexado pela chamada do encontro.
 */
export default function AttendanceGridScreen() {
  const router = useRouter();
  const colors = useColors();
  const styles = createStyles(colors);
  const { classId } = useLocalSearchParams<{ classId: string }>();

  const [grid, setGrid] = useState<AttendanceGrid | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Toques ficam em RASCUNHO — só "Salvar chamada" grava (passar pelo F no
  // ciclo não pode avisar falta à família)
  const [draft, setDraft] = useState<Record<string, CellState>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!classId) return;
    setIsLoading(true);
    try {
      setGrid(await getAttendanceGrid(classId));
    } catch (error: any) {
      Alert.alert('Folha de presença', error?.message ?? 'Não foi possível carregar.');
    } finally {
      setIsLoading(false);
    }
  }, [classId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const markMap = useMemo(() => {
    const map = new Map<string, AttendanceGridMark>();
    grid?.marks.forEach((mark) => map.set(`${mark.sessionId}:${mark.enrollmentId}`, mark));
    return map;
  }, [grid]);

  /** Estado gravado (o que o servidor conhece). */
  const stateOf = (mark: AttendanceGridMark | undefined): CellState => {
    if (!mark) return 'empty';
    if (mark.present) return mark.late ? 'late' : 'present';
    return mark.justified ? 'justified' : 'absent';
  };

  /** Estado efetivo da célula: rascunho por cima do gravado. */
  const effectiveState = (key: string): CellState => draft[key] ?? stateOf(markMap.get(key));

  /** Toque: só o RASCUNHO muda — presente → atraso → falta → justificada → limpar. */
  const cycleCell = (sessionId: string, enrollmentId: string) => {
    if (saving) return;
    const key = `${sessionId}:${enrollmentId}`;
    setDraft((prev) => {
      const current = prev[key] ?? stateOf(markMap.get(key));
      const next = NEXT_STATE[current];
      const cleaned = { ...prev };
      if (next === stateOf(markMap.get(key))) delete cleaned[key];
      else cleaned[key] = next;
      return cleaned;
    });
  };

  /** Salvar: agrupa o rascunho por encontro e grava o estado FINAL. */
  const saveDraft = async () => {
    if (!grid || saving) return;
    const entries = Object.entries(draft);
    if (!entries.length) return;
    const losesCertificate = entries.some(([key, state]) => {
      const mark = markMap.get(key);
      return !!mark?.hasCertificate && stateOf(mark) === 'justified' && state !== 'justified';
    });
    if (losesCertificate) {
      const proceed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          'Atestado será removido',
          'Alguma falta com atestado deixou de ser "falta justificada" — salvar remove o atestado. Continuar?',
          [
            { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Salvar mesmo assim', style: 'destructive', onPress: () => resolve(true) },
          ],
        );
      });
      if (!proceed) return;
    }
    const bySession = new Map<string, Array<{ enrollmentId: string; present: boolean; late: boolean; justified: boolean; clear: boolean }>>();
    entries.forEach(([key, state]) => {
      const [sessionId, enrollmentId] = key.split(':');
      const list = bySession.get(sessionId) ?? [];
      list.push({
        enrollmentId,
        present: state === 'present' || state === 'late',
        late: state === 'late',
        justified: state === 'justified',
        clear: state === 'empty',
      });
      bySession.set(sessionId, list);
    });
    setSaving(true);
    try {
      for (const [sessionId, sessionEntries] of bySession) {
        await markSessionAttendance(sessionId, sessionEntries);
      }
      setDraft({});
      await load();
    } catch (error: any) {
      Alert.alert('Não salvo', error?.message ?? 'Tente novamente — os toques continuam em rascunho.');
    } finally {
      setSaving(false);
    }
  };

  const cellVisual = (state: CellState, hasCertificate: boolean) => {
    if (state === 'empty') return { label: '·', color: colors.textTertiary, bg: 'transparent' };
    if (state === 'present') return { label: 'P', color: colors.success, bg: colors.success + '18' };
    if (state === 'late') return { label: 'P🕒', color: colors.success, bg: colors.success + '18' };
    if (state === 'justified') {
      return { label: hasCertificate ? 'FJ📎' : 'FJ', color: colors.warning, bg: colors.warning + '18' };
    }
    return { label: 'F', color: colors.error ?? '#d9534f', bg: (colors.error ?? '#d9534f') + '18' };
  };

  const dateLabel = (iso: string) => {
    const date = new Date(iso);
    return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()} hitSlop={10}>
          <FontAwesome5 name="arrow-left" size={17} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🗒 Folha de presença</Text>
        <View style={styles.headerBtn} />
      </View>
      <Text style={styles.subtitle}>
        Toque na célula: presente → atraso → falta → falta justificada → limpar · nada grava até “Salvar chamada”
      </Text>

      {isLoading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : !grid || grid.sessions.length === 0 ? (
        <Text style={styles.emptyText}>Nenhum encontro criado ainda nesta turma.</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator bounces={false}>
          <View>
            {/* Cabeçalho de datas */}
            <View style={styles.row}>
              <View style={[styles.nameCell, styles.headCell]}>
                <Text style={styles.headText}>Catequizando</Text>
              </View>
              {grid.sessions.map((session) => (
                <View key={session.id} style={[styles.cell, styles.headCell]}>
                  <Text style={styles.headText}>{dateLabel(session.date)}</Text>
                </View>
              ))}
              <View style={[styles.cell, styles.headCell]}>
                <Text style={styles.headText}>%</Text>
              </View>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
              {grid.students.map((student) => {
                let present = 0;
                let marked = 0;
                grid.sessions.forEach((session) => {
                  const state = effectiveState(`${session.id}:${student.enrollmentId}`);
                  if (state !== 'empty') {
                    marked += 1;
                    if (state === 'present' || state === 'late') present += 1;
                  }
                });
                const pct = marked === 0 ? '—' : `${Math.round((present / marked) * 100)}%`;
                return (
                  <View key={student.enrollmentId} style={styles.row}>
                    <View style={styles.nameCell}>
                      <Text style={styles.nameText} numberOfLines={2}>
                        {student.member.fullName}
                      </Text>
                    </View>
                    {grid.sessions.map((session) => {
                      const key = `${session.id}:${student.enrollmentId}`;
                      const state = effectiveState(key);
                      const dirty = key in draft;
                      const visual = cellVisual(state, !!markMap.get(key)?.hasCertificate);
                      return (
                        <TouchableOpacity
                          key={session.id}
                          style={[styles.cell, { backgroundColor: visual.bg }, dirty && styles.cellDirty]}
                          activeOpacity={0.6}
                          disabled={saving}
                          onPress={() => cycleCell(session.id, student.enrollmentId)}
                        >
                          <Text style={[styles.cellText, { color: visual.color }]}>{visual.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                    <View style={styles.cell}>
                      <Text style={styles.pctText}>{pct}</Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </ScrollView>
      )}

      {Object.keys(draft).length > 0 && (
        <View style={styles.saveBar}>
          <TouchableOpacity style={styles.discardBtn} disabled={saving} onPress={() => setDraft({})}>
            <Text style={styles.discardBtnText}>Descartar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            disabled={saving}
            onPress={() => void saveDraft()}
          >
            <Text style={styles.saveBtnText}>
              {saving ? 'Salvando…' : `Salvar chamada (${Object.keys(draft).length})`}
            </Text>
          </TouchableOpacity>
        </View>
      )}
      {!isLoading && grid && grid.sessions.length > 0 && (
        <Text style={styles.legend}>P presente · P🕒 atraso · F falta · FJ justificada · 📎 atestado · borda azul = não salvo</Text>
      )}
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
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    headerBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
    subtitle: {
      fontSize: 11.5,
      color: colors.textSecondary,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 32 },
    row: { flexDirection: 'row' },
    nameCell: {
      width: NAME_WIDTH,
      height: ROW_HEIGHT,
      justifyContent: 'center',
      paddingHorizontal: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    nameText: { fontSize: 12, fontWeight: '600', color: colors.text },
    cell: {
      width: CELL_WIDTH,
      height: ROW_HEIGHT,
      alignItems: 'center',
      justifyContent: 'center',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderLeftColor: colors.border,
    },
    headCell: { backgroundColor: colors.card },
    headText: { fontSize: 11, fontWeight: '800', color: colors.textSecondary },
    cellText: { fontSize: 12, fontWeight: '800' },
    // Alteração em rascunho (não salva): borda azul na célula
    cellDirty: { borderWidth: 1.5, borderColor: colors.primary, borderRadius: 6 },
    pctText: { fontSize: 11.5, fontWeight: '700', color: colors.textSecondary },
    saveBar: {
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
    },
    discardBtn: {
      paddingHorizontal: 14,
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 10,
    },
    discardBtnText: { fontSize: 13.5, fontWeight: '700', color: colors.textSecondary },
    saveBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 12,
      backgroundColor: colors.primary,
      borderRadius: 10,
    },
    saveBtnText: { fontSize: 14.5, fontWeight: '800', color: '#fff' },
    legend: {
      fontSize: 11,
      color: colors.textTertiary,
      textAlign: 'center',
      paddingVertical: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
  });
