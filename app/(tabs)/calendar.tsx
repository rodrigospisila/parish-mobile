import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import { Calendar, DateData, LocaleConfig } from 'react-native-calendars';
import { useAuth } from '../../src/context/AuthContext';
import { getCommunityEvents, Event } from '../../src/services/eventService';
import { formatToBrazilianDate } from '../../src/utils/dateUtils';

// Configuração do Locale para Português
LocaleConfig.locales['br'] = {
  monthNames: [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ],
  monthNamesShort: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
  dayNames: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'],
  dayNamesShort: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
  today: 'Hoje',
};
LocaleConfig.defaultLocale = 'br';

// Mapeamento de tipos de evento para labels amigáveis
const eventTypeLabels: { [key: string]: string } = {
  MISSA: 'Missa',
  REUNIAO: 'Reunião',
  ATIVIDADE: 'Atividade',
};

// Mapeamento de tipos de evento para cores
const eventTypeColors: { [key: string]: string } = {
  MISSA: '#E74C3C',
  REUNIAO: '#3498DB',
  ATIVIDADE: '#27AE60',
};

export default function CalendarScreen() {
  const { user } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);

  const communityId = user?.communityId;

  // 1. Carregar Eventos
  useEffect(() => {
    if (!communityId) {
      setIsLoading(false);
      return;
    }

    const loadEvents = async () => {
      setIsLoading(true);
      try {
        const data = await getCommunityEvents(communityId);
        setEvents(data);
      } catch (error) {
        Alert.alert('Erro', 'Não foi possível carregar os eventos.');
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };

    loadEvents();
  }, [communityId]);

  // 2. Mapear Eventos para o formato MarkedDates do react-native-calendars
  const markedDates = useMemo(() => {
    const marked: { [key: string]: any } = {};
    events.forEach((event) => {
      const date = event.date.split('T')[0];
      marked[date] = {
        marked: true,
        dotColor: eventTypeColors[event.type] || '#00adf5',
        selected: date === selectedDate,
        selectedColor: date === selectedDate ? '#00adf5' : undefined,
      };
    });

    // Garante que a data selecionada esteja marcada
    if (!marked[selectedDate]) {
      marked[selectedDate] = { selected: true, selectedColor: '#00adf5' };
    } else {
      marked[selectedDate].selected = true;
      marked[selectedDate].selectedColor = '#00adf5';
    }

    return marked;
  }, [events, selectedDate]);

  // 3. Filtrar eventos para a data selecionada
  const eventsForSelectedDate = useMemo(() => {
    return events
      .filter((event) => event.date.split('T')[0] === selectedDate)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [events, selectedDate]);

  const onDayPress = (day: DateData) => {
    setSelectedDate(day.dateString);
  };

  const openEventDetails = (event: Event) => {
    setSelectedEvent(event);
    setIsModalVisible(true);
  };

  const closeEventDetails = () => {
    setIsModalVisible(false);
    setSelectedEvent(null);
  };

  if (!communityId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.message}>Selecione sua comunidade para ver o calendário.</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#00adf5" />
        <Text style={{ marginTop: 10 }}>Carregando Calendário...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Calendar
        onDayPress={onDayPress}
        markedDates={markedDates}
        markingType={'dot'}
        theme={{
          todayTextColor: '#00adf5',
          selectedDayBackgroundColor: '#00adf5',
          dotColor: '#00adf5',
          textDayFontWeight: '300',
          textMonthFontWeight: 'bold',
          textDayHeaderFontWeight: '500',
          textDayFontSize: 16,
          textMonthFontSize: 18,
          textDayHeaderFontSize: 16,
        }}
      />

      <View style={styles.eventsContainer}>
        <Text style={styles.eventsTitle}>
          Eventos em {formatToBrazilianDate(selectedDate, 'dd/MM/yyyy')}
        </Text>
        <ScrollView style={styles.eventsList}>
          {eventsForSelectedDate.length > 0 ? (
            eventsForSelectedDate.map((event) => (
              <TouchableOpacity
                key={event.id}
                style={styles.eventItem}
                onPress={() => openEventDetails(event)}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.eventTypeIndicator,
                    { backgroundColor: eventTypeColors[event.type] || '#00adf5' },
                  ]}
                />
                <Text style={styles.eventTime}>
                  {formatToBrazilianDate(event.date, 'HH:mm')}
                </Text>
                <View style={styles.eventDetails}>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  <Text style={styles.eventLocation}>{event.location}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            ))
          ) : (
            <Text style={styles.noEvents}>Nenhum evento agendado para esta data.</Text>
          )}
        </ScrollView>
      </View>

      {/* Modal de Detalhes do Evento */}
      <Modal
        visible={isModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={closeEventDetails}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedEvent && (
              <>
                <View style={styles.modalHeader}>
                  <View
                    style={[
                      styles.modalTypeTag,
                      { backgroundColor: eventTypeColors[selectedEvent.type] || '#00adf5' },
                    ]}
                  >
                    <Text style={styles.modalTypeText}>
                      {eventTypeLabels[selectedEvent.type] || selectedEvent.type}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={closeEventDetails} style={styles.closeButton}>
                    <Text style={styles.closeButtonText}>✕</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.modalTitle}>{selectedEvent.title}</Text>

                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalLabel}>📅 Data e Hora:</Text>
                  <Text style={styles.modalValue}>
                    {formatToBrazilianDate(selectedEvent.date, 'dd/MM/yyyy')} às{' '}
                    {formatToBrazilianDate(selectedEvent.date, 'HH:mm')}
                  </Text>
                </View>

                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalLabel}>📍 Local:</Text>
                  <Text style={styles.modalValue}>{selectedEvent.location}</Text>
                </View>

                {selectedEvent.description && (
                  <View style={styles.modalDescriptionContainer}>
                    <Text style={styles.modalLabel}>📝 Descrição:</Text>
                    <Text style={styles.modalDescription}>{selectedEvent.description}</Text>
                  </View>
                )}

                {/* Placeholder para Escalas de Serviço (será implementado no próximo passo) */}
                <View style={styles.serviceRosterPlaceholder}>
                  <Text style={styles.serviceRosterTitle}>📋 Escalas de Serviço</Text>
                  <Text style={styles.serviceRosterText}>
                    Em breve: visualize as pastorais e membros escalados para este evento.
                  </Text>
                </View>

                <TouchableOpacity style={styles.modalCloseButton} onPress={closeEventDetails}>
                  <Text style={styles.modalCloseButtonText}>Fechar</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  message: {
    fontSize: 16,
    color: '#666',
  },
  eventsContainer: {
    flex: 1,
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  eventsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  eventsList: {
    flex: 1,
  },
  eventItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    padding: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
  },
  eventTypeIndicator: {
    width: 4,
    height: '100%',
    borderRadius: 2,
    marginRight: 10,
    minHeight: 40,
  },
  eventTime: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#00adf5',
    marginRight: 12,
    minWidth: 50,
  },
  eventDetails: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  eventLocation: {
    fontSize: 14,
    color: '#666',
  },
  chevron: {
    fontSize: 24,
    color: '#ccc',
    marginLeft: 10,
  },
  noEvents: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    marginTop: 20,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  modalTypeTag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  modalTypeText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  closeButton: {
    padding: 5,
  },
  closeButtonText: {
    fontSize: 20,
    color: '#999',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
  },
  modalInfoRow: {
    marginBottom: 15,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  modalValue: {
    fontSize: 16,
    color: '#333',
  },
  modalDescriptionContainer: {
    marginBottom: 15,
  },
  modalDescription: {
    fontSize: 16,
    color: '#333',
    lineHeight: 22,
  },
  serviceRosterPlaceholder: {
    backgroundColor: '#f0f8ff',
    padding: 15,
    borderRadius: 10,
    marginTop: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#cce5ff',
  },
  serviceRosterTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#004085',
    marginBottom: 5,
  },
  serviceRosterText: {
    fontSize: 14,
    color: '#004085',
  },
  modalCloseButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalCloseButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
