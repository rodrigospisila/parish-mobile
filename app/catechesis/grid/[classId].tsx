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
  const [savingCell, setSavingCell] = useState<string | null>(null);

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

  /** Toque: — → presente → falta → falta justificada → limpar (—). Grava na hora. */
  const cycleCell = async (sessionId: string, enrollmentId: string) => {
    if (!grid) return;
    const key = `${sessionId}:${enrollmentId}`;
    const mark = markMap.get(key);
    let next: { present: boolean; justified?: boolean; clear?: boolean };
    if (!mark) next = { present: true };
    else if (mark.present) next = { present: false };
    else if (!mark.justified) next = { present: false, justified: true };
    else {
      if (mark.hasCertificate) {
        const proceed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Atestado será removido',
            'Limpar este lançamento remove também o atestado anexado à falta. Continuar?',
            [
              { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Continuar', style: 'destructive', onPress: () => resolve(true) },
            ],
          );
        });
        if (!proceed) return;
      }
      // Fecha o ciclo desfazendo o lançamento — toque por engano tem volta
      next = { present: false, clear: true };
    }
    const previousMarks = grid.marks;
    setSavingCell(key);
    setGrid((current) => {
      if (!current) return current;
      const others = current.marks.filter((m) => !(m.sessionId === sessionId && m.enrollmentId === enrollmentId));
      if (next.clear) return { ...current, marks: others };
      return {
        ...current,
        marks: [
          ...others,
          {
            sessionId,
            enrollmentId,
            present: next.present,
            late: false,
            justified: !next.present && next.justified === true,
            hasCertificate: !next.present && next.justified === true ? mark?.hasCertificate ?? false : false,
          },
        ],
      };
    });
    try {
      await markSessionAttendance(sessionId, [
        { enrollmentId, present: next.present, late: false, justified: next.justified ?? false, clear: next.clear ?? false },
      ]);
    } catch (error: any) {
      setGrid((current) => (current ? { ...current, marks: previousMarks } : current));
      Alert.alert('Não gravado', error?.message ?? 'Tente novamente.');
    } finally {
      setSavingCell(null);
    }
  };

  const cellVisual = (mark: AttendanceGridMark | undefined) => {
    if (!mark) return { label: '·', color: colors.textTertiary, bg: 'transparent' };
    if (mark.present) {
      return { label: mark.late ? 'P🕒' : 'P', color: colors.success, bg: colors.success + '18' };
    }
    if (mark.justified) {
      return { label: mark.hasCertificate ? 'FJ📎' : 'FJ', color: colors.warning, bg: colors.warning + '18' };
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
        Toque na célula: presente → falta → falta justificada → limpar · cada toque já grava
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
                  const mark = markMap.get(`${session.id}:${student.enrollmentId}`);
                  if (mark) {
                    marked += 1;
                    if (mark.present) present += 1;
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
                      const visual = cellVisual(markMap.get(key));
                      const saving = savingCell === key;
                      return (
                        <TouchableOpacity
                          key={session.id}
                          style={[styles.cell, { backgroundColor: visual.bg }]}
                          activeOpacity={0.6}
                          disabled={saving}
                          onPress={() => void cycleCell(session.id, student.enrollmentId)}
                        >
                          {saving ? (
                            <ActivityIndicator size="small" color={colors.primary} />
                          ) : (
                            <Text style={[styles.cellText, { color: visual.color }]}>{visual.label}</Text>
                          )}
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

      {!isLoading && grid && grid.sessions.length > 0 && (
        <Text style={styles.legend}>P presente · P🕒 atraso · F falta · FJ justificada · 📎 atestado</Text>
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
    pctText: { fontSize: 11.5, fontWeight: '700', color: colors.textSecondary },
    legend: {
      fontSize: 11,
      color: colors.textTertiary,
      textAlign: 'center',
      paddingVertical: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
  });
