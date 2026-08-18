import api, { USE_MOCK } from '../config/api';
import { EventType } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cachedFetch } from '../utils/offlineCache';
import { enqueueWrite, isNetworkError } from '../utils/offlineQueue';

/**
 * Resultado de uma escrita que pode ser enfileirada offline (roadmap 4.7):
 * 'ok' = enviada; 'queued' = sem rede, entrou na fila de sincronização;
 * 'error' = rejeitada (erro do servidor ou inesperado).
 */
export type WriteOutcome = 'ok' | 'queued' | 'error';

// ============================================
// INTERFACES
// ============================================

/**
 * Representa um membro de uma pastoral (do backend)
 */
export interface PastoralMember {
  id: string;
  memberId: string;
  communityPastoralId: string;
  pastoralGroupId?: string;
  role: string;
  joinedAt: string;
  isActive: boolean;
  member?: {
    id: string;
    fullName: string;
    email: string;
    phone?: string;
  };
}

/**
 * Representa um membro simplificado (para exibiÃ§Ã£o)
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
 * Interface simplificada de Pastoral para exibiÃ§Ã£o no app
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
 * Representa uma escala de serviÃ§o para um evento especÃ­fico
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
 * Status de confirmaÃ§Ã£o de presenÃ§a na escala
 */
export type RosterConfirmationStatus = 'pending' | 'confirmed' | 'declined' | 'checked_in';

export interface CoordinatorAssignmentSummary {
  id: string;
  memberId: string;
  memberName: string;
  role: string;
  status: 'PENDING' | 'CONFIRMED' | 'DECLINED';
  checkedIn: boolean;
  checkedInAt?: string;
}

export interface CoordinatorScheduleSummary {
  scheduleId: string;
  title: string;
  date: string;
  event: {
    id: string;
    title: string;
    type: string;
    location?: string;
    community?: {
      id: string;
      name: string;
      parish?: {
        id: string;
        name: string;
      };
    };
  };
  counts: {
    total: number;
    pending: number;
    confirmed: number;
    declined: number;
    checkedIn: number;
  };
  attendanceRate: number;
  assignments: CoordinatorAssignmentSummary[];
}

export interface CoordinatorScheduleQueryParams {
  from?: string;
  to?: string;
}

/**
 * Interface para escala do usuÃ¡rio com informaÃ§Ãµes do evento
 */
export interface UserRoster {
  id: string;
  scheduleId: string;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  eventLocation: string;
  eventType: EventType;
  pastoralName: string;
  /** Comunidade real da escala (evento ou agenda fixa) */
  communityName?: string | null;
  parishName?: string | null;
  /** HH:MM da escala sem evento (agenda fixa) — hora exibida sem fuso */
  startTime?: string | null;
  responsibilities: string;
  confirmationStatus: RosterConfirmationStatus;
  checkedIn?: boolean;
  confirmedAt?: string;
  /** Grupo escalado como unidade (pastorais por grupos) */
  pastoralGroupId?: string | null;
  pastoralGroupName?: string | null;
  /** O usuário é líder do grupo — pode responder pela equipe */
  isGroupLeader?: boolean;
}

export interface ScheduleTeamMember {
  assignmentId: string;
  memberName: string;
  role: string;
  status: 'PENDING' | 'CONFIRMED' | 'DECLINED';
  checkedIn: boolean;
}

// ============================================
// DADOS MOCK
// ============================================

