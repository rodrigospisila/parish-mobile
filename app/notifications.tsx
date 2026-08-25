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
import { useColors } from '../src/context/ThemeContext';
import { AppNotification, getMyNotifications } from '../src/services/catechesisService';

// Valores REAIS do enum NotificationType do backend
const TYPE_META: Record<string, { label: string; icon: string }> = {
  CATECHESIS: { label: 'Catequese', icon: 'book' },
  SCHEDULE_REMINDER: { label: 'Escala', icon: 'clipboard-list' },
  ASSIGNMENT_CREATED: { label: 'Escala', icon: 'clipboard-list' },
  ASSIGNMENT_DECLINED: { label: 'Escala', icon: 'clipboard-list' },
  ASSIGNMENT_REPLACED: { label: 'Escala', icon: 'clipboard-list' },
  SCHEDULE_CANCELLED: { label: 'Escala', icon: 'clipboard-list' },
  TEAM_BROADCAST: { label: 'Pastoral', icon: 'users' },
  EVENT_REMINDER: { label: 'Evento', icon: 'calendar-alt' },
  URGENT_NOTICE: { label: 'Aviso urgente', icon: 'bullhorn' },
  NEWS: { label: 'Notícia', icon: 'newspaper' },
  CLERGY_MESSAGE: { label: 'Palavra Pastoral', icon: 'scroll' },
  PRAYER_REQUEST: { label: 'Oração', icon: 'praying-hands' },
  MASS_INTENTION_CONFIRMED: { label: 'Intenção de missa', icon: 'church' },
  DAILY_LITURGY: { label: 'Liturgia', icon: 'book-open' },
};

// O endpoint aceita UM type; os grupos são filtrados aqui a partir de 'Todos'
const FILTERS: Array<{ key: string | null; label: string; types?: string[] }> = [
  { key: null, label: 'Todos' },
  { key: 'catechesis', label: 'Catequese', types: ['CATECHESIS'] },
  {
    key: 'schedule',
    label: 'Escala',
    types: ['SCHEDULE_REMINDER', 'ASSIGNMENT_CREATED', 'ASSIGNMENT_DECLINED', 'ASSIGNMENT_REPLACED', 'SCHEDULE_CANCELLED', 'TEAM_BROADCAST'],
  },
  { key: 'event', label: 'Eventos', types: ['EVENT_REMINDER'] },
];

/** Central de avisos: tudo que chegou por push, para reler com calma. */
export default function NotificationsScreen() {
  const router = useRouter();
  const colors = useColors();
  const styles = createStyles(colors);

  const [items, setItems] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true);
    try {
      const list = await getMyNotifications();
      setItems(list);
    } catch (error) {
      console.error('Erro ao carregar avisos:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  const activeTypes = FILTERS.find((option) => option.key === filter)?.types;
  const visible = activeTypes ? items.filter((notice) => activeTypes.includes(notice.type)) : items;

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
        <Text style={styles.headerTitle}>🔔 Avisos</Text>
        <View style={styles.headerBtn} />
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((option) => (
          <TouchableOpacity
            key={option.label}
            style={[styles.filterChip, filter === option.key && styles.filterChipOn]}
            onPress={() => setFilter(option.key)}
          >
            <Text style={[styles.filterChipText, filter === option.key && styles.filterChipTextOn]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => load(true)} />}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : visible.length === 0 ? (
          <View style={styles.empty}>
            <FontAwesome5 name="bell-slash" size={26} color={colors.textTertiary} />
            <Text style={styles.emptyText}>
              {filter ? 'Nenhum aviso deste tipo.' : 'Nenhum aviso por aqui ainda.'}
            </Text>
          </View>
        ) : (
          visible.map((notice) => {
            const meta = TYPE_META[notice.type ?? ''] ?? { label: 'Aviso', icon: 'bell' };
            return (
              <View key={notice.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.cardIcon}>
                    <FontAwesome5 name={meta.icon as never} size={13} color={colors.primary} />
                  </View>
                  <Text style={styles.cardTitle}>{notice.title}</Text>
                  <Text style={styles.cardDate}>
                    {new Date(notice.createdAt).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                    })}
                  </Text>
                </View>
                <Text style={styles.cardBody}>{notice.body}</Text>
                <Text style={styles.cardKind}>{meta.label}</Text>
              </View>
            );
          })
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
    filterRow: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    filterChip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    filterChipOn: { borderColor: colors.primary, backgroundColor: colors.primary + '18' },
    filterChipText: { fontSize: 12.5, color: colors.textSecondary, fontWeight: '600' },
    filterChipTextOn: { color: colors.primary },
    scroll: { padding: 16, paddingTop: 4, paddingBottom: 40, gap: 10 },
    empty: { alignItems: 'center', gap: 12, marginTop: 48, paddingHorizontal: 24 },
    emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
    card: {
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      gap: 4,
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cardIcon: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: colors.primary + '15',
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardTitle: { flex: 1, fontSize: 14.5, fontWeight: '700', color: colors.text },
    cardDate: { fontSize: 12, color: colors.textTertiary, fontWeight: '600' },
    cardBody: { fontSize: 13.5, color: colors.text, lineHeight: 20 },
    cardKind: { fontSize: 11.5, color: colors.textTertiary, fontWeight: '600' },
  });
