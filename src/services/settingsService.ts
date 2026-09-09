import api from '../config/api';

/**
 * Recursos do Início do app que o administrador do sistema desligou no painel
 * (Configurações → Aplicativo). Ausência na lista = recurso visível.
 * Falha na consulta = tudo visível (o app nunca fica "vazio" por causa disso).
 */
let cache: { at: number; disabled: Set<string> } | null = null;
const TTL_MS = 5 * 60 * 1000;

export const getDisabledMobileFeatures = async (): Promise<Set<string>> => {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.disabled;
  try {
    const { data } = await api.get('/settings/mobile-features');
    const disabled = new Set<string>(Array.isArray(data?.disabled) ? data.disabled : []);
    cache = { at: Date.now(), disabled };
    return disabled;
  } catch {
    return cache?.disabled ?? new Set();
  }
};
