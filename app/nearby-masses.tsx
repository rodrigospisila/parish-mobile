import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useColors } from '../src/context/ThemeContext';
import { ThemeColors } from '../src/constants/Colors';
import {
  NearbyCommunity,
  NearbyMass,
  NearbyResult,
  getNearbyMasses,
  geocodeAddress,
} from '../src/services/nearbyMassService';
import { readCache, writeCache } from '../src/utils/offlineCache';

type Origin = { lat: number; lng: number; label: string };
type DayFilter = 'all' | 'today' | 'sunday';
interface CachedSearch {
  result: NearbyResult;
  originLabel: string;
}

const RADIUS_OPTIONS = [5, 10, 25, 50];
const TYPE_OPTIONS: { key: string; label: string }[] = [
  { key: 'MASS', label: 'Missa' },
  { key: 'CONFESSION', label: 'Confissão' },
  { key: 'ADORATION', label: 'Adoração' },
];
const TYPE_LABELS: Record<string, string> = {
  MASS: 'Missa',
  CONFESSION: 'Confissão',
  ADORATION: 'Adoração',
  ROSARY: 'Terço',
};
const DAY_OPTIONS: { key: DayFilter; label: string }[] = [
  { key: 'all', label: 'Próximos dias' },
  { key: 'today', label: 'Hoje' },
  { key: 'sunday', label: 'Domingo' },
];

const CACHE_KEY = 'nearby-masses:last';
const FAV_KEY = '@parish:nearby:favorites';

/**
 * Formata o horário flutuante (YYYY-MM-DDTHH:MM:SS) em rótulo pt-BR.
 * Usa "Hoje"/"Amanhã" no lugar do nome do dia quando aplicável.
 */
