import api from '../config/api';

/**
 * Representa um membro de uma pastoral
 */
export interface Member {
  id: string;
  name: string;
  phone?: string;
  role?: string; // Ex: "Coordenador", "Ministro", "Voluntário"
}

/**
 * Representa uma pastoral da comunidade
 */
export interface Pastoral {
  id: string;
  name: string;
  description?: string;
  communityId: string;
  coordinator?: Member;
  members: Member[];
}

/**
 * Representa uma escala de serviço para um evento específico
 */
export interface ServiceRoster {
  id: string;
  eventId: string;
  pastoralId: string;
  pastoralName: string;
  responsibilities: string; // Ex: "Leitura", "Canto", "Acolhida"
  membersOnDuty: Member[];
}

// ============================================
// DADOS MOCK
// ============================================

const mockMembers: Member[] = [
  { id: 'm1', name: 'Maria Silva', phone: '(11) 99999-1111', role: 'Coordenadora' },
  { id: 'm2', name: 'João Santos', phone: '(11) 99999-2222', role: 'Ministro' },
  { id: 'm3', name: 'Ana Oliveira', phone: '(11) 99999-3333', role: 'Voluntária' },
  { id: 'm4', name: 'Pedro Costa', phone: '(11) 99999-4444', role: 'Ministro' },
  { id: 'm5', name: 'Carla Souza', phone: '(11) 99999-5555', role: 'Voluntária' },
  { id: 'm6', name: 'Lucas Ferreira', phone: '(11) 99999-6666', role: 'Coordenador' },
  { id: 'm7', name: 'Juliana Lima', phone: '(11) 99999-7777', role: 'Voluntária' },
  { id: 'm8', name: 'Roberto Alves', phone: '(11) 99999-8888', role: 'Ministro' },
  { id: 'm9', name: 'Fernanda Rocha', phone: '(11) 99999-9999', role: 'Voluntária' },
  { id: 'm10', name: 'Marcos Pereira', phone: '(11) 99999-0000', role: 'Coordenador' },
];

const mockPastorals: Pastoral[] = [
  {
    id: 'p1',
    name: 'Pastoral da Liturgia',
    description: 'Responsável pela organização das celebrações litúrgicas',
    communityId: '1001',
    coordinator: mockMembers[0],
    members: [mockMembers[0], mockMembers[1], mockMembers[2], mockMembers[3]],
  },
  {
    id: 'p2',
    name: 'Pastoral do Canto',
    description: 'Animação musical das celebrações',
    communityId: '1001',
    coordinator: mockMembers[5],
    members: [mockMembers[5], mockMembers[6], mockMembers[7]],
  },
  {
    id: 'p3',
    name: 'Pastoral da Acolhida',
    description: 'Recepção e acolhimento dos fiéis',
    communityId: '1001',
    coordinator: mockMembers[9],
    members: [mockMembers[9], mockMembers[4], mockMembers[8]],
  },
  {
    id: 'p4',
    name: 'Ministros da Eucaristia',
    description: 'Distribuição da Sagrada Comunhão',
    communityId: '1001',
    coordinator: mockMembers[1],
    members: [mockMembers[1], mockMembers[3], mockMembers[7]],
  },
  {
    id: 'p5',
    name: 'Pastoral da Catequese',
    description: 'Formação catequética de crianças e adultos',
    communityId: '1001',
    coordinator: mockMembers[2],
    members: [mockMembers[2], mockMembers[4], mockMembers[6], mockMembers[8]],
  },
];

// ============================================
// FUNÇÕES DO SERVIÇO
// ============================================

/**
 * Busca todas as pastorais de uma comunidade
 */
