import api, { getErrorMessage } from '../config/api';

// ============================================
// TIPOS (espelham a resposta do backend — GET /masses/nearby)
// ============================================

export interface NearbyMass {
  id: string;
  title: string;
  type: string; // MASS
  start: string; // relógio de parede: YYYY-MM-DDTHH:MM:SS
  end: string | null;
  source: 'fixed' | 'event';
}

export interface NearbyCommunity {
  id: string;
  name: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  parish: { id: string; name: string } | null;
  distanceKm: number;
  nextMasses: NearbyMass[];
}

export interface NearbyResult {
  origin: { lat: number; lng: number };
  radiusKm: number;
  days: number;
  count: number;
  communities: NearbyCommunity[];
}

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  label: string;
}

// ============================================
// SERVIÇO
// ============================================

/**
 * Busca as missas mais próximas de uma coordenada (comunidades com agenda
 * fixa ou eventos do tipo Missa dentro do raio). Busca aberta entre comunidades.
 */
export const getNearbyMasses = async (params: {
  lat: number;
  lng: number;
  radiusKm?: number;
  days?: number;
  types?: string[];
}): Promise<NearbyResult> => {
  try {
    const response = await api.get<NearbyResult>('/masses/nearby', {
      params: {
        lat: params.lat,
        lng: params.lng,
        ...(params.radiusKm != null ? { radiusKm: params.radiusKm } : {}),
        ...(params.days != null ? { days: params.days } : {}),
        ...(params.types?.length ? { types: params.types.join(',') } : {}),
      },
    });
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/**
 * Converte um endereço/cidade em coordenadas (fallback quando o usuário nega
 * a localização ou quer buscar em outro lugar). Usa o proxy do Nominatim.
 */
export const geocodeAddress = async (query: string): Promise<GeocodeResult[]> => {
  const q = query.trim();
  if (q.length < 3) return [];
  try {
    const response = await api.get<GeocodeResult[]>('/geocoding/search', {
      params: { q },
    });
    return response.data || [];
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export default { getNearbyMasses, geocodeAddress };
