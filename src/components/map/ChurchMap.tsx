import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import type { ThemeColors } from '../../constants/Colors';
import type { MapConfig } from '../../services/publicMapService';
import { MAP_HTML } from './mapHtml';

/**
 * Origem do documento do mapa. Com `baseUrl` o WebView manda um Referer
 * identificando o app — servidores de tiles (inclusive o OSM) recusam
 * requisições sem ele. É o endereço do próprio Parish Web.
 */
const MAP_BASE_URL = 'https://parish-web-three.vercel.app/';
const MAP_SOURCE = { html: MAP_HTML, baseUrl: MAP_BASE_URL };

/** O que o mapa precisa saber de cada igreja — sem nome nem texto livre. */
export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  approx: boolean;
  soon: boolean;
}

/** Bolha do modo agrupado — só números (e o id quando é uma igreja sozinha). */
export interface MapClusterPoint {
  lat: number;
  lng: number;
  count: number;
  /** [minLng, minLat, maxLng, maxLat] */
  bbox: [number, number, number, number];
  id?: string;
}

export interface MapMoveEvent {
  /** [minLng, minLat, maxLng, maxLat] */
  bbox: [number, number, number, number];
  zoom: number;
  center: { lat: number; lng: number };
  /** movimento feito com o dedo (arrastar/pinçar/duplo toque) */
  user: boolean;
  /** etiqueta do movimento programático que originou este evento */
  tag: string | null;
}

export interface ChurchMapHandle {
  setData(points: MapPoint[]): void;
  setClusters(clusters: MapClusterPoint[]): void;
  /** Pede ao mapa o enquadramento atual (chega como onMoveEnd com a etiqueta). */
  requestView(tag?: string): void;
  setFavorites(ids: string[]): void;
  select(id: string | null): void;
  focus(id: string, opts?: { zoom?: number; offsetY?: number; tag?: string }): void;
  flyTo(lat: number, lng: number, zoom: number, tag?: string): void;
  setView(lat: number, lng: number, zoom: number, tag?: string): void;
  setUser(lat: number, lng: number, accuracyM?: number | null): void;
  setInsets(top: number, bottom: number): void;
}

export type MapBaseMode = 'map' | 'satellite';

interface Props {
  config: MapConfig | null;
  dark: boolean;
  colors: ThemeColors;
  onReady?: () => void;
  onMoveEnd?: (ev: MapMoveEvent) => void;
  onSelect?: (id: string) => void;
  /** Toque no pino de uma igreja sozinha no modo agrupado (o mapa já aproxima). */
  onClusterPin?: (id: string) => void;
  onMapPress?: () => void;
  /** Tiles falhando em série; `base` diz se foi o mapa ou a imagem de satélite. */
  onTileError?: (base: MapBaseMode) => void;
  /** Mapa ou imagem de satélite (só se `config.satellite` existir). */
  baseMode?: MapBaseMode;
}

/**
 * Serializa um argumento para dentro do JS injetado. JSON é JS válido; só os
 * separadores de linha Unicode precisam de escape em motores antigos.
 */
const jsArg = (v: unknown) =>
  JSON.stringify(v === undefined ? null : v)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

/**
 * Atribuição do mapa-base: aceita só texto e links http(s) simples. Tudo o
 * mais é escapado — o HTML entra no controle de atribuição do Leaflet.
 */
export function sanitizeAttribution(html: string): string {
  const esc = (s: string) =>
    s.replace(/&(?![a-zA-Z]+;|#\d+;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const parts: string[] = [];
  const re = /<a\s+[^>]*?href\s*=\s*"(https?:\/\/[^"<>\s]+)"[^>]*>([^<]*)<\/a>/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    parts.push(esc(html.slice(last, m.index).replace(/<[^>]*>/g, '')));
    parts.push(`<a href="${esc(m[1])}">${esc(m[2])}</a>`);
    last = m.index + m[0].length;
  }
  parts.push(esc(html.slice(last).replace(/<[^>]*>/g, '')));
  return parts.join('').slice(0, 600);
}

