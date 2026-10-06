import api, { getErrorMessage } from '../config/api';

/** Consentimentos granulares do cadastro (LGPD). */
export type ConsentType = 'DATA_PROCESSING' | 'IMAGE_USE' | 'COMMUNICATIONS';

export interface ConsentRow {
  type: ConsentType;
  granted: boolean;
  grantedAt?: string | null;
  revokedAt?: string | null;
}

export interface TermsStatus {
  /** true: a conta ainda não aceitou os termos vigentes (servidor antigo: ausente) */
  termsAcceptanceRequired?: boolean;
  termsVersion?: string;
}

/**
 * Privacidade do titular (M3/M4 e B62 da auditoria): aceite dos termos,
 * consentimentos, exportação dos dados. A exclusão da conta segue em
 * authService.deleteAccount.
 */
export const privacyService = {
  async getTermsStatus(): Promise<TermsStatus> {
    const { data } = await api.get('/users/me');
    return { termsAcceptanceRequired: data?.termsAcceptanceRequired, termsVersion: data?.termsVersion };
  },

  async acceptTerms(version?: string): Promise<void> {
    try {
      await api.post('/users/me/accept-terms', version ? { version } : {});
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  /** Id do cadastro de membro da conta (null quando não há cadastro). */
  async getMyMemberId(): Promise<string | null> {
    const { data } = await api.get('/users/me');
    return data?.member?.id ?? null;
  },

  async getConsents(memberId: string): Promise<ConsentRow[]> {
    try {
      const { data } = await api.get<ConsentRow[]>(`/members/${memberId}/consents`);
      return Array.isArray(data) ? data : [];
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  async setConsent(memberId: string, type: ConsentType, granted: boolean): Promise<void> {
    try {
      await api.put(`/members/${memberId}/consents`, { type, granted });
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  /** Conta (/users/me) + cadastro exportado (/members/:id/export), num só objeto. */
  async exportMyData(memberId: string | null): Promise<Record<string, unknown>> {
    try {
      const [{ data: account }, memberExport] = await Promise.all([
        api.get('/users/me'),
        memberId ? api.get(`/members/${memberId}/export`).then((response) => response.data) : Promise.resolve(null),
      ]);
      return { exportedAt: new Date().toISOString(), account, member: memberExport?.member ?? null };
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },
};