const mockMembers: Member[] = [
  { id: 'm1', name: 'Maria Silva', phone: '(11) 99999-1111', role: 'Coordenadora' },
  { id: 'm2', name: 'JoÃ£o Santos', phone: '(11) 99999-2222', role: 'Ministro' },
  { id: 'm3', name: 'Ana Oliveira', phone: '(11) 99999-3333', role: 'VoluntÃ¡ria' },
  { id: 'm4', name: 'Pedro Costa', phone: '(11) 99999-4444', role: 'Ministro' },
  { id: 'm5', name: 'Carla Souza', phone: '(11) 99999-5555', role: 'VoluntÃ¡ria' },
  { id: 'm6', name: 'Lucas Ferreira', phone: '(11) 99999-6666', role: 'Coordenador' },
  { id: 'm7', name: 'Juliana Lima', phone: '(11) 99999-7777', role: 'VoluntÃ¡ria' },
  { id: 'm8', name: 'Roberto Alves', phone: '(11) 99999-8888', role: 'Ministro' },
  { id: 'm9', name: 'Fernanda Rocha', phone: '(11) 99999-9999', role: 'VoluntÃ¡ria' },
  { id: 'm10', name: 'Marcos Pereira', phone: '(11) 99999-0000', role: 'Coordenador' },
];

const mockPastorals: Pastoral[] = [
  {
    id: 'p1',
    name: 'Pastoral da Liturgia',
    description: 'ResponsÃ¡vel pela organizaÃ§Ã£o das celebraÃ§Ãµes litÃºrgicas',
    communityId: '1001',
    coordinator: mockMembers[0],
    members: [mockMembers[0], mockMembers[1], mockMembers[2], mockMembers[3]],
  },
  {
    id: 'p2',
    name: 'Pastoral do Canto',
    description: 'AnimaÃ§Ã£o musical das celebraÃ§Ãµes',
    communityId: '1001',
    coordinator: mockMembers[5],
    members: [mockMembers[5], mockMembers[6], mockMembers[7]],
  },
  {
    id: 'p3',
    name: 'Pastoral da Acolhida',
    description: 'RecepÃ§Ã£o e acolhimento dos fiÃ©is',
    communityId: '1001',
    coordinator: mockMembers[9],
    members: [mockMembers[9], mockMembers[4], mockMembers[8]],
  },
  {
    id: 'p4',
    name: 'Ministros da Eucaristia',
    description: 'DistribuiÃ§Ã£o da Sagrada ComunhÃ£o',
    communityId: '1001',
    coordinator: mockMembers[1],
    members: [mockMembers[1], mockMembers[3], mockMembers[7]],
  },
  {
    id: 'p5',
    name: 'Pastoral da Catequese',
    description: 'FormaÃ§Ã£o catequÃ©tica de crianÃ§as e adultos',
    communityId: '1001',
    coordinator: mockMembers[2],
    members: [mockMembers[2], mockMembers[4], mockMembers[6], mockMembers[8]],
  },
];

// Chave para armazenar confirmaÃ§Ãµes no AsyncStorage
const ROSTER_CONFIRMATIONS_KEY = '@parish:roster_confirmations';

// ============================================
// FUNÃ‡Ã•ES AUXILIARES
// ============================================

/**
 * Converte um PastoralMember para Member simplificado
 */
const isCoordinatorRole = (role: string | undefined): boolean =>
  role === 'COORDINATOR' || role === 'Coordenador';

