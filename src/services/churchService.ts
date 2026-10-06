import axios from 'axios';
import api, { getErrorMessage } from '../config/api';

// ============================================
// TIPOS
// ============================================

/**
 * Comunidade
 */
export interface Community {
  id: string;
  name: string;
  description?: string;
  patronSaint?: string;
  address?: string;
  phone?: string;
  email?: string;
  parishId: string;
}

/**
 * Paróquia
 */
export interface Parish {
  id: string;
  name: string;
  description?: string;
  patronSaint?: string;
  parishPriest?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  dioceseId: string;
  diocese?: {
    id: string;
    name: string;
  };
  communities: Community[];
  _count?: {
    communities: number;
  };
}

/**
 * Diocese
 */
export interface Diocese {
  id: string;
  name: string;
  description?: string;
  bishopName?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  parishes: Parish[];
  _count?: {
    parishes: number;
  };
}

/** Itens enxutos da cascata Diocese → Paróquia → Comunidade (GET /territory/*) */
export interface TerritoryDiocese {
  id: string;
  name: string;
  state?: string | null;
}

export interface TerritoryParish {
  id: string;
  name: string;
  city?: string | null;
}

export interface TerritoryCommunity {
  id: string;
  name: string;
  address?: string | null;
}

/** Diocese e paróquia de uma comunidade (para abrir a cascata pré-selecionada) */
export interface CommunityAncestors {
  dioceseId: string;
  parishId: string;
}

// ============================================
// CONFIGURAÇÃO
// ============================================

/**
 * Flag para usar mock ou API real
 */
const USE_MOCK = process.env.EXPO_PUBLIC_USE_MOCK === 'true';

// ============================================
// MOCK DATA
// ============================================

const mockDioceses: Diocese[] = [
  {
    id: 'mock-diocese-1',
    name: 'Diocese de Santa Rita',
    description: 'Diocese de Santa Rita do Passa Quatro',
    bishopName: 'Dom João Paulo',
    parishes: [
      {
        id: 'mock-parish-1',
        name: 'Paróquia Nossa Senhora da Paz',
        dioceseId: 'mock-diocese-1',
        parishPriest: 'Pe. José da Silva',
        communities: [
          { id: 'mock-community-1', name: 'Comunidade São João', parishId: 'mock-parish-1' },
          { id: 'mock-community-2', name: 'Comunidade Santa Clara', parishId: 'mock-parish-1' },
        ],
      },
      {
        id: 'mock-parish-2',
        name: 'Paróquia São Francisco de Assis',
        dioceseId: 'mock-diocese-1',
        parishPriest: 'Pe. Antônio Pereira',
        communities: [
          { id: 'mock-community-3', name: 'Comunidade Matriz', parishId: 'mock-parish-2' },
        ],
      },
    ],
  },
  {
    id: 'mock-diocese-2',
    name: 'Diocese de São Paulo',
    description: 'Arquidiocese de São Paulo',
    bishopName: 'Dom Carlos Alberto',
    parishes: [
      {
        id: 'mock-parish-3',
        name: 'Paróquia Santo Antônio',
        dioceseId: 'mock-diocese-2',
        parishPriest: 'Pe. Marcos Santos',
        communities: [
          { id: 'mock-community-4', name: 'Comunidade Central', parishId: 'mock-parish-3' },
        ],
      },
    ],
  },
];

// ============================================
// SERVIÇO
// ============================================

// ============================================
// CASCATA ENXUTA (Diocese → Paróquia → Comunidade)
// ============================================

/**
 * O app baixava GET /dioceses e depois GET /dioceses/:id de CADA uma das 281
 * dioceses (282 requisições) só para montar os seletores. Agora cada nível é
 * carregado quando o anterior é escolhido (GET /territory/*). Servidor antigo
 * (404 nessas rotas): cai no formato antigo SÓ para a diocese escolhida.
 */
let territoryRoutesMissing = false;

const isNotFound = (error: unknown) => axios.isAxiosError(error) && error.response?.status === 404;

