import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
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

export default function CalendarScreen() {
  const { user } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);

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
        dotColor: event.type === 'MISSA' ? 'red' : event.type === 'REUNIAO' ? 'blue' : 'green',
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
    return events.filter((event) => event.date.split('T')[0] === selectedDate).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [events, selectedDate]);

  const onDayPress = (day: DateData) => {
    setSelectedDate(day.dateString);
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
        <Text style={styles.eventsTitle}>Eventos em {formatToBrazilianDate(selectedDate, 'dd/MM/yyyy')}</Text>
        {eventsForSelectedDate.length > 0 ? (
          eventsForSelectedDate.map((event) => (
            <View key={event.id} style={styles.eventItem}>
              <Text style={styles.eventTime}>{formatToBrazilianDate(event.date, 'HH:mm')}</Text>
              <View style={styles.eventDetails}>
                <Text style={styles.eventTitle}>{event.title}</Text>
                <Text style={styles.eventLocation}>{event.location}</Text>
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.noEvents}>Nenhum evento agendado para esta data.</Text>
        )}
      </View>
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
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  eventsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  eventItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    padding: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 5,
  },
  eventTime: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#00adf5',
    marginRight: 15,
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
  noEvents: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    marginTop: 20,
  },
});