const convertToMember = (pm: PastoralMember): Member => ({
  id: pm.id,
  name: pm.member?.fullName || 'Sem nome',
  phone: pm.member?.phone,
  role: isCoordinatorRole(pm.role) ? 'Coordenador(a)' : (pm.role || 'Membro'),
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
// FUNÃ‡Ã•ES DE CONFIRMAÃ‡ÃƒO (LOCAL)
// ============================================

/**
 * Carrega as confirmaÃ§Ãµes salvas do AsyncStorage
 */
const loadConfirmations = async (): Promise<Record<string, { status: RosterConfirmationStatus; confirmedAt?: string }>> => {
  try {
    const data = await AsyncStorage.getItem(ROSTER_CONFIRMATIONS_KEY);
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.error('Erro ao carregar confirmaÃ§Ãµes:', error);
    return {};
  }
};

/**
 * Salva as confirmaÃ§Ãµes no AsyncStorage
 */
const saveConfirmations = async (
  confirmations: Record<string, { status: RosterConfirmationStatus; confirmedAt?: string }>
): Promise<void> => {
  try {
    await AsyncStorage.setItem(ROSTER_CONFIRMATIONS_KEY, JSON.stringify(confirmations));
  } catch (error) {
    console.error('Erro ao salvar confirmaÃ§Ãµes:', error);
  }
};

/**
 * Confirma presenÃ§a em uma escala
 */
export const confirmRosterPresence = async (rosterId: string): Promise<WriteOutcome> => {
  try {
    if (!USE_MOCK) {
      // API real - confirmar participaÃ§Ã£o na escala
      await api.patch(`/schedules/assignments/${rosterId}/confirm`);
      return 'ok';
    }

    const confirmations = await loadConfirmations();
    confirmations[rosterId] = {
      status: 'confirmed',
      confirmedAt: new Date().toISOString(),
    };
    await saveConfirmations(confirmations);
    return 'ok';
  } catch (error) {
    // Sem rede: enfileira para sincronizar quando a conexão voltar (4.7)
    if (!USE_MOCK && isNetworkError(error)) {
      await enqueueWrite({
        method: 'patch',
        path: `/schedules/assignments/${rosterId}/confirm`,
        description: 'Confirmar presença na escala',
      });
      return 'queued';
    }
    console.error('Erro ao confirmar presenÃ§a:', error);
    return 'error';
  }
};
export const declineRosterPresence = async (rosterId: string, reason?: string): Promise<WriteOutcome> => {
  try {
    if (!USE_MOCK) {
      // API real - recusar participaÃ§Ã£o na escala (com justificativa opcional, 4.6)
      await api.patch(`/schedules/assignments/${rosterId}/decline`, reason ? { reason } : undefined);
      return 'ok';
    }

    const confirmations = await loadConfirmations();
    confirmations[rosterId] = {
      status: 'declined',
      confirmedAt: new Date().toISOString(),
    };
    await saveConfirmations(confirmations);
    return 'ok';
  } catch (error) {
    // Sem rede: enfileira para sincronizar quando a conexão voltar (4.7)
    if (!USE_MOCK && isNetworkError(error)) {
      await enqueueWrite({
        method: 'patch',
        path: `/schedules/assignments/${rosterId}/decline`,
        body: reason ? { reason } : undefined,
        description: 'Declinar presença na escala',
      });
      return 'queued';
    }
    console.error('Erro ao declinar presenÃ§a:', error);
    return 'error';
  }
};
/**
 * Busca todos os membros escalados para uma escala específica
 */
/**
 * Líder do grupo responde (confirma/recusa) a escala em nome de TODA a equipe.
 */
export const respondGroupPresence = async (
  scheduleId: string,
  pastoralGroupId: string,
  action: 'confirm' | 'decline',
  reason?: string,
): Promise<void> => {
  await api.patch('/schedules/assignments/group/respond', {
    scheduleId,
    pastoralGroupId,
    action,
    ...(reason ? { reason } : {}),
  });
};

export const getScheduleTeam = async (scheduleId: string): Promise<ScheduleTeamMember[]> => {
  try {
    const response = await api.get(`/schedules/assignments/all?scheduleId=${scheduleId}`);
    return (response.data || []).map((a: any) => ({
      assignmentId: a.id,
      memberName: a.member?.fullName || 'Membro',
      role: a.role || 'Participação',
      status: a.status as 'PENDING' | 'CONFIRMED' | 'DECLINED',
      checkedIn: !!a.checkedIn,
    }));
  } catch (error) {
    console.error('Erro ao buscar equipe da escala:', error);
    return [];
  }
};

/**
 * Reseta o status de confirmaÃ§Ã£o de uma escala
 */
export const resetRosterConfirmation = async (rosterId: string): Promise<boolean> => {
  try {
    const confirmations = await loadConfirmations();
    delete confirmations[rosterId];
    await saveConfirmations(confirmations);
    return true;
  } catch (error) {
    console.error('Erro ao resetar confirmaÃ§Ã£o:', error);
    return false;
  }
};

// ============================================
// FUNÃ‡Ã•ES DE PASTORAIS GLOBAIS
// ============================================

/**
 * Busca todas as pastorais globais (templates)
 */
export const getGlobalPastorals = async (): Promise<GlobalPastoral[]> => {
  if (USE_MOCK) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve([
          { id: 'gp1', name: 'Pastoral da Liturgia', description: 'OrganizaÃ§Ã£o das celebraÃ§Ãµes litÃºrgicas', isActive: true, createdAt: new Date().toISOString() },
          { id: 'gp2', name: 'Pastoral do Canto', description: 'AnimaÃ§Ã£o musical das celebraÃ§Ãµes', isActive: true, createdAt: new Date().toISOString() },
          { id: 'gp3', name: 'Pastoral da Acolhida', description: 'RecepÃ§Ã£o e acolhimento dos fiÃ©is', isActive: true, createdAt: new Date().toISOString() },
          { id: 'gp4', name: 'Ministros da Eucaristia', description: 'DistribuiÃ§Ã£o da Sagrada ComunhÃ£o', isActive: true, createdAt: new Date().toISOString() },
          { id: 'gp5', name: 'Pastoral da Catequese', description: 'FormaÃ§Ã£o catequÃ©tica', isActive: true, createdAt: new Date().toISOString() },
        ]);
      }, 200);
    });
  }

  const response = await api.get('/pastorals/global');
  return response.data;
};

