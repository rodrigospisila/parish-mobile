import { LEAFLET_CSS, LEAFLET_JS, MARKERCLUSTER_CSS, MARKERCLUSTER_JS } from './vendor/leaflet';

/**
 * Documento HTML do mapa das igrejas — montado UMA única vez (constante do
 * módulo). Não depende de dados, tema nem posição: tudo isso chega depois por
 * `injectJavaScript` chamando `window.parishMap.*`, e o mapa responde por
 * `postMessage` com eventos `ready`, `moveend`, `select`, `mapclick` e
 * `tileerror`. Assim favoritar, filtrar ou trocar o tema nunca recarrega o
 * WebView nem devolve o mapa ao GPS.
 *
 * Segurança: nenhum texto vindo do servidor (nome de igreja etc.) entra no
 * HTML — o mapa só recebe id, coordenadas e flags. Cores são validadas antes
 * de entrar no SVG e a atribuição do mapa-base é saneada no lado nativo.
 */

// Evita que um "</script>" dentro das bibliotecas feche a tag antes da hora
const inlineScript = (js: string) => js.replace(/<\/script/gi, '<\\/script');
const inlineStyle = (css: string) => css.replace(/<\/style/gi, '<\\/style');

const APP_CSS = `
:root{--primary:#075AA9;--bg:#F5F7FA;--surface:rgba(255,255,255,.88);--text:#151A20;--link:#075AA9;--ti:0px;--bi:0px}
html,body,#map{height:100%;width:100%;margin:0;padding:0;background:var(--bg);-webkit-tap-highlight-color:transparent}
.leaflet-container{background:var(--bg);font-family:-apple-system,Roboto,"Segoe UI",sans-serif}
.leaflet-top{top:var(--ti)}
.leaflet-bottom{bottom:var(--bi);transition:bottom .25s ease}
.leaflet-control-attribution{background:var(--surface)!important;color:var(--text)!important;font-size:10.5px;line-height:1.5;padding:1px 6px!important;border-radius:6px 0 0 0}
.leaflet-control-attribution a{color:var(--link)!important;text-decoration:none}
.pin-wrap{background:none;border:0}
.pin{position:relative;width:100%;height:100%}
.pin svg{display:block;width:100%;height:100%;filter:drop-shadow(0 2px 2px rgba(0,0,0,.35))}
.pin.approx svg{opacity:.9}
.pin .soon{position:absolute;top:-1px;right:-1px;width:11px;height:11px;border-radius:50%;background:#2E9D62;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.15)}
.cl-wrap{background:none;border:0}
.cl{width:100%;height:100%;border-radius:50%;background:var(--primary);opacity:.95;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 4px rgba(255,255,255,.75),0 2px 6px rgba(0,0,0,.3)}
.cl span{color:#fff;font-weight:800;font-size:13px}
.me{background:none;border:0}
`;