function formatMassTime(start: string): string {
  try {
    const d = parseISO(start);
    const dateStr = start.slice(0, 10);
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = format(tomorrow, 'yyyy-MM-dd');
    const rest = format(d, "dd/MM 'às' HH:mm", { locale: ptBR });
    if (dateStr === todayStr) return `Hoje, ${rest}`;
    if (dateStr === tomorrowStr) return `Amanhã, ${rest}`;
    const weekday = format(d, 'EEE', { locale: ptBR });
    return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${rest}`;
  } catch {
    return start;
  }
}

/** Rótulo de uma celebração (horário + tipo, quando não for missa). */
function massLabel(m: NearbyMass): string {
  const t = m.type && m.type !== 'MASS' ? ` (${TYPE_LABELS[m.type] || m.type})` : '';
  return formatMassTime(m.start) + t;
}

/** HTML do mapa Leaflet (OpenStreetMap) injetado no WebView. */
function buildMapHtml(origin: Origin, communities: NearbyCommunity[], colors: ThemeColors): string {
  const points = communities.map((c) => ({
    name: c.name,
    lat: c.latitude,
    lng: c.longitude,
    distance: c.distanceKm,
    masses: c.nextMasses.map(massLabel),
  }));

  return `<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>html,body,#map{height:100%;margin:0;padding:0;background:${colors.background}}
.leaflet-popup-content{font-family:-apple-system,Roboto,sans-serif;font-size:13px}</style>
</head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var origin=${JSON.stringify({ lat: origin.lat, lng: origin.lng })};
var points=${JSON.stringify(points)};
var map=L.map('map',{zoomControl:true,attributionControl:false}).setView([origin.lat,origin.lng],13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
var here=L.circleMarker([origin.lat,origin.lng],{radius:9,color:'#fff',weight:3,fillColor:'${colors.primary}',fillOpacity:1}).addTo(map);
here.bindPopup('<b>Voce esta aqui</b>');
var nearest=null;
points.forEach(function(p,idx){
  var mk=L.marker([p.lat,p.lng]).addTo(map);
  p.marker=mk;
  var html='<div style="display:flex;align-items:stretch;gap:10px;min-width:214px;font-family:-apple-system,Roboto,sans-serif">';
  // Coluna de informações (esquerda)
  html+='<div style="flex:1;min-width:0">';
  html+='<div style="font-weight:800;font-size:14.5px;color:#181818;line-height:1.25;margin-bottom:6px">'+p.name+'</div>';
  html+='<span style="display:inline-flex;align-items:center;background:#e9f1ff;color:${colors.primary};font-weight:800;font-size:11px;padding:3px 9px;border-radius:20px">'+p.distance+' km</span>';
  if(p.masses && p.masses.length){
    html+='<div style="margin-top:8px;font-size:12.5px;color:#3a3a3a"><b style="color:#111">Próxima:</b> '+p.masses[0]+'</div>';
    if(p.masses.length>1){
      var extra=p.masses.slice(1);
      html+='<div id="mx'+idx+'" style="display:none;margin-top:4px;font-size:12.5px;color:#3a3a3a;line-height:1.7">'+extra.map(function(m){return '• '+m;}).join('<br>')+'</div>';
      html+='<a href="#" class="vermais" data-id="mx'+idx+'" style="color:${colors.primary};font-weight:700;font-size:12px;display:inline-block;margin-top:4px;text-decoration:none">ver mais ('+extra.length+')</a>';
    }
  } else {
    html+='<div style="margin-top:8px;font-size:12px;color:#999">sem horários nos próximos dias</div>';
  }
  html+='</div>';
  // Botão "Ir" vertical (lateral direita, ocupa a altura do card)
  html+='<a href="#" class="ir" data-lat="'+p.lat+'" data-lng="'+p.lng+'" style="display:flex;align-items:center;justify-content:center;background:${colors.primary};color:#fff;text-decoration:none;border-radius:10px;padding:8px 6px;min-width:34px;writing-mode:vertical-rl;text-orientation:mixed;font-weight:800;font-size:14px;letter-spacing:2px">Ir</a>';
  html+='</div>';
  mk.bindPopup(html,{maxHeight:260,minWidth:214});
  if(nearest===null || p.distance < nearest.distance){ nearest=p; }
});
// Interações do popup: "ver mais" expande as datas; "Ir" pede rota ao app nativo
document.addEventListener('click',function(ev){
  var t=ev.target; if(!t) return;
  if(t.className==='vermais'){
    var e=document.getElementById(t.getAttribute('data-id'));
    if(e){e.style.display='block';t.style.display='none';}
    ev.preventDefault(); return;
  }
  var ir=(t.className==='ir')?t:(t.closest?t.closest('.ir'):null);
  if(ir){
    if(window.ReactNativeWebView){
      window.ReactNativeWebView.postMessage(JSON.stringify({action:'route',lat:ir.getAttribute('data-lat'),lng:ir.getAttribute('data-lng')}));
    }
    ev.preventDefault(); return;
  }
});
// Zoom inicial focado no GPS + a marcação mais próxima (evita afastar demais)
if(nearest){
  map.fitBounds([[origin.lat,origin.lng],[nearest.lat,nearest.lng]],{padding:[70,70],maxZoom:16});
  nearest.marker.openPopup();
} else {
  map.setView([origin.lat,origin.lng],15);
}
</script></body></html>`;
}

export default function NearbyMassesScreen() {
  const colors = useColors();
  const router = useRouter();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [origin, setOrigin] = useState<Origin | null>(null);
  const [result, setResult] = useState<NearbyResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [radiusKm, setRadiusKm] = useState(10);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['MASS']);
  const [dayFilter, setDayFilter] = useState<DayFilter>('all');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [fromCache, setFromCache] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searching, setSearching] = useState(false);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [listQuery, setListQuery] = useState('');

  // Favoritos persistidos localmente (privacidade: nunca sobem ao servidor)
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(FAV_KEY);
        if (raw) setFavorites(JSON.parse(raw));
      } catch {
        // ignora
      }
    })();
  }, []);

  const fetchNearby = useCallback(async (coords: Origin, radius: number, types: string[]) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getNearbyMasses({ lat: coords.lat, lng: coords.lng, radiusKm: radius, days: 7, types });
      setResult(data);
      setFromCache(false);
      setCachedAt(null);
      writeCache<CachedSearch>(CACHE_KEY, { result: data, originLabel: coords.label });
    } catch (e: any) {
      // Sem rede: cai para a última busca cacheada, se houver
      const cached = await readCache<CachedSearch>(CACHE_KEY);
      if (cached) {
        setResult(cached.data.result);
        setOrigin({
          lat: cached.data.result.origin.lat,
          lng: cached.data.result.origin.lng,
          label: cached.data.originLabel,
        });
        setFromCache(true);
        setCachedAt(cached.cachedAt);
      } else {
        setError(e?.message || 'Não foi possível buscar as missas próximas.');
        setResult(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const initLocation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setShowSearch(true);
        setError('Permissão de localização negada. Busque por endereço/cidade.');
        setLoading(false);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const o: Origin = { lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'Sua localização' };
      setOrigin(o);
      await fetchNearby(o, radiusKm, selectedTypes);
    } catch {
      setShowSearch(true);
      setError('Não foi possível obter sua localização. Busque por endereço/cidade.');
      setLoading(false);
    }
  }, [fetchNearby, radiusKm, selectedTypes]);

  useEffect(() => {
    initLocation();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onSelectRadius = (r: number) => {
    setRadiusKm(r);
    if (origin) fetchNearby(origin, r, selectedTypes);
  };

  const toggleType = (key: string) => {
    const has = selectedTypes.includes(key);
    let next = has ? selectedTypes.filter((t) => t !== key) : [...selectedTypes, key];
    if (next.length === 0) next = selectedTypes; // mantém ao menos um tipo
    setSelectedTypes(next);
    if (origin) fetchNearby(origin, radiusKm, next);
  };

  const toggleFavorite = async (id: string) => {
    const next = favorites.includes(id) ? favorites.filter((x) => x !== id) : [...favorites, id];
    setFavorites(next);
    try {
      await AsyncStorage.setItem(FAV_KEY, JSON.stringify(next));
    } catch {
      // ignora
    }
  };

  const onSearchSubmit = async () => {
    const q = searchText.trim();
    if (q.length < 3) {
      Alert.alert('Busca', 'Digite ao menos 3 caracteres (rua, bairro ou cidade).');
      return;
    }
    setSearching(true);
    try {
      const results = await geocodeAddress(q);
      if (!results.length) {
        Alert.alert('Local não encontrado', 'Tente outro endereço ou cidade.');
        return;
      }
      const best = results[0];
      const o: Origin = { lat: best.latitude, lng: best.longitude, label: best.label };
      setOrigin(o);
      setShowSearch(false);
      await fetchNearby(o, radiusKm, selectedTypes);
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Falha ao buscar o local.');
    } finally {
      setSearching(false);
    }
  };

  const openDirectionsTo = (lat: number, lng: number) => {
    const dest = `${lat},${lng}`;
    const url = Platform.select({
      ios: `maps://?daddr=${dest}`,
      android: `google.navigation:q=${dest}`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${dest}`,
    })!;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${dest}`).catch(() =>
        Alert.alert('Erro', 'Não foi possível abrir o mapa.'),
      );
    });
  };

  const openDirections = (c: NearbyCommunity) => openDirectionsTo(c.latitude, c.longitude);

  // Mensagens vindas do mapa (WebView): botão "Ir" pede a rota
  const onMapMessage = (event: { nativeEvent: { data: string } }) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data?.action === 'route') {
        const lat = parseFloat(data.lat);
        const lng = parseFloat(data.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) openDirectionsTo(lat, lng);
      }
    } catch {
      // ignora payloads inválidos
    }
  };

  // Filtro de dia (client-side) + favoritos no topo
  const filteredCommunities = useMemo(() => {
    if (!result) return [];
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const communities = result.communities.map((c) => {
      let masses = c.nextMasses;
      if (dayFilter === 'today') {
        masses = masses.filter((m) => m.start.slice(0, 10) === todayStr);
      } else if (dayFilter === 'sunday') {
        masses = masses.filter((m) => {
          try {
            return parseISO(m.start).getDay() === 0;
          } catch {
            return false;
          }
        });
      }
      return { ...c, nextMasses: masses };
    });
    const visible = dayFilter === 'all' ? communities : communities.filter((c) => c.nextMasses.length > 0);
    return [...visible].sort((a, b) => {
      const fa = favorites.includes(a.id) ? 0 : 1;
      const fb = favorites.includes(b.id) ? 0 : 1;
      if (fa !== fb) return fa - fb;
      return a.distanceKm - b.distanceKm;
    });
  }, [result, dayFilter, favorites]);

  const mapHtml = useMemo(() => {
    if (!origin || filteredCommunities.length === 0) return null;
    return buildMapHtml(origin, filteredCommunities, colors);
  }, [origin, filteredCommunities, colors]);

  // Busca textual na lista (não afeta o mapa)
  const listCommunities = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    if (!q) return filteredCommunities;
    return filteredCommunities.filter((c) =>
      [c.name, c.city, c.parish?.name].filter(Boolean).some((s) => s!.toLowerCase().includes(q)),
    );
  }, [filteredCommunities, listQuery]);

  const renderMassRow = (m: NearbyMass) => {
    const typeLabel = m.type && m.type !== 'MASS' ? TYPE_LABELS[m.type] || m.type : null;
    return (
      <View key={m.id} style={styles.massRow}>
        <FontAwesome5 name="church" size={11} color={colors.primary} style={{ width: 16 }} />
        <Text style={styles.massTime}>{formatMassTime(m.start)}</Text>
        {typeLabel && (
          <View style={styles.tag}>
            <Text style={styles.tagText}>{typeLabel}</Text>
          </View>
        )}
        {m.source === 'event' && (
          <View style={styles.tag}>
            <Text style={styles.tagText}>especial</Text>
          </View>
        )}
      </View>
    );
  };

  const renderCommunity = (c: NearbyCommunity) => {
    const isFav = favorites.includes(c.id);
    return (
      <View key={c.id} style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardName} numberOfLines={2}>{c.name}</Text>
          <TouchableOpacity onPress={() => toggleFavorite(c.id)} hitSlop={8} style={styles.starBtn}>
            <FontAwesome5
              name="star"
              solid={isFav}
              size={16}
              color={isFav ? colors.warning : colors.textTertiary}
            />
          </TouchableOpacity>
        </View>
        <View style={styles.cardMetaRow}>
          <View style={styles.distanceBadge}>
            <FontAwesome5 name="location-arrow" size={10} color="#fff" />
            <Text style={styles.distanceText}>{c.distanceKm} km</Text>
          </View>
          <Text style={styles.cardSub} numberOfLines={1}>
            {[c.city && c.state ? `${c.city}/${c.state}` : c.city || c.state, c.parish?.name]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>

        <View style={styles.massList}>
          {c.nextMasses.length > 0 ? (
            c.nextMasses.map(renderMassRow)
          ) : (
            <Text style={styles.noMass}>Sem horários nos próximos 7 dias</Text>
          )}
        </View>

        <TouchableOpacity style={styles.routeBtn} activeOpacity={0.85} onPress={() => openDirections(c)}>
          <FontAwesome5 name="directions" size={13} color={colors.primary} />
          <Text style={styles.routeBtnText}>Traçar rota</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const dayEmptyLabel = dayFilter === 'today' ? ' hoje' : dayFilter === 'sunday' ? ' no domingo' : '';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()} hitSlop={10}>
          <FontAwesome5 name="arrow-left" size={17} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Missas por perto</Text>
        <TouchableOpacity style={styles.headerBtn} onPress={() => setShowSearch((s) => !s)} hitSlop={10}>
          <FontAwesome5 name="search-location" size={17} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* BUSCA POR ENDEREÇO (fallback / trocar local) */}
      {showSearch && (
        <View style={styles.searchBox}>
          <TextInput
            style={styles.searchInput}
            placeholder="Endereço, bairro ou cidade"
            placeholderTextColor={colors.placeholder}
            value={searchText}
            onChangeText={setSearchText}
            onSubmitEditing={onSearchSubmit}
            returnKeyType="search"
            autoFocus
          />
          <TouchableOpacity style={styles.searchBtn} onPress={onSearchSubmit} disabled={searching}>
            {searching ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.searchBtnText}>Buscar</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* LOCAL ATUAL + BOTÃO USAR GPS */}
      <View style={styles.originRow}>
        <FontAwesome5 name="map-marker-alt" size={12} color={colors.primary} />
        <Text style={styles.originLabel} numberOfLines={1}>
          {origin ? origin.label : 'Localizando…'}
        </Text>
        <TouchableOpacity onPress={initLocation} hitSlop={8}>
          <Text style={styles.originAction}>Usar GPS</Text>
        </TouchableOpacity>
      </View>

      {/* FILTROS: raio / tipo / quando */}
      <View style={styles.radiusRow}>
        {RADIUS_OPTIONS.map((r) => {
          const active = r === radiusKm;
          return (
            <TouchableOpacity key={r} style={[styles.chip, active && styles.chipActive]} onPress={() => onSelectRadius(r)}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{r} km</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
      >
        {TYPE_OPTIONS.map((t) => {
          const active = selectedTypes.includes(t.key);
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.chipSm, active && styles.chipActive]}
              onPress={() => toggleType(t.key)}
            >
              <Text style={[styles.chipTextSm, active && styles.chipTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
        <View style={styles.filterDivider} />
        {DAY_OPTIONS.map((d) => {
          const active = dayFilter === d.key;
          return (
            <TouchableOpacity
              key={d.key}
              style={[styles.chipSm, active && styles.chipActive]}
              onPress={() => setDayFilter(d.key)}
            >
              <Text style={[styles.chipTextSm, active && styles.chipTextActive]}>{d.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* AVISO OFFLINE */}
      {fromCache && (
        <View style={styles.offlineBanner}>
          <FontAwesome5 name="wifi" size={12} color={colors.warning} />
          <Text style={styles.offlineText}>
            Sem conexão — última busca{cachedAt ? ` de ${format(new Date(cachedAt), "dd/MM HH:mm")}` : ''}
          </Text>
        </View>
      )}

      {/* MAPA */}
      {mapHtml && (
        <View style={styles.mapContainer}>
          <WebView
            originWhitelist={['*']}
            source={{ html: mapHtml }}
            onMessage={onMapMessage}
            style={styles.map}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.mapLoading}>
                <ActivityIndicator color={colors.primary} />
              </View>
            )}
          />
          <TouchableOpacity
            style={styles.mapExpandBtn}
            onPress={() => setMapFullscreen(true)}
            activeOpacity={0.85}
            hitSlop={8}
          >
            <FontAwesome5 name="expand" size={14} color={colors.text} />
          </TouchableOpacity>
        </View>
      )}

      {/* LISTA / ESTADOS */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.centerText}>Buscando missas próximas…</Text>
        </View>
      ) : error && !result ? (
        <View style={styles.centerBox}>
          <FontAwesome5 name="map-marked-alt" size={40} color={colors.textTertiary} />
          <Text style={styles.centerText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={initLocation}>
            <Text style={styles.retryBtnText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : result && result.count === 0 ? (
        <View style={styles.centerBox}>
          <FontAwesome5 name="church" size={40} color={colors.textTertiary} />
          <Text style={styles.centerText}>
            Nenhuma comunidade num raio de {result.radiusKm} km.{'\n'}Tente aumentar o raio.
          </Text>
        </View>
      ) : filteredCommunities.length === 0 ? (
        <View style={styles.centerBox}>
          <FontAwesome5 name="calendar-times" size={40} color={colors.textTertiary} />
          <Text style={styles.centerText}>Nenhuma celebração{dayEmptyLabel} por perto.</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          stickyHeaderIndices={[0]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Busca na lista (fixa no topo) */}
          <View style={styles.listSearchWrap}>
            <View style={styles.listSearchBox}>
              <FontAwesome5 name="search" size={13} color={colors.textTertiary} />
              <TextInput
                style={styles.listSearchInput}
                placeholder="Buscar comunidade na lista"
                placeholderTextColor={colors.placeholder}
                value={listQuery}
                onChangeText={setListQuery}
                returnKeyType="search"
              />
              {listQuery.length > 0 && (
                <TouchableOpacity onPress={() => setListQuery('')} hitSlop={8}>
                  <FontAwesome5 name="times-circle" size={15} color={colors.textTertiary} solid />
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.resultCount}>
              {listCommunities.length} de {filteredCommunities.length} comunidade
              {filteredCommunities.length !== 1 ? 's' : ''}
            </Text>
          </View>

          {listCommunities.length === 0 ? (
            <Text style={styles.listEmpty}>Nenhuma comunidade corresponde a "{listQuery}".</Text>
          ) : (
            listCommunities.map(renderCommunity)
          )}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {/* MAPA EM TELA CHEIA */}
      <Modal
        visible={mapFullscreen}
        animationType="slide"
        onRequestClose={() => setMapFullscreen(false)}
        statusBarTranslucent
      >
        <SafeAreaProvider>
          <SafeAreaView style={styles.fsContainer} edges={['top', 'bottom']}>
            <View style={styles.fsHeader}>
              <Text style={styles.fsTitle} numberOfLines={1}>
                {origin?.label || 'Mapa'} · {filteredCommunities.length} comunidades
              </Text>
              <TouchableOpacity style={styles.fsClose} onPress={() => setMapFullscreen(false)} hitSlop={10}>
                <FontAwesome5 name="times" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>
            {mapHtml && (
              <WebView
                originWhitelist={['*']}
                source={{ html: mapHtml }}
                onMessage={onMapMessage}
                style={styles.map}
                startInLoadingState
                renderLoading={() => (
                  <View style={styles.mapLoading}>
                    <ActivityIndicator color={colors.primary} />
                  </View>
                )}
              />
            )}
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    headerBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
    searchBox: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    searchInput: {
      flex: 1,
      height: 40,
      borderRadius: 10,
      paddingHorizontal: 12,
      backgroundColor: colors.inputBackground,
      color: colors.text,
      fontSize: 14,
    },
    searchBtn: {
      minWidth: 76,
      height: 40,
      borderRadius: 10,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    searchBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    originRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 2,
    },
    originLabel: { flex: 1, fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
    originAction: { fontSize: 13, color: colors.primary, fontWeight: '700' },
    radiusRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 },
    // flexGrow:0 impede o ScrollView horizontal de "esticar" na vertical
    filterScroll: { flexGrow: 0, flexShrink: 0 },
    filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 6, alignItems: 'center' },
    filterDivider: { width: 1, height: 20, backgroundColor: colors.border, marginHorizontal: 2 },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipSm: {
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 16,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
    chipTextSm: { fontSize: 12.5, fontWeight: '700', color: colors.textSecondary },
    chipTextActive: { color: '#fff' },
    offlineBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 14,
      marginTop: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: colors.highlightLight,
    },
    offlineText: { fontSize: 12.5, color: colors.textSecondary, fontWeight: '600' },
    mapContainer: {
      height: 210,
      marginHorizontal: 14,
      marginTop: 8,
      borderRadius: 14,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
    },
    map: { flex: 1, backgroundColor: colors.background },
    mapLoading: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    mapExpandBtn: {
      position: 'absolute',
      top: 10,
      right: 10,
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 4,
    },
    fsContainer: { flex: 1, backgroundColor: colors.background },
    fsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    fsTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
    fsClose: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
    centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
    centerText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
    retryBtn: {
      marginTop: 4,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.primary,
    },
    retryBtnText: { color: '#fff', fontWeight: '700' },
    list: { flex: 1 },
    listContent: { paddingHorizontal: 14, paddingTop: 8 },
    listSearchWrap: { backgroundColor: colors.background, paddingTop: 4 },
    listSearchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      height: 40,
      borderRadius: 10,
      paddingHorizontal: 12,
      backgroundColor: colors.inputBackground,
      borderWidth: 1,
      borderColor: colors.border,
    },
    listSearchInput: { flex: 1, color: colors.text, fontSize: 14, paddingVertical: 0 },
    listEmpty: { fontSize: 13.5, color: colors.textSecondary, textAlign: 'center', paddingVertical: 24 },
    resultCount: { fontSize: 12.5, fontWeight: '700', color: colors.textTertiary, marginBottom: 8, marginTop: 8 },
    card: {
      backgroundColor: colors.card,
      borderRadius: 14,
      padding: 14,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    cardName: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.text },
    starBtn: { padding: 2 },
    cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
    distanceBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.primary,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 20,
    },
    distanceText: { color: '#fff', fontSize: 12, fontWeight: '800' },
    cardSub: { flex: 1, fontSize: 12.5, color: colors.textSecondary },
    massList: { marginTop: 10, gap: 6 },
    massRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    massTime: { fontSize: 13.5, color: colors.text, fontWeight: '600' },
    tag: {
      marginLeft: 4,
      backgroundColor: colors.highlightLight,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 6,
    },
    tagText: { fontSize: 10.5, color: colors.primary, fontWeight: '700' },
    noMass: { fontSize: 13, color: colors.textTertiary, fontStyle: 'italic' },
    routeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 12,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.highlightLight,
    },
    routeBtnText: { color: colors.primary, fontWeight: '800', fontSize: 14 },
  });
}