// ============================================
// FUNÃ‡Ã•ES DE PASTORAIS DA COMUNIDADE
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
 * Busca uma pastoral especÃ­fica pelo ID
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
// FUNÃ‡Ã•ES DE MEMBROS
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
// FUNÃ‡Ã•ES DE GRUPOS
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
// FUNÃ‡Ã•ES DE ESCALAS DE SERVIÃ‡O
// ============================================

/**
 * Busca as escalas de serviÃ§o para um evento especÃ­fico
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
              responsibilities: '1Âª Leitura, 2Âª Leitura, Salmo',
              membersOnDuty: [mockMembers[1], mockMembers[2]],
            },
            {
              id: 'sr2',
              eventId: '1',
              pastoralId: 'p2',
              pastoralName: 'Pastoral do Canto',
              responsibilities: 'AnimaÃ§Ã£o musical',
              membersOnDuty: [mockMembers[5], mockMembers[6]],
            },
            {
              id: 'sr3',
              eventId: '1',
              pastoralId: 'p3',
              pastoralName: 'Pastoral da Acolhida',
              responsibilities: 'RecepÃ§Ã£o e entrega de folhetos',
              membersOnDuty: [mockMembers[9], mockMembers[4]],
            },
            {
              id: 'sr4',
              eventId: '1',
              pastoralId: 'p4',
              pastoralName: 'Ministros da Eucaristia',
              responsibilities: 'DistribuiÃ§Ã£o da ComunhÃ£o',
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
            responsibilities: 'OrganizaÃ§Ã£o da pauta',
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

  // API real - escalas vÃªm junto com o evento
  // Por enquanto retorna vazio, pois o backend retorna as escalas no prÃ³prio evento
  return [];
};

// ============================================
// FUNÃ‡Ã•ES DE ESCALAS DO USUÃRIO
// ============================================

/**
 * Busca as prÃ³ximas escalas do usuÃ¡rio logado
 */
