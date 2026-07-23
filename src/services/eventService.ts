import api, { getErrorMessage } from '../config/api';
import { EventType as BackendEventType, eventTypeLabels, eventTypeColors } from '../types';

// ============================================
// TIPOS
// ============================================

/**
 * Tipo de evento (do backend)
 */
export type EventType = BackendEventType;

/**
 * Status do evento
 */
export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED';

/**
 * Comunidade resumida
 */
export interface EventCommunity {
  id: string;
  name: string;
  parish?: {
    id: string;
    name: string;
    diocese?: {
      id: string;
      name: string;
    };
  };
}

/**
 * Membro resumido
 */
export interface EventMember {
  id: string;
  fullName: string;
  email?: string;
  phone?: string;
}

/**
 * Atribuição de escala (assignment)
 */
export interface EventAssignment {
  id: string;
  role: string;
  checkedIn: boolean;
  checkedInAt?: string;
  status?: 'PENDING' | 'CONFIRMED' | 'DECLINED';
  member: EventMember;
}

/**
 * Pastoral vinculada ao evento
 */
export interface EventPastoral {
  id: string;
  role?: string;
  isLeader: boolean;
  requiredPeople?: number;
  notes?: string;
  communityPastoral: {
    id: string;
    globalPastoral: {
      id: string;
      name: string;
    };
  };
  assignments: EventAssignment[];
  _count?: {
    assignments: number;
  };
}

/**
 * Evento
 */
export interface Event {
  id: string;
  title: string;
  description?: string;
  type: EventType;
  startDate: string;
  endDate?: string;
  location?: string;
  notes?: string;
  isRecurring: boolean;
  maxParticipants?: number;
  isPublic: boolean;
  status: EventStatus;
  communityId: string;
  community?: EventCommunity;
  eventPastorals?: EventPastoral[];
  _count?: {
    participants: number;
  };
  // Agenda fixa (Missa/Confissão/Adoração/Terço) — ocorrência virtual, não editável
  isFixed?: boolean;
  fixedType?: 'MASS' | 'CONFESSION' | 'ADORATION' | 'ROSARY';
}

/**
 * Evento com escalas de serviço (para compatibilidade com código existente)
 */
export interface EventWithRosters extends Event {
  serviceRosters: ServiceRoster[];
}

/**
 * Escala de serviço (formato legado para compatibilidade)
 */
export interface ServiceRoster {
  id: string;
  pastoralId: string;
  pastoralName: string;
  responsibilities: string;
  members: {
    id: string;
    name: string;
    status?: 'PENDING' | 'CONFIRMED' | 'DECLINED';
    role: string;
    phone?: string;
    checkedIn?: boolean;
    checkedInAt?: string;
  }[];
  membersOnDuty?: {
    id: string;
    name: string;
    status?: 'PENDING' | 'CONFIRMED' | 'DECLINED';
    role: string;
    phone?: string;
    checkedIn?: boolean;
    checkedInAt?: string;
  }[];
}

// ============================================
// CONFIGURAÇÃO
// ============================================

const USE_MOCK = process.env.EXPO_PUBLIC_USE_MOCK === 'true';

// ============================================
// HELPERS
// ============================================

/**
 * Converte EventPastoral para ServiceRoster (formato legado)
 */
function convertToServiceRoster(eventPastoral: EventPastoral): ServiceRoster {
  const members = eventPastoral.assignments.map((assignment) => ({
    id: assignment.member.id,
    name: assignment.member.fullName,
    role: assignment.role,
    phone: assignment.member.phone,
    status: assignment.status,
    checkedIn: assignment.checkedIn,
    checkedInAt: assignment.checkedInAt,
  }));

  return {
    id: eventPastoral.id,
    pastoralId: eventPastoral.communityPastoral.id,
    pastoralName: eventPastoral.communityPastoral.globalPastoral.name,
    responsibilities: eventPastoral.role || 'Serviço',
    members,
    membersOnDuty: members,
  };
}

/** Retorna a label do tipo de evento em português
 */