/** Detalhe antigo da diocese (com paróquias e comunidades), uma por vez e em cache */
const legacyDioceseCache = new Map<string, Promise<Diocese>>();
const getLegacyDiocese = (dioceseId: string): Promise<Diocese> => {
  let pending = legacyDioceseCache.get(dioceseId);
  if (!pending) {
    pending = api.get<Diocese>(`/dioceses/${dioceseId}`).then((response) => response.data);
    // Falha não fica no cache: o "Tentar de novo" precisa refazer a chamada
    pending.catch(() => legacyDioceseCache.delete(dioceseId));
    legacyDioceseCache.set(dioceseId, pending);
  }
  return pending;
};

const byName = <T extends { name: string }>(items: T[]) =>
  [...items].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

/** Lista de dioceses (id, nome, UF) — uma requisição */
export const listDioceses = async (): Promise<TerritoryDiocese[]> => {
  if (USE_MOCK) {
    return (await mockGetDioceses()).map(({ id, name }) => ({ id, name }));
  }
  try {
    if (!territoryRoutesMissing) {
      try {
        const { data } = await api.get<TerritoryDiocese[]>('/territory/dioceses');
        return byName(data);
      } catch (error) {
        if (!isNotFound(error)) throw error;
        territoryRoutesMissing = true;
      }
    }
    // Servidor antigo: só a lista (sem buscar o detalhe de cada diocese)
    const { data } = await api.get<Diocese[]>('/dioceses');
    return byName(data.map(({ id, name }) => ({ id, name })));
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/** Paróquias de UMA diocese */
export const listParishes = async (dioceseId: string): Promise<TerritoryParish[]> => {
  if (USE_MOCK) {
    return (await mockGetParishes(dioceseId)).map(({ id, name }) => ({ id, name }));
  }
  try {
    if (!territoryRoutesMissing) {
      try {
        const { data } = await api.get<TerritoryParish[]>(`/territory/dioceses/${dioceseId}/parishes`);
        return byName(data);
      } catch (error) {
        if (!isNotFound(error)) throw error;
        territoryRoutesMissing = true;
      }
    }
    const diocese = await getLegacyDiocese(dioceseId);
    return byName((diocese.parishes ?? []).map(({ id, name }) => ({ id, name })));
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/** Comunidades de UMA paróquia (dioceseId só é usado no servidor antigo) */
export const listCommunities = async (parishId: string, dioceseId?: string): Promise<TerritoryCommunity[]> => {
  if (USE_MOCK) {
    return (await mockGetCommunities(parishId)).map(({ id, name, address }) => ({ id, name, address }));
  }
  try {
    if (!territoryRoutesMissing) {
      try {
        const { data } = await api.get<TerritoryCommunity[]>(`/territory/parishes/${parishId}/communities`);
        return byName(data);
      } catch (error) {
        if (!isNotFound(error)) throw error;
        territoryRoutesMissing = true;
      }
    }
    if (dioceseId) {
      const diocese = await getLegacyDiocese(dioceseId);
      const parish = (diocese.parishes ?? []).find((p) => p.id === parishId);
      if (parish?.communities) {
        return byName(parish.communities.map(({ id, name, address }) => ({ id, name, address })));
      }
    }
    const { data } = await api.get<Parish>(`/parishes/${parishId}`);
    return byName((data.communities ?? []).map(({ id, name, address }) => ({ id, name, address })));
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/**
 * Diocese e paróquia de uma comunidade (GET /communities/:id, rota de dados
 * públicos) — usado para abrir a troca de comunidade já pré-selecionada.
 */
export const getCommunityAncestors = async (communityId: string): Promise<CommunityAncestors | null> => {
  if (USE_MOCK) {
    for (const diocese of mockDioceses) {
      for (const parish of diocese.parishes) {
        if (parish.communities.some((c) => c.id === communityId)) {
          return { dioceseId: diocese.id, parishId: parish.id };
        }
      }
    }
    return null;
  }
  try {
    const { data } = await api.get<{ parishId?: string; parish?: { id?: string; dioceseId?: string } }>(
      `/communities/${communityId}`,
    );
    const parishId = data.parishId ?? data.parish?.id;
    const dioceseId = data.parish?.dioceseId;
    return parishId && dioceseId ? { dioceseId, parishId } : null;
  } catch {
    return null;
  }
};

/**
 * Busca uma diocese por ID (com paróquias e comunidades)
 */
export const getDioceseById = async (id: string): Promise<Diocese> => {
  if (USE_MOCK) {
    return mockGetDioceseById(id);
  }

  try {
    const response = await api.get<Diocese>(`/dioceses/${id}`);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/**
 * Busca todas as paróquias
 * Opcionalmente filtra por dioceseId
 */
export const getParishes = async (dioceseId?: string): Promise<Parish[]> => {
  if (USE_MOCK) {
    return mockGetParishes(dioceseId);
  }

  try {
    const response = await api.get<Parish[]>('/parishes');
    
    if (dioceseId) {
      return response.data.filter(p => p.dioceseId === dioceseId);
    }
    
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/**
 * Busca uma paróquia por ID (com comunidades)
 */
export const getParishById = async (id: string): Promise<Parish> => {
  if (USE_MOCK) {
    return mockGetParishById(id);
  }

  try {
    const response = await api.get<Parish>(`/parishes/${id}`);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/**
 * Busca todas as comunidades
 * Opcionalmente filtra por parishId
 */
export const getCommunities = async (parishId?: string): Promise<Community[]> => {
  if (USE_MOCK) {
    return mockGetCommunities(parishId);
  }

  try {
    const response = await api.get<Community[]>('/communities');
    
    if (parishId) {
      return response.data.filter(c => c.parishId === parishId);
    }
    
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/**
 * Busca uma comunidade por ID
 */
export const getCommunityById = async (id: string): Promise<Community> => {
  if (USE_MOCK) {
    return mockGetCommunityById(id);
  }

  try {
    const response = await api.get<Community>(`/communities/${id}`);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

// ============================================
// FUNÇÕES MOCK
// ============================================

async function mockGetDioceses(): Promise<Diocese[]> {
  await new Promise((resolve) => setTimeout(resolve, 500));
  return mockDioceses;
}

async function mockGetDioceseById(id: string): Promise<Diocese> {
  await new Promise((resolve) => setTimeout(resolve, 200));
  const diocese = mockDioceses.find(d => d.id === id);
  if (!diocese) {
    throw new Error('Diocese não encontrada');
  }
  return diocese;
}

async function mockGetParishes(dioceseId?: string): Promise<Parish[]> {
  await new Promise((resolve) => setTimeout(resolve, 300));
  
  if (dioceseId) {
    const diocese = mockDioceses.find(d => d.id === dioceseId);
    return diocese ? diocese.parishes : [];
  }
  
  return mockDioceses.flatMap(d => d.parishes);
}

async function mockGetParishById(id: string): Promise<Parish> {
  await new Promise((resolve) => setTimeout(resolve, 200));
  const parish = mockDioceses.flatMap(d => d.parishes).find(p => p.id === id);
  if (!parish) {
    throw new Error('Paróquia não encontrada');
  }
  return parish;
}

async function mockGetCommunities(parishId?: string): Promise<Community[]> {
  await new Promise((resolve) => setTimeout(resolve, 200));
  
  const allCommunities = mockDioceses
    .flatMap(d => d.parishes)
    .flatMap(p => p.communities);
  
  if (parishId) {
    return allCommunities.filter(c => c.parishId === parishId);
  }
  
  return allCommunities;
}

async function mockGetCommunityById(id: string): Promise<Community> {
  await new Promise((resolve) => setTimeout(resolve, 200));
  const community = mockDioceses
    .flatMap(d => d.parishes)
    .flatMap(p => p.communities)
    .find(c => c.id === id);
  
  if (!community) {
    throw new Error('Comunidade não encontrada');
  }
  return community;
}

export default {
  listDioceses,
  listParishes,
  listCommunities,
  getCommunityAncestors,
  getDioceseById,
  getParishes,
  getParishById,
  getCommunities,
  getCommunityById,
};