export const getPastorals = async (communityId: string): Promise<Pastoral[]> => {
  // Em um cenário real:
  // const response = await api.get(`/pastorals?communityId=${communityId}`);
  // return response.data;

  return new Promise((resolve) => {
    setTimeout(() => {
      // Mock: Retorna pastorais para qualquer communityId (simulando que todas as comunidades têm as mesmas pastorais)
      // Em produção, o filtro seria aplicado corretamente pelo backend
      const pastorals = mockPastorals.map((p) => ({ ...p, communityId }));
      resolve(pastorals);
    }, 200);
  });
};

/**
 * Busca uma pastoral específica pelo ID
 */
export const getPastoralById = async (pastoralId: string): Promise<Pastoral | null> => {
  // Em um cenário real:
  // const response = await api.get(`/pastorals/${pastoralId}`);
  // return response.data;

  return new Promise((resolve) => {
    setTimeout(() => {
      const pastoral = mockPastorals.find((p) => p.id === pastoralId);
      resolve(pastoral || null);
    }, 100);
  });
};

/**
 * Busca as escalas de serviço para um evento específico
 */
export const getServiceRostersByEventId = async (eventId: string): Promise<ServiceRoster[]> => {
  // Em um cenário real:
  // const response = await api.get(`/service-rosters?eventId=${eventId}`);
  // return response.data;

  // Mock: Gera escalas baseadas no eventId
  return new Promise((resolve) => {
    setTimeout(() => {
      // Simula diferentes escalas para diferentes eventos
      const mockRosters: ServiceRoster[] = [];

      // Evento 1 (Missa) - tem várias pastorais escaladas
      if (eventId === '1') {
        mockRosters.push(
          {
            id: 'sr1',
            eventId: '1',
            pastoralId: 'p1',
            pastoralName: 'Pastoral da Liturgia',
            responsibilities: '1ª Leitura, 2ª Leitura, Salmo',
            membersOnDuty: [mockMembers[1], mockMembers[2]],
          },
          {
            id: 'sr2',
            eventId: '1',
            pastoralId: 'p2',
            pastoralName: 'Pastoral do Canto',
            responsibilities: 'Animação musical',
            membersOnDuty: [mockMembers[5], mockMembers[6]],
          },
          {
            id: 'sr3',
            eventId: '1',
            pastoralId: 'p3',
            pastoralName: 'Pastoral da Acolhida',
            responsibilities: 'Recepção e entrega de folhetos',
            membersOnDuty: [mockMembers[9], mockMembers[4]],
          },
          {
            id: 'sr4',
            eventId: '1',
            pastoralId: 'p4',
            pastoralName: 'Ministros da Eucaristia',
            responsibilities: 'Distribuição da Comunhão',
            membersOnDuty: [mockMembers[1], mockMembers[3]],
          }
        );
      }

      // Evento 2 (Reunião) - apenas uma pastoral
      if (eventId === '2') {
        mockRosters.push({
          id: 'sr5',
          eventId: '2',
          pastoralId: 'p1',
          pastoralName: 'Pastoral da Liturgia',
          responsibilities: 'Organização da pauta',
          membersOnDuty: [mockMembers[0]],
        });
      }

      // Evento 3 (Catequese) - pastoral da catequese
      if (eventId === '3') {
        mockRosters.push({
          id: 'sr6',
          eventId: '3',
          pastoralId: 'p5',
          pastoralName: 'Pastoral da Catequese',
          responsibilities: 'Encontro semanal - Tema: Batismo',
          membersOnDuty: [mockMembers[2], mockMembers[4], mockMembers[6]],
        });
      }

      resolve(mockRosters);
    }, 200);
  });
};

/**
 * Busca os membros de uma pastoral específica
 */
export const getPastoralMembers = async (pastoralId: string): Promise<Member[]> => {
  // Em um cenário real:
  // const response = await api.get(`/pastorals/${pastoralId}/members`);
  // return response.data;

  return new Promise((resolve) => {
    setTimeout(() => {
      const pastoral = mockPastorals.find((p) => p.id === pastoralId);
      resolve(pastoral ? pastoral.members : []);
    }, 100);
  });
};
