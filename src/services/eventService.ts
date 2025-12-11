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
