import api from '../config/api';
import { ServiceRoster, getServiceRostersByEventId } from './pastoralService';

export type EventType = 'MISSA' | 'REUNIAO' | 'ATIVIDADE';

export interface Event {
  id: string;
  title: string;
  description: string;
  date: string; // ISO 8601 string
  type: EventType;
  location: string;
  communityId: string;
  hasServiceRosters?: boolean; // Indica se o evento tem escalas de serviço
}

export interface EventWithRosters extends Event {
  serviceRosters: ServiceRoster[];
}

/**
 * Busca o próximo evento (missa) para a comunidade do usuário.
 * @param communityId ID da comunidade do usuário logado.
 * @returns O próximo evento ou null.
 */
export const getNextMass = async (communityId: string): Promise<Event | null> => {
  try {
    // Em um cenário real, o endpoint seria algo como:
    // const response = await api.get(`/events/next-mass?communityId=${communityId}`);
    // return response.data;

    // Mock de dados para desenvolvimento
    const now = new Date();
    const nextDay = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Próximo dia

    const mockEvent: Event = {
      id: '1',
      title: 'Santa Missa Dominical',
      description: 'Missa celebrada pelo Padre João.',
      date: nextDay.toISOString(),
      type: 'MISSA',
      location: 'Igreja Matriz - Comunidade São João',
      communityId: communityId,
      hasServiceRosters: true,
    };

    return new Promise((resolve) => {
      setTimeout(() => resolve(mockEvent), 300); // Simula delay de rede
    });
  } catch (error) {
    console.error('Erro ao buscar próxima missa:', error);
    return null;
  }
};

/**
 * Busca todos os eventos para a comunidade do usuário.
 * @param communityId ID da comunidade do usuário logado.
 * @returns Lista de eventos.
 */
export const getCommunityEvents = async (communityId: string): Promise<Event[]> => {
  try {
    // Em um cenário real, o endpoint seria algo como:
    // const response = await api.get(`/events?communityId=${communityId}`);
    // return response.data;

    // Mock de dados para desenvolvimento
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const dayAfterTomorrow = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    // Cria datas específicas para os eventos
    const missaDate = new Date(tomorrow);
    missaDate.setHours(17, 30, 0, 0);

    const reuniaoDate = new Date(dayAfterTomorrow);
    reuniaoDate.setHours(19, 0, 0, 0);

    const catequeseDate = new Date(tomorrow);
    catequeseDate.setHours(10, 0, 0, 0);

    const mockEvents: Event[] = [
      {
        id: '1',
        title: 'Santa Missa Dominical',
        description: 'Missa celebrada pelo Padre João. Todos são bem-vindos para celebrar a Eucaristia.',
        date: missaDate.toISOString(),
        type: 'MISSA',
        location: 'Igreja Matriz',
        communityId: communityId,
        hasServiceRosters: true,
      },
      {
        id: '2',
        title: 'Reunião do Conselho',
        description: 'Pauta: Preparação da Festa Junina e planejamento das atividades do próximo mês.',
        date: reuniaoDate.toISOString(),
        type: 'REUNIAO',
        location: 'Salão Paroquial',
        communityId: communityId,
        hasServiceRosters: true,
      },
      {
        id: '3',
        title: 'Catequese Infantil',
        description: 'Encontro semanal de catequese para crianças de 7 a 10 anos. Tema: O Batismo.',
        date: catequeseDate.toISOString(),
        type: 'ATIVIDADE',
        location: 'Sala 3',
        communityId: communityId,
        hasServiceRosters: true,
      },
    ];

    return new Promise((resolve) => {
      setTimeout(() => resolve(mockEvents), 300); // Simula delay de rede
    });
  } catch (error) {
    console.error('Erro ao buscar eventos da comunidade:', error);
    return [];
  }
};

/**
 * Busca um evento com suas escalas de serviço
 * @param eventId ID do evento
 * @returns Evento com escalas de serviço
 */
export const getEventWithRosters = async (event: Event): Promise<EventWithRosters> => {
  try {
    const serviceRosters = await getServiceRostersByEventId(event.id);
    return {
      ...event,
      serviceRosters,
    };
  } catch (error) {
    console.error('Erro ao buscar escalas do evento:', error);
    return {
      ...event,
      serviceRosters: [],
    };
  }
};
