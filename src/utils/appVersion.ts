/**
 * Versão mínima / mais recente do app (Onda 1, contrato C4 — eng-qualidade-12).
 *
 * Funções puras (sem React Native) para poderem ser testadas em Node.
 * Comparação semver SIMPLES: "1.2.3" por número (major.minor.patch); aceita
 * "v1.2", ignora sufixo de pré-lançamento/build ("1.2.3-beta.1" = 1.2.3).
 * Qualquer coisa fora disso é inválida e NUNCA bloqueia o app.
 */

export interface AppConfig {
  minSupportedVersion?: string | null;
  latestVersion?: string | null;
  iosUrl?: string | null;
  androidUrl?: string | null;
}

export type AppVersionStatus =
  | { kind: 'ok' }
  | { kind: 'required'; installed: string; required: string; storeUrl: string | null }
  | { kind: 'available'; installed: string; latest: string; storeUrl: string | null };

/** "1.2.3" → [1, 2, 3]; inválido → null. */
export function parseVersion(value: unknown): [number, number, number] | null {
  if (typeof value !== 'string') return null;
  const core = value.trim().replace(/^v/i, '').split(/[-+]/)[0];
  if (!/^\d{1,6}(\.\d{1,6}){0,2}$/.test(core)) return null;
  const parts = core.split('.').map((p) => Number(p));
  while (parts.length < 3) parts.push(0);
  return [parts[0], parts[1], parts[2]];
}

/** -1 se a < b, 0 se iguais, 1 se a > b; null se alguma for inválida. */
export function compareVersions(a: unknown, b: unknown): -1 | 0 | 1 | null {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}

/** Link de loja aceito: https, ou os esquemas das próprias lojas. */
export function safeStoreUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const url = value.trim();
  return /^(https:\/\/|itms-apps:\/\/|market:\/\/)\S+$/i.test(url) ? url : null;
}

/**
 * Decide o que mostrar. Sem configuração, sem campos ou com versão inválida
 * (do app ou do servidor) → 'ok' (nada acontece).
 */
export function evaluateAppVersion(
  installed: unknown,
  config: AppConfig | null | undefined,
  platform: string,
): AppVersionStatus {
  if (!config || typeof config !== 'object' || typeof installed !== 'string') return { kind: 'ok' };
  const storeUrl = safeStoreUrl(platform === 'ios' ? config.iosUrl : platform === 'android' ? config.androidUrl : null);

  if (compareVersions(installed, config.minSupportedVersion) === -1) {
    return { kind: 'required', installed, required: String(config.minSupportedVersion).trim(), storeUrl };
  }
  if (compareVersions(installed, config.latestVersion) === -1) {
    return { kind: 'available', installed, latest: String(config.latestVersion).trim(), storeUrl };
  }
  return { kind: 'ok' };
}
