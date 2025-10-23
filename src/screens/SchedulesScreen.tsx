import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { schedulesService, ScheduleAssignment, MemberStats } from '../services/schedules';

export default function SchedulesScreen({ navigation }: any) {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<ScheduleAssignment[]>([]);
  const [stats, setStats] = useState<MemberStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (user?.id) {
      loadData();
    }
  }, [user]);

  async function loadData() {
    try {
      // Carregar minhas atribuições
      const assignmentsData = await schedulesService.getMyAssignments(user!.id);
      setAssignments(assignmentsData);

      // Carregar estatísticas
      const statsData = await schedulesService.getMemberStats(user!.id);
      setStats(statsData);
    } catch (error) {
      console.error('Erro ao carregar escalas:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function onRefresh() {
    setRefreshing(true);
    loadData();
  }

  async function handleCheckIn(assignment: ScheduleAssignment) {
    try {
      if (assignment.checkedIn) {
        await schedulesService.undoCheckIn(assignment.id);
        Alert.alert('Sucesso', 'Check-in desfeito com sucesso!');
      } else {
        await schedulesService.checkIn(assignment.id);
        Alert.alert('Sucesso', 'Check-in realizado com sucesso!');
      }
      loadData(); // Recarregar dados
    } catch (error: any) {
      Alert.alert(
        'Erro',
        error.response?.data?.message || 'Erro ao fazer check-in'
      );
    }
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  function isPast(dateString: string): boolean {
    return new Date(dateString) < new Date();
  }

  function renderAssignment({ item }: { item: ScheduleAssignment }) {
    const past = isPast(item.schedule?.date || '');

    return (
      <View style={[styles.card, past && styles.cardPast]}>
        <View style={styles.cardHeader}>
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.schedule?.event?.title}
            </Text>
            <Text style={styles.cardSubtitle}>
              {formatDate(item.schedule?.date || '')}
            </Text>
          </View>
          <View
            style={[
              styles.roleBadge,
              item.checkedIn && styles.roleBadgeChecked,
            ]}
          >
            <Text style={styles.roleBadgeText}>{item.role}</Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <View style={styles.statusContainer}>
            {item.checkedIn ? (
              <Text style={styles.statusChecked}>✅ Check-in feito</Text>
            ) : past ? (
              <Text style={styles.statusMissed}>❌ Não compareceu</Text>
            ) : (
              <Text style={styles.statusPending}>⏳ Pendente</Text>
            )}
          </View>

          {!past && (
            <TouchableOpacity
              style={[
                styles.checkInButton,
                item.checkedIn && styles.checkInButtonUndo,
              ]}
              onPress={() => handleCheckIn(item)}
            >
              <Text style={styles.checkInButtonText}>
                {item.checkedIn ? 'Desfazer' : 'Check-in'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6B46C1" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {stats && (
        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>Suas Estatísticas</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.total}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: '#10B981' }]}>
                {stats.checkedIn}
              </Text>
              <Text style={styles.statLabel}>Presentes</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: '#EF4444' }]}>
                {stats.missed}
              </Text>
              <Text style={styles.statLabel}>Faltas</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: '#6B46C1' }]}>
                {stats.attendanceRate.toFixed(0)}%
              </Text>
              <Text style={styles.statLabel}>Taxa</Text>
            </View>
          </View>
        </View>
      )}

      {assignments.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>👥</Text>
          <Text style={styles.emptyText}>Você não está em nenhuma escala</Text>
        </View>
      ) : (
        <FlatList
          data={assignments}
          renderItem={renderAssignment}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
  },
  statsCard: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
  },
  listContent: {
    padding: 16,
    paddingTop: 0,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  cardPast: {
    opacity: 0.7,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardInfo: {
    flex: 1,
    marginRight: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  roleBadge: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleBadgeChecked: {
    backgroundColor: '#10B981',
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusContainer: {
    flex: 1,
  },
  statusChecked: {
    fontSize: 14,
    color: '#10B981',
    fontWeight: '600',
  },
  statusMissed: {
    fontSize: 14,
    color: '#EF4444',
    fontWeight: '600',
  },
  statusPending: {
    fontSize: 14,
    color: '#F59E0B',
    fontWeight: '600',
  },
  checkInButton: {
    backgroundColor: '#6B46C1',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },
  checkInButtonUndo: {
    backgroundColor: '#EF4444',
  },
  checkInButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