export function getEventTypeLabel(type: EventType): string {
  return eventTypeLabels[type] || type;
}

/**
 * Retorna a cor do tipo de evento
 */
export function getEventTypeColor(type: EventType): string {
  return eventTypeColors[type] || '#757575';
}

// ============================================
// SERVIÇO
// ============================================

/**
 * Busca o próximo evento (missa) para a comunidade do usuário
 */
export const getNextMass = async (communityId: string): Promise<Event | null> => {
  if (USE_MOCK) {
    return mockGetNextMass(communityId);
  }

  try {
    const response = await api.get<Event[]>('/events/upcoming', {
      params: {
        communityId,
        limit: 1,
      },
    });

    // Filtra apenas missas
    const masses = response.data.filter((e) => e.type === 'MASS');
    return masses.length > 0 ? masses[0] : null;
  } catch (error) {
    console.error('Erro ao buscar próxima missa:', error);
    return null;
  }
};

/**
 * Busca todos os eventos para a comunidade do usuário.
 * Com `onlyMyPastorals`, retorna apenas eventos em que alguma pastoral
 * do usuário está envolvida.
 */
export const getCommunityEvents = async (
  communityId: string,
  options?: { onlyMyPastorals?: boolean },
): Promise<Event[]> => {
  if (USE_MOCK) {
    return mockGetCommunityEvents(communityId);
  }

  try {
    const response = await api.get<Event[]>('/events', {
      params: {
        communityId,
        ...(options?.onlyMyPastorals ? { onlyMyPastorals: 'true' } : {}),
      },
    });
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/**
 * Busca as ocorrências da AGENDA FIXA (Missa/Confissão/Adoração/Terço) num
 * período e as converte em "eventos" virtuais (isFixed) para exibir no
 * calendário junto dos eventos reais. São somente-leitura (não editáveis).
 */
export const getFixedOccurrences = async (
  communityId: string,
  from: Date,
  to: Date,
): Promise<Event[]> => {
  if (USE_MOCK) return [];

  try {
    const response = await api.get<any[]>('/mass-schedules/occurrences', {
      params: { communityId, from: from.toISOString(), to: to.toISOString() },
    });
    return (response.data || []).map((occ) => ({
      id: occ.id,
      title: occ.title,
      type: (occ.type === 'MASS' ? 'MASS' : 'OTHER') as EventType,
      startDate: occ.start,
      endDate: occ.end,
      location: occ.community?.name,
      isRecurring: true,
      isPublic: true,
      status: 'PUBLISHED' as EventStatus,
      communityId: occ.community?.id ?? communityId,
      isFixed: true,
      fixedType: occ.type,
    }));
  } catch (error) {
    console.error('Erro ao carregar agenda fixa:', error);
    return []; // não bloqueia o calendário
  }
};

/**
 * Busca eventos futuros da comunidade
 */
export const getUpcomingEvents = async (communityId: string, limit: number = 10): Promise<Event[]> => {
  if (USE_MOCK) {
    return mockGetCommunityEvents(communityId);
  }

  try {
    const response = await api.get<Event[]>('/events/upcoming', {
      params: {
        communityId,
        limit,
      },
    });
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/**
 * Busca eventos por intervalo de datas
 */
export const getEventsByDateRange = async (
  startDate: string,
  endDate: string,
  communityId?: string
): Promise<Event[]> => {
  if (USE_MOCK) {
    return mockGetCommunityEvents(communityId || '');
  }

  try {
    const response = await api.get<Event[]>('/events/range', {
      params: {
        startDate,
        endDate,
        communityId,
      },
    });
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/**
 * Busca eventos por tipo
 */
export const getEventsByType = async (type: EventType, communityId?: string): Promise<Event[]> => {
  if (USE_MOCK) {
    const events = await mockGetCommunityEvents(communityId || '');
    return events.filter((e) => e.type === type);
  }

  try {
    const response = await api.get<Event[]>(`/events/type/${type}`, {
      params: {
        communityId,
      },
    });
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/**
 * Busca um evento por ID com detalhes completos
 */
export const getEventById = async (id: string): Promise<Event> => {
  if (USE_MOCK) {
    return mockGetEventById(id);
  }

  try {
    const response = await api.get<Event>(`/events/${id}`);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/**
 * Busca um evento com suas escalas de serviço (formato legado)
 *
 * Os membros escalados vivem em ScheduleAssignment (via Schedule), não em
 * EventPastoralAssignment. Por isso buscamos GET /schedules?eventId e
 * agrupamos os assignments por communityPastoralId para montar o ServiceRoster.
 */
export const getEventWithRosters = async (event: Event): Promise<EventWithRosters> => {
  if (USE_MOCK) {
    return mockGetEventWithRosters(event);
  }

  try {
    const [fullEvent, schedulesResponse] = await Promise.all([
      getEventById(event.id),
      api.get(`/schedules?eventId=${event.id}`),
    ]);

    const schedules: any[] = schedulesResponse.data || [];

    // Agrupa assignments de todos os schedules do evento por communityPastoralId
    const assignmentsByPastoral: Record<string, any[]> = {};
    for (const schedule of schedules) {
      for (const assignment of schedule.assignments || []) {
        const pid = assignment.communityPastoral?.id ?? 'general';
        if (!assignmentsByPastoral[pid]) assignmentsByPastoral[pid] = [];
        // Evita duplicatas do mesmo membro em múltiplos schedules
        if (!assignmentsByPastoral[pid].some((a) => a.member?.id === assignment.member?.id)) {
          assignmentsByPastoral[pid].push(assignment);
        }
      }
    }

    const serviceRosters: ServiceRoster[] = (fullEvent.eventPastorals || []).map((ep) => {
      const epAssignments = assignmentsByPastoral[ep.communityPastoral.id] || [];
      const members = epAssignments.map((a: any) => ({
        id: a.member.id,
        name: a.member.fullName,
        role: a.role,
        phone: a.member.phone,
        status: a.status as 'PENDING' | 'CONFIRMED' | 'DECLINED',
        checkedIn: !!a.checkedIn,
        checkedInAt: a.checkedInAt,
      }));

      return {
        id: ep.id,
        pastoralId: ep.communityPastoral.id,
        pastoralName: ep.communityPastoral.globalPastoral.name,
        responsibilities: ep.role || 'Serviço',
        members,
        membersOnDuty: members,
      };
    });

    return { ...fullEvent, serviceRosters };
  } catch (error) {
    console.error('Erro ao buscar escalas do evento:', error);
    return { ...event, serviceRosters: [] };
  }
};

/**
 * Busca as pastorais vinculadas a um evento
 */
export const getEventPastorals = async (eventId: string): Promise<EventPastoral[]> => {
  if (USE_MOCK) {
    return [];
  }

  try {
    const response = await api.get<EventPastoral[]>(`/events/${eventId}/pastorals`);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/**
 * Busca eventos favoritados pelo usuario
 */
export const getFavoriteEvents = async (): Promise<Event[]> => {
  if (USE_MOCK) {
    return [];
  }

  try {
    const response = await api.get<Event[]>('/events/favorites');
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/**
 * Favorita um evento
 */
export const addFavoriteEvent = async (eventId: string): Promise<void> => {
  if (USE_MOCK) {
    return;
  }

  try {
    await api.post(`/events/${eventId}/favorite`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/**
 * Remove o evento dos favoritos
 */
export const removeFavoriteEvent = async (eventId: string): Promise<void> => {
  if (USE_MOCK) {
    return;
  }

  try {
    await api.delete(`/events/${eventId}/favorite`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

// ============================================
// MOCK DATA
// ============================================

async function mockGetNextMass(communityId: string): Promise<Event | null> {
  await new Promise((resolve) => setTimeout(resolve, 300));

  const now = new Date();
  const nextDay = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  nextDay.setHours(17, 30, 0, 0);

  return {
    id: 'mock-event-1',
    title: 'Santa Missa Dominical',
    description: 'Missa celebrada pelo Padre João.',
    type: 'MASS',
    startDate: nextDay.toISOString(),
    location: 'Igreja Matriz - Comunidade São João',
    isRecurring: true,
    isPublic: true,
    status: 'PUBLISHED',
    communityId: communityId,
  };
}

async function mockGetCommunityEvents(communityId: string): Promise<Event[]> {
  await new Promise((resolve) => setTimeout(resolve, 300));

  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const dayAfterTomorrow = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const missaDate = new Date(tomorrow);
  missaDate.setHours(17, 30, 0, 0);

  const reuniaoDate = new Date(dayAfterTomorrow);
  reuniaoDate.setHours(19, 0, 0, 0);

  const catequeseDate = new Date(tomorrow);
  catequeseDate.setHours(10, 0, 0, 0);

  return [
    {
      id: 'mock-event-1',
      title: 'Santa Missa Dominical',
      description: 'Missa celebrada pelo Padre João. Todos são bem-vindos para celebrar a Eucaristia.',
      type: 'MASS',
      startDate: missaDate.toISOString(),
      location: 'Igreja Matriz',
      isRecurring: true,
      isPublic: true,
      status: 'PUBLISHED',
      communityId: communityId,
    },
    {
      id: 'mock-event-2',
      title: 'Reunião do Conselho',
      description: 'Pauta: Preparação da Festa Junina e planejamento das atividades do próximo mês.',
      type: 'PASTORAL_MEETING',
      startDate: reuniaoDate.toISOString(),
      location: 'Salão Paroquial',
      isRecurring: false,
      isPublic: false,
      status: 'PUBLISHED',
      communityId: communityId,
    },
    {
      id: 'mock-event-3',
      title: 'Catequese Infantil',
      description: 'Encontro semanal de catequese para crianças de 7 a 10 anos. Tema: O Batismo.',
      type: 'FORMATION',
      startDate: catequeseDate.toISOString(),
      location: 'Sala 3',
      isRecurring: true,
      isPublic: true,
      status: 'PUBLISHED',
      communityId: communityId,
    },
  ];
}

async function mockGetEventById(id: string): Promise<Event> {
  await new Promise((resolve) => setTimeout(resolve, 200));

  const events = await mockGetCommunityEvents('mock-community');
  const event = events.find((e) => e.id === id);

  if (!event) {
    throw new Error('Evento não encontrado');
  }

  return event;
}

async function mockGetEventWithRosters(event: Event): Promise<EventWithRosters> {
  await new Promise((resolve) => setTimeout(resolve, 200));

  // Mock de escalas de serviço
  const mockRosters: ServiceRoster[] = [
    {
      id: 'mock-roster-1',
      pastoralId: 'mock-pastoral-1',
      pastoralName: 'Ministros da Eucaristia',
      responsibilities: '1ª Leitura, 2ª Leitura',
      members: [
        { id: 'mock-member-1', name: 'Maria Silva', role: '1ª Leitura', phone: '11999999999' },
        { id: 'mock-member-2', name: 'João Santos', role: '2ª Leitura', phone: '11988888888' },
      ],
    },
    {
      id: 'mock-roster-2',
      pastoralId: 'mock-pastoral-2',
      pastoralName: 'Coral',
      responsibilities: 'Animação',
      members: [
        { id: 'mock-member-3', name: 'Ana Oliveira', role: 'Regente' },
        { id: 'mock-member-4', name: 'Pedro Costa', role: 'Violão' },
      ],
    },
  ];

  return {
    ...event,
    serviceRosters: mockRosters,
  };
}

export default {
  getNextMass,
  getCommunityEvents,
  getUpcomingEvents,
  getEventsByDateRange,
  getEventsByType,
  getEventById,
  getEventWithRosters,
  getEventPastorals,
  getFavoriteEvents,
  addFavoriteEvent,
  removeFavoriteEvent,
  getEventTypeLabel,
  getEventTypeColor,
};

