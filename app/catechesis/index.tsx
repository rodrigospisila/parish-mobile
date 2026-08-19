import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';
import {
  getMyCatechesisClasses,
  MyCatechesisClass,
} from '../../src/services/catechesisService';

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/** Minhas turmas de catequese (catequista/auxiliar). */
export default function CatechesisClassesScreen() {
  const router = useRouter();
  const colors = useColors();
  const styles = createStyles(colors);

  const [classes, setClasses] = useState<MyCatechesisClass[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true);
    try {
      setClasses(await getMyCatechesisClasses());
    } catch (error) {
      console.error('Erro ao carregar turmas de catequese:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()} hitSlop={10}>
          <FontAwesome5 name="arrow-left" size={17} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Catequese</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => load(true)} />}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>Suas turmas como catequista ou auxiliar.</Text>

        {isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : classes.length === 0 ? (
          <View style={styles.empty}>
            <FontAwesome5 name="book-open" size={28} color={colors.textTertiary} />
            <Text style={styles.emptyText}>
              Você ainda não está vinculado(a) a nenhuma turma. A coordenação da catequese faz o
              vínculo pelo painel da paróquia.
            </Text>
          </View>
        ) : (
          classes.map((klass) => (
            <TouchableOpacity
              key={klass.classId}
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => router.push(`/catechesis/${klass.classId}` as never)}
            >
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {klass.name}
                </Text>
                <Text style={styles.roleChip}>{klass.role}</Text>
              </View>
              <Text style={styles.cardStage} numberOfLines={1}>
                {klass.stage.name} · {klass.year}
              </Text>
              <Text style={styles.cardMeta} numberOfLines={1}>
                {klass.community.name}
                {klass.weekday !== null && klass.weekday !== undefined
                  ? ` · ${WEEKDAYS[klass.weekday]}`
                  : ''}
                {klass.time ? ` às ${klass.time}` : ''}
                {klass.room ? ` · ${klass.room}` : ''}
              </Text>
              <View style={styles.cardStats}>
                <Text style={styles.cardStat}>
                  👥 {klass.activeEnrollments} catequizando{klass.activeEnrollments === 1 ? '' : 's'}
                </Text>
                <Text style={styles.cardStat}>
                  📅 {klass.sessionsCount} encontro{klass.sessionsCount === 1 ? '' : 's'}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
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
    scroll: { padding: 16, paddingBottom: 40, gap: 10 },
    subtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 4 },
    empty: { alignItems: 'center', gap: 12, marginTop: 48, paddingHorizontal: 24 },
    emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
    card: {
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      gap: 3,
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cardTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
    roleChip: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.primary,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 2,
      overflow: 'hidden',
    },
    cardStage: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    cardMeta: { fontSize: 12.5, color: colors.textSecondary },
    cardStats: { flexDirection: 'row', gap: 14, marginTop: 6 },
    cardStat: { fontSize: 12.5, color: colors.textSecondary },
  });
