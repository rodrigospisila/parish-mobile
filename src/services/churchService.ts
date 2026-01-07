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

/**
 * Busca todas as dioceses
 * Retorna dioceses com suas paróquias (sem comunidades no findAll)
 */
export const getDioceses = async (): Promise<Diocese[]> => {
  if (USE_MOCK) {
    return mockGetDioceses();
  }

  try {
    const response = await api.get<Diocese[]>('/dioceses');
    
    // O backend retorna dioceses com paróquias, mas sem comunidades no findAll
    // Precisamos buscar os detalhes de cada diocese para ter as comunidades
    const diocesesWithCommunities = await Promise.all(
      response.data.map(async (diocese) => {
        const detailedDiocese = await getDioceseById(diocese.id);
        return detailedDiocese;
      })
    );
    
    return diocesesWithCommunities;
  } catch (error) {
    throw new Error(getErrorMessage(error));
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
  getDioceses,
  getDioceseById,
  getParishes,
  getParishById,
  getCommunities,
  getCommunityById,
};
