import api, { USE_MOCK } from '../config/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================
// INTERFACES
// ============================================

/**
 * Representa um membro de uma pastoral (do backend)
 */
export interface PastoralMember {
  id: string;
  userId: string;
  communityPastoralId: string;
  pastoralGroupId?: string;
  role: 'COORDINATOR' | 'MEMBER';
  joinedAt: string;
  isActive: boolean;
  user?: {
    id: string;
    name: string;
    email: string;
    phone?: string;
  };
}

/**
 * Representa um membro simplificado (para exibição)
 */
export interface Member {
  id: string;
  name: string;
  phone?: string;
  role?: string;
}

/**
 * Representa uma pastoral global (template)
 */
export interface GlobalPastoral {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
}

/**
 * Representa uma pastoral da comunidade
 */
export interface CommunityPastoral {
  id: string;
  communityId: string;
  globalPastoralId: string;
  isActive: boolean;
  createdAt: string;
  globalPastoral?: GlobalPastoral;
  members?: PastoralMember[];
  groups?: PastoralGroup[];
  community?: {
    id: string;
    name: string;
  };
}

/**
 * Representa um grupo dentro de uma pastoral
 */
export interface PastoralGroup {
  id: string;
  name: string;
  description?: string;
  communityPastoralId: string;
  createdAt: string;
  members?: PastoralMember[];
}

/**
 * Interface simplificada de Pastoral para exibição no app
 */
export interface Pastoral {
  id: string;
  name: string;
  description?: string;
  communityId: string;
  coordinator?: Member;
  members: Member[];
  groups?: PastoralGroup[];
}

/**
 * Representa uma escala de serviço para um evento específico
 */
export interface ServiceRoster {
  id: string;
  eventId: string;
  pastoralId: string;
  pastoralName: string;
  responsibilities: string;
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
// FUNÇÕES AUXILIARES
// ============================================

/**
 * Converte um PastoralMember para Member simplificado
 */
const convertToMember = (pm: PastoralMember): Member => ({
  id: pm.id,
  name: pm.user?.name || 'Membro',
  phone: pm.user?.phone,
  role: pm.role === 'COORDINATOR' ? 'Coordenador(a)' : 'Membro',
});

/**
 * Converte uma CommunityPastoral para Pastoral simplificada
 */
const convertToPastoral = (cp: CommunityPastoral): Pastoral => {
  const members = cp.members?.map(convertToMember) || [];
  const coordinator = members.find(m => m.role === 'Coordenador(a)');
  
  return {
    id: cp.id,
    name: cp.globalPastoral?.name || 'Pastoral',
    description: cp.globalPastoral?.description,
    communityId: cp.communityId,
    coordinator,
    members,
    groups: cp.groups,
  };
};

// ============================================
// FUNÇÕES DE CONFIRMAÇÃO (LOCAL)
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
 */
export const confirmRosterPresence = async (rosterId: string): Promise<boolean> => {
  try {
    if (!USE_MOCK) {
      // API real - fazer check-in na escala
      await api.patch(`/schedules/assignments/${rosterId}/checkin`);
    }
    
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
 */
export const declineRosterPresence = async (rosterId: string, reason?: string): Promise<boolean> => {
  try {
    if (!USE_MOCK) {
      // API real - desfazer check-in (o backend não tem endpoint de decline, usamos undo-checkin)
      // Nota: Em produção, pode ser necessário criar um endpoint específico para decline
      await api.patch(`/schedules/assignments/${rosterId}/undo-checkin`);
    }
    
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
 * Reseta o status de confirmação de uma escala
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
// FUNÇÕES DE PASTORAIS GLOBAIS
// ============================================

/**
 * Busca todas as pastorais globais (templates)
 */
export const getGlobalPastorals = async (): Promise<GlobalPastoral[]> => {
  if (USE_MOCK) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve([
          { id: 'gp1', name: 'Pastoral da Liturgia', description: 'Organização das celebrações litúrgicas', isActive: true, createdAt: new Date().toISOString() },
          { id: 'gp2', name: 'Pastoral do Canto', description: 'Animação musical das celebrações', isActive: true, createdAt: new Date().toISOString() },
          { id: 'gp3', name: 'Pastoral da Acolhida', description: 'Recepção e acolhimento dos fiéis', isActive: true, createdAt: new Date().toISOString() },
          { id: 'gp4', name: 'Ministros da Eucaristia', description: 'Distribuição da Sagrada Comunhão', isActive: true, createdAt: new Date().toISOString() },
          { id: 'gp5', name: 'Pastoral da Catequese', description: 'Formação catequética', isActive: true, createdAt: new Date().toISOString() },
        ]);
      }, 200);
    });
  }

