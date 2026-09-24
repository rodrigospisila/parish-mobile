import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Keyboard,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format, parseISO } from 'date-fns';
import { useTheme } from '../src/context/ThemeContext';
import { useAuth } from '../src/context/AuthContext';
import type { ThemeColors } from '../src/constants/Colors';
import {
  FALLBACK_MAP_CONFIG,
  GeocodeResult,
  MapAreaResult,
  MapClustersResult,
  MapCommunity,
  MapConfig,
  MapPinsResult,
  MapRequestCanceled,
  PINS_MIN_ZOOM,
  getMapArea,
  getMapConfig,
  searchPlace,
} from '../src/services/publicMapService';
import { clearCache, readCache, writeCache } from '../src/utils/offlineCache';
import ChurchMap, {
  ChurchMapHandle,
  MapBaseMode,
  MapClusterPoint,
  MapMoveEvent,
  MapPoint,
} from '../src/components/map/ChurchMap';
import CommunityCard from '../src/components/map/CommunityCard';
import ChurchListPanel, { ListItem } from '../src/components/map/ChurchListPanel';
import MapFilters, { DayFilter } from '../src/components/map/MapFilters';
import { cityLine, distanceFor, hasSoonMass, isCancelled } from '../src/components/map/format';
import { openDirectionsTo } from '../src/components/map/directions';

/**
 * Mapa das igrejas ("Missas por perto").
 *
 * Aberto a quem não tem login. O mapa é um WebView com Leaflet embutido cujo
 * HTML nunca muda; dados, tema, favoritos e seleção vão por comandos.
 *
 * Navegação livre: ao fim de cada movimento/zoom a área visível é buscada
 * sozinha (com espera curta e cancelando a busca anterior). De longe (zoom < 11,
 * ou pinos demais) o backend responde agrupado e o mapa mostra bolhas com a
 * contagem por região — do Brasil inteiro ao bairro; de perto, os pinos e a lista.
 * Regra de ouro: depois que a pessoa mexeu no mapa, nada reenquadra sozinho.
 */

type BBox = [number, number, number, number];
interface CachedMap {
  result: MapAreaResult;
}
interface Filters {
  types: string[];
  approx: boolean;
}
/** O que já foi carregado (ou está a caminho): evita buscar de novo o mesmo recorte. */
interface Loaded {
  bbox: BBox;
  zoom: number;
  key: string;
  mode: 'pins' | 'clusters' | null; // null = a caminho
}

const DAYS = 7;
const AREA_LIMIT = 300;
const USER_ZOOM = 13;
const SEARCH_ZOOM = 14;
const FOCUS_ZOOM = 16;
const PANEL_COLLAPSED = 74;
/** Espera depois do fim do movimento antes de buscar (pinçar costuma gerar vários). */
const MOVE_DEBOUNCE_MS = 400;
/** Folga em volta da área visível: arrastar um pouco não dispara outra busca. */
const PREFETCH_PAD = 0.15;

const CACHE_KEY = 'church-map:last-area';
const OLD_CACHE_KEY = 'church-map:last';
const CONFIG_CACHE_KEY = 'church-map:config';
const FAV_KEY = '@parish:nearby:favorites';
/** Mapa ou satélite: a última escolha vale na próxima abertura */
const BASE_MODE_KEY = '@parish:map:baseMode';

/** `inner` cabe em `outer` (com uma folga pequena)? */
const contains = (outer: BBox, inner: BBox) => {
  const tol = 0.002;
  return inner[0] >= outer[0] - tol && inner[1] >= outer[1] - tol && inner[2] <= outer[2] + tol && inner[3] <= outer[3] + tol;
};

/** Retângulo aumentado por uma fração de cada lado (dentro do globo). */
const padBbox = (b: BBox, f: number): BBox => {
  const dx = (b[2] - b[0]) * f;
  const dy = (b[3] - b[1]) * f;
  return [Math.max(-180, b[0] - dx), Math.max(-90, b[1] - dy), Math.min(180, b[2] + dx), Math.min(90, b[3] + dy)];
};

const inBbox = (b: BBox, lat: number, lng: number) => lat >= b[1] && lat <= b[3] && lng >= b[0] && lng <= b[2];

const filtersKey = (f: Filters) => `${[...f.types].sort().join(',')}|${f.approx ? 1 : 0}`;

