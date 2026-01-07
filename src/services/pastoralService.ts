import api from '../config/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

/**
 * Status de confirmação de presença na escala
 */
export type RosterConfirmationStatus = 'pending' | 'confirmed' | 'declined';

/**
 * Interface para escala do usuário com informações do evento
 */
export interface UserRoster {
  id: string;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  eventLocation: string;
  eventType: string;
  pastoralName: string;
  responsibilities: string;
  confirmationStatus: RosterConfirmationStatus;
  confirmedAt?: string;
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

// Chave para armazenar confirmações no AsyncStorage
const ROSTER_CONFIRMATIONS_KEY = '@parish:roster_confirmations';

// ============================================
// FUNÇÕES DE CONFIRMAÇÃO
// ============================================

/**
 * Carrega as confirmações salvas do AsyncStorage
 */
const loadConfirmations = async (): Promise<Record<string, { status: RosterConfirmationStatus; confirmedAt?: string }>> => {
  try {
    const data = await AsyncStorage.getItem(ROSTER_CONFIRMATIONS_KEY);
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.error('Erro ao carregar confirmações:', error);
    return {};
  }
};

/**
 * Salva as confirmações no AsyncStorage
 */
const saveConfirmations = async (
  confirmations: Record<string, { status: RosterConfirmationStatus; confirmedAt?: string }>
): Promise<void> => {
  try {
    await AsyncStorage.setItem(ROSTER_CONFIRMATIONS_KEY, JSON.stringify(confirmations));
  } catch (error) {
    console.error('Erro ao salvar confirmações:', error);
  }
};

/**
 * Confirma presença em uma escala
 * @param rosterId ID da escala
 * @returns A escala atualizada ou null em caso de erro
 */
export const confirmRosterPresence = async (rosterId: string): Promise<boolean> => {
  try {
    // Em um cenário real:
    // const response = await api.post(`/rosters/${rosterId}/confirm`);
    // return response.data;

    const confirmations = await loadConfirmations();
    confirmations[rosterId] = {
      status: 'confirmed',
      confirmedAt: new Date().toISOString(),
    };
    await saveConfirmations(confirmations);
    return true;
  } catch (error) {
    console.error('Erro ao confirmar presença:', error);
    return false;
  }
};

/**
 * Declina presença em uma escala
 * @param rosterId ID da escala
 * @param reason Motivo opcional da recusa
 * @returns true se sucesso, false caso contrário
 */
export const declineRosterPresence = async (rosterId: string, reason?: string): Promise<boolean> => {
  try {
    // Em um cenário real:
    // const response = await api.post(`/rosters/${rosterId}/decline`, { reason });
    // return response.data;

    const confirmations = await loadConfirmations();
    confirmations[rosterId] = {
      status: 'declined',
      confirmedAt: new Date().toISOString(),
    };
    await saveConfirmations(confirmations);
    return true;
  } catch (error) {
    console.error('Erro ao declinar presença:', error);
    return false;
  }
};

/**
 * Reseta o status de confirmação de uma escala para pendente
 * @param rosterId ID da escala
 * @returns true se sucesso, false caso contrário
 */
export const resetRosterConfirmation = async (rosterId: string): Promise<boolean> => {
  try {
    const confirmations = await loadConfirmations();
    delete confirmations[rosterId];
    await saveConfirmations(confirmations);
    return true;
  } catch (error) {
    console.error('Erro ao resetar confirmação:', error);
    return false;
  }
};

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

/**
 * Busca as próximas escalas de um usuário específico
 * @param userId ID do usuário
 * @param communityId ID da comunidade
 * @returns Lista de escalas futuras do usuário
 */
export const getUserUpcomingRosters = async (
  userId: number,
  communityId: string
): Promise<UserRoster[]> => {
  // Em um cenário real:
  // const response = await api.get(`/users/${userId}/rosters?communityId=${communityId}`);
  // return response.data;

  // Carrega confirmações salvas
  const confirmations = await loadConfirmations();

  return new Promise((resolve) => {
    setTimeout(() => {
      // Mock: Simula escalas futuras do usuário
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      // Datas específicas
      const missaDate = new Date(tomorrow);
      missaDate.setHours(17, 30, 0, 0);

      const missaDate2 = new Date(nextWeek);
      missaDate2.setHours(10, 0, 0, 0);

      const reuniaoDate = new Date(nextMonth);
      reuniaoDate.setHours(19, 0, 0, 0);

      // Mock de escalas do usuário com status de confirmação
      const mockUserRosters: UserRoster[] = [
        {
          id: 'ur1',
          eventId: '1',
          eventTitle: 'Santa Missa Dominical',
          eventDate: missaDate.toISOString(),
          eventLocation: 'Igreja Matriz',
          eventType: 'MISSA',
          pastoralName: 'Pastoral da Liturgia',
          responsibilities: '1ª Leitura',
          confirmationStatus: confirmations['ur1']?.status || 'pending',
          confirmedAt: confirmations['ur1']?.confirmedAt,
        },
        {
          id: 'ur2',
          eventId: '4',
          eventTitle: 'Missa das 10h',
          eventDate: missaDate2.toISOString(),
          eventLocation: 'Igreja Matriz',
          eventType: 'MISSA',
          pastoralName: 'Ministros da Eucaristia',
          responsibilities: 'Distribuição da Comunhão',
          confirmationStatus: confirmations['ur2']?.status || 'pending',
          confirmedAt: confirmations['ur2']?.confirmedAt,
        },
        {
          id: 'ur3',
          eventId: '5',
          eventTitle: 'Reunião Mensal da Pastoral',
          eventDate: reuniaoDate.toISOString(),
          eventLocation: 'Salão Paroquial',
          eventType: 'REUNIAO',
          pastoralName: 'Pastoral da Liturgia',
          responsibilities: 'Participação obrigatória',
          confirmationStatus: confirmations['ur3']?.status || 'pending',
          confirmedAt: confirmations['ur3']?.confirmedAt,
        },
      ];

      resolve(mockUserRosters);
    }, 300);
  });
};
