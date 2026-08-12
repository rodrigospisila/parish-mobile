import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  TouchableOpacity,
  Pressable,
  Modal,
  ScrollView,
  SectionList,
  SafeAreaView,
  RefreshControl,
} from 'react-native';
import { Calendar, DateData, LocaleConfig, Timeline } from 'react-native-calendars';
import * as ExpoCalendar from 'expo-calendar';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { parseISO, format, differenceInCalendarDays, addDays, isToday, isTomorrow, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '../../src/context/AuthContext';
import { useCommunity } from '../../src/context/CommunityContext';
import { useColors, useTheme } from '../../src/context/ThemeContext';
import { useNotifications } from '../../src/context/NotificationContext';
import {
  getCommunityEvents,
  Event,
  EventType,
  addFavoriteEvent,
  removeFavoriteEvent,
  getFavoriteEvents,
  getFixedOccurrences,
  getEventTypeLabel,
  getEventTypeColor,
  getEventWithRosters,
  ServiceRoster,
} from '../../src/services/eventService';
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

// ============================================================
// Metadados de data do evento (dia inteiro, vários dias, intervalo)
// ============================================================
interface EventDateMeta {
  start: Date;
  end: Date;
  isAllDay: boolean;
  isMultiDay: boolean;
  dayCount: number;
  rangeLabel: string; // ex.: "23–26 jul" ou "30 jul – 2 ago"
}

function getEventDateMeta(event: Event): EventDateMeta {
  const start = parseISO(event.startDate);
  const rawEnd = event.endDate ? parseISO(event.endDate) : start;
  const end = rawEnd < start ? start : rawEnd;

  const startKey = format(start, 'yyyy-MM-dd');
  const endKey = format(end, 'yyyy-MM-dd');
  const isMultiDay = startKey !== endKey;

  const startsMidnight = start.getHours() === 0 && start.getMinutes() === 0;
  const endsMidnight = end.getHours() === 0 && end.getMinutes() === 0;
  const isAllDay = startsMidnight && (!event.endDate || endsMidnight);

  const dayCount = differenceInCalendarDays(end, start) + 1;
  const sameMonth = format(start, 'yyyy-MM') === format(end, 'yyyy-MM');
  const rangeLabel = sameMonth
    ? `${format(start, 'd', { locale: ptBR })}–${format(end, 'd MMM', { locale: ptBR })}`
    : `${format(start, 'd MMM', { locale: ptBR })} – ${format(end, 'd MMM', { locale: ptBR })}`;

  return { start, end, isAllDay, isMultiDay, dayCount, rangeLabel };
}

// Item da agenda: um evento pode ocupar vários dias (segmentos)
type AgendaItem = {
  key: string;
  event: Event;
  dayKey: string;
  segment: 'single' | 'start' | 'continuation';
  meta: EventDateMeta;
};

const DAY_KEY = (date: Date) => format(date, 'yyyy-MM-dd');

// Cores/rótulos da agenda fixa (Missa/Confissão/Adoração/Terço)
const FIXED_COLORS: Record<string, string> = {
  MASS: '#7E57C2',
  CONFESSION: '#F9A825',
  ADORATION: '#26A69A',
  ROSARY: '#78909C',
};
const FIXED_LABELS: Record<string, string> = {
  MASS: 'Missa',
  CONFESSION: 'Confissão',
  ADORATION: 'Adoração',
  ROSARY: 'Terço',
};
const eventColor = (event: Event) =>
  event.isFixed ? FIXED_COLORS[event.fixedType ?? ''] ?? '#78909C' : getEventTypeColor(event.type);
const eventLabel = (event: Event) =>
  event.isFixed ? FIXED_LABELS[event.fixedType ?? ''] ?? 'Agenda fixa' : getEventTypeLabel(event.type);
// Chave de agrupamento: eventos fixos agrupam por tipo litúrgico próprio
const groupKeyOf = (event: Event) => (event.isFixed ? `fix-${event.fixedType}` : event.type);

// Ordena itens de um dia: dia-inteiro/vários-dias no topo, depois por horário
const sortDayItems = (items: AgendaItem[]) =>
  items.sort((a, b) => {
    const aTop = a.segment !== 'single' || a.meta.isAllDay ? 0 : 1;
    const bTop = b.segment !== 'single' || b.meta.isAllDay ? 0 : 1;
    if (aTop !== bTop) return aTop - bTop;
    return a.meta.start.getTime() - b.meta.start.getTime();
  });

// Linha da agenda: evento único OU grupo (3+ do mesmo tipo litúrgico no dia)
type AgendaRow =
  | { kind: 'event'; key: string; item: AgendaItem }
  | { kind: 'group'; key: string; groupKey: string; items: AgendaItem[] };

// Colapsa 3+ eventos do MESMO tipo (ex.: várias missas) num item expansível,
// mantendo a ordem cronológica (o grupo fica onde o 1º evento apareceria).
function buildDayRows(items: AgendaItem[], dayKey: string): AgendaRow[] {
  const countByKey = new Map<string, number>();
  items.forEach((it) => {
    if (it.segment === 'single' && !it.meta.isAllDay) {
      const k = groupKeyOf(it.event);
      countByKey.set(k, (countByKey.get(k) ?? 0) + 1);
    }
  });
  const groupable = new Set(
    [...countByKey.entries()].filter(([, count]) => count >= 3).map(([k]) => k),
  );

  const rows: AgendaRow[] = [];
  const emitted = new Set<string>();
  for (const it of items) {
    const timedSingle = it.segment === 'single' && !it.meta.isAllDay;
    const k = groupKeyOf(it.event);
    if (timedSingle && groupable.has(k)) {
      if (!emitted.has(k)) {
        emitted.add(k);
        const list = items.filter(
          (x) => x.segment === 'single' && !x.meta.isAllDay && groupKeyOf(x.event) === k,
        );
        rows.push({ kind: 'group', key: `grp-${dayKey}-${k}`, groupKey: `grp-${dayKey}-${k}`, items: list });
      }
    } else {
      rows.push({ kind: 'event', key: it.key, item: it });
    }
  }
  return rows;
}

// Importamos getEventTypeLabel e getEventTypeColor do eventService

export default function CalendarScreen() {
  const { user } = useAuth();
  const colors = useColors();
  const { isDark } = useTheme();
  const { rescheduleEventNotifications } = useNotifications();
  const [events, setEvents] = useState<Event[]>([]);
  const [fixedEvents, setFixedEvents] = useState<Event[]>([]);
  const [showFixed, setShowFixed] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [viewMode, setViewMode] = useState<'agenda' | 'week' | 'calendar'>('agenda');
  // Mês exibido no grid (permite botão "Hoje" e swipe entre meses)
  const [visibleMonth, setVisibleMonth] = useState<string>(new Date().toISOString().split('T')[0]);
  // Grupos de eventos repetidos expandidos na agenda
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [addingToCalendar, setAddingToCalendar] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<EventType | 'ALL'>('ALL');
  const [onlyMyPastorals, setOnlyMyPastorals] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [serviceRosters, setServiceRosters] = useState<ServiceRoster[]>([]);
  const [isLoadingRosters, setIsLoadingRosters] = useState(false);
  const [rostersError, setRostersError] = useState(false);

  const { activeCommunityId } = useCommunity();
  const communityId = activeCommunityId ?? user?.communityId;



  // 1. Carregar Eventos
  const loadEvents = useCallback(
    async (refresh = false) => {
      if (!communityId) {
        setIsLoading(false);
        return;
      }

      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        // Janela ampla para a agenda fixa: −31 a +180 dias (cobre agenda + navegação)
        const from = new Date();
        from.setDate(from.getDate() - 31);
        const to = new Date();
        to.setDate(to.getDate() + 180);

        const [data, fixed] = await Promise.all([
          getCommunityEvents(communityId, { onlyMyPastorals }),
          getFixedOccurrences(communityId, from, to),
        ]);
        setEvents(data);
        setFixedEvents(fixed);
      } catch (error) {
        Alert.alert('Erro', 'Não foi possível carregar os eventos.');
        console.error(error);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [communityId, onlyMyPastorals],
  );

  useFocusEffect(
    useCallback(() => {
      loadEvents();
    }, [loadEvents]),
  );

  useEffect(() => {
    if (!communityId) {
      return;
    }

    const loadFavorites = async () => {
      try {
        const favorites = await getFavoriteEvents();
        setFavoriteIds(favorites.map((event) => event.id));
      } catch (error) {
        console.error('Erro ao carregar favoritos:', error);
      }
    };

    loadFavorites();
  }, [communityId]);

  const normalizeText = (value: string) => {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  };

  const favoriteIdSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const typeOptions = useMemo(() => {
    const types = Array.from(new Set(events.map((event) => event.type))).sort();
    return ['ALL', ...types];
  }, [events]);

  const filteredEvents = useMemo(() => {
    const query = normalizeText(searchQuery.trim());
    const all = showFixed ? [...events, ...fixedEvents] : events;

    return all.filter((event) => {
      // A agenda fixa aparece sempre sob "Todos" (não é um EventType filtrável)
      if (selectedType !== 'ALL' && !event.isFixed && event.type !== selectedType) {
        return false;
      }
      if (selectedType !== 'ALL' && event.isFixed) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = normalizeText(
        `${event.title} ${event.description || ''} ${event.location || ''} ${event.notes || ''}`
      );
      return haystack.includes(query);
    });
  }, [events, fixedEvents, showFixed, searchQuery, selectedType]);

  // 1. Agenda: expande eventos de vários dias em todos os dias que ocupam,
  // inclui os que já começaram e ainda não terminaram, e mantém eventos
  // "dia inteiro"/multi-dia no topo de cada dia.
  const agendaSections = useMemo(() => {
    const today = startOfDay(new Date());
    const MAX_SPAN = 31; // trava de segurança para eventos muito longos
    const grouped = new Map<string, AgendaItem[]>();

    filteredEvents.forEach((event) => {
      const meta = getEventDateMeta(event);
      if (meta.end < today) return; // já encerrado

      const firstShown = meta.start < today ? today : meta.start;
      const totalDays = Math.min(differenceInCalendarDays(meta.end, firstShown) + 1, MAX_SPAN);
      const startKey = DAY_KEY(meta.start);

      for (let i = 0; i < totalDays; i++) {
        const dayKey = DAY_KEY(addDays(firstShown, i));
        const segment: AgendaItem['segment'] = !meta.isMultiDay
          ? 'single'
          : dayKey === startKey
            ? 'start'
            : 'continuation';
        if (!grouped.has(dayKey)) grouped.set(dayKey, []);
        grouped.get(dayKey)!.push({ key: `${event.id}-${dayKey}`, event, dayKey, segment, meta });
      }
    });

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dayKey, items]) => ({
        dayKey,
        title: dayKey,
        count: items.length,
        data: buildDayRows(sortDayItems(items), dayKey),
      }));
  }, [filteredEvents]);

  // 2. Marcações no calendário: BARRAS contínuas (multi-period). Eventos de
  // vários dias atravessam o mês numa faixa colorida (como Google/Outlook);
  // eventos de um dia viram uma faixinha curta. Máx. 3 faixas por dia.
  const markedDates = useMemo(() => {
    const marked: { [key: string]: any } = {};
    const pushPeriod = (dayKey: string, period: any) => {
      if (!marked[dayKey]) marked[dayKey] = { periods: [] };
      if (!marked[dayKey].periods) marked[dayKey].periods = [];
      if (marked[dayKey].periods.length < 3) marked[dayKey].periods.push(period);
    };

    // Multi-dia primeiro (faixas mais relevantes ocupam a primeira linha)
    const ordered = [...filteredEvents].sort((a, b) => {
      const am = getEventDateMeta(a).isMultiDay ? 0 : 1;
      const bm = getEventDateMeta(b).isMultiDay ? 0 : 1;
      return am - bm;
    });

    ordered.forEach((event) => {
      const meta = getEventDateMeta(event);
      const color = eventColor(event);
      const span = Math.min(differenceInCalendarDays(meta.end, meta.start) + 1, 60);
      for (let i = 0; i < span; i++) {
        const dayKey = DAY_KEY(addDays(meta.start, i));
        pushPeriod(dayKey, { color, startingDay: i === 0, endingDay: i === span - 1 });
      }
    });

    if (!marked[selectedDate]) marked[selectedDate] = { periods: [] };
    marked[selectedDate].selected = true;
    marked[selectedDate].selectedColor = colors.highlight;

    return marked;
  }, [filteredEvents, selectedDate, colors]);

  // Dias da semana exibida (visão Semana) — 7 dias a partir do domingo
  const weekDays = useMemo(() => {
    const base = parseISO(`${selectedDate}T00:00:00`);
    const sunday = addDays(base, -base.getDay());
    return Array.from({ length: 7 }, (_, i) => addDays(sunday, i));
  }, [selectedDate]);

  // 3. Eventos que ocupam a data selecionada (inclui multi-dia em andamento)
  const eventsForSelectedDate = useMemo(() => {
    const items: AgendaItem[] = [];
    filteredEvents.forEach((event) => {
      const meta = getEventDateMeta(event);
      const startKey = DAY_KEY(meta.start);
      const endKey = DAY_KEY(meta.end);
      if (selectedDate >= startKey && selectedDate <= endKey) {
        const segment: AgendaItem['segment'] = !meta.isMultiDay
          ? 'single'
          : selectedDate === startKey
            ? 'start'
            : 'continuation';
        items.push({ key: `${event.id}-${selectedDate}`, event, dayKey: selectedDate, segment, meta });
      }
    });
    return sortDayItems(items);
  }, [filteredEvents, selectedDate]);

  // Eventos com horário (para a timeline da visão Semana)
  const timelineEvents = useMemo(() => {
    return eventsForSelectedDate
      .filter((item) => item.segment !== 'continuation' && !item.meta.isAllDay)
      .map((item) => {
        // Garante ao menos 1h de bloco quando não há horário de término
        const endDate =
          item.meta.end.getTime() > item.meta.start.getTime()
            ? item.meta.end
            : new Date(item.meta.start.getTime() + 60 * 60 * 1000);
        return {
          id: item.event.id,
          start: format(item.meta.start, 'yyyy-MM-dd HH:mm:ss'),
          end: format(endDate, 'yyyy-MM-dd HH:mm:ss'),
          title: item.event.title,
          summary: item.event.location || '',
          color: eventColor(item.event),
        };
      });
  }, [eventsForSelectedDate]);

  // Eventos "dia todo" / multi-dia da data selecionada (banner acima da timeline)
  const allDayForSelected = useMemo(
    () => eventsForSelectedDate.filter((item) => item.segment === 'continuation' || item.meta.isAllDay),
    [eventsForSelectedDate],
  );

  const onDayPress = (day: DateData) => {
    setSelectedDate(day.dateString);
  };

  // Volta para hoje (mês/semana/agenda)
  const goToToday = () => {
    const todayKey = new Date().toISOString().split('T')[0];
    setSelectedDate(todayKey);
    setVisibleMonth(todayKey);
  };

  const shiftWeek = (deltaDays: number) => {
    const base = parseISO(`${selectedDate}T00:00:00`);
    setSelectedDate(DAY_KEY(addDays(base, deltaDays)));
  };

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.has(groupKey) ? next.delete(groupKey) : next.add(groupKey);
      return next;
    });
  };

  // Adiciona um evento à agenda nativa do celular (expo-calendar)
  const handleAddToDeviceCalendar = async (event: Event) => {
    setAddingToCalendar(true);
    try {
      const { status } = await ExpoCalendar.requestCalendarPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão necessária', 'Autorize o acesso ao calendário para adicionar o evento.');
        return;
      }
      const calendars = await ExpoCalendar.getCalendarsAsync(ExpoCalendar.EntityTypes.EVENT);
      const writable = calendars.find((c) => c.allowsModifications) ?? calendars[0];
      if (!writable) {
        Alert.alert('Sem calendário', 'Nenhum calendário disponível no aparelho.');
        return;
      }
      const meta = getEventDateMeta(event);
      const endDate =
        meta.end.getTime() > meta.start.getTime()
          ? meta.end
          : new Date(meta.start.getTime() + 60 * 60 * 1000);

      await ExpoCalendar.createEventAsync(writable.id, {
        title: event.title,
        startDate: meta.start,
        endDate,
        location: event.location || undefined,
        notes: event.description || undefined,
        allDay: meta.isAllDay,
        timeZone: undefined,
      });
      Alert.alert('Adicionado! 📅', `"${event.title}" foi salvo na agenda do seu celular.`);
    } catch (error) {
      console.error('Erro ao adicionar à agenda:', error);
      Alert.alert('Erro', 'Não foi possível adicionar o evento à agenda do celular.');
    } finally {
      setAddingToCalendar(false);
    }
  };

  const openEventDetails = async (event: Event) => {
    setSelectedEvent(event);
    setServiceRosters([]);
    setRostersError(false);
    setIsModalVisible(true);

    // Ocorrência da agenda fixa é virtual: não tem escalas nem detalhes remotos
    if (event.isFixed) {
      setIsLoadingRosters(false);
      return;
    }

    setIsLoadingRosters(true);
    try {
      const eventWithRosters = await getEventWithRosters(event);
      setServiceRosters(eventWithRosters.serviceRosters);
    } catch (error) {
      console.error('Erro ao carregar escalas:', error);
      setRostersError(true);
    } finally {
      setIsLoadingRosters(false);
    }
  };

  const closeEventDetails = () => {
    setIsModalVisible(false);
    setSelectedEvent(null);
    setServiceRosters([]);
    setRostersError(false);
  };

  const handleToggleFavorite = async (event: Event) => {
    const isFavorite = favoriteIdSet.has(event.id);
    setFavoriteIds((prev) =>
      isFavorite ? prev.filter((id) => id !== event.id) : [...prev, event.id]
    );

    try {
      if (isFavorite) {
        await removeFavoriteEvent(event.id);
      } else {
        await addFavoriteEvent(event.id);
      }
      await rescheduleEventNotifications();
    } catch (error) {
      setFavoriteIds((prev) =>
        isFavorite ? [...prev, event.id] : prev.filter((id) => id !== event.id)
      );
      Alert.alert('Erro', 'Nao foi possivel atualizar os favoritos.');
    }
  };

  const renderEventRow = (item: AgendaItem) => {
    const { event, segment, meta } = item;
    const isFavorite = favoriteIdSet.has(event.id);
    const color = eventColor(event);

    // Coluna de horário
    const continuation = segment === 'continuation';
    const timeMain = continuation ? '' : meta.isAllDay ? 'Dia' : format(meta.start, 'HH:mm');
    const timeSub = continuation ? '' : meta.isAllDay ? 'todo' : '';

    return (
      <TouchableOpacity style={styles.eventItem} onPress={() => openEventDetails(event)} activeOpacity={0.7}>
        <View style={[styles.eventTypeIndicator, { backgroundColor: color }]} />
        <View style={styles.eventTimeCol}>
          {continuation ? (
            <Ionicons name="ellipsis-horizontal" size={16} color={colors.textTertiary} />
          ) : (
            <>
              <Text style={styles.eventTime}>{timeMain}</Text>
              {timeSub ? <Text style={styles.eventTimeSub}>{timeSub}</Text> : null}
            </>
          )}
        </View>
        <View style={styles.eventDetails}>
          <View style={styles.eventTitleRow}>
            {event.isFixed && <Ionicons name="repeat" size={13} color={color} style={{ marginRight: 4 }} />}
            <Text style={styles.eventTitle}>{event.title}</Text>
          </View>
          {meta.isMultiDay && (
            <View style={styles.rangeChip}>
              <Ionicons name="calendar-outline" size={11} color={colors.highlight} />
              <Text style={styles.rangeChipText}>
                {continuation
                  ? `Em andamento · até ${format(meta.end, "EEE, d/MM", { locale: ptBR })}`
                  : `${meta.rangeLabel} · ${meta.dayCount} dias`}
              </Text>
            </View>
          )}
          <Text style={styles.eventLocation}>
            {event.isFixed ? 'Agenda fixa' : event.location || 'A definir'}
          </Text>
        </View>
        {!event.isFixed && (
          <Pressable
            style={styles.favoriteButton}
            onPress={(pressEvent) => {
              pressEvent.stopPropagation();
              handleToggleFavorite(event);
            }}
            accessibilityRole="button"
            accessibilityLabel={isFavorite ? 'Remover favorito' : 'Adicionar favorito'}
          >
            <Ionicons
              name={isFavorite ? 'star' : 'star-outline'}
              size={18}
              color={isFavorite ? colors.highlight : colors.textTertiary}
            />
          </Pressable>
        )}
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      </TouchableOpacity>
    );
  };

  // Linha de grupo (ex.: "3 Missas") expansível
  const renderGroupRow = (row: Extract<AgendaRow, { kind: 'group' }>) => {
    const sample = row.items[0].event;
    const color = eventColor(sample);
    const expanded = expandedGroups.has(row.groupKey);
    const times = row.items.map((it) => format(it.meta.start, 'HH:mm')).join(' · ');
    const label = eventLabel(sample);

    return (
      <View>
        <TouchableOpacity style={styles.groupRow} onPress={() => toggleGroup(row.groupKey)} activeOpacity={0.7}>
          <View style={[styles.eventTypeIndicator, { backgroundColor: color }]} />
          <View style={styles.groupBadge}>
            <Text style={[styles.groupBadgeText, { color }]}>{row.items.length}</Text>
          </View>
          <View style={styles.eventDetails}>
            <View style={styles.eventTitleRow}>
              {sample.isFixed && <Ionicons name="repeat" size={13} color={color} style={{ marginRight: 4 }} />}
              <Text style={styles.eventTitle}>{row.items.length} {label}s</Text>
            </View>
            <Text style={styles.eventLocation} numberOfLines={1}>{times}</Text>
          </View>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textTertiary} />
        </TouchableOpacity>
        {expanded && (
          <View style={styles.groupChildren}>
            {row.items.map((it) => (
              <React.Fragment key={it.key}>{renderEventRow(it)}</React.Fragment>
            ))}
          </View>
        )}
      </View>
    );
  };

  const renderAgendaItem = ({ item }: { item: AgendaRow }) =>
    item.kind === 'group' ? renderGroupRow(item) : renderEventRow(item.item);

  // Cabeçalho relativo (HOJE/AMANHÃ) + dia da semana + contagem
  const renderSectionHeader = ({ section }: { section: { dayKey: string; count: number } }) => {
    const date = parseISO(`${section.dayKey}T00:00:00`);
    const relative = isToday(date) ? 'HOJE' : isTomorrow(date) ? 'AMANHÃ' : '';
    const weekday = format(date, 'EEE', { locale: ptBR }).replace('.', '');
    const dayLabel = format(date, "d 'de' MMMM", { locale: ptBR });

    return (
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderLeft}>
          {relative ? <Text style={styles.sectionHeaderRelative}>{relative}</Text> : null}
          <Text style={styles.sectionHeaderText}>
            {weekday.charAt(0).toUpperCase() + weekday.slice(1)}, {dayLabel}
          </Text>
        </View>
        <Text style={styles.sectionHeaderCount}>
          {section.count} {section.count === 1 ? 'evento' : 'eventos'}
        </Text>
      </View>
    );
  };

  const getRosterMembers = (roster: ServiceRoster) => roster.membersOnDuty ?? roster.members;

  const getRosterStatusSummary = (roster: ServiceRoster) => {
    const members = getRosterMembers(roster);
    let pending = 0;
    let confirmed = 0;
    let declined = 0;
    let checkedIn = 0;

    for (const member of members) {
      if (member.checkedIn) {
        checkedIn += 1;
      }

      if (member.status === 'CONFIRMED') {
        confirmed += 1;
      } else if (member.status === 'DECLINED') {
        declined += 1;
      } else {
        pending += 1;
      }
    }

    return {
      total: members.length,
      pending,
      confirmed,
      declined,
      checkedIn,
    };
  };

  const getMemberStatusLabel = (member: { status?: 'PENDING' | 'CONFIRMED' | 'DECLINED'; checkedIn?: boolean; checkedInAt?: string }) => {
    if (member.checkedIn) {
      return member.checkedInAt
        ? `Presente às ${formatToBrazilianDate(member.checkedInAt, 'HH:mm')}`
        : 'Presente';
    }

    if (member.status === 'CONFIRMED') {
      return 'Confirmado';
    }

    if (member.status === 'DECLINED') {
      return 'Declinado';
    }

    return 'Pendente';
  };

  const getMemberStatusStyle = (member: { status?: 'PENDING' | 'CONFIRMED' | 'DECLINED'; checkedIn?: boolean }) => {
    if (member.checkedIn) {
      return styles.statusCheckedIn;
    }

    if (member.status === 'CONFIRMED') {
      return styles.statusConfirmed;
    }

    if (member.status === 'DECLINED') {
      return styles.statusDeclined;
    }

    return styles.statusPending;
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
        <View style={styles.toolbar}>
          <View style={styles.toolbarTopRow}>
            <View style={styles.viewToggle}>
              {([
                { mode: 'agenda', icon: 'list', label: 'Agenda' },
                { mode: 'week', icon: 'time-outline', label: 'Semana' },
                { mode: 'calendar', icon: 'calendar', label: 'Mês' },
              ] as const).map((option) => {
                const active = viewMode === option.mode;
                return (
                  <Pressable
                    key={option.mode}
                    style={[styles.viewToggleButton, active && styles.viewToggleButtonActive]}
                    onPress={() => setViewMode(option.mode)}
                  >
                    <Ionicons
                      name={option.icon}
                      size={15}
                      color={active ? colors.textInverse : colors.textSecondary}
                    />
                    <Text style={[styles.viewToggleText, active && styles.viewToggleTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              style={styles.refreshButton}
              onPress={() => loadEvents(true)}
              disabled={isRefreshing}
              accessibilityLabel="Atualizar eventos"
              accessibilityRole="button"
            >
              {isRefreshing ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="refresh" size={18} color={colors.primary} />
              )}
            </Pressable>
          </View>

          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color={colors.textTertiary} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Buscar por nome ou local"
              placeholderTextColor={colors.textTertiary}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <Pressable
                style={styles.clearButton}
                onPress={() => setSearchQuery('')}
                accessibilityLabel="Limpar busca"
              >
                <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
              </Pressable>
            )}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.typeFilters}
          >
            <Pressable
              onPress={() => setOnlyMyPastorals((prev) => !prev)}
              style={[styles.typeChip, onlyMyPastorals && styles.typeChipActive]}
              accessibilityRole="button"
              accessibilityLabel={
                onlyMyPastorals
                  ? 'Mostrar todos os eventos da comunidade'
                  : 'Mostrar apenas eventos das minhas pastorais'
              }
            >
              <Ionicons
                name="people"
                size={12}
                color={onlyMyPastorals ? colors.highlight : colors.textSecondary}
                style={styles.typeChipIcon}
              />
              <Text style={[styles.typeChipText, onlyMyPastorals && styles.typeChipTextActive]}>
                Minhas pastorais
              </Text>
            </Pressable>

            {/* Toggle da agenda fixa (Missa/Confissão/Adoração/Terço) */}
            <Pressable
              onPress={() => setShowFixed((prev) => !prev)}
              style={[styles.typeChip, showFixed && styles.typeChipActive]}
            >
              <Ionicons
                name="repeat"
                size={12}
                color={showFixed ? colors.highlight : colors.textSecondary}
                style={styles.typeChipIcon}
              />
              <Text style={[styles.typeChipText, showFixed && styles.typeChipTextActive]}>
                Agenda fixa
              </Text>
            </Pressable>

            {typeOptions.map((type) => {
              const isActive = selectedType === type;
              const label = type === 'ALL' ? 'Todos' : getEventTypeLabel(type as EventType);

              return (
                <Pressable
                  key={type}
                  onPress={() => setSelectedType(type as EventType | 'ALL')}
                  style={[styles.typeChip, isActive && styles.typeChipActive]}
                >
                  {type !== 'ALL' && (
                    <View
                      style={[
                        styles.typeDot,
                        { backgroundColor: getEventTypeColor(type as EventType) },
                      ]}
                    />
                  )}
                  <Text style={[styles.typeChipText, isActive && styles.typeChipTextActive]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {viewMode === 'calendar' ? (
          <>
            <View style={styles.calBar}>
              <Pressable style={styles.todayButton} onPress={goToToday}>
                <Ionicons name="today-outline" size={14} color={colors.highlight} />
                <Text style={styles.todayButtonText}>Hoje</Text>
              </Pressable>
            </View>
            <Calendar
              key={isDark ? 'dark' : 'light'}
              current={visibleMonth}
              onDayPress={onDayPress}
              onMonthChange={(month) => setVisibleMonth(month.dateString)}
              enableSwipeMonths
              markedDates={markedDates}
              markingType={'multi-period'}
              theme={calendarTheme}
            />

            <View style={styles.eventsContainer}>
              <Text style={styles.eventsTitle}>
                Eventos em {formatToBrazilianDate(selectedDate, 'dd/MM/yyyy')}
              </Text>
              <ScrollView
                style={styles.eventsList}
                contentContainerStyle={styles.eventsListContent}
                refreshControl={
                  <RefreshControl refreshing={isRefreshing} onRefresh={() => loadEvents(true)} />
                }
              >
                {eventsForSelectedDate.length > 0 ? (
                  buildDayRows(eventsForSelectedDate, selectedDate).map((row) => (
                    <React.Fragment key={row.key}>{renderAgendaItem({ item: row })}</React.Fragment>
                  ))
                ) : (
                  <Text style={styles.noEvents}>Nenhum evento agendado para esta data.</Text>
                )}
              </ScrollView>
            </View>
          </>
        ) : viewMode === 'week' ? (
          <View style={styles.weekContainer}>
            {/* Faixa de dias da semana */}
            <View style={styles.weekStrip}>
              <Pressable style={styles.weekNav} onPress={() => shiftWeek(-7)}>
                <Ionicons name="chevron-back" size={18} color={colors.textSecondary} />
              </Pressable>
              {weekDays.map((day) => {
                const dayKey = DAY_KEY(day);
                const isSel = dayKey === selectedDate;
                const today = DAY_KEY(new Date()) === dayKey;
                const hasEvents = !!markedDates[dayKey]?.periods?.length;
                return (
                  <Pressable
                    key={dayKey}
                    style={[styles.weekDay, isSel && styles.weekDaySelected]}
                    onPress={() => setSelectedDate(dayKey)}
                  >
                    <Text style={[styles.weekDayName, isSel && styles.weekDayTextSel]}>
                      {format(day, 'EEEEEE', { locale: ptBR })}
                    </Text>
                    <Text style={[styles.weekDayNum, isSel && styles.weekDayTextSel, today && !isSel && styles.weekDayToday]}>
                      {format(day, 'd')}
                    </Text>
                    {hasEvents && <View style={[styles.weekDot, isSel && { backgroundColor: colors.textInverse }]} />}
                  </Pressable>
                );
              })}
              <Pressable style={styles.weekNav} onPress={() => shiftWeek(7)}>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>

            {/* Eventos "dia todo" / vários dias */}
            {allDayForSelected.length > 0 && (
              <View style={styles.allDayBanner}>
                {allDayForSelected.map((item) => (
                  <Pressable
                    key={item.key}
                    style={[styles.allDayChip, { borderLeftColor: eventColor(item.event) }]}
                    onPress={() => openEventDetails(item.event)}
                  >
                    <Ionicons name="calendar-outline" size={12} color={colors.highlight} />
                    <Text style={styles.allDayChipText} numberOfLines={1}>{item.event.title}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            {/* Timeline por horas do dia selecionado */}
            <View style={styles.timelineWrap}>
              {timelineEvents.length > 0 ? (
                <Timeline
                  key={`${selectedDate}-${isDark ? 'd' : 'l'}`}
                  date={selectedDate}
                  events={timelineEvents}
                  showNowIndicator
                  scrollToFirst
                  format24h
                  onEventPress={(e: any) => {
                    const found = events.find((ev) => ev.id === e.id);
                    if (found) openEventDetails(found);
                  }}
                  theme={calendarTheme}
                />
              ) : (
                <View style={styles.timelineEmpty}>
                  <Ionicons name="time-outline" size={28} color={colors.textTertiary} />
                  <Text style={styles.noEvents}>Sem eventos com horário neste dia.</Text>
                </View>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.agendaContainer}>
            <SectionList
              sections={agendaSections}
              style={styles.agendaList}
              keyExtractor={(item) => item.key}
              renderItem={renderAgendaItem}
              renderSectionHeader={renderSectionHeader}
              stickySectionHeadersEnabled={true}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.agendaContent}
              refreshing={isRefreshing}
              onRefresh={() => loadEvents(true)}
              ListEmptyComponent={
                <Text style={styles.noEvents}>Nenhum evento futuro encontrado.</Text>
              }
            />
          </View>
        )}

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
                          { backgroundColor: eventColor(selectedEvent) },
                        ]}
                      >
                        <Text style={styles.modalTypeText}>
                          {selectedEvent.isFixed ? `🕐 ${eventLabel(selectedEvent)}` : eventLabel(selectedEvent)}
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
                        {(() => {
                          const meta = getEventDateMeta(selectedEvent);
                          if (meta.isMultiDay) {
                            const startPart = meta.isAllDay
                              ? formatToBrazilianDate(selectedEvent.startDate, 'dd/MM/yyyy')
                              : `${formatToBrazilianDate(selectedEvent.startDate, 'dd/MM/yyyy')} às ${formatToBrazilianDate(selectedEvent.startDate, 'HH:mm')}`;
                            const endPart = meta.isAllDay
                              ? format(meta.end, 'dd/MM/yyyy', { locale: ptBR })
                              : `${format(meta.end, 'dd/MM/yyyy', { locale: ptBR })} às ${format(meta.end, 'HH:mm', { locale: ptBR })}`;
                            return `${startPart}  →  ${endPart}  (${meta.dayCount} dias)`;
                          }
                          if (meta.isAllDay) {
                            return `${formatToBrazilianDate(selectedEvent.startDate, 'dd/MM/yyyy')} · Dia todo`;
                          }
                          return `${formatToBrazilianDate(selectedEvent.startDate, 'dd/MM/yyyy')} às ${formatToBrazilianDate(selectedEvent.startDate, 'HH:mm')}`;
                        })()}
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

                    {/* Adicionar à agenda nativa do celular */}
                    <TouchableOpacity
                      style={styles.addToCalendarButton}
                      onPress={() => handleAddToDeviceCalendar(selectedEvent)}
                      disabled={addingToCalendar}
                    >
                      {addingToCalendar ? (
                        <ActivityIndicator size="small" color={colors.highlight} />
                      ) : (
                        <>
                          <Ionicons name="calendar" size={16} color={colors.highlight} />
                          <Text style={styles.addToCalendarText}>Adicionar à minha agenda</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    {/* Escalas de Serviço (não se aplica à agenda fixa) */}
                    {!selectedEvent.isFixed && (
                    <View style={styles.serviceRosterSection}>
                      <Text style={styles.serviceRosterSectionTitle}>📋 Escalas de Serviço</Text>

                      {isLoadingRosters ? (
                        <View style={styles.rostersLoading}>
                          <ActivityIndicator size="small" color={colors.primary} />
                          <Text style={styles.rostersLoadingText}>Carregando escalas...</Text>
                        </View>
                      ) : serviceRosters.length > 0 ? (
                        serviceRosters.map((roster) => (
                          (() => {
                            const members = getRosterMembers(roster);
                            const summary = getRosterStatusSummary(roster);

                            return (
                          <View key={roster.id} style={styles.rosterCard}>
                            <View style={styles.rosterHeader}>
                              <Text style={styles.rosterPastoralName}>{roster.pastoralName}</Text>
                            </View>
                            <Text style={styles.rosterResponsibilities}>{roster.responsibilities}</Text>
                            <View style={styles.rosterSummary}>
                              <Text style={styles.rosterSummaryText}>
                                Escalados: {summary.total} • Confirmados: {summary.confirmed} •
                                Pendentes: {summary.pending} • Presenças: {summary.checkedIn}
                              </Text>
                            </View>
                            <View style={styles.rosterMembers}>
                              <Text style={styles.rosterMembersLabel}>Escalados:</Text>
                              {members.map((member) => (
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
                                    <Text style={[styles.memberStatus, getMemberStatusStyle(member)]}>
                                      {getMemberStatusLabel(member)}
                                    </Text>
                                  </View>
                                </View>
                              ))}
                            </View>
                          </View>
                            );
                          })()
                        ))
                      ) : rostersError ? (
                        <View style={styles.noRosters}>
                          <Text style={[styles.noRostersText, { color: colors.error }]}>
                            Não foi possível carregar as escalas. Verifique sua conexão.
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.noRosters}>
                          <Text style={styles.noRostersText}>
                            Nenhuma escala de serviço cadastrada para este evento.
                          </Text>
                        </View>
                      )}
                    </View>
                    )}

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
    toolbar: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    toolbarTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    viewToggle: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: 999,
      padding: 4,
      alignSelf: 'flex-start',
    },
    refreshButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    viewToggleButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      gap: 6,
    },
    viewToggleButtonActive: {
      backgroundColor: colors.highlight,
    },
    viewToggleText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    viewToggleTextActive: {
      color: colors.textInverse,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginBottom: 10,
    },
    searchInput: {
      flex: 1,
      marginLeft: 8,
      color: colors.text,
    },
    clearButton: {
      marginLeft: 6,
    },
    typeFilters: {
      paddingRight: 8,
    },
    typeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      marginRight: 8,
    },
    typeChipActive: {
      backgroundColor: colors.highlightLight,
      borderColor: colors.highlight,
    },
    typeChipText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    typeChipTextActive: {
      color: colors.highlight,
    },
    typeDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: 6,
    },
    typeChipIcon: {
      marginRight: 6,
    },
    agendaContainer: {
      flex: 1,
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    agendaList: {
      flex: 1,
    },
    agendaContent: {
      paddingBottom: 24,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 2,
      backgroundColor: colors.background,
    },
    sectionHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
    },
    sectionHeaderRelative: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.highlight,
      backgroundColor: colors.highlightLight,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 8,
      overflow: 'hidden',
      letterSpacing: 0.5,
    },
    sectionHeaderText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
    },
    sectionHeaderCount: {
      fontSize: 12,
      color: colors.textTertiary,
      fontWeight: '600',
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
    eventsListContent: {
      paddingBottom: 20,
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
    eventTimeCol: {
      minWidth: 52,
      marginRight: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    eventTime: {
      fontSize: 16,
      fontWeight: 'bold',
      color: colors.highlight,
      textAlign: 'center',
    },
    eventTimeSub: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.highlight,
      textAlign: 'center',
      marginTop: -2,
    },
    eventDetails: {
      flex: 1,
    },
    eventTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    eventTitle: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text,
      flexShrink: 1,
    },
    rangeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 4,
      marginTop: 3,
      marginBottom: 1,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: colors.highlightLight,
    },
    rangeChipText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.highlight,
    },
    eventLocation: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    favoriteButton: {
      paddingHorizontal: 6,
      paddingVertical: 4,
      marginRight: 6,
    },
    noEvents: {
      fontSize: 16,
      color: colors.textTertiary,
      textAlign: 'center',
      marginTop: 20,
    },
    // Botão "Hoje" acima do mês
    calBar: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingHorizontal: 16,
      paddingTop: 6,
    },
    todayButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.highlight,
    },
    todayButtonText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.highlight,
    },
    // Grupo de eventos repetidos (ex.: várias missas)
    groupRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
      padding: 12,
      backgroundColor: colors.card,
      borderRadius: 8,
    },
    groupBadge: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.highlightLight,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    groupBadgeText: {
      fontSize: 15,
      fontWeight: '800',
    },
    groupChildren: {
      paddingLeft: 14,
      marginBottom: 6,
    },
    // Visão Semana
    weekContainer: {
      flex: 1,
    },
    weekStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 6,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    weekNav: {
      padding: 6,
    },
    weekDay: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 6,
      borderRadius: 10,
      marginHorizontal: 1,
    },
    weekDaySelected: {
      backgroundColor: colors.highlight,
    },
    weekDayName: {
      fontSize: 10,
      color: colors.textTertiary,
      textTransform: 'uppercase',
      fontWeight: '600',
    },
    weekDayNum: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      marginTop: 2,
    },
    weekDayTextSel: {
      color: colors.textInverse,
    },
    weekDayToday: {
      color: colors.highlight,
    },
    weekDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.highlight,
      marginTop: 3,
    },
    allDayBanner: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 6,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    allDayChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.card,
      borderLeftWidth: 3,
      borderRadius: 6,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    allDayChipText: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
    },
    timelineWrap: {
      flex: 1,
    },
    timelineEmpty: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 60,
      gap: 8,
    },
    // Botão adicionar à agenda (modal)
    addToCalendarButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 14,
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.highlight,
      backgroundColor: colors.highlightLight,
    },
    addToCalendarText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.highlight,
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
    rosterSummary: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 8,
      marginBottom: 10,
    },
    rosterSummaryText: {
      fontSize: 12,
      color: colors.textSecondary,
      fontWeight: '500',
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
    memberStatus: {
      fontSize: 11,
      marginTop: 2,
      fontWeight: '600',
    },
    statusPending: {
      color: colors.warning,
    },
    statusConfirmed: {
      color: colors.primary,
    },
    statusDeclined: {
      color: colors.error,
    },
    statusCheckedIn: {
      color: colors.success,
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
