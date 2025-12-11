import api from '../config/api';

export interface Event {
  id: string;
  title: string;
  description: string;
  date: string; // ISO 8601 string
  type: 'MISSA' | 'REUNIAO' | 'ATIVIDADE';
  location: string;
  communityId: string;
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
    const nextHour = new Date(now.getTime() + 60 * 60 * 1000); // Próxima hora
    const nextDay = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Próximo dia

    const mockEvent: Event = {
      id: '1',
      title: 'Santa Missa Dominical',
      description: 'Missa celebrada pelo Padre João.',
      date: nextDay.toISOString(),
      type: 'MISSA',
      location: 'Igreja Matriz - Comunidade São João',
      communityId: communityId,
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

    const mockEvents: Event[] = [
      {
        id: '1',
        title: 'Santa Missa Dominical',
        description: 'Missa celebrada pelo Padre João.',
        date: tomorrow.toISOString(),
        type: 'MISSA',
        location: 'Igreja Matriz',
        communityId: communityId,
      },
      {
        id: '2',
        title: 'Reunião do Conselho',
        description: 'Pauta: Festa Junina.',
        date: dayAfterTomorrow.toISOString(),
        type: 'REUNIAO',
        location: 'Salão Paroquial',
        communityId: communityId,
      },
      {
        id: '3',
        title: 'Catequese Infantil',
        description: 'Encontro semanal.',
        date: new Date(tomorrow.setHours(10, 0, 0, 0)).toISOString(),
        type: 'ATIVIDADE',
        location: 'Sala 3',
        communityId: communityId,
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
