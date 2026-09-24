import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import type { ThemeColors } from '../../constants/Colors';
import { FALLBACK_MAP_CONFIG, MapConfig, getMapConfig } from '../../services/publicMapService';
import { readCache, writeCache } from '../../utils/offlineCache';
import ChurchMap, { ChurchMapHandle, MapBaseMode, MapMoveEvent } from './ChurchMap';

/**
 * Marcar a igreja no mapa (sugestão de localização, para quem não está no local):
 * o pino fica fixo no centro e a pessoa arrasta o mapa por baixo até a porta da
 * igreja — mais preciso no dedo do que arrastar um pino pequeno. Abre em satélite
 * (o telhado da igreja é a melhor referência) quando o servidor oferece a camada.
 */

/** Mesma chave do mapa das igrejas: aproveita a config já baixada */
const CONFIG_CACHE_KEY = 'church-map:config';
/** Abaixo disso a marcação fica imprecisa demais (≈ quarteirão inteiro na tela) */
const MIN_CONFIRM_ZOOM = 17;
const PIN_SIZE = 44;

export interface PickedPoint {
  latitude: number;
  longitude: number;
}

interface Props {
  visible: boolean;
  colors: ThemeColors;
  dark: boolean;
  /** Onde abrir: o ponto já marcado, o GPS ou o pino atual da igreja */
  initial: { lat: number; lng: number; zoom: number } | null;
  /** Pino atual da igreja (para a pessoa ver onde ele está hoje) */
  current: { lat: number; lng: number; approx: boolean } | null;
  onClose: () => void;
  onConfirm: (point: PickedPoint) => void;
}

