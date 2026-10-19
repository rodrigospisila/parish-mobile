import api from '../config/api';
import type { AppConfig } from '../utils/appVersion';

/**
 * GET /public/app-config (contrato C4): versão mínima suportada, versão mais
 * recente e links das lojas. Rota pública (vai sem token). Qualquer falha →
 * null: sem resposta, o app segue normalmente (nunca bloqueia por erro).
 */
export async function getAppConfig(): Promise<AppConfig | null> {
  try {
    const { data } = await api.get<AppConfig>('/public/app-config', { timeout: 8000 });
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}
