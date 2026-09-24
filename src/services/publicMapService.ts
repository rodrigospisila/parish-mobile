import axios from 'axios';
import api, { getErrorMessage } from '../config/api';

// ============================================
// Mapa público das igrejas (sem login)
//
// Todas as rotas `/public/*` vão SEM token e um 401/403 nelas nunca dispara
// refresh nem logout (ver `isPublicRoute` em src/config/api.ts). Só o envio de
// sugestão (`POST /communities/:id/suggestions`) exige sessão.
// ============================================

// ---------- Tipos ----------

export type CelebrationType = 'MASS' | 'CONFESSION' | 'ADORATION' | 'ROSARY';

export interface MapConfig {
  tileUrl: string;
  tileUrlDark: string | null;
  /** HTML curto do provedor (ex.: "&copy; <a href=...>OpenStreetMap</a>") — sempre visível no mapa */
  attribution: string;
  maxZoom: number;
  subdomains: string | string[];
  /** Imagem de satélite (botão de camadas); ausente/nulo = sem modo satélite */
  satellite?: SatelliteConfig | null;
}

export interface SatelliteConfig {
  tileUrl: string;
  /** Ruas e nomes por cima da imagem (nulo = só a imagem) */
  labelsUrl: string | null;
  attribution: string;
  maxZoom: number;
}

export interface PublicMass {
  id: string;
  title: string;
  type: string;
  /** relógio de parede, sem fuso: YYYY-MM-DDTHH:MM:SS */
  start: string;
  end: string | null;
  source: 'fixed' | 'event';
}

export interface MapCommunity {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  latitude: number;
  longitude: number;
  approximate: boolean;
  verified: boolean;
  parish: { id: string; name: string } | null;
  distanceKm: number | null;
  nextMasses: PublicMass[];
}

export interface MapResult {
  origin: { lat: number; lng: number } | null;
  /** [minLng, minLat, maxLng, maxLat] */
  bbox: number[] | null;
  radiusKm: number | null;
  days: number;
  count: number;
  truncated: boolean;
  communities: MapCommunity[];
}

/** Grupo de igrejas numa célula da grade (mapa afastado). */
export interface MapCluster {
  lat: number;
  lng: number;
  count: number;
  /** [minLng, minLat, maxLng, maxLat] dos pinos do grupo */
  bbox: [number, number, number, number];
  /** Só nos grupos de uma igreja */
  id?: string;
  name?: string;
}

/** `/public/map/area` em modo pinos: o resultado de sempre + modo e zoom. */
export type MapPinsResult = MapResult & { mode: 'pins'; zoom: number | null };

/** `/public/map/area` em modo agrupado (zoom < 11 ou pinos demais): só contagens, sem horários. */
export interface MapClustersResult {
  mode: 'clusters';
  bbox: number[];
  zoom: number;
  total: number;
  clusters: MapCluster[];
}

export type MapAreaResult = MapPinsResult | MapClustersResult;

/** Zoom a partir do qual o backend devolve os pinos um a um (abaixo, agrupa). */
export const PINS_MIN_ZOOM = 11;

export interface CommunitySchedule {
  id: string;
  type: string;
  /** 0 = domingo */
  dayOfWeek: number | null;
  time: string;
  recurrence: 'WEEKLY' | 'MONTHLY_NTH' | 'MONTHLY_DAY' | null;
  weeksOfMonth: number[] | null;
  dayOfMonth: number | null;
  notes: string | null;
}

export interface PublicCommunity {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logoUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  geoPrecision: string | null;
  approximate: boolean;
  verified: boolean;
  parish: {
    id: string;
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    priestName: string | null;
  } | null;
  diocese: { id: string; name: string } | null;
  patrons: { name: string; feastMonth: number | null; feastDay: number | null }[];
  schedules: CommunitySchedule[];
  nextMasses: PublicMass[];
}

export type SuggestionKind = 'LOCATION' | 'SCHEDULE' | 'INFO';

export interface SuggestionPayload {
  kind: SuggestionKind;
  scheduleType?: CelebrationType;
  latitude?: number;
  longitude?: number;
  accuracyM?: number;
  atChurch?: boolean;
  message: string;
}

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  label: string;
}

/** Filtros comuns às buscas do mapa. */
export interface MapQueryFilters {
  days?: number;
  types?: string[];
  /** incluir comunidades com pino aproximado (approx=1) */
  approx?: boolean;
}

// ---------- Mapa-base ----------

/** Mapa-base padrão (OSM) — usado quando /public/map/config não responde. */
export const FALLBACK_MAP_CONFIG: MapConfig = {
  tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  tileUrlDark: null,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 19,
  subdomains: 'abc',
  satellite: {
    tileUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    labelsUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imagens &copy; Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
  },
};

