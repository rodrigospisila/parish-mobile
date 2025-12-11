import api from '../config/api';

// Tipos de dados
export interface Community {
  id: string;
  name: string;
  parishId: string;
}

export interface Parish {
  id: string;
  name: string;
  dioceseId: string;
  communities: Community[];
}

export interface Diocese {
  id: string;
  name: string;
  parishes: Parish[];
}

// Mock de dados para desenvolvimento
const mockDioceses: Diocese[] = [
  {
    id: '1',
    name: 'Diocese de Santa Rita',
    parishes: [
      {
        id: '101',
        name: 'Paróquia Nossa Senhora da Paz',
        dioceseId: '1',
        communities: [
          { id: '1001', name: 'Comunidade São João', parishId: '101' },
          { id: '1002', name: 'Comunidade Santa Clara', parishId: '101' },
        ],
      },
      {
        id: '102',
        name: 'Paróquia São Francisco de Assis',
        dioceseId: '1',
        communities: [
          { id: '1003', name: 'Comunidade Matriz', parishId: '102' },
        ],
      },
    ],
  },
  {
    id: '2',
    name: 'Diocese de São Paulo',
    parishes: [
      {
        id: '201',
        name: 'Paróquia Santo Antônio',
        dioceseId: '2',
        communities: [
          { id: '2001', name: 'Comunidade Central', parishId: '201' },
        ],
      },
    ],
  },
];

export const getDioceses = async (): Promise<Diocese[]> => {
  // Em um cenário real, faríamos a chamada:
  // const response = await api.get('/church/dioceses');
  // return response.data;

  return new Promise((resolve) => {
    setTimeout(() => resolve(mockDioceses), 500); // Simula delay de rede
  });
};

export const getParishes = async (dioceseId: string): Promise<Parish[]> => {
  // Em um cenário real, faríamos a chamada:
  // const response = await api.get(`/church/dioceses/${dioceseId}/parishes`);
  // return response.data;

  const diocese = mockDioceses.find(d => d.id === dioceseId);
  return new Promise((resolve) => {
    setTimeout(() => resolve(diocese ? diocese.parishes : []), 100);
  });
};

export const getCommunities = async (parishId: string): Promise<Community[]> => {
  // Em um cenário real, faríamos a chamada:
  // const response = await api.get(`/church/parishes/${parishId}/communities`);
  // return response.data;

  const parish = mockDioceses
    .flatMap(d => d.parishes)
    .find(p => p.id === parishId);

  return new Promise((resolve) => {
    setTimeout(() => resolve(parish ? parish.communities : []), 100);
  });
};