export const getUserUpcomingRosters = async (userId: string): Promise<UserRoster[]> => {
  if (USE_MOCK) {
    const confirmations = await loadConfirmations();

    return new Promise((resolve) => {
      setTimeout(() => {
        const now = new Date();
        const mockUserRosters: UserRoster[] = [
          {
            id: 'ur1',
            scheduleId: 'sched-1',
            eventId: '1',
            eventTitle: 'Santa Missa Dominical',
            eventDate: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
            eventLocation: 'Igreja Matriz',
            eventType: 'MASS',
            pastoralName: 'Pastoral da Liturgia',
            responsibilities: '1Âª Leitura',
            confirmationStatus: confirmations['ur1']?.status || 'pending',
            confirmedAt: confirmations['ur1']?.confirmedAt,
          },
          {
            id: 'ur2',
            scheduleId: 'sched-2',
            eventId: '2',
            eventTitle: 'ReuniÃ£o da Pastoral',
            eventDate: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
            eventLocation: 'SalÃ£o Paroquial',
            eventType: 'PASTORAL_MEETING',
            pastoralName: 'Pastoral da Liturgia',
            responsibilities: 'ParticipaÃ§Ã£o',
            confirmationStatus: confirmations['ur2']?.status || 'pending',
            confirmedAt: confirmations['ur2']?.confirmedAt,
          },
          {
            id: 'ur3',
            scheduleId: 'sched-3',
            eventId: '3',
            eventTitle: 'Missa da Festa do Padroeiro',
            eventDate: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString(),
            eventLocation: 'Igreja Matriz',
            eventType: 'MASS',
            pastoralName: 'Ministros da Eucaristia',
            responsibilities: 'DistribuiÃ§Ã£o da ComunhÃ£o',
            confirmationStatus: confirmations['ur3']?.status || 'pending',
            confirmedAt: confirmations['ur3']?.confirmedAt,
          },
        ];

        resolve(mockUserRosters);
      }, 300);
    });
  }

  // Resiliência offline (Fase 4.7): network-first com fallback para o cache.
  // O app abre as escalas do usuário mesmo sem internet.
  try {
    const result = await cachedFetch<UserRoster[]>(`upcoming-rosters:${userId}`, async () => {
      const response = await api.get('/schedules/my-assignments');

      if (response.data.message || !response.data.upcoming) {
        return [];
      }

      return response.data.upcoming.map((assignment: any): UserRoster => {
        let confirmationStatus: RosterConfirmationStatus = 'pending';
        if (assignment.checkedIn) {
          confirmationStatus = 'checked_in';
        } else if (assignment.status === 'CONFIRMED') {
          confirmationStatus = 'confirmed';
        } else if (assignment.status === 'DECLINED') {
          confirmationStatus = 'declined';
        }

        return {
          id: assignment.id,
          scheduleId: assignment.schedule?.id || '',
          eventId: assignment.schedule?.event?.id || '',
          eventTitle: assignment.schedule?.event?.title || assignment.schedule?.title || 'Evento',
          eventDate: assignment.schedule?.date,
          eventLocation: assignment.schedule?.event?.location || 'A definir',
          eventType: assignment.schedule?.event?.type || 'OTHER',
          pastoralName:
            assignment.schedule?.community?.name ||
            assignment.schedule?.event?.community?.name ||
            'Comunidade',
          communityName:
            assignment.schedule?.community?.name ??
            assignment.schedule?.event?.community?.name ??
            null,
          parishName:
            assignment.schedule?.community?.parish?.name ??
            assignment.schedule?.event?.community?.parish?.name ??
            null,
          startTime: assignment.schedule?.startTime ?? null,
          responsibilities: assignment.role || 'Participação',
          confirmationStatus,
          checkedIn: !!assignment.checkedIn,
          confirmedAt: assignment.checkedInAt,
          pastoralGroupId: assignment.pastoralGroup?.id ?? null,
          pastoralGroupName: assignment.pastoralGroup?.name ?? null,
          isGroupLeader: !!assignment.isGroupLeader,
        };
      });
    });

    return result.data;
  } catch (error) {
    console.error('Erro ao buscar escalas do usuário (sem cache disponível):', error);
    return [];
  }
};

/**
 * Busca o histÃ³rico de escalas do usuÃ¡rio
 */
