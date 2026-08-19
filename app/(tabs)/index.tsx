import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  TouchableOpacity,
  Modal,
  ScrollView,
  Pressable,
  Alert,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '../../src/context/AuthContext';
import { useCommunity } from '../../src/context/CommunityContext';
import { getMyCatechesisClasses, getMyFamilyCatechesis } from '../../src/services/catechesisService';
import { useColors } from '../../src/context/ThemeContext';
import { useNotifications } from '../../src/context/NotificationContext';
import { FontAwesome5 } from '@expo/vector-icons';
import { getUpcomingEvents, Event, getEventTypeLabel, getEventTypeColor } from '../../src/services/eventService';
import { getTodayLiturgy, LiturgyData, LiturgyReading } from '../../src/services/liturgyService';
import {
  getMassSchedules,
  getFavoriteMassSchedules,
  addFavoriteMassSchedule,
  removeFavoriteMassSchedule,
} from '../../src/services/massScheduleService';
import { MassSchedule } from '../../src/types';
import { formatDateBR, formatDateTimeBR } from '../../src/utils/dateUtils';
import {
  ClergyMessage,
  getClergyMessages,
  getAudienceLabel,
} from '../../src/services/clergyMessageService';

// Saudação conforme o horário
function greetingByHour(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function firstNameOf(name?: string): string {
  return (name || '').trim().split(/\s+/)[0] || 'Fiel';
}

function initialsOf(name?: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

const SHORT_DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
function shortDayLabel(dayOfWeek: number): string {
  return SHORT_DAYS[dayOfWeek] ?? '';
}

/**
 * Separa o texto de uma leitura em versículos, para exibir um por linha.
 * Detecta o número do versículo (início/espaço + dígitos colados na palavra).
 * Para textos sem numeração (salmos com "—"), quebra por linha/estrofe.
 */
function splitIntoVerses(text?: string): { num?: string; text: string }[] {
  const trimmed = (text || '').replace(/\r/g, '').trim();
  if (!trimmed) return [];
  const tokens = trimmed.split(/(?:^|\s)(\d{1,3})(?=[^\s\d])/);
  const verses: { num?: string; text: string }[] = [];
  if (tokens[0] && tokens[0].trim()) verses.push({ text: tokens[0].trim() });
  for (let i = 1; i < tokens.length; i += 2) {
    const t = (tokens[i + 1] || '').trim();
    if (t) verses.push({ num: tokens[i], text: t });
  }
  // Sem versículos numerados (ex.: salmo): quebra por linha ou por "—".
  if (verses.length <= 1) {
    const lines = trimmed
      .split(/\n+|(?=—\s)/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length > 1) return lines.map((t) => ({ text: t }));
  }
  return verses;
}

/** Próxima data (>= from) de um horário semanal (dia da semana + HH:MM). */
function weeklyNextDate(dayOfWeek: number, time: string, from: Date): Date {
  const [hh, mm] = (time || '00:00').split(':').map((n) => parseInt(n, 10) || 0);
  const c = new Date(from);
  const daysAhead = (dayOfWeek - c.getDay() + 7) % 7;
  c.setDate(c.getDate() + daysAhead);
  c.setHours(hh, mm, 0, 0);
  if (c.getTime() < from.getTime()) c.setDate(c.getDate() + 7); // já passou hoje → próxima semana
  return c;
}

/** Ocorrência mais próxima entre os horários fixos (semanais + especiais). */
function nextFixedOccurrence(
  schedules: MassSchedule[],
  from: Date,
): { date: Date; schedule: MassSchedule } | null {
  let best: { date: Date; schedule: MassSchedule } | null = null;
  for (const s of schedules) {
    let date: Date;
    if (s.isSpecial && s.specialDate) {
      const [hh, mm] = (s.time || '00:00').split(':').map((n) => parseInt(n, 10) || 0);
      date = new Date(s.specialDate);
      date.setHours(hh, mm, 0, 0);
      if (date.getTime() < from.getTime()) continue; // especial no passado
    } else {
      date = weeklyNextDate(s.dayOfWeek, s.time, from);
    }
    if (!best || date.getTime() < best.date.getTime()) best = { date, schedule: s };
  }
  return best;
}

export default function HomeScreen() {
  const { user } = useAuth();
  const { activeCommunityId, activeCommunityName, isSecondaryActive, links, setActiveCommunity } =
    useCommunity();
  const colors = useColors();
  const router = useRouter();
  const { rescheduleEventNotifications } = useNotifications();
  const [nextMass, setNextMass] = useState<Event | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([]);
  const [isLoadingUpcoming, setIsLoadingUpcoming] = useState(true);
  const [liturgy, setLiturgy] = useState<LiturgyData | null>(null);
  const [isLoadingLiturgy, setIsLoadingLiturgy] = useState(true);
  const [expandedReadings, setExpandedReadings] = useState<Record<string, boolean>>({});
  const [isLiturgyModalVisible, setIsLiturgyModalVisible] = useState(false);
  const [showCommunityPicker, setShowCommunityPicker] = useState(false);
  const [catechesisClassCount, setCatechesisClassCount] = useState(0);
  const [massSchedules, setMassSchedules] = useState<MassSchedule[]>([]);
  const [favoriteMassScheduleIds, setFavoriteMassScheduleIds] = useState<string[]>([]);
  const [isLoadingMassSchedules, setIsLoadingMassSchedules] = useState(true);
  const [upcomingEventsError, setUpcomingEventsError] = useState(false);
  const [massSchedulesError, setMassSchedulesError] = useState(false);
  const [liturgyError, setLiturgyError] = useState(false);

  // Palavra do Pastor (mensagens do clero)
  const [clergyMessages, setClergyMessages] = useState<ClergyMessage[]>([]);
  const [isLoadingClergy, setIsLoadingClergy] = useState(true);
  const [clergyFromCache, setClergyFromCache] = useState(false);

  useEffect(() => {
    const loadClergyMessages = async () => {
      setIsLoadingClergy(true);
      try {
        const { messages, fromCache } = await getClergyMessages(5, activeCommunityId);
        setClergyMessages(messages.slice(0, 3));
        setClergyFromCache(fromCache);
      } catch (error) {
        console.error('Erro ao carregar Palavra do Pastor:', error);
        setClergyMessages([]);
      } finally {
        setIsLoadingClergy(false);
      }
    };
    loadClergyMessages();
    // Recarrega ao logar (user.id) E ao trocar de comunidade (communityId),
    // senão a Palavra Pastoral fica presa na comunidade anterior.
  }, [user?.id, user?.communityId]);

  useEffect(() => {
    if (!activeCommunityId) {
      setIsLoading(false);
      setIsLoadingUpcoming(false);
      setIsLoadingMassSchedules(false);
      return;
    }

    const loadUpcomingEvents = async () => {
      setIsLoading(true);
      setIsLoadingUpcoming(true);
      setUpcomingEventsError(false);
      try {
        const events = await getUpcomingEvents(activeCommunityId, 10);
        setUpcomingEvents(events.slice(0, 3));
        setNextMass(events.find((event) => event.type === 'MASS') || null);
      } catch (error) {
        console.error('Erro ao carregar próximos eventos:', error);
        setUpcomingEventsError(true);
      } finally {
        setIsLoading(false);
        setIsLoadingUpcoming(false);
      }
    };

    loadUpcomingEvents();
  }, [activeCommunityId]);

  useEffect(() => {
    if (!activeCommunityId) {
      return;
    }

    const loadMassSchedules = async () => {
      setIsLoadingMassSchedules(true);
      setMassSchedulesError(false);
      try {
        const schedules = await getMassSchedules(activeCommunityId);
        const massOnly = schedules.filter((schedule) => schedule.type === 'MASS');
        setMassSchedules(massOnly);
        try {
          const favorites = await getFavoriteMassSchedules();
          setFavoriteMassScheduleIds(favorites.map((favorite) => favorite.id));
        } catch (error) {
          console.error('Erro ao carregar favoritos das missas fixas:', error);
        }
      } catch (error) {
        console.error('Erro ao carregar horarios fixos:', error);
        setMassSchedulesError(true);
      } finally {
        setIsLoadingMassSchedules(false);
      }
    };

    loadMassSchedules();
  }, [activeCommunityId]);
  useEffect(() => {
    const loadLiturgy = async () => {
      setIsLoadingLiturgy(true);
      setLiturgyError(false);
      try {
        const data = await getTodayLiturgy();
        setLiturgy(data);
        setExpandedReadings({});
        setIsLiturgyModalVisible(false);
      } catch (error) {
        console.error('Erro ao carregar liturgia do dia:', error);
        setLiturgyError(true);
      } finally {
        setIsLoadingLiturgy(false);
      }
    };

    loadLiturgy();
  }, []);


  const styles = createStyles(colors);
  const normalizeText = (value?: string) => {
    if (!value) {
      return '';
    }

    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  };

  const getLiturgicalColor = (colorName?: string) => {
    if (!colorName) {
      return colors.border;
    }

    const colorMap: { [key: string]: string } = {
      verde: '#2ecc71',
      vermelho: '#e74c3c',
      roxo: '#8e44ad',
      branco: '#ecf0f1',
      rosa: '#fd79a8',
      preto: '#2d3436',
    };

    const key = colorName.trim().toLowerCase();
    return colorMap[key] || colors.border;
  };

  const dayLabels = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];

  const getDayLabel = (dayOfWeek: number) => {
    return dayLabels[dayOfWeek] || 'Dia';
  };

  const favoriteMassScheduleSet = new Set(favoriteMassScheduleIds);
  const allMassSchedulesFavorited =
    massSchedules.length > 0 && massSchedules.every((schedule) => favoriteMassScheduleSet.has(schedule.id));

  const handleToggleMassScheduleFavorite = async (schedule: MassSchedule) => {
    const isFavorite = favoriteMassScheduleSet.has(schedule.id);
    setFavoriteMassScheduleIds((prev) =>
      isFavorite ? prev.filter((id) => id !== schedule.id) : [...prev, schedule.id]
    );

    try {
      if (isFavorite) {
        await removeFavoriteMassSchedule(schedule.id);
      } else {
        await addFavoriteMassSchedule(schedule.id);
      }
      await rescheduleEventNotifications();
    } catch (error) {
      setFavoriteMassScheduleIds((prev) =>
        isFavorite ? [...prev, schedule.id] : prev.filter((id) => id !== schedule.id)
      );
      Alert.alert('Erro', 'Nao foi possivel atualizar seus favoritos.');
    }
  };

  const handleToggleAllMassSchedules = async () => {
    if (massSchedules.length === 0) {
      return;
    }

    const previousFavorites = favoriteMassScheduleIds;

    if (allMassSchedulesFavorited) {
      const idsToRemove = new Set(massSchedules.map((schedule) => schedule.id));
      setFavoriteMassScheduleIds(previousFavorites.filter((id) => !idsToRemove.has(id)));

      try {
        await Promise.all(
          Array.from(idsToRemove).map((id) => removeFavoriteMassSchedule(id))
        );
        await rescheduleEventNotifications();
      } catch (error) {
        setFavoriteMassScheduleIds(previousFavorites);
        Alert.alert('Erro', 'Nao foi possivel remover os favoritos.');
      }
      return;
    }

    const idsToAdd = massSchedules
      .filter((schedule) => !favoriteMassScheduleSet.has(schedule.id))
      .map((schedule) => schedule.id);

    setFavoriteMassScheduleIds(Array.from(new Set([...previousFavorites, ...idsToAdd])));

    try {
      await Promise.all(idsToAdd.map((id) => addFavoriteMassSchedule(id)));
      await rescheduleEventNotifications();
    } catch (error) {
      setFavoriteMassScheduleIds(previousFavorites);
      Alert.alert('Erro', 'Nao foi possivel favoritar todas as missas.');
    }
  };


  // Próxima celebração = a mais próxima entre o próximo evento-missa e a próxima
  // ocorrência das missas fixas (agenda semanal).
  const nextCelebration = (() => {
    const now = new Date();
    const candidates: { start: Date; title: string; location?: string; isFixed: boolean }[] = [];
    if (nextMass) {
      const d = new Date(nextMass.startDate);
      if (!Number.isNaN(d.getTime())) {
        candidates.push({ start: d, title: nextMass.title, location: nextMass.location, isFixed: false });
      }
    }
    const fixed = nextFixedOccurrence(massSchedules, now);
    if (fixed) {
      candidates.push({
        start: fixed.date,
        title: fixed.schedule.notes || 'Santa Missa',
        location: activeCommunityName ?? user?.community?.name,
        isFixed: true,
      });
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.start.getTime() - b.start.getTime());
    return candidates[0];
  })();

  const renderNextMass = () => {
    if ((isLoading || isLoadingMassSchedules) && !nextCelebration) {
      return <ActivityIndicator size="small" color={colors.primary} />;
    }

    if (!nextCelebration) {
      if (upcomingEventsError) {
        return <Text style={styles.errorText}>Não foi possível carregar os eventos. Verifique sua conexão.</Text>;
      }
      return <Text style={styles.infoText}>Nenhuma missa programada para sua comunidade.</Text>;
    }

    const { start, title, location, isFixed } = nextCelebration;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const diffDays = Math.round((new Date(start).setHours(0, 0, 0, 0) - startOfToday.getTime()) / 86400000);
    const relative = diffDays === 0 ? 'Hoje' : diffDays === 1 ? 'Amanhã' : `Em ${diffDays} dias`;

    return (
      <TouchableOpacity
        style={styles.nextMassCard}
        activeOpacity={0.85}
        onPress={() => router.push('/(tabs)/calendar' as never)}
      >
        <View style={styles.nextMassDateBox}>
          <Text style={styles.nextMassDay}>{format(start, 'dd')}</Text>
          <Text style={styles.nextMassMonth}>{format(start, 'MMM', { locale: ptBR }).toUpperCase()}</Text>
        </View>
        <View style={styles.nextMassInfo}>
          <View style={styles.nextMassBadge}>
            <FontAwesome5 name="clock" size={10} color={colors.primary} />
            <Text style={styles.nextMassBadgeText}>{relative} · {format(start, 'HH:mm')}</Text>
          </View>
          <Text style={styles.nextMassTitle} numberOfLines={2}>{title}</Text>
          <View style={styles.nextMassMetaRow}>
            <FontAwesome5 name={isFixed ? 'church' : 'map-marker-alt'} size={11} color={colors.textTertiary} />
            <Text style={styles.nextMassMeta} numberOfLines={1}>
              {isFixed ? `Missa fixa${location ? ` · ${location}` : ''}` : location || 'A definir'}
            </Text>
          </View>
        </View>
        <FontAwesome5 name="chevron-right" size={14} color={colors.textTertiary} />
      </TouchableOpacity>
    );
  };

  const renderMassSchedules = () => {
    if (isLoadingMassSchedules) {
      return <ActivityIndicator size="small" color={colors.primary} />;
    }

    if (massSchedulesError) {
      return <Text style={styles.errorText}>Não foi possível carregar os horários. Verifique sua conexão.</Text>;
    }

    if (massSchedules.length === 0) {
      return <Text style={styles.infoText}>Nenhum horario fixo cadastrado.</Text>;
    }

    return (
      <View style={styles.massScheduleList}>
        {massSchedules.map((schedule) => {
          const isFavorite = favoriteMassScheduleSet.has(schedule.id);
          return (
            <View key={schedule.id} style={[styles.massItem, isFavorite && styles.massItemFav]}>
              <View style={styles.massTimeBlock}>
                <Text style={styles.massTimeDay}>{shortDayLabel(schedule.dayOfWeek)}</Text>
                <Text style={styles.massTimeHour}>{schedule.time}</Text>
              </View>
              <View style={styles.massItemInfo}>
                <Text style={styles.massItemTitle} numberOfLines={2}>
                  {schedule.notes || 'Santa Missa'}
                </Text>
                <Text style={styles.massItemDay}>{getDayLabel(schedule.dayOfWeek)}</Text>
                {schedule.isSpecial && schedule.specialDate ? (
                  <Text style={styles.massScheduleSpecial}>
                    Especial: {formatDateBR(schedule.specialDate)}
                  </Text>
                ) : null}
              </View>
              <Pressable
                style={styles.massScheduleFavoriteButton}
                onPress={() => handleToggleMassScheduleFavorite(schedule)}
                accessibilityRole="button"
                accessibilityLabel={isFavorite ? 'Remover favorito' : 'Adicionar favorito'}
                hitSlop={8}
              >
                <FontAwesome5
                  name="star"
                  size={17}
                  solid={isFavorite}
                  color={isFavorite ? colors.highlight : colors.textTertiary}
                />
              </Pressable>
            </View>
          );
        })}
      </View>
    );
  };

  const renderLiturgy = () => {
    if (isLoadingLiturgy) {
      return <ActivityIndicator size="small" color={colors.primary} />;
    }

    if (liturgyError) {
      return <Text style={styles.errorText}>Não foi possível carregar a liturgia. Verifique sua conexão.</Text>;
    }

    if (!liturgy) {
      return <Text style={styles.infoText}>Liturgia nao disponivel no momento.</Text>;
    }

    const liturgicalColor = getLiturgicalColor(liturgy.liturgicalColor);
    const gospelText = liturgy.gospel?.text?.trim() || '';
    const isFallback = normalizeText(gospelText).includes('liturgia nao disponivel');

    const readingItems: { key: string; label: string; reading?: LiturgyReading }[] = [
      { key: 'first', label: '1a Leitura', reading: liturgy.firstReading },
      { key: 'psalm', label: 'Salmo', reading: liturgy.psalm },
      { key: 'second', label: '2a Leitura', reading: liturgy.secondReading },
      { key: 'gospel', label: 'Evangelho', reading: liturgy.gospel },
    ];

    const availableReadings = readingItems.filter((item) => {
      const reference = item.reading?.reference?.trim();
      const text = item.reading?.text?.trim();
      return Boolean(reference || text);
    });

    const hasAnyText = availableReadings.some((item) => Boolean(item.reading?.text?.trim()));
    const canOpenModal = hasAnyText && !isFallback;

    const toggleReading = (key: string) => {
      setExpandedReadings((prev) => ({
        ...prev,
        [key]: !prev[key],
      }));
    };

    const renderReadingCard = (item: { key: string; label: string; reading?: LiturgyReading }) => {
      if (!item.reading) {
        return null;
      }

      const reference = item.reading.reference?.trim();
      const text = item.reading.text?.trim();

      if (!reference && !text) {
        return null;
      }

      const isExpanded = Boolean(expandedReadings[item.key]);
      const canExpand = Boolean(text);

      const headerContent = (
        <>
          <View style={styles.liturgyReadingTitleGroup}>
            <Text style={styles.liturgyReadingTitle}>{item.label}</Text>
            {reference ? (
              <Text style={styles.liturgyReadingReference}>{reference}</Text>
            ) : null}
          </View>
          {canExpand ? (
            <FontAwesome5
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={12}
              color={colors.textSecondary}
            />
          ) : (
            <Text style={styles.liturgyReadingMuted}>Sem texto</Text>
          )}
        </>
      );

      return (
        <View key={item.key} style={styles.liturgyReadingCard}>
          {canExpand ? (
            <Pressable
              style={styles.liturgyReadingHeader}
              onPress={(event) => {
                event.stopPropagation();
                toggleReading(item.key);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Alternar ${item.label}`}
            >
              {headerContent}
            </Pressable>
          ) : (
            <View style={styles.liturgyReadingHeader}>{headerContent}</View>
          )}
          {isExpanded && text ? (
            <Text style={styles.liturgyReadingText} numberOfLines={4}>
              {text}
            </Text>
          ) : null}
        </View>
      );
    };

    const renderModalReading = (item: { key: string; label: string; reading?: LiturgyReading }) => {
      if (!item.reading) {
        return null;
      }

      const reference = item.reading.reference?.trim();
      const text = item.reading.text?.trim();

      if (!reference && !text) {
        return null;
      }

      const verses = splitIntoVerses(text);

      return (
        <View key={item.key} style={styles.modalReadingSection}>
          <Text style={styles.modalReadingTitle}>
            {item.label}{reference ? ` · ${reference}` : ''}
          </Text>
          {verses.length > 0 ? (
            verses.map((v, i) => (
              <Text key={i} style={styles.modalVerse}>
                {v.num ? <Text style={styles.modalVerseNum}>{v.num} </Text> : null}
                {v.text}
              </Text>
            ))
          ) : (
            <Text style={styles.modalReadingMuted}>Texto não disponível.</Text>
          )}
        </View>
      );
    };

    return (
      <Pressable
        style={styles.liturgyCard}
        onPress={() => setIsLiturgyModalVisible(true)}
        disabled={!canOpenModal}
        accessibilityRole={canOpenModal ? 'button' : undefined}
        accessibilityLabel={canOpenModal ? 'Abrir liturgia completa' : undefined}
      >
        <View style={styles.liturgyHeader}>
          <View style={styles.liturgyTitleRow}>
            <View style={[styles.liturgyColorDot, { backgroundColor: liturgicalColor }]} />
            <Text style={styles.liturgyTitle}>{liturgy.liturgy}</Text>
          </View>
          {isFallback && (
            <View style={styles.liturgyFallbackBadge}>
              <Text style={styles.liturgyFallbackText}>Indisponivel</Text>
            </View>
          )}
        </View>
        <Text style={styles.liturgyMeta}>
          {formatDateBR(liturgy.date)} - Cor: {liturgy.liturgicalColor}
        </Text>

        {isFallback && gospelText ? (
          <Text style={styles.liturgyFallbackMessage}>{gospelText}</Text>
        ) : (
          <>
            {availableReadings.length > 0 ? (
              <View style={styles.liturgyReadings}>
                {availableReadings.map(renderReadingCard)}
              </View>
            ) : (
              <Text style={styles.liturgyFallbackMessage}>Leituras nao disponiveis.</Text>
            )}
            {canOpenModal && (
              <View style={styles.liturgyCta}>
                <FontAwesome5 name="book-open" size={13} color={colors.primary} />
                <Text style={styles.liturgyCtaText}>Ler liturgia completa</Text>
                <FontAwesome5 name="chevron-right" size={11} color={colors.primary} />
              </View>
            )}
          </>
        )}

        <Modal
          visible={isLiturgyModalVisible}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setIsLiturgyModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Liturgia do Dia</Text>
                <TouchableOpacity
                  onPress={() => setIsLiturgyModalVisible(false)}
                  accessibilityLabel="Fechar modal"
                >
                  <FontAwesome5 name="times" size={16} color={colors.text} />
                </TouchableOpacity>
              </View>
              <Text style={styles.modalSubtitle}>{liturgy.liturgy}</Text>
              <Text style={styles.modalMeta}>
                {formatDateBR(liturgy.date)} - Cor: {liturgy.liturgicalColor}
              </Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                {availableReadings.map(renderModalReading)}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </Pressable>
    );
  };

  const renderUpcomingEvents = () => {
    if (isLoadingUpcoming) {
      return <ActivityIndicator size="small" color={colors.primary} />;
    }

    if (upcomingEvents.length === 0) {
      return <Text style={styles.infoText}>Nenhum evento próximo para sua comunidade.</Text>;
    }

    return (
      <View style={styles.upcomingList}>
        {upcomingEvents.map((event) => {
          const start = new Date(event.startDate);
          const color = getEventTypeColor(event.type);
          return (
            <TouchableOpacity
              key={event.id}
              style={styles.upcomingItem}
              activeOpacity={0.8}
              onPress={() => router.push('/(tabs)/calendar' as never)}
            >
              <View style={[styles.upcomingDateBlock, { backgroundColor: color + '1A' }]}>
                <Text style={[styles.upcomingDateDay, { color }]}>{format(start, 'dd')}</Text>
                <Text style={[styles.upcomingDateMonth, { color }]}>
                  {format(start, 'MMM', { locale: ptBR }).toUpperCase()}
                </Text>
              </View>
              <View style={styles.upcomingInfo}>
                <Text style={styles.upcomingTitle} numberOfLines={2}>{event.title}</Text>
                <Text style={styles.upcomingMeta} numberOfLines={1}>
                  {format(start, 'HH:mm')}
                  {event.location ? ` · ${event.location}` : ''}
                </Text>
              </View>
              <View style={[styles.upcomingTypePill, { backgroundColor: color }]}>
                <Text style={styles.upcomingTypePillText}>{getEventTypeLabel(event.type)}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const renderClergyMessages = () => {
    if (isLoadingClergy) {
      return <ActivityIndicator size="small" color={colors.primary} />;
    }
    if (clergyMessages.length === 0) {
      return <Text style={styles.clergyEmpty}>Nenhuma mensagem do clero por enquanto.</Text>;
    }
    return (
      <View>
        {clergyFromCache && (
          <Text style={styles.clergyCacheNote}>Sem conexão — mostrando as últimas mensagens salvas.</Text>
        )}
        {clergyMessages.map((message) => (
          <View key={message.id} style={styles.clergyItem}>
            <View style={styles.clergyHeader}>
              <View style={styles.clergyLabelPill}>
                <Text style={styles.clergyLabelText}>📜 {message.senderLabel || 'Palavra Pastoral'}</Text>
              </View>
              <View style={styles.clergyBadge}>
                <Text style={styles.clergyBadgeText}>{getAudienceLabel(message)}</Text>
              </View>
            </View>
            <Text style={styles.clergyTitle} numberOfLines={2}>{message.title}</Text>
            <Text style={styles.clergyMeta}>
              {message.senderTitle || message.sender?.name || 'Clero'} · {formatDateBR(message.publishedAt)}
            </Text>
            {message.body ? (
              <Text style={styles.clergyBody} numberOfLines={4}>{message.body}</Text>
            ) : null}
            {message.videoUrl ? (
              <TouchableOpacity
                style={styles.clergyVideoButton}
                onPress={() => Linking.openURL(message.videoUrl!).catch(() => undefined)}
              >
                <FontAwesome5 name="play-circle" size={14} color={colors.primary} />
                <Text style={styles.clergyVideoText}>Assistir vídeo</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
      </View>
    );
  };

  useEffect(() => {
    if (!user?.id) {
      setCatechesisClassCount(0);
      return;
    }
    Promise.all([
      getMyCatechesisClasses().catch(() => []),
      getMyFamilyCatechesis().catch(() => []),
    ])
      .then(([classes, family]) => setCatechesisClassCount(classes.length + family.length))
      .catch(() => setCatechesisClassCount(0));
  }, [user?.id]);

  const quickActions: { icon: string; label: string; route?: string; kind?: 'liturgy' }[] = [
    { icon: 'calendar-alt', label: 'Calendário', route: '/(tabs)/calendar' },
    { icon: 'clipboard-list', label: 'Minha Escala', route: '/(tabs)/schedule' },
    { icon: 'users', label: 'Pastorais', route: '/(tabs)/pastorals' },
    { icon: 'book-open', label: 'Liturgia', kind: 'liturgy' },
  ];

  const liturgyDot = getLiturgicalColor(liturgy?.liturgicalColor);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* HERO */}
        <LinearGradient
          colors={[colors.primary, colors.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroTopRow}>
            <View style={styles.heroTextGroup}>
              <Text style={styles.heroGreeting}>{greetingByHour()},</Text>
              <Text style={styles.heroName} numberOfLines={1}>{firstNameOf(user?.name)}</Text>
              <Text style={styles.heroSub} numberOfLines={1}>
                {format(new Date(), "EEE, d 'de' MMMM", { locale: ptBR })}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.heroAvatar}
              activeOpacity={0.8}
              onPress={() => router.push('/(tabs)/profile' as never)}
            >
              <Text style={styles.heroAvatarText}>{initialsOf(user?.name)}</Text>
            </TouchableOpacity>
          </View>

          {liturgy && (
            <View style={styles.heroLiturgy}>
              <View style={[styles.heroLiturgyDot, { backgroundColor: liturgyDot }]} />
              <Text style={styles.heroLiturgyText} numberOfLines={1}>
                {liturgy.liturgy}
              </Text>
            </View>
          )}

          {/* Comunidade ATIVA (toque para alternar entre as vinculadas) */}
          <TouchableOpacity
            style={styles.heroCommunity}
            activeOpacity={0.8}
            onPress={() => {
              if (links.length <= 1) {
                router.push('/change-community' as never);
                return;
              }
              setShowCommunityPicker(true);
            }}
          >
            <FontAwesome5 name="map-marker-alt" size={12} color="#fff" />
            <Text style={styles.heroCommunityText} numberOfLines={1}>
              {activeCommunityName
                ? `${activeCommunityName}${isSecondaryActive ? ' · secundária' : ''}`
                : [user?.parish?.name, user?.community?.name].filter(Boolean).join(' · ') ||
                  'Definir minha comunidade'}
            </Text>
            <FontAwesome5
              name={links.length > 1 ? 'exchange-alt' : 'chevron-right'}
              size={11}
              color="rgba(255,255,255,0.85)"
            />
          </TouchableOpacity>
        </LinearGradient>

        {/* Seletor da comunidade em foco (multi-comunidade) */}
        <Modal
          visible={showCommunityPicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowCommunityPicker(false)}
        >
          <Pressable
            style={{
              flex: 1,
              backgroundColor: 'rgba(0,0,0,0.45)',
              justifyContent: 'flex-end',
            }}
            onPress={() => setShowCommunityPicker(false)}
          >
            <Pressable
              style={{
                backgroundColor: colors.card,
                borderTopLeftRadius: 18,
                borderTopRightRadius: 18,
                padding: 18,
                paddingBottom: 30,
                gap: 8,
              }}
              onPress={() => {}}
            >
              <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>
                Comunidade em foco
              </Text>
              <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 6 }}>
                Escolha a comunidade para ver eventos, agenda e pastorais.
              </Text>
              {links.map((link) => (
                <TouchableOpacity
                  key={link.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingVertical: 12,
                    paddingHorizontal: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor:
                      link.communityId === activeCommunityId ? colors.primary : colors.border,
                    backgroundColor:
                      link.communityId === activeCommunityId
                        ? `${colors.primary}14`
                        : 'transparent',
                  }}
                  onPress={() => {
                    void setActiveCommunity(link.communityId);
                    setShowCommunityPicker(false);
                  }}
                >
                  <FontAwesome5
                    name={link.isPrimary ? 'star' : 'link'}
                    size={13}
                    color={
                      link.communityId === activeCommunityId ? colors.primary : colors.textSecondary
                    }
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{ fontSize: 15, fontWeight: '600', color: colors.text }}
                      numberOfLines={1}
                    >
                      {link.community.name}
                      {link.isPrimary ? ' (principal)' : ''}
                    </Text>
                    {link.community.parish?.name ? (
                      <Text style={{ fontSize: 12, color: colors.textSecondary }} numberOfLines={1}>
                        {link.community.parish.name}
                      </Text>
                    ) : null}
                  </View>
                  {link.communityId === activeCommunityId && (
                    <FontAwesome5 name="check" size={13} color={colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={{ paddingVertical: 12, alignItems: 'center' }}
                onPress={() => {
                  setShowCommunityPicker(false);
                  router.push('/(tabs)/profile' as never);
                }}
              >
                <Text style={{ color: colors.primary, fontWeight: '700' }}>
                  Gerenciar comunidades
                </Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

        {/* ATALHOS */}
        <View style={styles.quickRow}>
          {quickActions.map((action) => (
            <TouchableOpacity
              key={action.label}
              style={styles.quickAction}
              activeOpacity={0.8}
              onPress={() => {
                if (action.kind === 'liturgy') {
                  if (liturgy) setIsLiturgyModalVisible(true);
                } else if (action.route) {
                  router.push(action.route as never);
                }
              }}
            >
              <View style={styles.quickIcon}>
                <FontAwesome5 name={action.icon as never} size={18} color={colors.primary} />
              </View>
              <Text style={styles.quickLabel} numberOfLines={1}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* MISSAS POR PERTO */}
        <TouchableOpacity
          style={styles.nearbyBanner}
          activeOpacity={0.9}
          onPress={() => router.push('/nearby-masses' as never)}
        >
          <View style={styles.nearbyIcon}>
            <FontAwesome5 name="map-marked-alt" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.nearbyTitle}>Missas por perto</Text>
            <Text style={styles.nearbySub} numberOfLines={1}>
              Encontre missas próximas de onde você está
            </Text>
          </View>
          <FontAwesome5 name="chevron-right" size={14} color={colors.textTertiary} />
        </TouchableOpacity>

        {/* CATEQUESE — inscrição aberta a todos; turmas/chamada para catequistas */}
        {(
          <TouchableOpacity
            style={styles.nearbyBanner}
            activeOpacity={0.9}
            onPress={() => router.push('/catechesis' as never)}
          >
            <View style={styles.nearbyIcon}>
              <FontAwesome5 name="book-open" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.nearbyTitle}>Catequese</Text>
              <Text style={styles.nearbySub} numberOfLines={1}>
                {catechesisClassCount > 0
                  ? 'Turmas, encontros, chamada e acompanhamento da família'
                  : 'Inscrições e acompanhamento da família'}
              </Text>
            </View>
            <FontAwesome5 name="chevron-right" size={14} color={colors.textTertiary} />
          </TouchableOpacity>
        )}

        {/* PRÓXIMA MISSA */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Próxima celebração</Text>
          {renderNextMass()}
        </View>

        {/* PALAVRA PASTORAL */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📜 Palavra Pastoral</Text>
          <View style={styles.sectionCard}>{renderClergyMessages()}</View>
        </View>

        {/* PRÓXIMOS EVENTOS */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Próximos eventos</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/calendar' as never)}>
              <Text style={styles.sectionLink}>Ver todos</Text>
            </TouchableOpacity>
          </View>
          {renderUpcomingEvents()}
        </View>

        {/* MISSAS FIXAS */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Missas fixas</Text>
            {massSchedules.length > 0 ? (
              <TouchableOpacity onPress={handleToggleAllMassSchedules}>
                <Text style={styles.sectionLink}>
                  {allMassSchedulesFavorited ? 'Remover todas' : '★ Favoritar todas'}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <View style={styles.sectionCard}>{renderMassSchedules()}</View>
        </View>

        {/* LITURGIA DO DIA */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Liturgia do dia</Text>
          <View style={styles.sectionCard}>{renderLiturgy()}</View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollView: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      flexGrow: 1,
      paddingBottom: 32,
      backgroundColor: colors.background,
    },
    // ===== HERO =====
    hero: {
      backgroundColor: colors.primary,
      paddingTop: 18,
      paddingBottom: 22,
      paddingHorizontal: 20,
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
    },
    heroTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    heroTextGroup: {
      flex: 1,
      marginRight: 12,
    },
    heroGreeting: {
      fontSize: 14,
      color: 'rgba(255,255,255,0.85)',
      fontWeight: '500',
    },
    heroName: {
      fontSize: 26,
      color: '#fff',
      fontWeight: '800',
      marginTop: 1,
    },
    heroSub: {
      fontSize: 13,
      color: 'rgba(255,255,255,0.8)',
      marginTop: 3,
      textTransform: 'capitalize',
    },
    heroAvatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: 'rgba(255,255,255,0.22)',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.4)',
    },
    heroAvatarText: {
      fontSize: 18,
      fontWeight: '800',
      color: '#fff',
    },
    heroLiturgy: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 16,
      backgroundColor: 'rgba(255,255,255,0.15)',
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
    },
    heroLiturgyDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.6)',
    },
    heroLiturgyText: {
      fontSize: 12.5,
      fontWeight: '600',
      color: '#fff',
      flexShrink: 1,
    },
    heroCommunity: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 10,
      backgroundColor: 'rgba(255,255,255,0.15)',
      alignSelf: 'flex-start',
      maxWidth: '100%',
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.25)',
    },
    heroCommunityText: {
      fontSize: 12.5,
      fontWeight: '700',
      color: '#fff',
      flexShrink: 1,
    },
    // ===== ATALHOS =====
    quickRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      marginTop: -14,
      marginBottom: 8,
    },
    quickAction: {
      flex: 1,
      alignItems: 'center',
    },
    quickIcon: {
      width: 54,
      height: 54,
      borderRadius: 16,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 6,
      elevation: 3,
      marginBottom: 6,
    },
    quickLabel: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    // ===== MISSAS POR PERTO (banner) =====
    nearbyBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginHorizontal: 16,
      marginTop: 16,
      padding: 14,
      borderRadius: 16,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.borderLight,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 6,
      elevation: 3,
    },
    nearbyIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: colors.highlightLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    nearbyTitle: { fontSize: 15.5, fontWeight: '800', color: colors.text },
    nearbySub: { fontSize: 12.5, color: colors.textSecondary, marginTop: 2 },
    // ===== SEÇÕES =====
    section: {
      paddingHorizontal: 16,
      marginTop: 18,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: colors.text,
      marginBottom: 10,
    },
    sectionLink: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.primary,
      marginBottom: 10,
    },
    sectionCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 14,
    },
    // ===== PRÓXIMA MISSA =====
    nextMassCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 14,
      gap: 14,
      borderLeftWidth: 4,
      borderLeftColor: colors.primary,
    },
    nextMassDateBox: {
      width: 58,
      height: 62,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    nextMassDay: {
      fontSize: 24,
      fontWeight: '800',
      color: '#fff',
      lineHeight: 26,
    },
    nextMassMonth: {
      fontSize: 11,
      fontWeight: '700',
      color: 'rgba(255,255,255,0.9)',
    },
    nextMassInfo: {
      flex: 1,
    },
    nextMassBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 5,
      backgroundColor: colors.highlightLight,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      marginBottom: 5,
    },
    nextMassBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.primary,
    },
    nextMassTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    nextMassMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginTop: 3,
    },
    nextMassMeta: {
      fontSize: 13,
      color: colors.textSecondary,
      flexShrink: 1,
    },
    card: {
      width: '100%',
      padding: 15,
      borderRadius: 12,
      backgroundColor: colors.card,
      marginBottom: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    cardTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      marginBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
      paddingBottom: 8,
      color: colors.text,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
      paddingBottom: 8,
    },
    cardHeaderTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.text,
    },
    cardHeaderAction: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: colors.highlightLight,
    },
    cardHeaderActionText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.highlight,
    },
    // Palavra do Pastor
    clergyItem: {
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
    },
    clergyHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
      marginBottom: 5,
    },
    clergyLabelPill: {
      backgroundColor: colors.primary,
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 3,
    },
    clergyLabelText: {
      fontSize: 11,
      fontWeight: '800',
      color: '#fff',
    },
    clergyTitle: {
      fontSize: 15,
      fontWeight: 'bold',
      color: colors.text,
      marginBottom: 2,
    },
    clergyBadge: {
      backgroundColor: colors.highlightLight,
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    clergyBadgeText: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.highlight,
    },
    clergyMeta: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    clergyBody: {
      fontSize: 13,
      color: colors.text,
      marginTop: 6,
      lineHeight: 19,
    },
    clergyVideoButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 8,
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    clergyVideoText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.primary,
    },
    clergyEmpty: {
      fontSize: 13,
      color: colors.textTertiary,
    },
    clergyCacheNote: {
      fontSize: 11,
      color: colors.textTertiary,
      fontStyle: 'italic',
      marginBottom: 6,
    },
    massCard: {
      marginTop: 5,
    },
    massTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      marginBottom: 8,
      color: colors.text,
    },
    massDetail: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 4,
    },
    massScheduleList: {
      marginTop: 5,
      gap: 10,
    },
    massItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.borderLight,
      backgroundColor: colors.background,
    },
    massItemFav: {
      borderColor: colors.primary,
    },
    massTimeBlock: {
      width: 62,
      paddingVertical: 8,
      borderRadius: 10,
      alignItems: 'center',
      backgroundColor: colors.highlightLight,
    },
    massTimeDay: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    massTimeHour: {
      fontSize: 17,
      fontWeight: '800',
      color: colors.primary,
      marginTop: 1,
    },
    massItemInfo: { flex: 1 },
    massItemTitle: { fontSize: 14.5, fontWeight: '600', color: colors.text },
    massItemDay: { fontSize: 12.5, color: colors.textTertiary, marginTop: 2 },
    massScheduleItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.borderLight,
      backgroundColor: colors.background,
      marginBottom: 10,
    },
    massScheduleInfo: {
      flex: 1,
    },
    massScheduleDay: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    massScheduleTime: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 2,
    },
    massScheduleNotes: {
      fontSize: 12,
      color: colors.textTertiary,
      marginTop: 4,
    },
    massScheduleSpecial: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 4,
    },
    massScheduleFavoriteButton: {
      padding: 6,
    },
    typeBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      marginTop: 8,
    },
    typeBadgeText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '600',
    },
    errorText: {
      fontSize: 14,
      color: colors.error,
      textAlign: 'center',
      paddingVertical: 8,
    },
    infoText: {
      fontSize: 16,
      color: colors.textTertiary,
      textAlign: 'center',
      paddingVertical: 10,
    },
    liturgyCard: {
      marginTop: 5,
    },
    liturgyHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    liturgyTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      marginRight: 8,
    },
    liturgyColorDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginRight: 8,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    liturgyTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      color: colors.text,
      flex: 1,
    },
    liturgyMeta: {
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 10,
    },
    liturgyReadings: {
      gap: 10,
    },
    liturgyReadingCard: {
      backgroundColor: colors.background,
      borderRadius: 10,
      padding: 10,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    liturgyReadingHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    liturgyReadingTitleGroup: {
      flex: 1,
      marginRight: 10,
    },
    liturgyReadingTitle: {
      fontSize: 13,
      color: colors.text,
      fontWeight: '600',
    },
    liturgyReadingReference: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    liturgyReadingText: {
      fontSize: 12,
      color: colors.textSecondary,
      lineHeight: 18,
      marginTop: 8,
    },
    liturgyReadingMuted: {
      fontSize: 11,
      color: colors.textTertiary,
    },
    liturgyFallbackBadge: {
      marginLeft: 8,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.highlight,
      backgroundColor: colors.highlightLight,
    },
    liturgyFallbackText: {
      fontSize: 10,
      color: colors.highlight,
      fontWeight: '600',
    },
    liturgyFallbackMessage: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 8,
    },
    liturgyHint: {
      fontSize: 12,
      color: colors.textTertiary,
      marginTop: 8,
    },
    liturgyCta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 12,
      paddingVertical: 11,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: colors.highlightLight,
    },
    liturgyCtaText: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.primary },
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
      marginBottom: 10,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.text,
    },
    modalSubtitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 6,
    },
    modalMeta: {
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: 12,
    },
    modalReadingSection: {
      marginBottom: 16,
    },
    modalReadingTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 6,
    },
    modalReadingText: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    modalVerse: {
      fontSize: 14.5,
      color: colors.text,
      lineHeight: 23,
      marginBottom: 9,
    },
    modalVerseNum: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.primary,
    },
    modalReadingMuted: {
      fontSize: 13,
      color: colors.textTertiary,
    },
    upcomingList: {
      gap: 10,
    },
    upcomingItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 14,
      padding: 12,
      gap: 12,
    },
    upcomingDateBlock: {
      width: 50,
      height: 52,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    upcomingDateDay: {
      fontSize: 20,
      fontWeight: '800',
      lineHeight: 22,
    },
    upcomingDateMonth: {
      fontSize: 10,
      fontWeight: '700',
    },
    upcomingInfo: {
      flex: 1,
    },
    upcomingTitle: {
      fontSize: 14.5,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 2,
    },
    upcomingMeta: {
      fontSize: 12.5,
      color: colors.textSecondary,
    },
    upcomingTypePill: {
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 999,
    },
    upcomingTypePillText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '700',
    },
  });