const BRIDGE_JS = `
(function(){
  var RN = window.ReactNativeWebView;
  function post(msg){ try { if (RN) RN.postMessage(JSON.stringify(msg)); } catch (e) {} }
  window.onerror = function(m){ post({ type: 'error', message: String(m).slice(0, 300) }); };

  var HEX = /^#[0-9a-fA-F]{3,8}$/;
  var theme = { dark: false, primary: '#075AA9', gold: '#D8A83E', gray: '#8B97A4', grayStroke: '#5B6570' };
  var tiles = null, tileLayer = null, tileErrors = 0, tileLoads = 0, tileErrorSent = false;

  var map = L.map('map', { zoomControl: false, attributionControl: true, worldCopyJump: true, minZoom: 3, maxZoom: 19 });
  map.attributionControl.setPrefix('Leaflet');
  map.setView([-14.2, -51.9], 4);

  function clusterIcon(c){
    var n = c.getChildCount();
    var s = n < 10 ? 34 : (n < 100 ? 40 : 48);
    return L.divIcon({ html: '<div class="cl"><span>' + Number(n) + '</span></div>', className: 'cl-wrap', iconSize: [s, s] });
  }
  var cluster = L.markerClusterGroup({
    maxClusterRadius: 48, disableClusteringAtZoom: 16, spiderfyOnMaxZoom: true,
    showCoverageOnHover: false, chunkedLoading: true, iconCreateFunction: clusterIcon
  });
  map.addLayer(cluster);

  var markers = {}, items = {}, favs = {}, selected = null;
  var userDot = null, userHalo = null;
  var gesture = false, pendingTag = null, tagTimer = null;

  // ---------- Pino de igreja ----------
  function pinSvg(fill, stroke, dashed){
    return '<svg viewBox="0 0 36 46" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M18 44.5C18 44.5 3.5 28.8 3.5 17.5a14.5 14.5 0 0 1 29 0C32.5 28.8 18 44.5 18 44.5z" fill="' + fill +
      '" stroke="' + stroke + '" stroke-width="2.2"' + (dashed ? ' stroke-dasharray="3.2 2.4"' : '') + '/>' +
      '<g fill="#fff"><rect x="17.1" y="5.6" width="1.8" height="6.4"/><rect x="15.1" y="7.3" width="5.8" height="1.7"/>' +
      '<path d="M10.6 17.8 18 11.6l7.4 6.2z"/><rect x="12.2" y="17.2" width="11.6" height="8.6"/></g>' +
      '<rect x="16.3" y="20.4" width="3.4" height="5.4" rx="1.7" fill="' + fill + '"/></svg>';
  }
  function iconFor(d){
    var sel = d.id === selected, fav = !!favs[d.id];
    var fill = theme.primary, stroke = '#ffffff', dashed = false, cls = 'pin';
    if (sel || fav) { fill = theme.gold; }
    else if (d.approx) { fill = theme.gray; stroke = theme.grayStroke; dashed = true; cls += ' approx'; }
    var w = sel ? 46 : 34, h = Math.round(w * 46 / 36);
    return L.divIcon({
      className: 'pin-wrap',
      html: '<div class="' + cls + '">' + pinSvg(fill, stroke, dashed) + (d.soon ? '<span class="soon"></span>' : '') + '</div>',
      iconSize: [w, h], iconAnchor: [w / 2, h]
    });
  }
  function refresh(id){
    var m = markers[id], d = items[id];
    if (!m || !d) return;
    m.setIcon(iconFor(d));
    m.setZIndexOffset(id === selected ? 1000 : (favs[id] ? 500 : 0));
  }
  function onMarkerClick(){ post({ type: 'select', id: this._pid }); }

  // ---------- Enquadramento ----------
  function boundsMsg(tag){
    var b = map.getBounds(), c = map.getCenter();
    var clamp = function(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); };
    return {
      type: 'moveend', user: gesture, tag: tag || null, zoom: map.getZoom(),
      center: { lat: c.lat, lng: ((c.lng + 540) % 360) - 180 },
      bbox: [clamp(b.getWest(), -180, 180), clamp(b.getSouth(), -90, 90), clamp(b.getEast(), -180, 180), clamp(b.getNorth(), -90, 90)]
    };
  }
  function programmatic(tag){
    pendingTag = tag || null;
    if (tagTimer) clearTimeout(tagTimer);
    // Se o mapa já estava ali (sem moveend), o evento sai assim mesmo
    tagTimer = setTimeout(function(){ if (pendingTag) { var t = pendingTag; pendingTag = null; gesture = false; post(boundsMsg(t)); } }, 2200);
  }
  map.on('dragstart', function(){ gesture = true; });
  map.on('dblclick', function(){ gesture = true; });
  map.getContainer().addEventListener('touchstart', function(ev){ if (ev.touches && ev.touches.length > 1) gesture = true; }, { passive: true });
  map.on('moveend', function(){
    var t = pendingTag; pendingTag = null;
    if (tagTimer && t) { clearTimeout(tagTimer); tagTimer = null; }
    post(boundsMsg(t));
    gesture = false;
  });
  map.on('click', function(){ post({ type: 'mapclick' }); });

  // ---------- Mapa-base ----------
  function applyTiles(){
    if (!tiles) return;
    var url = (theme.dark && tiles.tileUrlDark) ? tiles.tileUrlDark : tiles.tileUrl;
    if (tileLayer && tileLayer._url === url) return;
    if (tileLayer) map.removeLayer(tileLayer);
    tileErrors = 0; tileLoads = 0; tileErrorSent = false;
    tileLayer = L.tileLayer(url, {
      maxZoom: tiles.maxZoom || 19, subdomains: tiles.subdomains || 'abc', attribution: tiles.attribution || ''
    });
    tileLayer.on('tileload', function(){ tileLoads++; });
    tileLayer.on('tileerror', function(){
      tileErrors++;
      if (!tileErrorSent && tileLoads === 0 && tileErrors >= 6) { tileErrorSent = true; post({ type: 'tileerror' }); }
    });
    tileLayer.addTo(map);
    map.setMaxZoom(tiles.maxZoom || 19);
  }

  window.parishMap = {
    setTiles: function(cfg){ if (cfg && typeof cfg.tileUrl === 'string') { tiles = cfg; applyTiles(); } },
    setTheme: function(t){
      if (!t) return;
      theme.dark = !!t.dark;
      ['primary', 'gold', 'gray', 'grayStroke'].forEach(function(k){ if (HEX.test(t[k] || '')) theme[k] = t[k]; });
      var root = document.documentElement.style;
      root.setProperty('--primary', theme.primary);
      if (HEX.test(t.bg || '')) root.setProperty('--bg', t.bg);
      if (HEX.test(t.text || '')) root.setProperty('--text', t.text);
      if (HEX.test(t.link || '')) root.setProperty('--link', t.link);
      root.setProperty('--surface', theme.dark ? 'rgba(23,26,31,.85)' : 'rgba(255,255,255,.88)');
      applyTiles();
      Object.keys(markers).forEach(refresh);
      cluster.refreshClusters();
    },
    setInsets: function(top, bottom){
      var root = document.documentElement.style;
      root.setProperty('--ti', Math.max(0, Number(top) || 0) + 'px');
      root.setProperty('--bi', Math.max(0, Number(bottom) || 0) + 'px');
    },
    setData: function(list){
      if (!Array.isArray(list)) return;
      var seen = {}, add = [], remove = [];
      list.forEach(function(d){
        if (!d || typeof d.id !== 'string' || !isFinite(d.lat) || !isFinite(d.lng)) return;
        seen[d.id] = true;
        var old = items[d.id];
        var nd = { id: d.id, lat: +d.lat, lng: +d.lng, approx: !!d.approx, soon: !!d.soon };
        items[d.id] = nd;
        var m = markers[d.id];
        if (m && old && (old.lat !== nd.lat || old.lng !== nd.lng)) { remove.push(m); m = null; }
        if (m) {
          if (old.approx !== nd.approx || old.soon !== nd.soon) refresh(d.id);
        } else {
          m = L.marker([nd.lat, nd.lng], { icon: iconFor(nd), keyboard: false });
          m._pid = d.id;
          m.on('click', onMarkerClick);
          markers[d.id] = m;
          add.push(m);
          if (d.id === selected || favs[d.id]) m.setZIndexOffset(d.id === selected ? 1000 : 500);
        }
      });
      Object.keys(markers).forEach(function(id){
        if (!seen[id]) { remove.push(markers[id]); delete markers[id]; delete items[id]; }
      });
      if (remove.length) cluster.removeLayers(remove);
      if (add.length) cluster.addLayers(add);
    },
    setFavorites: function(ids){
      var next = {};
      (Array.isArray(ids) ? ids : []).forEach(function(id){ if (typeof id === 'string') next[id] = true; });
      var changed = {};
      Object.keys(favs).forEach(function(id){ if (!next[id]) changed[id] = true; });
      Object.keys(next).forEach(function(id){ if (!favs[id]) changed[id] = true; });
      favs = next;
      Object.keys(changed).forEach(refresh);
    },
    select: function(id){
      var prev = selected;
      selected = (typeof id === 'string') ? id : null;
      if (prev && prev !== selected) refresh(prev);
      if (selected) refresh(selected);
    },
    focus: function(id, opts){
      var m = markers[id];
      if (!m) return;
      opts = opts || {};
      var z = Math.max(map.getZoom(), Number(opts.zoom) || 16);
      var off = Number(opts.offsetY) || 0;
      var target = map.unproject(map.project(m.getLatLng(), z).add([0, off]), z);
      programmatic(opts.tag);
      map.flyTo(target, z, { duration: 0.6 });
    },
    flyTo: function(lat, lng, zoom, tag){
      if (!isFinite(lat) || !isFinite(lng)) return;
      programmatic(tag);
      map.flyTo([lat, lng], Number(zoom) || map.getZoom(), { duration: 0.8 });
    },
    setView: function(lat, lng, zoom, tag){
      if (!isFinite(lat) || !isFinite(lng)) return;
      programmatic(tag);
      map.setView([lat, lng], Number(zoom) || map.getZoom(), { animate: false });
    },
    setUser: function(lat, lng, acc){
      if (!isFinite(lat) || !isFinite(lng)) return;
      var ll = [lat, lng];
      if (!userHalo) {
        userHalo = L.circle(ll, { radius: 30, stroke: false, fillColor: theme.primary, fillOpacity: 0.15, interactive: false }).addTo(map);
        userDot = L.circleMarker(ll, { radius: 8, color: '#fff', weight: 3, fillColor: theme.primary, fillOpacity: 1, interactive: false }).addTo(map);
      }
      userHalo.setLatLng(ll); userDot.setLatLng(ll);
      userHalo.setRadius(Math.min(Math.max(Number(acc) || 30, 15), 2000));
      userDot.setStyle({ fillColor: theme.primary }); userHalo.setStyle({ fillColor: theme.primary });
    }
  };

  post({ type: 'ready' });
})();
`;

export const MAP_HTML = `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<style>${inlineStyle(LEAFLET_CSS)}</style>
<style>${inlineStyle(MARKERCLUSTER_CSS)}</style>
<style>${APP_CSS}</style>
</head><body><div id="map"></div>
<script>${inlineScript(LEAFLET_JS)}</script>
<script>${inlineScript(MARKERCLUSTER_JS)}</script>
<script>${BRIDGE_JS}</script>
</body></html>`;