export const getUserRosterHistory = async (userId: string): Promise<UserRoster[]> => {
  if (USE_MOCK) {
    const confirmations = await loadConfirmations();

    return new Promise((resolve) => {
      setTimeout(() => {
        const now = new Date();
        const mockHistory: UserRoster[] = [
          {
            id: 'urh1',
            scheduleId: 'sched-h1',
            eventId: '10',
            eventTitle: 'Santa Missa Dominical',
            eventDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
            eventLocation: 'Igreja Matriz',
            eventType: 'MASS',
            pastoralName: 'Pastoral da Liturgia',
            responsibilities: '2Âª Leitura',
            confirmationStatus: 'confirmed',
            confirmedAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString(),
          },
          {
            id: 'urh2',
            scheduleId: 'sched-h2',
            eventId: '11',
            eventTitle: 'ReuniÃ£o Mensal',
            eventDate: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(),
            eventLocation: 'SalÃ£o Paroquial',
            eventType: 'PASTORAL_MEETING',
            pastoralName: 'Pastoral da Liturgia',
            responsibilities: 'ParticipaÃ§Ã£o',
            confirmationStatus: 'confirmed',
            confirmedAt: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString(),
          },
        ];

        resolve(mockHistory);
      }, 300);
    });
  }

  try {
    const response = await api.get('/schedules/my-assignments');
    
    if (!response.data.past) {
      return [];
    }

    return response.data.past.map((assignment: any) => {
      let confirmationStatus: RosterConfirmationStatus = 'declined';
      if (assignment.checkedIn) {
        confirmationStatus = 'checked_in';
      } else if (assignment.status === 'CONFIRMED') {
        confirmationStatus = 'confirmed';
      } else if (assignment.status === 'PENDING') {
        confirmationStatus = 'pending';
      }

      return {
        id: assignment.id,
        scheduleId: assignment.schedule?.id || '',
        eventId: assignment.schedule?.event?.id || '',
        eventTitle: assignment.schedule?.event?.title || 'Evento',
        eventDate: assignment.schedule?.date,
        eventLocation: assignment.schedule?.event?.location || 'A definir',
        eventType: assignment.schedule?.event?.type || 'OTHER',
        pastoralName: assignment.schedule?.event?.community?.name || 'Pastoral',
        responsibilities: assignment.role || 'ParticipaÃ§Ã£o',
        confirmationStatus,
        checkedIn: !!assignment.checkedIn,
        confirmedAt: assignment.checkedInAt,
      };
    });
  } catch (error) {
    console.error('Erro ao buscar histÃ³rico de escalas:', error);
    return [];
  }
};

// ============================================
// FUNÃ‡Ã•ES DE VISÃO COORDENAÃÃƒO
// ============================================

export const getCoordinatorScheduleOverview = async (
  params: CoordinatorScheduleQueryParams = {}
): Promise<CoordinatorScheduleSummary[]> => {
  if (USE_MOCK) {
    return [];
  }

  try {
    const response = await api.get('/schedules/coordinator-overview', { params });
    return response.data.map((item: any) => {
      const event = item.event || {};
      return {
        scheduleId: item.scheduleId,
        title: item.title,
        date: item.date,
        event: {
          id: event.id || '',
          title: event.title || item.title || '',
          type: event.type || 'OTHER',
          location: event.location,
          community: event.community,
        },
        counts: item.counts || {
          total: 0,
          pending: 0,
          confirmed: 0,
          declined: 0,
          checkedIn: 0,
        },
        attendanceRate: item.attendanceRate || 0,
        assignments: (item.assignments || []).map((assignment: any) => ({
          id: assignment.id,
          memberId: assignment.memberId,
          memberName: assignment.memberName,
          role: assignment.role,
          status: assignment.status || 'PENDING',
          checkedIn: assignment.checkedIn || false,
          checkedInAt: assignment.checkedInAt,
        })),
      };
    });
  } catch (error) {
    console.error('Erro ao buscar visÃ£o de coordenaÃ§Ã£o:', error);
    return [];
  }
};