/**
 * A área visível já está coberta pelo que foi carregado? Pinos cobrem qualquer
 * aproximação dentro do recorte; bolhas só valem no mesmo zoom (a grade muda com ele).
 */
const covers = (l: Loaded | null, bbox: BBox, zoom: number, key: string) => {
  if (!l || l.key !== key || !contains(l.bbox, bbox)) return false;
  if (l.mode === 'pins') return zoom >= PINS_MIN_ZOOM && zoom >= l.zoom;
  return zoom === l.zoom;
};

const fmtInt = (n: number) => n.toLocaleString('pt-BR');

/** Busca sem acento/caixa. */
const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export default function NearbyMassesScreen() {
  const { colors, isDark } = useTheme();
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const mapRef = useRef<ChurchMapHandle>(null);
  const searchInputRef = useRef<TextInput>(null);

  const [config, setConfig] = useState<MapConfig | null>(null);
  const [area, setArea] = useState<MapAreaResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offlineAt, setOfflineAt] = useState<number | null>(null);
  const [types, setTypes] = useState<string[]>(['MASS']);
  const [day, setDay] = useState<DayFilter>('all');
  const [approx, setApprox] = useState(false);
  const [baseMode, setBaseMode] = useState<MapBaseMode>('map');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [selected, setSelected] = useState<MapCommunity | null>(null);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [view, setView] = useState<MapMoveEvent | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [searching, setSearching] = useState(false);
  const [places, setPlaces] = useState<GeocodeResult[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [topH, setTopH] = useState(0);
  const [cardH, setCardH] = useState(0);

  const loaded = useRef<Loaded | null>(null);
  const inflight = useRef<Loaded | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const moveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqId = useRef(0);
  const initDone = useRef(false);
  const userMoved = useRef(false);
  const areaRef = useRef<MapAreaResult | null>(null);
  const viewRef = useRef<MapMoveEvent | null>(null);
  const filtersRef = useRef<Filters>({ types, approx });
  const pendingSelect = useRef<string | null>(null);

  filtersRef.current = { types, approx };
  areaRef.current = area;
  const result: MapPinsResult | null = area?.mode === 'pins' ? area : null;
  const clusterData: MapClustersResult | null = area?.mode === 'clusters' ? area : null;

  // Sai da tela: nada de busca pendente
  useEffect(
    () => () => {
      if (moveTimer.current) clearTimeout(moveTimer.current);
      abortRef.current?.abort();
    },
    [],
  );

  // ---------- Mapa-base (config pública, com cache e fallback OSM) ----------
  useEffect(() => {
    let alive = true;
    clearCache('nearby-masses:last'); // cache do mapa antigo (formato /masses/nearby)
    clearCache(OLD_CACHE_KEY); // cache do mapa de "Buscar nesta área"
    AsyncStorage.removeItem('@parish:map:lastView').catch(() => undefined); // a abertura não restaura mais a última área
    (async () => {
      const cached = await readCache<MapConfig>(CONFIG_CACHE_KEY);
      if (alive && cached?.data?.tileUrl) setConfig(cached.data);
      try {
        const fresh = await getMapConfig();
        if (!alive) return;
        writeCache(CONFIG_CACHE_KEY, fresh);
        setConfig((prev) => (prev && JSON.stringify(prev) === JSON.stringify(fresh) ? prev : fresh));
      } catch {
        if (alive && !cached?.data?.tileUrl) setConfig(FALLBACK_MAP_CONFIG);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Tiles do provedor falhando em série: cai para o OSM padrão; satélite
  // falhando volta para o mapa (a imagem é um extra)
  const onTileError = useCallback((base: MapBaseMode) => {
    if (base === 'satellite') {
      setBaseMode('map');
      Alert.alert('Satélite indisponível', 'Não foi possível carregar as imagens de satélite agora. Voltamos para o mapa.');
      return;
    }
    setConfig((prev) => (prev && prev.tileUrl !== FALLBACK_MAP_CONFIG.tileUrl ? FALLBACK_MAP_CONFIG : prev));
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(BASE_MODE_KEY)
      .then((v) => {
        if (v === 'satellite') setBaseMode('satellite');
      })
      .catch(() => undefined);
  }, []);

  const toggleBaseMode = useCallback(() => {
    setBaseMode((prev) => {
      const next: MapBaseMode = prev === 'satellite' ? 'map' : 'satellite';
      AsyncStorage.setItem(BASE_MODE_KEY, next).catch(() => undefined);
      return next;
    });
  }, []);
  const hasSatellite = !!config?.satellite?.tileUrl;

  // ---------- Favoritos (só no aparelho) ----------
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(FAV_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setFavorites(parsed.filter((x) => typeof x === 'string'));
        }
      } catch {
        // ignora
      }
    })();
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      AsyncStorage.setItem(FAV_KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, []);

  // ---------- Busca da área visível ----------
  const loadArea = useCallback(async (v: { bbox: BBox; zoom: number }, f: Filters, force = false) => {
    const zoom = Math.min(20, Math.max(0, Math.round(v.zoom)));
    const key = filtersKey(f);
    if (!force && (covers(loaded.current, v.bbox, zoom, key) || covers(inflight.current, v.bbox, zoom, key))) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const id = ++reqId.current;
    const bbox = padBbox(v.bbox, PREFETCH_PAD);
    inflight.current = { bbox, zoom, key, mode: null };
    setLoading(true);
    setError(null);
    try {
      const data = await getMapArea(
        { bbox, zoom, days: DAYS, types: f.types, approx: f.approx, limit: AREA_LIMIT },
        ctrl.signal,
      );
      if (id !== reqId.current) return;
      setArea(data);
      setOfflineAt(null);
      loaded.current = { bbox, zoom, key, mode: data.mode };
      writeCache<CachedMap>(CACHE_KEY, { result: data });
    } catch (e: any) {
      if (e instanceof MapRequestCanceled || id !== reqId.current) return;
      loaded.current = null;
      if (!areaRef.current) {
        // Sem rede e nada na tela: mostra a última busca guardada
        const cached = await readCache<CachedMap>(CACHE_KEY);
        if (id !== reqId.current) return;
        if (cached?.data?.result?.mode) {
          setArea(cached.data.result);
          setOfflineAt(cached.cachedAt);
          return;
        }
      }
      setError(e?.message || 'Não foi possível buscar as igrejas.');
    } finally {
      if (id === reqId.current) {
        inflight.current = null;
        setLoading(false);
      }
    }
  }, []);

  /** Busca de novo a área visível agora (filtros mudaram, ou "tentar de novo"). */
  const reloadView = useCallback(
    (f: Filters) => {
      const v = viewRef.current;
      if (v) loadArea(v, f, true);
    },
    [loadArea],
  );

  // Filtros de servidor mudaram: refaz a busca da área atual (o mapa não se move)
  const firstFilterRun = useRef(true);
  useEffect(() => {
    if (firstFilterRun.current) {
      firstFilterRun.current = false;
      return;
    }
    reloadView({ types, approx });
  }, [types, approx, reloadView]);

  // ---------- Localização ----------
  const locate = useCallback(
    async (initial: boolean): Promise<boolean> => {
      setLocating(true);
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== 'granted') {
          if (!initial) {
            Alert.alert(
              'Localização desativada',
              'Para centralizar o mapa em você, permita o acesso à localização nas configurações do aparelho.',
              [
                { text: 'Agora não', style: 'cancel' },
                { text: 'Abrir configurações', onPress: () => Linking.openSettings().catch(() => undefined) },
              ],
            );
          }
          return false;
        }
        let pos = await Location.getLastKnownPositionAsync({ maxAge: 60_000, requiredAccuracy: 500 }).catch(
          () => null,
        );
        if (!pos) pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        setUserPos({ lat, lng });
        mapRef.current?.setUser(lat, lng, accuracy ?? null);
        // Na abertura, se a pessoa já começou a mexer no mapa, não puxa de volta
        if (initial && userMoved.current) return true;
        mapRef.current?.flyTo(lat, lng, USER_ZOOM, 'gps');
        return true;
      } catch {
        if (!initial) Alert.alert('Localização', 'Não foi possível obter sua localização agora.');
        return false;
      } finally {
        setLocating(false);
      }
    },
    [],
  );

  // Abertura: o mapa nasce no Brasil inteiro (zoom 4) e já mostra as bolhas; com GPS, voa até a cidade da pessoa
  const onMapReady = useCallback(async () => {
    if (initDone.current) return;
    initDone.current = true;
    mapRef.current?.requestView('init');
    await locate(true);
  }, [locate]);

  // ---------- Eventos do mapa ----------
  const onMoveEnd = useCallback(
    (ev: MapMoveEvent) => {
      setView(ev);
      viewRef.current = ev;
      if (ev.user) {
        userMoved.current = true;
        pendingSelect.current = null; // a pessoa foi para outro lugar
      }
      // Busca sozinha quando o mapa para (o pinçar gera vários moveend seguidos)
      if (moveTimer.current) clearTimeout(moveTimer.current);
      moveTimer.current = setTimeout(() => {
        moveTimer.current = null;
        loadArea(ev, filtersRef.current);
      }, MOVE_DEBOUNCE_MS);
    },
    [loadArea],
  );

  // ---------- Dados derivados ----------
  const visibleCommunities = useMemo(() => {
    if (!result) return [];
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const list = result.communities.map((c) => {
      if (day === 'all') return c;
      const masses = c.nextMasses.filter((m) => {
        if (day === 'today') return m.start.slice(0, 10) === todayStr;
        try {
          return parseISO(m.start).getDay() === 0;
        } catch {
          return false;
        }
      });
      return { ...c, nextMasses: masses };
    });
    // "Hoje"/"Domingo": só fica a igreja que tem algum horário que vai mesmo acontecer
    return day === 'all' ? list : list.filter((c) => c.nextMasses.some((m) => !isCancelled(m)));
  }, [result, day]);

  const listItems: ListItem[] = useMemo(() => {
    const vb = view?.bbox;
    const onScreen = vb ? visibleCommunities.filter((c) => inBbox(vb, c.latitude, c.longitude)) : visibleCommunities;
    const items = onScreen.map((c) => ({
      community: c,
      distanceKm: distanceFor(c, userPos),
      favorite: favorites.includes(c.id),
    }));
    return items.sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm;
      if (a.distanceKm != null || b.distanceKm != null) return a.distanceKm != null ? -1 : 1;
      return a.community.name.localeCompare(b.community.name, 'pt-BR');
    });
  }, [visibleCommunities, view, userPos, favorites]);

  // Pinos: só id, posição e flags — nada de texto vai para o WebView
  useEffect(() => {
    const now = new Date();
    const points: MapPoint[] = visibleCommunities.map((c) => ({
      id: c.id,
      lat: c.latitude,
      lng: c.longitude,
      approx: !!c.approximate,
      soon: hasSoonMass(c, now),
    }));
    mapRef.current?.setData(points);
  }, [visibleCommunities]);

  // Bolhas do modo agrupado: só números (e o id da igreja sozinha)
  useEffect(() => {
    const list: MapClusterPoint[] = (clusterData?.clusters ?? []).map((g) => ({
      lat: g.lat,
      lng: g.lng,
      count: g.count,
      bbox: g.bbox,
      ...(g.count === 1 && g.id ? { id: g.id } : {}),
    }));
    mapRef.current?.setClusters(list);
  }, [clusterData]);

  // Igrejas na tela no modo agrupado (as bolhas da folga ficam de fora)
  const clusterTotal = useMemo(() => {
    if (!clusterData) return 0;
    const vb = view?.bbox;
    return clusterData.clusters.reduce((sum, g) => (!vb || inBbox(vb, g.lat, g.lng) ? sum + g.count : sum), 0);
  }, [clusterData, view]);

  useEffect(() => {
    mapRef.current?.setFavorites(favorites);
  }, [favorites]);

  useEffect(() => {
    mapRef.current?.select(selected?.id ?? null);
  }, [selected]);

  // Espaço ocupado pelos controles nativos: a atribuição do mapa fica sempre à vista
  const panelOpenHeight = Math.round(winH * 0.55);
  const bottomSafe = insets.bottom;
  const bottomCover = selected
    ? cardH || 280 + bottomSafe
    : panelOpen
      ? panelOpenHeight + bottomSafe
      : PANEL_COLLAPSED + bottomSafe;
  useEffect(() => {
    mapRef.current?.setInsets(topH, bottomCover);
  }, [topH, bottomCover]);

  // ---------- Seleção ----------
  const selectCommunity = useCallback(
    (c: MapCommunity, focus: boolean) => {
      setSelected(c);
      setPanelOpen(false);
      Keyboard.dismiss();
      setSearchFocused(false);
      if (focus) {
        const estCard = cardH || 290;
        mapRef.current?.focus(c.id, { zoom: FOCUS_ZOOM, offsetY: Math.round((estCard - topH) / 2), tag: 'focus' });
      }
    },
    [cardH, topH],
  );

  const onMapSelect = useCallback(
    (id: string) => {
      const c = visibleCommunities.find((x) => x.id === id);
      if (c) selectCommunity(c, false);
    },
    [visibleCommunities, selectCommunity],
  );

  const onClusterPin = useCallback((id: string) => {
    pendingSelect.current = id;
  }, []);

  useEffect(() => {
    const id = pendingSelect.current;
    if (!id || !result) return;
    const c = result.communities.find((x) => x.id === id);
    if (c) {
      pendingSelect.current = null;
      selectCommunity(c, false);
    }
  }, [result, selectCommunity]);

  const onMapPress = useCallback(() => {
    setSelected(null);
    setSearchFocused(false);
    Keyboard.dismiss();
  }, []);

  // Voltar do Android fecha cartão/painel antes de sair da tela — só enquanto
  // o mapa está em foco (com a página da comunidade por cima, o voltar é dela)
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (selected) {
          setSelected(null);
          return true;
        }
        if (panelOpen) {
          setPanelOpen(false);
          return true;
        }
        return false;
      });
      return () => sub.remove();
    }, [selected, panelOpen]),
  );

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace((isAuthenticated ? '/(tabs)' : '/(auth)/login') as never);
  };

  // ---------- Busca do topo ----------
  const localMatches = useMemo(() => {
    const q = norm(searchText.trim());
    if (q.length < 2) return [];
    return visibleCommunities
      .filter((c) => norm([c.name, c.parish?.name, c.city].filter(Boolean).join(' ')).includes(q))
      .slice(0, 4);
  }, [searchText, visibleCommunities]);

  const onSearchSubmit = async () => {
    const q = searchText.trim();
    if (q.length < 3) {
      setSearchError('Digite ao menos 3 letras (cidade, bairro ou igreja).');
      setPlaces([]);
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const found = await searchPlace(q, isAuthenticated);
      setPlaces(found);
      if (!found.length && !localMatches.length) setSearchError('Nenhum lugar encontrado. Tente outro nome.');
    } catch (e: any) {
      setPlaces([]);
      setSearchError(e?.message || 'Falha ao buscar o local.');
    } finally {
      setSearching(false);
    }
  };

  const goToPlace = (p: GeocodeResult) => {
    Keyboard.dismiss();
    setSearchFocused(false);
    setSelected(null);
    setSearchText(p.label.split(',')[0] || p.label);
    mapRef.current?.flyTo(p.latitude, p.longitude, SEARCH_ZOOM, 'search');
  };

  const showDropdown = searchFocused && (localMatches.length > 0 || places !== null || searching);

  // ---------- Textos de estado ----------
  const count = listItems.length;
  const igrejas = (n: number) => `${fmtInt(n)} ${n === 1 ? 'igreja' : 'igrejas'}`;
  const panelTitle = !area
    ? loading
      ? 'Buscando igrejas…'
      : 'Igrejas'
    : clusterData
      ? `${igrejas(clusterTotal)} nesta área`
      : `${igrejas(count)} nesta área`;
  const panelSubtitle = offlineAt
    ? `Sem conexão — busca salva de ${format(new Date(offlineAt), 'dd/MM HH:mm')}`
    : clusterData
      ? 'Aproxime o mapa para ver a lista'
      : result?.truncated
        ? 'Mostrando parte das igrejas — aproxime o mapa para ver todas'
        : result
          ? 'Toque numa igreja para ver os horários'
          : null;
  const emptyText = error && !area
    ? error
    : clusterData
      ? `Aproxime o mapa para ver a lista (${igrejas(clusterTotal)} nesta área).`
      : !result
        ? 'Carregando o mapa…'
        : day !== 'all' && (result.communities.length || 0) > 0
          ? `Nenhuma celebração ${day === 'today' ? 'hoje' : 'no domingo'} nas igrejas desta área.`
          : approx
            ? 'Nenhuma igreja encontrada nesta área.'
            : 'Nenhuma igreja com localização conferida nesta área. Ative "Mostrar localização aproximada" para ver mais.';

  // Indicador discreto: carregando, ou falha com "tentar de novo"
  const pill: { icon: string | null; text: string; onPress?: () => void } | null = (() => {
    if (loading) return { icon: null, text: 'Carregando…' };
    if (error) {
      return { icon: 'exclamation-circle', text: 'Falha na busca — tentar de novo', onPress: () => reloadView(filtersRef.current) };
    }
    return null;
  })();

  const selectedDistance = selected ? distanceFor(selected, userPos) : null;

  return (
    <View style={styles.container}>
      <ChurchMap
        ref={mapRef}
        config={config}
        dark={isDark}
        colors={colors}
        onReady={onMapReady}
        onMoveEnd={onMoveEnd}
        onSelect={onMapSelect}
        onClusterPin={onClusterPin}
        onMapPress={onMapPress}
        onTileError={onTileError}
        baseMode={hasSatellite ? baseMode : 'map'}
      />

      {/* TOPO: voltar + busca + filtros */}
      <View
        style={[styles.top, { paddingTop: insets.top + 6 }]}
        pointerEvents="box-none"
        onLayout={(e) => setTopH(Math.round(e.nativeEvent.layout.height))}
      >
        <View style={styles.searchRow}>
          <TouchableOpacity style={styles.roundBtn} onPress={goBack} hitSlop={8} accessibilityLabel="Voltar">
            <FontAwesome5 name="arrow-left" size={16} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.searchBox}>
            <FontAwesome5 name="search" size={13} color={colors.textTertiary} />
            <TextInput
              ref={searchInputRef}
              style={styles.searchInput}
              placeholder="Cidade, bairro ou igreja"
              placeholderTextColor={colors.placeholder}
              value={searchText}
              onChangeText={(t) => {
                setSearchText(t);
                setPlaces(null);
                setSearchError(null);
              }}
              onFocus={() => setSearchFocused(true)}
              onSubmitEditing={onSearchSubmit}
              returnKeyType="search"
              autoCorrect={false}
            />
            {searching ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : searchText.length > 0 ? (
              <TouchableOpacity
                onPress={() => {
                  setSearchText('');
                  setPlaces(null);
                  setSearchError(null);
                }}
                hitSlop={8}
                accessibilityLabel="Limpar busca"
              >
                <FontAwesome5 name="times-circle" size={15} color={colors.textTertiary} solid />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
        <MapFilters
          colors={colors}
          types={types}
          day={day}
          approx={approx}
          onToggleType={(key) =>
            setTypes((prev) => {
              const next = prev.includes(key) ? prev.filter((t) => t !== key) : [...prev, key];
              return next.length ? next : prev; // ao menos um tipo
            })
          }
          onDay={setDay}
          onToggleApprox={() => setApprox((a) => !a)}
        />
      </View>

      {/* Indicador flutuante: carregando / falha */}
      {pill && !showDropdown && (
        <View style={[styles.pillWrap, { top: topH + 4 }]} pointerEvents="box-none">
          <TouchableOpacity
            style={[styles.pill, pill.onPress ? styles.pillAction : styles.pillQuiet]}
            onPress={pill.onPress}
            disabled={!pill.onPress}
            activeOpacity={0.85}
          >
            {pill.icon ? (
              <FontAwesome5 name={pill.icon as never} size={12} color={pill.onPress ? '#fff' : colors.text} />
            ) : (
              <ActivityIndicator size="small" color={colors.primary} />
            )}
            <Text style={[styles.pillText, pill.onPress ? { color: '#fff' } : null]}>{pill.text}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Resultados da busca */}
      {showDropdown && (
        <View style={[styles.dropdown, { top: insets.top + 6 + 50 }]}>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: winH * 0.45 }}>
            {localMatches.map((c) => (
              <TouchableOpacity key={`c-${c.id}`} style={styles.ddRow} onPress={() => selectCommunity(c, true)}>
                <FontAwesome5 name="church" size={13} color={colors.primary} style={styles.ddIcon} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.ddTitle} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text style={styles.ddSub} numberOfLines={1}>
                    {[c.parish?.name, cityLine(c)].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
            {(places || []).map((p, i) => (
              <TouchableOpacity key={`p-${i}`} style={styles.ddRow} onPress={() => goToPlace(p)}>
                <FontAwesome5 name="map-marker-alt" size={13} color={colors.textSecondary} style={styles.ddIcon} />
                <Text style={[styles.ddSub, { flex: 1, color: colors.text }]} numberOfLines={2}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
            {places === null && !searching && (
              <Text style={styles.ddHint}>Toque em “buscar” no teclado para procurar cidades e bairros.</Text>
            )}
            {!!searchError && <Text style={styles.ddHint}>{searchError}</Text>}
          </ScrollView>
        </View>
      )}

      {/* Mapa ou satélite */}
      {!panelOpen && hasSatellite && (
        <TouchableOpacity
          style={[styles.locBtn, { bottom: bottomCover + 14 + 56 }]}
          onPress={toggleBaseMode}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={baseMode === 'satellite' ? 'Mostrar o mapa' : 'Mostrar imagem de satélite'}
        >
          <FontAwesome5
            name={baseMode === 'satellite' ? 'map' : 'globe-americas'}
            size={18}
            color={colors.primary}
          />
          <Text style={styles.layerLabel}>{baseMode === 'satellite' ? 'Mapa' : 'Satélite'}</Text>
        </TouchableOpacity>
      )}

      {/* Minha localização */}
      {!panelOpen && (
        <TouchableOpacity
          style={[styles.locBtn, { bottom: bottomCover + 14 }]}
          onPress={() => locate(false)}
          activeOpacity={0.85}
          accessibilityLabel="Minha localização"
        >
          {locating ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <FontAwesome5 name="crosshairs" size={18} color={colors.primary} />
          )}
        </TouchableOpacity>
      )}

      {/* Painel da lista ou cartão da igreja selecionada */}
      {selected ? (
        <CommunityCard
          community={selected}
          distanceKm={selectedDistance}
          favorite={favorites.includes(selected.id)}
          colors={colors}
          bottomInset={bottomSafe}
          onClose={() => setSelected(null)}
          onToggleFavorite={() => toggleFavorite(selected.id)}
          onDirections={() => openDirectionsTo(selected.latitude, selected.longitude, selected.name)}
          onOpen={() => router.push(`/comunidade/${selected.id}` as never)}
          onLayout={(e) => setCardH(Math.round(e.nativeEvent.layout.height))}
        />
      ) : (
        <ChurchListPanel
          colors={colors}
          items={listItems}
          open={panelOpen}
          openHeight={panelOpenHeight}
          collapsedHeight={PANEL_COLLAPSED}
          bottomInset={bottomSafe}
          title={panelTitle}
          subtitle={panelSubtitle}
          loading={loading}
          emptyText={emptyText}
          onToggle={() => setPanelOpen((o) => !o)}
          onPressItem={(c) => selectCommunity(c, true)}
          onToggleFavorite={toggleFavorite}
        />
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  const shadow = {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 4,
  };
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    top: { position: 'absolute', top: 0, left: 0, right: 0 },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
    roundBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadow,
    },
    searchBox: {
      flex: 1,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      ...shadow,
    },
    searchInput: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 0 },
    pillWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 20,
      backgroundColor: colors.surface,
      ...shadow,
    },
    pillAction: { backgroundColor: colors.primary },
    pillQuiet: { paddingVertical: 6, paddingHorizontal: 12, opacity: 0.92 },
    pillText: { fontSize: 13, fontWeight: '800', color: colors.text },
    dropdown: {
      position: 'absolute',
      left: 12,
      right: 12,
      borderRadius: 14,
      backgroundColor: colors.surface,
      paddingVertical: 4,
      ...shadow,
      elevation: 10,
    },
    ddRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
    ddIcon: { width: 18, textAlign: 'center' },
    ddTitle: { fontSize: 14.5, fontWeight: '800', color: colors.text },
    ddSub: { fontSize: 12.5, color: colors.textSecondary },
    ddHint: { fontSize: 12.5, color: colors.textTertiary, paddingHorizontal: 14, paddingVertical: 10 },
    locBtn: {
      position: 'absolute',
      right: 14,
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadow,
    },
    layerLabel: { fontSize: 8.5, fontWeight: '800', color: colors.primary, marginTop: 1 },
  });
}