const ChurchMap = forwardRef<ChurchMapHandle, Props>(function ChurchMap(
  { config, dark, colors, onReady, onMoveEnd, onSelect, onClusterPin, onMapPress, onTileError, baseMode = 'map' },
  ref,
) {
  const webRef = useRef<WebView>(null);
  const ready = useRef(false);
  const queue = useRef<string[]>([]);

  // Último estado enviado — reaplicado se o WebView recarregar (ex.: o sistema
  // matou o processo de renderização em segundo plano).
  const state = useRef<{
    data: MapPoint[];
    clusters: MapClusterPoint[];
    favorites: string[];
    selected: string | null;
    user: [number, number, number | null] | null;
    insets: [number, number];
    view: { lat: number; lng: number; zoom: number } | null;
  }>({ data: [], clusters: [], favorites: [], selected: null, user: null, insets: [0, 0], view: null });

  const send = useCallback((fn: string, ...args: unknown[]) => {
    const code = `try{window.parishMap&&window.parishMap.${fn}(${args.map(jsArg).join(',')})}catch(e){};true;`;
    if (ready.current && webRef.current) webRef.current.injectJavaScript(code);
    else queue.current.push(code);
  }, []);

  const themePayload = useCallback(
    () => ({
      dark,
      primary: colors.primary,
      gold: colors.gold,
      gray: dark ? '#6B7480' : '#8B97A4',
      grayStroke: dark ? '#C3CBD4' : '#5B6570',
      bg: colors.background,
      text: colors.textSecondary,
      link: colors.primary,
    }),
    [dark, colors],
  );

  const tilesPayload = useCallback(
    () =>
      config
        ? {
            tileUrl: config.tileUrl,
            tileUrlDark: config.tileUrlDark,
            attribution: sanitizeAttribution(config.attribution),
            maxZoom: config.maxZoom,
            subdomains: config.subdomains,
            satellite: config.satellite?.tileUrl
              ? {
                  tileUrl: config.satellite.tileUrl,
                  labelsUrl: config.satellite.labelsUrl || null,
                  attribution: sanitizeAttribution(config.satellite.attribution || ''),
                  maxZoom: config.satellite.maxZoom,
                }
              : null,
          }
        : null,
    [config],
  );

  useImperativeHandle(
    ref,
    () => ({
      setData(points) {
        state.current.data = points;
        send('setData', points);
      },
      setClusters(clusters) {
        state.current.clusters = clusters;
        send('setClusters', clusters);
      },
      requestView(tag) {
        send('requestView', tag || null);
      },
      setFavorites(ids) {
        state.current.favorites = ids;
        send('setFavorites', ids);
      },
      select(id) {
        state.current.selected = id;
        send('select', id);
      },
      focus(id, opts) {
        send('focus', id, opts || {});
      },
      flyTo(lat, lng, zoom, tag) {
        send('flyTo', lat, lng, zoom, tag || null);
      },
      setView(lat, lng, zoom, tag) {
        send('setView', lat, lng, zoom, tag || null);
      },
      setUser(lat, lng, acc) {
        state.current.user = [lat, lng, acc ?? null];
        send('setUser', lat, lng, acc ?? null);
      },
      setInsets(top, bottom) {
        state.current.insets = [top, bottom];
        send('setInsets', top, bottom);
      },
    }),
    [send],
  );

  // Tema e mapa-base mudam sem recarregar o documento
  useEffect(() => {
    send('setTheme', themePayload());
  }, [send, themePayload]);

  useEffect(() => {
    const t = tilesPayload();
    if (t) send('setTiles', t);
  }, [send, tilesPayload]);

  const baseModeRef = useRef<MapBaseMode>(baseMode);
  baseModeRef.current = baseMode;
  useEffect(() => {
    send('setBaseMode', baseMode);
  }, [send, baseMode]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let msg: any;
      try {
        msg = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      if (!msg || typeof msg.type !== 'string') return;

      if (msg.type === 'ready') {
        const firstLoad = !ready.current && state.current.view === null;
        ready.current = true;
        // Estado atual primeiro; depois os comandos que esperavam o mapa
        const s = state.current;
        const replay = [
          ['setTheme', themePayload()],
          ['setBaseMode', baseModeRef.current],
          ...(tilesPayload() ? [['setTiles', tilesPayload()]] : []),
          ['setInsets', ...s.insets],
          ...(s.view ? [['setView', s.view.lat, s.view.lng, s.view.zoom, null]] : []),
          ['setFavorites', s.favorites],
          ['setData', s.data],
          ['setClusters', s.clusters],
          ['select', s.selected],
          ...(s.user ? [['setUser', ...s.user]] : []),
        ] as unknown[][];
        replay.forEach(([fn, ...args]) =>
          webRef.current?.injectJavaScript(
            `try{window.parishMap&&window.parishMap.${fn as string}(${args.map(jsArg).join(',')})}catch(e){};true;`,
          ),
        );
        const pending = queue.current;
        queue.current = [];
        pending.forEach((code) => webRef.current?.injectJavaScript(code));
        if (firstLoad) onReady?.();
        return;
      }
      if (msg.type === 'moveend' && Array.isArray(msg.bbox) && msg.bbox.length === 4) {
        const bbox = msg.bbox.map(Number) as [number, number, number, number];
        if (bbox.some((n) => !Number.isFinite(n))) return;
        const zoom = Number(msg.zoom);
        const center = { lat: Number(msg.center?.lat), lng: Number(msg.center?.lng) };
        if (Number.isFinite(center.lat) && Number.isFinite(center.lng) && Number.isFinite(zoom)) {
          state.current.view = { lat: center.lat, lng: center.lng, zoom };
        }
        onMoveEnd?.({
          bbox,
          zoom,
          center,
          user: !!msg.user,
          tag: typeof msg.tag === 'string' ? msg.tag : null,
        });
        return;
      }
      if (msg.type === 'select' && typeof msg.id === 'string') {
        onSelect?.(msg.id);
        return;
      }
      if (msg.type === 'clusterpin' && typeof msg.id === 'string') {
        onClusterPin?.(msg.id);
        return;
      }
      if (msg.type === 'mapclick') {
        onMapPress?.();
        return;
      }
      if (msg.type === 'tileerror') {
        onTileError?.(msg.base === 'satellite' ? 'satellite' : 'map');
        return;
      }
      if (msg.type === 'error' && __DEV__) {
        console.warn('[mapa] erro no WebView:', msg.message);
      }
    },
    [onClusterPin, onMapPress, onMoveEnd, onReady, onSelect, onTileError, themePayload, tilesPayload],
  );

  // Links (ex.: atribuição do mapa-base) abrem fora do app; o WebView só
  // carrega o próprio documento do mapa.
  const onShouldStart = useCallback((req: ShouldStartLoadRequest) => {
    const url = req.url || '';
    if (url === MAP_BASE_URL || url === 'about:blank' || url.startsWith('data:')) return true;
    if (/^https?:\/\//i.test(url)) {
      Linking.openURL(url).catch(() => undefined);
      return false;
    }
    return false;
  }, []);

  // Processo do WebView morto pelo sistema: recarrega e o 'ready' reaplica o estado
  const reload = useCallback(() => {
    ready.current = false;
    webRef.current?.reload();
  }, []);

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}>
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={MAP_SOURCE}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={onShouldStart}
        setSupportMultipleWindows={false}
        javaScriptEnabled
        domStorageEnabled={false}
        bounces={false}
        overScrollMode="never"
        style={{ flex: 1, backgroundColor: colors.background }}
        onContentProcessDidTerminate={reload}
        onRenderProcessGone={reload}
      />
    </View>
  );
});

export default ChurchMap;
