/**
 * Endereços externos configuráveis por env (Onda 1 — suporte e domínio ainda
 * não existem; o Rodrigo vai criar). Nada de domínio inventado: sem env, valem
 * os padrões abaixo.
 *
 * As envs EXPO_PUBLIC_* são embutidas no bundle na hora do build/OTA, por isso
 * o acesso é sempre literal (`process.env.EXPO_PUBLIC_...`).
 */

const DEFAULT_WEB_URL = 'https://parish-web-three.vercel.app';
/** Valor que o produto já usa hoje (web: LegalPages). */
const DEFAULT_SUPPORT_EMAIL = 'suporte@parish.app';

/**
 * Fora do desenvolvimento, só HTTPS público — uma atualização pelo ar
 * publicada com o .env local (ex.: http://localhost:5173) mandaria todo mundo
 * para um endereço que não abre (mesma regra da URL da API).
 */
export const resolveWebUrl = (configured: string | undefined, dev: boolean): string => {
  const url = (configured || '').trim().replace(/\/+$/, '');
  if (!url) return DEFAULT_WEB_URL;
  if (dev) return url;
  const local = /^http:\/\/|\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i;
  return /^https:\/\//i.test(url) && !local.test(url) ? url : DEFAULT_WEB_URL;
};

/** Painel web do Parish (gestão da paróquia, reivindicação, convites). */
export const WEB_URL = resolveWebUrl(process.env.EXPO_PUBLIC_WEB_URL, __DEV__);

const resolveSupportEmail = (configured?: string): string => {
  const email = (configured || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : DEFAULT_SUPPORT_EMAIL;
};

/** E-mail de suporte do Parish (saas-implantacao-06). */
export const SUPPORT_EMAIL = resolveSupportEmail(process.env.EXPO_PUBLIC_SUPPORT_EMAIL);

/** Página pública de reivindicação da paróquia no painel web (contrato C1). */
export const claimParishUrl = (parishId: string): string =>
  `${WEB_URL}/reivindicar/${encodeURIComponent(parishId)}`;

/** mailto: do suporte, com assunto e (opcional) corpo já preenchidos. */
export const supportMailto = (subject: string, body?: string): string => {
  const params = [`subject=${encodeURIComponent(subject)}`];
  if (body) params.push(`body=${encodeURIComponent(body)}`);
  return `mailto:${SUPPORT_EMAIL}?${params.join('&')}`;
};