export default function PinPickerModal({ visible, colors, dark, initial, current, onClose, onConfirm }: Props) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<ChurchMapHandle>(null);
  const [config, setConfig] = useState<MapConfig | null>(null);
  const [baseMode, setBaseMode] = useState<MapBaseMode>('satellite');
  const [view, setView] = useState<{ lat: number; lng: number; zoom: number } | null>(null);
  const [bottomH, setBottomH] = useState(0);
  const [topH, setTopH] = useState(0);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setView(null);
    (async () => {
      const cached = await readCache<MapConfig>(CONFIG_CACHE_KEY);
      if (alive && cached?.data?.tileUrl) setConfig(cached.data);
      try {
        const fresh = await getMapConfig();
        if (!alive) return;
        writeCache(CONFIG_CACHE_KEY, fresh);
        setConfig(fresh);
      } catch {
        if (alive && !cached?.data?.tileUrl) setConfig(FALLBACK_MAP_CONFIG);
      }
    })();
    return () => {
      alive = false;
    };
  }, [visible]);

  const hasSatellite = !!config?.satellite?.tileUrl;

  const onReady = useCallback(() => {
    const start = initial ?? { lat: -14.2, lng: -51.9, zoom: 4 };
    mapRef.current?.setView(start.lat, start.lng, start.zoom, 'start');
    if (current) mapRef.current?.setData([{ id: 'pino-atual', lat: current.lat, lng: current.lng, approx: current.approx, soon: false }]);
  }, [initial, current]);

  useEffect(() => {
    mapRef.current?.setInsets(topH, bottomH);
  }, [topH, bottomH]);

  const onMoveEnd = useCallback((ev: MapMoveEvent) => {
    if (Number.isFinite(ev.center.lat) && Number.isFinite(ev.center.lng)) {
      setView({ lat: ev.center.lat, lng: ev.center.lng, zoom: ev.zoom });
    }
  }, []);

  const onTileError = useCallback((base: MapBaseMode) => {
    if (base === 'satellite') setBaseMode('map');
    else setConfig((prev) => (prev && prev.tileUrl !== FALLBACK_MAP_CONFIG.tileUrl ? FALLBACK_MAP_CONFIG : prev));
  }, []);

  const closeEnough = !!view && view.zoom >= MIN_CONFIRM_ZOOM;
  const styles = createStyles(colors);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.container}>
        {config ? (
          <ChurchMap
            ref={mapRef}
            config={config}
            dark={dark}
            colors={colors}
            baseMode={hasSatellite ? baseMode : 'map'}
            onReady={onReady}
            onMoveEnd={onMoveEnd}
            onTileError={onTileError}
          />
        ) : (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {/* Pino fixo: a ponta marca o centro do mapa */}
        <View style={styles.centerWrap} pointerEvents="none">
          <View style={styles.centerPin}>
            <FontAwesome5 name="map-marker-alt" size={PIN_SIZE} color={colors.gold} solid />
          </View>
          <View style={styles.centerDot} />
        </View>

        <View
          style={[styles.top, { paddingTop: insets.top + 8 }]}
          onLayout={(e) => setTopH(Math.round(e.nativeEvent.layout.height))}
        >
          <TouchableOpacity style={styles.roundBtn} onPress={onClose} hitSlop={8} accessibilityLabel="Fechar">
            <FontAwesome5 name="times" size={17} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.tip}>
            <Text style={styles.tipTitle}>Arraste o mapa até a porta da igreja</Text>
            <Text style={styles.tipSub}>
              {current ? 'O pino azul mostra onde ela está hoje no mapa.' : 'Use dois dedos para aproximar.'}
            </Text>
          </View>
        </View>

        <View
          style={[styles.bottom, { paddingBottom: insets.bottom + 14 }]}
          onLayout={(e) => setBottomH(Math.round(e.nativeEvent.layout.height))}
        >
          {hasSatellite && (
            <TouchableOpacity
              style={styles.layerBtn}
              onPress={() => setBaseMode((m) => (m === 'satellite' ? 'map' : 'satellite'))}
              accessibilityRole="button"
              accessibilityLabel={baseMode === 'satellite' ? 'Mostrar o mapa' : 'Mostrar imagem de satélite'}
            >
              <FontAwesome5 name={baseMode === 'satellite' ? 'map' : 'globe-americas'} size={15} color={colors.primary} />
              <Text style={styles.layerText}>{baseMode === 'satellite' ? 'Ver mapa' : 'Ver satélite'}</Text>
            </TouchableOpacity>
          )}
          {!closeEnough && <Text style={styles.zoomHint}>Aproxime mais o mapa para marcar com precisão.</Text>}
          <TouchableOpacity
            style={[styles.confirmBtn, !closeEnough && styles.confirmDisabled]}
            disabled={!closeEnough}
            onPress={() => view && onConfirm({ latitude: view.lat, longitude: view.lng })}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ disabled: !closeEnough }}
          >
            <FontAwesome5 name="check" size={15} color="#fff" />
            <Text style={styles.confirmText}>Confirmar este lugar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  const shadow = {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  };
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
    centerWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
    // A ponta do marcador fica no centro exato: sobe a altura inteira do ícone
    centerPin: { marginBottom: PIN_SIZE, ...shadow },
    centerDot: {
      position: 'absolute',
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#000',
      opacity: 0.45,
    },
    top: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingHorizontal: 14,
      paddingBottom: 8,
    },
    roundBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadow,
    },
    tip: { flex: 1, padding: 12, borderRadius: 14, backgroundColor: colors.surface, ...shadow },
    tipTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
    tipSub: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    bottom: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 16,
      paddingTop: 14,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      backgroundColor: colors.surface,
      ...shadow,
    },
    layerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 8,
      minHeight: 40,
      paddingHorizontal: 14,
      borderRadius: 20,
      backgroundColor: colors.highlightLight,
      marginBottom: 10,
    },
    layerText: { fontSize: 14, fontWeight: '700', color: colors.primary },
    zoomHint: { fontSize: 13.5, color: colors.textSecondary, marginBottom: 8 },
    confirmBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      minHeight: 52,
      borderRadius: 12,
      backgroundColor: colors.primary,
    },
    confirmDisabled: { backgroundColor: colors.disabled },
    confirmText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  });
}