export const getMapConfig = async (): Promise<MapConfig> => {
  try {
    const { data } = await api.get<MapConfig>('/public/map/config');
    if (!data || typeof data.tileUrl !== 'string' || !data.tileUrl) {
      throw new Error('Configuração do mapa inválida.');
    }
    return {
      tileUrl: data.tileUrl,
      tileUrlDark: data.tileUrlDark || null,
      attribution: data.attribution || FALLBACK_MAP_CONFIG.attribution,
      maxZoom: Number(data.maxZoom) || 19,
      subdomains: data.subdomains ?? 'abc',
    };
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

// ---------- Buscas ----------

const filterParams = (f: MapQueryFilters) => ({
  ...(f.days != null ? { days: f.days } : {}),
  ...(f.types?.length ? { types: f.types.join(',') } : {}),
  approx: f.approx ? 1 : 0,
});

/** Igrejas num raio em torno de um ponto (abertura com GPS / "minha localização"). */
export const getNearbyChurches = async (
  params: { lat: number; lng: number; radiusKm?: number } & MapQueryFilters,
): Promise<MapResult> => {
  try {
    const { data } = await api.get<MapResult>('/public/map/nearby', {
      params: {
        lat: params.lat,
        lng: params.lng,
        ...(params.radiusKm != null ? { radiusKm: params.radiusKm } : {}),
        ...filterParams(params),
      },
    });
    return data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/** A requisição foi cancelada (AbortController) — não é erro para mostrar. */
export class MapRequestCanceled extends Error {
  constructor() {
    super('cancelada');
  }
}

/**
 * Igrejas no retângulo visível do mapa, de qualquer tamanho (o backend recorta ao Brasil).
 * Com `zoom` < 11, ou pinos demais, a resposta vem agrupada (`mode: 'clusters'`).
 * `signal` cancela a busca anterior quando o mapa se move de novo.
 */
export const getMapArea = async (
  params: { bbox: [number, number, number, number]; zoom: number; limit?: number } & MapQueryFilters,
  signal?: AbortSignal,
): Promise<MapAreaResult> => {
  try {
    const { data } = await api.get<MapAreaResult | MapResult>('/public/map/area', {
      params: {
        bbox: params.bbox.map((n) => n.toFixed(5)).join(','),
        zoom: Math.min(20, Math.max(0, Math.round(params.zoom))),
        ...(params.limit != null ? { limit: params.limit } : {}),
        ...filterParams(params),
      },
      signal,
    });
    // Backend anterior ao agrupamento: sem `mode`, é sempre pinos
    if (!data || (data as MapAreaResult).mode !== 'clusters') {
      return { ...(data as MapResult), mode: 'pins', zoom: (data as MapPinsResult)?.zoom ?? null };
    }
    const c = data as MapClustersResult;
    return { ...c, clusters: Array.isArray(c.clusters) ? c.clusters : [], total: Number(c.total) || 0 };
  } catch (error) {
    if (axios.isCancel(error) || (error as any)?.name === 'CanceledError' || signal?.aborted) {
      throw new MapRequestCanceled();
    }
    throw new Error(getErrorMessage(error));
  }
};

// ---------- Comunidade ----------

export const getPublicCommunity = async (id: string): Promise<PublicCommunity> => {
  try {
    const { data } = await api.get<PublicCommunity>(`/public/communities/${encodeURIComponent(id)}`);
    return data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

// ---------- Sugestão de correção (exige login) ----------

export class SuggestionError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

export const sendSuggestion = async (
  communityId: string,
  payload: SuggestionPayload,
): Promise<{ id: string; status: string }> => {
  try {
    const { data } = await api.post<{ id: string; status: string }>(
      `/communities/${encodeURIComponent(communityId)}/suggestions`,
      payload,
    );
    return data;
  } catch (error: any) {
    const status: number | undefined = error?.response?.status;
    if (status === 429) {
      throw new SuggestionError(
        'Você já enviou muitas sugestões na última hora. Tente de novo mais tarde.',
        429,
      );
    }
    throw new SuggestionError(getErrorMessage(error), status);
  }
};

// ---------- Busca de lugar (cidade, bairro, igreja) ----------

/**
 * Converte um texto em coordenadas pela rota pública do backend (`GET /public/map/geocode`: proxy com cache e
 * limite por IP) — com ou sem sessão. O aparelho nunca consulta o Nominatim direto.
 */
export const searchPlace = async (query: string, _authenticated?: boolean): Promise<GeocodeResult[]> => {
  const q = query.trim();
  if (q.length < 3) return [];
  try {
    const { data } = await api.get<GeocodeResult[]>('/public/map/geocode', { params: { q } });
    return data || [];
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};