  const response = await api.get('/pastorals/global');
  return response.data;
};

// ============================================
// FUNÇÕES DE PASTORAIS DA COMUNIDADE
// ============================================

/**
 * Busca todas as pastorais de uma comunidade
 */
export const getPastorals = async (communityId: string): Promise<Pastoral[]> => {
  if (USE_MOCK) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const pastorals = mockPastorals.map((p) => ({ ...p, communityId }));
        resolve(pastorals);
      }, 200);
    });
  }

  try {
    const response = await api.get('/pastorals/community', {
      params: { communityId },
    });
    
    const communityPastorals: CommunityPastoral[] = response.data;
    return communityPastorals.map(convertToPastoral);
  } catch (error) {
    console.error('Erro ao buscar pastorais:', error);
    return [];
  }
};

/**
 * Busca uma pastoral específica pelo ID
 */
export const getPastoralById = async (pastoralId: string): Promise<Pastoral | null> => {
  if (USE_MOCK) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const pastoral = mockPastorals.find((p) => p.id === pastoralId);
        resolve(pastoral || null);
      }, 100);
    });
  }

  try {
    const response = await api.get(`/pastorals/community/${pastoralId}`);
    return convertToPastoral(response.data);
  } catch (error) {
    console.error('Erro ao buscar pastoral:', error);
    return null;
  }
};

// ============================================
// FUNÇÕES DE MEMBROS
// ============================================

/**
 * Busca os membros de uma pastoral
 */
export const getPastoralMembers = async (pastoralId: string): Promise<Member[]> => {
  if (USE_MOCK) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const pastoral = mockPastorals.find((p) => p.id === pastoralId);
        resolve(pastoral?.members || []);
      }, 100);
    });
  }

  try {
    const response = await api.get('/pastorals/members', {
      params: { communityPastoralId: pastoralId },
    });
    
    const members: PastoralMember[] = response.data;
    return members.map(convertToMember);
  } catch (error) {
    console.error('Erro ao buscar membros:', error);
    return [];
  }
};

// ============================================
// FUNÇÕES DE GRUPOS
// ============================================

/**
 * Busca os grupos de uma pastoral
 */
export const getPastoralGroups = async (communityPastoralId: string): Promise<PastoralGroup[]> => {
  if (USE_MOCK) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve([]);
      }, 100);
    });
  }

  try {
    const response = await api.get('/pastorals/groups', {
      params: { communityPastoralId },
    });
    return response.data;
  } catch (error) {
    console.error('Erro ao buscar grupos:', error);
    return [];
  }
};

// ============================================
// FUNÇÕES DE ESCALAS DE SERVIÇO
// ============================================

/**
 * Busca as escalas de serviço para um evento específico
 */
export const getServiceRostersByEventId = async (eventId: string): Promise<ServiceRoster[]> => {
  if (USE_MOCK) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const mockRosters: ServiceRoster[] = [];

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
  }

  // API real - escalas vêm junto com o evento
  // Por enquanto retorna vazio, pois o backend retorna as escalas no próprio evento
  return [];
};

// ============================================
// FUNÇÕES DE ESCALAS DO USUÁRIO
// ============================================

/**
 * Busca as próximas escalas do usuário logado
 */
