import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';
import { secureDelete, secureGet, secureSet } from '../utils/secureStorage';

/**
 * Entrar com Face ID / digital.
 *
 * Ao ativar, o login (e-mail ou celular) e a senha ficam no armazenamento
 * protegido do aparelho (Keychain/Keystore, só neste aparelho). Para usar, o
 * sistema pede a biometria e o app faz o login normal com eles — o servidor
 * continua conferindo tudo (inclusive o segundo fator, se a conta tiver).
 * Sobrevive ao "sair" de propósito: é justamente para entrar de novo sem digitar.
 * Se a senha mudar, o primeiro login recusado apaga as credenciais guardadas.
 */

const CREDENTIALS_KEY = 'parish.biometric_credentials';
/** Marcador sem segredo, para saber se mostra o botão sem abrir o Keychain */
const ENABLED_KEY = '@parish:biometric_enabled';
/** A pessoa já respondeu "agora não" ao convite — não perguntar de novo a cada login */
const DECLINED_KEY = '@parish:biometric_declined';

export type BiometricSupport = {
  available: boolean;
  /** "Face ID", "digital", "reconhecimento facial" ou "biometria" */
  label: string;
  icon: 'smile' | 'fingerprint';
};

type StoredCredentials = { login: string; password: string };

const NOT_AVAILABLE: BiometricSupport = { available: false, label: 'biometria', icon: 'fingerprint' };

export const biometricService = {
  async getSupport(): Promise<BiometricSupport> {
    if (Platform.OS === 'web') return NOT_AVAILABLE;
    try {
      const [hasHardware, enrolled, types] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
        LocalAuthentication.supportedAuthenticationTypesAsync(),
      ]);
      if (!hasHardware || !enrolled) return NOT_AVAILABLE;
      const face = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
      const finger = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
      if (face && Platform.OS === 'ios') return { available: true, label: 'Face ID', icon: 'smile' };
      if (finger) return { available: true, label: 'digital', icon: 'fingerprint' };
      if (face) return { available: true, label: 'reconhecimento facial', icon: 'smile' };
      return { available: true, label: 'biometria', icon: 'fingerprint' };
    } catch {
      return NOT_AVAILABLE;
    }
  },

  async isEnabled(): Promise<boolean> {
    try {
      return (await AsyncStorage.getItem(ENABLED_KEY)) === '1';
    } catch {
      return false;
    }
  },

  async wasDeclined(): Promise<boolean> {
    try {
      return (await AsyncStorage.getItem(DECLINED_KEY)) === '1';
    } catch {
      return false;
    }
  },

  async setDeclined(): Promise<void> {
    await AsyncStorage.setItem(DECLINED_KEY, '1').catch(() => {});
  },

  /** Guarda as credenciais depois de um login com senha que deu certo */
  async enable(login: string, password: string): Promise<void> {
    const value: StoredCredentials = { login, password };
    await secureSet(CREDENTIALS_KEY, JSON.stringify(value));
    await AsyncStorage.multiSet([
      [ENABLED_KEY, '1'],
      [DECLINED_KEY, ''],
    ]);
  },

  async disable(): Promise<void> {
    await secureDelete(CREDENTIALS_KEY);
    await AsyncStorage.removeItem(ENABLED_KEY).catch(() => {});
  },

  /** Atualiza a senha guardada (ex.: depois de trocar a senha no app), se estiver ativo */
  async updatePassword(password: string): Promise<void> {
    if (!(await this.isEnabled())) return;
    const current = await this.readCredentials();
    if (current) await this.enable(current.login, password);
  },

  async readCredentials(): Promise<StoredCredentials | null> {
    try {
      const raw = await secureGet(CREDENTIALS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed?.login && parsed?.password ? parsed : null;
    } catch {
      return null;
    }
  },

  /**
   * Pede a biometria e devolve as credenciais guardadas.
   * null = a pessoa cancelou/falhou, ou não há credenciais (aí desativa).
   */
  async unlock(label: string): Promise<StoredCredentials | null> {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: `Entrar no Parish com ${label}`,
      cancelLabel: 'Cancelar',
      fallbackLabel: 'Usar a senha do celular',
      disableDeviceFallback: false,
    });
    if (!result.success) return null;
    const credentials = await this.readCredentials();
    if (!credentials) {
      await this.disable();
      return null;
    }
    return credentials;
  },
};
