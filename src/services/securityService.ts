import api, { getErrorMessage, saveTokens } from '../config/api';

// ============================================
// TIPOS — Governança de acesso (Dízimo D4.7)
// ============================================

/** Situação do segundo fator (TOTP) da conta logada */
export interface TwoFactorStatus {
  enabled: boolean;
  enabledAt: string | null;
  /** true para papéis que administram finanças/dados sensíveis */
  recommended: boolean;
  backupCodesLeft: number;
  /** false quando o servidor não tem a chave de cifra do segredo configurada */
  serverReady: boolean;
}

/** Segredo pendente gerado pelo servidor (ainda não ativo) */
export interface TwoFactorSetup {
  secret: string;
  otpauthUrl: string;
  /** PNG em data URL, pronto para <Image source={{ uri }} /> */
  qrDataUrl: string;
}

export interface TwoFactorEnableResult {
  enabled: boolean;
  /** Códigos de recuperação — mostrados apenas uma vez */
  backupCodes: string[];
  /** Sessão nova deste aparelho (as demais sessões da conta foram encerradas) */
  accessToken?: string;
  refreshToken?: string;
}

export interface ForgetDeviceResult {
  forgotten: boolean;
  /** true quando o aparelho esquecido é este — a sessão atual acabou */
  current: boolean;
  accessToken?: string;
  refreshToken?: string;
}

/** Aparelho conhecido pela conta */
export interface KnownDevice {
  id: string;
  label: string | null;
  lastIp: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  revokedAt?: string | null;
  /** true quando corresponde ao aparelho que fez a requisição */
  current: boolean;
}

// ============================================
// SERVIÇO
// ============================================

export const securityService = {
  /** Situação atual do 2FA */
  async getTwoFactorStatus(): Promise<TwoFactorStatus> {
    try {
      const response = await api.get<TwoFactorStatus>('/auth/2fa/status');
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  /** Gera o segredo pendente + QR para o app autenticador */
  async setupTwoFactor(): Promise<TwoFactorSetup> {
    try {
      const response = await api.post<TwoFactorSetup>('/auth/2fa/setup');
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  /** Confirma o código do autenticador e ativa; devolve os códigos de recuperação */
  async enableTwoFactor(code: string): Promise<TwoFactorEnableResult> {
    try {
      const response = await api.post<TwoFactorEnableResult>('/auth/2fa/enable', {
        code: code.trim(),
      });
      // Ativar o 2FA encerra as outras sessões; este aparelho segue com os tokens novos
      if (response.data?.accessToken && response.data?.refreshToken) {
        await saveTokens(response.data.accessToken, response.data.refreshToken);
      }
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  /** Desativa o 2FA (exige senha atual + código válido ou de recuperação) */
  async disableTwoFactor(password: string, code: string): Promise<void> {
    try {
      await api.post('/auth/2fa/disable', { password, code: code.trim() });
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  /** Lista os aparelhos que já acessaram a conta */
  async listDevices(): Promise<KnownDevice[]> {
    try {
      const response = await api.get<KnownDevice[]>('/auth/devices');
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  /**
   * Esquece um aparelho. O servidor encerra todas as sessões da conta; se o
   * aparelho esquecido não é este, devolve tokens novos para continuar aqui.
   */
  async forgetDevice(deviceId: string): Promise<ForgetDeviceResult> {
    try {
      const response = await api.delete<ForgetDeviceResult>(`/auth/devices/${deviceId}`);
      const data = response.data ?? { forgotten: true, current: false };
      if (!data.current && data.accessToken && data.refreshToken) {
        await saveTokens(data.accessToken, data.refreshToken);
      }
      return data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },
};

export default securityService;
