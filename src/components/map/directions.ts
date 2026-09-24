import { Alert, Linking, Platform } from 'react-native';

/**
 * Abre o app de mapas do aparelho com a igreja como destino.
 *
 * - iOS: Apple Maps com rota até o ponto (o nome vai como rótulo).
 * - Android: intent `geo:` com o pino rotulado — o sistema oferece o app de
 *   mapas preferido (Google Maps, Waze…) e o botão de rota fica a um toque.
 * - Fallback: Google Maps na web.
 */
export function openDirectionsTo(lat: number, lng: number, name?: string | null) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  const dest = `${lat},${lng}`;
  // Parênteses delimitam o rótulo no esquema geo:, então saem do nome
  const label = (name || '').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
  const web = `https://www.google.com/maps/dir/?api=1&destination=${dest}`;

  const url = Platform.select({
    ios: `maps://?daddr=${dest}${label ? `&q=${encodeURIComponent(label)}` : ''}`,
    android: `geo:${dest}?q=${dest}${label ? `(${encodeURIComponent(label)})` : ''}`,
    default: web,
  })!;

  Linking.openURL(url).catch(() => {
    Linking.openURL(web).catch(() => Alert.alert('Erro', 'Não foi possível abrir o mapa.'));
  });
}
