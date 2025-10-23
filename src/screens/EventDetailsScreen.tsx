import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { eventsService, Event } from '../services/events';

export default function EventDetailsScreen({ route }: any) {
  const { eventId } = route.params;
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEvent();
  }, []);

  async function loadEvent() {
    try {
      const data = await eventsService.getById(eventId);
      setEvent(data);
    } catch (error) {
      console.error('Erro ao carregar evento:', error);
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
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

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6B46C1" />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Evento não encontrado</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View
        style={[
          styles.header,
          { backgroundColor: getEventTypeColor(event.type) },
        ]}
      >
        <Text style={styles.title}>{event.title}</Text>
        <View style={styles.typeBadge}>
          <Text style={styles.typeBadgeText}>
            {getEventTypeLabel(event.type)}
          </Text>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📅 Data e Hora</Text>
          <Text style={styles.dateText}>{formatDate(event.startDate)}</Text>
          <Text style={styles.timeText}>
            Início: {formatTime(event.startDate)}
          </Text>
          {event.endDate && (
            <Text style={styles.timeText}>
              Término: {formatTime(event.endDate)}
            </Text>
          )}
          {event.isRecurring && (
            <View style={styles.recurringBadge}>
              <Text style={styles.recurringText}>🔄 Evento Recorrente</Text>
            </View>
          )}
        </View>

        {event.location && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📍 Local</Text>
            <Text style={styles.text}>{event.location}</Text>
          </View>
        )}

        {event.description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📝 Descrição</Text>
            <Text style={styles.text}>{event.description}</Text>
          </View>
        )}

        {event.maxParticipants && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>👥 Participantes</Text>
            <Text style={styles.text}>
              Máximo de {event.maxParticipants} participantes
            </Text>
          </View>
        )}

        {event.community && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>⛪ Comunidade</Text>
            <Text style={styles.text}>{event.community.name}</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ℹ️ Informações</Text>
          <Text style={styles.text}>
            Evento {event.isPublic ? 'Público' : 'Privado'}
          </Text>
        </View>
      </View>
    </ScrollView>
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
  errorText: {
    fontSize: 16,
    color: '#666',
  },
  header: {
    padding: 24,
    paddingTop: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  typeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  typeBadgeText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
  content: {
    padding: 16,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  dateText: {
    fontSize: 16,
    color: '#333',
    marginBottom: 8,
    textTransform: 'capitalize',
  },
  timeText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  text: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  recurringBadge: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  recurringText: {
    fontSize: 14,
    color: '#666',
  },
});