export const getUserUpcomingRosters = async (userId: string): Promise<UserRoster[]> => {
  const confirmations = await loadConfirmations();
  
  if (USE_MOCK) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const now = new Date();
        const mockUserRosters: UserRoster[] = [
          {
            id: 'ur1',
            eventId: '1',
            eventTitle: 'Santa Missa Dominical',
            eventDate: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
            eventLocation: 'Igreja Matriz',
            eventType: 'MASS',
            pastoralName: 'Pastoral da Liturgia',
            responsibilities: '1ª Leitura',
            confirmationStatus: confirmations['ur1']?.status || 'pending',
            confirmedAt: confirmations['ur1']?.confirmedAt,
          },
          {
            id: 'ur2',
            eventId: '2',
            eventTitle: 'Reunião da Pastoral',
            eventDate: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
            eventLocation: 'Salão Paroquial',
            eventType: 'PASTORAL_MEETING',
            pastoralName: 'Pastoral da Liturgia',
            responsibilities: 'Participação',
            confirmationStatus: confirmations['ur2']?.status || 'pending',
            confirmedAt: confirmations['ur2']?.confirmedAt,
          },
          {
            id: 'ur3',
            eventId: '3',
            eventTitle: 'Missa da Festa do Padroeiro',
            eventDate: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString(),
            eventLocation: 'Igreja Matriz',
            eventType: 'MASS',
            pastoralName: 'Ministros da Eucaristia',
            responsibilities: 'Distribuição da Comunhão',
            confirmationStatus: confirmations['ur3']?.status || 'pending',
            confirmedAt: confirmations['ur3']?.confirmedAt,
          },
        ];

        resolve(mockUserRosters);
      }, 300);
    });
  }

  try {
    // API real - buscar atribuições do usuário (memberId = id do membro na pastoral)
    // O backend usa /schedules/assignments/all?memberId=xxx
    const response = await api.get('/schedules/assignments/all', {
      params: { memberId: userId },
    });
    
    // Filtrar apenas escalas futuras
    const now = new Date();
    const futureAssignments = response.data.filter((assignment: any) => {
      const scheduleDate = new Date(assignment.schedule?.date || assignment.schedule?.event?.startDate);
      return scheduleDate >= now;
    });
    
    // Mapear resposta da API para UserRoster
    return futureAssignments.map((assignment: any) => ({
      id: assignment.id,
      eventId: assignment.schedule?.eventId || '',
      eventTitle: assignment.schedule?.event?.title || assignment.schedule?.title || 'Evento',
      eventDate: assignment.schedule?.date || assignment.schedule?.event?.startDate,
      eventLocation: assignment.schedule?.event?.location || 'A definir',
      eventType: assignment.schedule?.event?.type || 'OTHER',
      pastoralName: 'Pastoral', // TODO: Adicionar pastoral no backend
      responsibilities: assignment.role || 'Participação',
      confirmationStatus: confirmations[assignment.id]?.status || (assignment.checkedIn ? 'confirmed' : 'pending'),
      confirmedAt: confirmations[assignment.id]?.confirmedAt || assignment.checkedInAt,
    }));
  } catch (error) {
    console.error('Erro ao buscar escalas do usuário:', error);
    return [];
  }
};

/**
 * Busca o histórico de escalas do usuário
 */
export const getUserRosterHistory = async (userId: string): Promise<UserRoster[]> => {
  const confirmations = await loadConfirmations();
  
  if (USE_MOCK) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const now = new Date();
        const mockHistory: UserRoster[] = [
          {
            id: 'urh1',
            eventId: '10',
            eventTitle: 'Santa Missa Dominical',
            eventDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
            eventLocation: 'Igreja Matriz',
            eventType: 'MASS',
            pastoralName: 'Pastoral da Liturgia',
            responsibilities: '2ª Leitura',
            confirmationStatus: 'confirmed',
            confirmedAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString(),
          },
          {
            id: 'urh2',
            eventId: '11',
            eventTitle: 'Reunião Mensal',
            eventDate: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(),
            eventLocation: 'Salão Paroquial',
            eventType: 'PASTORAL_MEETING',
            pastoralName: 'Pastoral da Liturgia',
            responsibilities: 'Participação',
            confirmationStatus: 'confirmed',
            confirmedAt: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString(),
          },
        ];

        resolve(mockHistory);
      }, 300);
    });
  }

  try {
    const response = await api.get('/schedules/user/history', {
      params: { userId },
    });
    
    return response.data.map((schedule: any) => ({
      id: schedule.id,
      eventId: schedule.eventId,
      eventTitle: schedule.event?.title || 'Evento',
      eventDate: schedule.event?.startDate || schedule.date,
      eventLocation: schedule.event?.location || 'A definir',
      eventType: schedule.event?.type || 'OTHER',
      pastoralName: schedule.communityPastoral?.globalPastoral?.name || 'Pastoral',
      responsibilities: schedule.role || 'Participação',
      confirmationStatus: schedule.checkedIn ? 'confirmed' : 'declined',
      confirmedAt: schedule.checkedInAt,
    }));
  } catch (error) {
    console.error('Erro ao buscar histórico de escalas:', error);
    return [];
  }
};
