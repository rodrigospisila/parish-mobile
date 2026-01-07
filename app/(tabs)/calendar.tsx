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
  SafeAreaView,
} from 'react-native';
import { Calendar, DateData, LocaleConfig } from 'react-native-calendars';
import { useAuth } from '../../src/context/AuthContext';
import { useColors, useTheme } from '../../src/context/ThemeContext';
import { getCommunityEvents, Event, getEventTypeLabel, getEventTypeColor, getEventWithRosters, ServiceRoster } from '../../src/services/eventService';
import { formatToBrazilianDate } from '../../src/utils/dateUtils';

// Configuração do Locale para Português
LocaleConfig.locales['br'] = {
  monthNames: [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ],
  monthNamesShort: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
  dayNames: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'],
  dayNamesShort: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
  today: 'Hoje',
};
LocaleConfig.defaultLocale = 'br';

// Importamos getEventTypeLabel e getEventTypeColor do eventService

export default function CalendarScreen() {
  const { user } = useAuth();
  const colors = useColors();
  const { isDark } = useTheme();
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [serviceRosters, setServiceRosters] = useState<ServiceRoster[]>([]);
  const [isLoadingRosters, setIsLoadingRosters] = useState(false);

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

  // 2. Mapear Eventos para o formato MarkedDates
  const markedDates = useMemo(() => {
    const marked: { [key: string]: any } = {};
    events.forEach((event) => {
      const date = event.startDate.split('T')[0];
      marked[date] = {
        marked: true,
        dotColor: getEventTypeColor(event.type),
        selected: date === selectedDate,
        selectedColor: date === selectedDate ? colors.highlight : undefined,
      };
    });

    if (!marked[selectedDate]) {
      marked[selectedDate] = { selected: true, selectedColor: colors.highlight };
    } else {
      marked[selectedDate].selected = true;
      marked[selectedDate].selectedColor = colors.highlight;
    }

    return marked;
  }, [events, selectedDate, colors, eventTypeColors]);

  // 3. Filtrar eventos para a data selecionada
  const eventsForSelectedDate = useMemo(() => {
    return events
      .filter((event) => event.startDate.split('T')[0] === selectedDate)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  }, [events, selectedDate]);

  const onDayPress = (day: DateData) => {
    setSelectedDate(day.dateString);
  };

  const openEventDetails = async (event: Event) => {
    setSelectedEvent(event);
    setIsModalVisible(true);
    setServiceRosters([]);
    
    // Carregar escalas de serviço
    setIsLoadingRosters(true);
    try {
      const eventWithRosters = await getEventWithRosters(event);
      setServiceRosters(eventWithRosters.serviceRosters);
    } catch (error) {
      console.error('Erro ao carregar escalas:', error);
    } finally {
      setIsLoadingRosters(false);
    }
  };

  const closeEventDetails = () => {
    setIsModalVisible(false);
    setSelectedEvent(null);
    setServiceRosters([]);
  };

  const styles = createStyles(colors);

  // Tema do calendário
  const calendarTheme = useMemo(
    () => ({
      backgroundColor: colors.surface,
      calendarBackground: colors.surface,
      textSectionTitleColor: colors.textSecondary,
      selectedDayBackgroundColor: colors.highlight,
      selectedDayTextColor: colors.textInverse,
      todayTextColor: colors.highlight,
      dayTextColor: colors.text,
      textDisabledColor: colors.disabled,
      dotColor: colors.highlight,
      selectedDotColor: colors.textInverse,
      arrowColor: colors.primary,
      monthTextColor: colors.text,
      textDayFontWeight: '300' as const,
      textMonthFontWeight: 'bold' as const,
      textDayHeaderFontWeight: '500' as const,
      textDayFontSize: 16,
      textMonthFontSize: 18,
      textDayHeaderFontSize: 14,
    }),
    [colors]
  );

  if (!communityId) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.message}>Selecione sua comunidade para ver o calendário.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Carregando Calendário...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Calendar
          key={isDark ? 'dark' : 'light'}
          onDayPress={onDayPress}
          markedDates={markedDates}
          markingType={'dot'}
          theme={calendarTheme}
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
                      { backgroundColor: getEventTypeColor(event.type) },
                    ]}
                  />
                  <Text style={styles.eventTime}>{formatToBrazilianDate(event.startDate, 'HH:mm')}</Text>
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
              <ScrollView showsVerticalScrollIndicator={false}>
                {selectedEvent && (
                  <>
                    <View style={styles.modalHeader}>
                      <View
                        style={[
                          styles.modalTypeTag,
                          { backgroundColor: getEventTypeColor(selectedEvent.type) },
                        ]}
                      >
                        <Text style={styles.modalTypeText}>
                          {getEventTypeLabel(selectedEvent.type)}
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
                        {formatToBrazilianDate(selectedEvent.startDate, 'dd/MM/yyyy')} às{' '}
                        {formatToBrazilianDate(selectedEvent.startDate, 'HH:mm')}
                      </Text>
                    </View>

                    <View style={styles.modalInfoRow}>
                      <Text style={styles.modalLabel}>📍 Local:</Text>
                      <Text style={styles.modalValue}>{selectedEvent.location || 'A definir'}</Text>
                    </View>

                    {selectedEvent.description && (
                      <View style={styles.modalDescriptionContainer}>
                        <Text style={styles.modalLabel}>📝 Descrição:</Text>
                        <Text style={styles.modalDescription}>{selectedEvent.description}</Text>
                      </View>
                    )}

                    {/* Escalas de Serviço */}
                    <View style={styles.serviceRosterSection}>
                      <Text style={styles.serviceRosterSectionTitle}>📋 Escalas de Serviço</Text>
                      
                      {isLoadingRosters ? (
                        <View style={styles.rostersLoading}>
                          <ActivityIndicator size="small" color={colors.primary} />
                          <Text style={styles.rostersLoadingText}>Carregando escalas...</Text>
                        </View>
                      ) : serviceRosters.length > 0 ? (
                        serviceRosters.map((roster) => (
                          <View key={roster.id} style={styles.rosterCard}>
                            <View style={styles.rosterHeader}>
                              <Text style={styles.rosterPastoralName}>{roster.pastoralName}</Text>
                            </View>
                            <Text style={styles.rosterResponsibilities}>{roster.responsibilities}</Text>
                            <View style={styles.rosterMembers}>
                              <Text style={styles.rosterMembersLabel}>Escalados:</Text>
                              {roster.membersOnDuty.map((member) => (
                                <View key={member.id} style={styles.memberItem}>
                                  <View style={styles.memberAvatar}>
                                    <Text style={styles.memberAvatarText}>
                                      {member.name.charAt(0).toUpperCase()}
                                    </Text>
                                  </View>
                                  <View style={styles.memberInfo}>
                                    <Text style={styles.memberName}>{member.name}</Text>
                                    {member.role && (
                                      <Text style={styles.memberRole}>{member.role}</Text>
                                    )}
                                  </View>
                                </View>
                              ))}
                            </View>
                          </View>
                        ))
                      ) : (
                        <View style={styles.noRosters}>
                          <Text style={styles.noRostersText}>
                            Nenhuma escala de serviço cadastrada para este evento.
                          </Text>
                        </View>
                      )}
                    </View>

                    <TouchableOpacity style={styles.modalCloseButton} onPress={closeEventDetails}>
                      <Text style={styles.modalCloseButtonText}>Fechar</Text>
                    </TouchableOpacity>
                  </>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    message: {
      fontSize: 16,
      color: colors.textSecondary,
    },
    loadingText: {
      marginTop: 10,
      color: colors.textSecondary,
    },
    eventsContainer: {
      flex: 1,
      padding: 15,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    eventsTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      marginBottom: 10,
      color: colors.text,
    },
    eventsList: {
      flex: 1,
    },
    eventItem: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
      padding: 12,
      backgroundColor: colors.card,
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
      color: colors.highlight,
      marginRight: 12,
      minWidth: 50,
    },
    eventDetails: {
      flex: 1,
    },
    eventTitle: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text,
    },
    eventLocation: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    chevron: {
      fontSize: 24,
      color: colors.textTertiary,
      marginLeft: 10,
    },
    noEvents: {
      fontSize: 16,
      color: colors.textTertiary,
      textAlign: 'center',
      marginTop: 20,
    },
    // Modal Styles
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.modalBackground,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      maxHeight: '85%',
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
      color: colors.textTertiary,
    },
    modalTitle: {
      fontSize: 22,
      fontWeight: 'bold',
      marginBottom: 20,
      color: colors.text,
    },
    modalInfoRow: {
      marginBottom: 15,
    },
    modalLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 4,
    },
    modalValue: {
      fontSize: 16,
      color: colors.text,
    },
    modalDescriptionContainer: {
      marginBottom: 15,
    },
    modalDescription: {
      fontSize: 16,
      color: colors.text,
      lineHeight: 22,
    },
    // Service Roster Styles
    serviceRosterSection: {
      marginTop: 10,
      marginBottom: 20,
    },
    serviceRosterSectionTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.text,
      marginBottom: 15,
    },
    rostersLoading: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    rostersLoadingText: {
      marginLeft: 10,
      color: colors.textSecondary,
    },
    rosterCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 15,
      marginBottom: 12,
      borderLeftWidth: 4,
      borderLeftColor: colors.primary,
    },
    rosterHeader: {
      marginBottom: 8,
    },
    rosterPastoralName: {
      fontSize: 16,
      fontWeight: 'bold',
      color: colors.text,
    },
    rosterResponsibilities: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 12,
      fontStyle: 'italic',
    },
    rosterMembers: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 10,
    },
    rosterMembersLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textTertiary,
      marginBottom: 8,
      textTransform: 'uppercase',
    },
    memberItem: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    memberAvatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 10,
    },
    memberAvatarText: {
      color: '#fff',
      fontWeight: 'bold',
      fontSize: 14,
    },
    memberInfo: {
      flex: 1,
    },
    memberName: {
      fontSize: 14,
      color: colors.text,
      fontWeight: '500',
    },
    memberRole: {
      fontSize: 12,
      color: colors.textTertiary,
    },
    noRosters: {
      backgroundColor: colors.highlightLight,
      padding: 15,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.highlight,
    },
    noRostersText: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    modalCloseButton: {
      backgroundColor: colors.primary,
      padding: 15,
      borderRadius: 10,
      alignItems: 'center',
      marginTop: 10,
    },
    modalCloseButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
  });
