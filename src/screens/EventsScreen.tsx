import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { eventsService, Event } from '../services/events';

export default function EventsScreen({ navigation }: any) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadEvents();
  }, []);

  async function loadEvents() {
    try {
      const data = await eventsService.getUpcoming(undefined, 50);
      setEvents(data);
    } catch (error) {
      console.error('Erro ao carregar eventos:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function onRefresh() {
    setRefreshing(true);
    loadEvents();
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  function formatTime(dateString: string) {
    const date = new Date(dateString);
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function getEventTypeColor(type: string): string {
    const colors: { [key: string]: string } = {
      LITURGICAL: '#6B46C1',
      PASTORAL: '#10B981',
      FORMATION: '#F59E0B',
      SOCIAL: '#EF4444',
      MEETING: '#3B82F6',
    };
    return colors[type] || '#6B7280';
  }

  function getEventTypeLabel(type: string): string {
    const labels: { [key: string]: string } = {
      LITURGICAL: 'Litúrgico',
      PASTORAL: 'Pastoral',
      FORMATION: 'Formação',
      SOCIAL: 'Social',
      MEETING: 'Reunião',
    };
    return labels[type] || type;
  }

  function renderEvent({ item }: { item: Event }) {
    return (
      <TouchableOpacity
        style={styles.eventCard}
        onPress={() => navigation.navigate('EventDetails', { eventId: item.id })}
      >
        <View style={styles.eventHeader}>
          <View style={styles.dateContainer}>
            <Text style={styles.dateDay}>
              {new Date(item.startDate).getDate()}
            </Text>
            <Text style={styles.dateMonth}>
              {new Date(item.startDate).toLocaleDateString('pt-BR', { month: 'short' })}
            </Text>
          </View>
          <View style={styles.eventInfo}>
            <Text style={styles.eventTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.eventTime}>
              {formatTime(item.startDate)}
              {item.location && ` • ${item.location}`}
            </Text>
          </View>
        </View>
        <View style={styles.eventFooter}>
          <View
            style={[
              styles.typeBadge,
              { backgroundColor: getEventTypeColor(item.type) },
            ]}
          >
            <Text style={styles.typeBadgeText}>
              {getEventTypeLabel(item.type)}
            </Text>
          </View>
          {item.isRecurring && (
            <View style={styles.recurringBadge}>
              <Text style={styles.recurringText}>🔄 Recorrente</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6B46C1" />
      </View>
    );
  }

  if (events.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyIcon}>📅</Text>
        <Text style={styles.emptyText}>Nenhum evento próximo</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={events}
        renderItem={renderEvent}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      />
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
    backgroundColor: '#f5f5f5',
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
  },
  listContent: {
    padding: 16,
  },
  eventCard: {
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
  eventHeader: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  dateContainer: {
    width: 60,
    height: 60,
    backgroundColor: '#6B46C1',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  dateDay: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  dateMonth: {
    fontSize: 12,
    color: '#E9D5FF',
    textTransform: 'uppercase',
  },
  eventInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  eventTime: {
    fontSize: 14,
    color: '#666',
  },
  eventFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
  },
  recurringBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  recurringText: {
    fontSize: 12,
    color: '#666',
  },
});

