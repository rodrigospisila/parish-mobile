import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { canUseProtectedStore, protectedDelete, protectedGet, protectedSet } from '../utils/secureStorage';

/**
 * Entrar com Face ID / digital.
 *
 * Ao ativar, o login (e-mail ou celular) e a senha ficam num item do
 * Keychain/Keystore que SÓ o sistema libera, com a biometria (iOS: Face ID /
 * Touch ID atuais — o código do celular não serve; Android: biometria forte).
 * Nunca cai no AsyncStorage: se o aparelho não consegue guardar assim, a
 * opção não aparece (B10/B56). O servidor continua conferindo tudo
 * (inclusive o segundo fator, se a conta tiver).
 * Sobrevive ao "sair" de propósito: é justamente para entrar de novo sem digitar.
 * Se a senha mudar, o primeiro login recusado apaga as credenciais guardadas.
 *
 * Versões até a 1.1.0 guardavam {login, senha} sem exigir a biometria do
 * sistema (e, se o SecureStore falhasse, no AsyncStorage). Esse item antigo é
 * lido uma última vez no próximo "Entrar com Face ID", regravado no formato
 * protegido e apagado.
 */

/** Item protegido por biometria (formato atual) */
const PROTECTED_KEY = 'parish.biometric_login';
/** Item antigo, sem exigência de biometria do sistema (até a 1.1.0) */
const LEGACY_KEY = 'parish.biometric_credentials';
/** Marcador sem segredo, para saber se mostra o botão sem abrir o Keychain */
const ENABLED_KEY = '@parish:biometric_enabled';
/** Dono da biometria neste aparelho: { userId, login } — nada secreto, evita abrir o Keychain para comparar */
const OWNER_KEY = '@parish:biometric_owner';
/** A pessoa já respondeu "agora não" ao convite — não perguntar de novo a cada login */
const DECLINED_KEY = '@parish:biometric_declined';

export type BiometricSupport = {
  available: boolean;
  /** "Face ID", "digital", "reconhecimento facial" ou "biometria" */
  label: string;
  icon: 'smile' | 'fingerprint';
};

export type StoredCredentials = { login: string; password: string; userId?: string };
type Owner = { userId?: string; login?: string };
/** Conta que acabou de entrar (para saber se a biometria guardada é dela) */
export type BiometricAccount = { id: string; email?: string | null; phone?: string | null };

const NOT_AVAILABLE: BiometricSupport = { available: false, label: 'biometria', icon: 'fingerprint' };
const canUseNativeStore = Platform.OS === 'ios' || Platform.OS === 'android';
const digitsOf = (value?: string | null) => String(value ?? '').replace(/\D/g, '');
/** Cancelamento do pedido de biometria (não é motivo para desativar) */
const isCancel = (error: unknown) => /cancel/i.test(String((error as any)?.message ?? error ?? ''));

const parseCredentials = (raw: string | null): StoredCredentials | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.login && parsed?.password ? parsed : null;
  } catch {
    return null;
  }
};

async function readOwner(): Promise<Owner | null> {
  try {
    const raw = await AsyncStorage.getItem(OWNER_KEY);
    return raw ? (JSON.parse(raw) as Owner) : null;
  } catch {
    return null;
  }
}

/** Item antigo: SecureStore sem biometria ou, se ele tinha falhado, o AsyncStorage. */
async function readLegacy(): Promise<StoredCredentials | null> {
  if (canUseNativeStore) {
    try {
      const fromStore = parseCredentials(await SecureStore.getItemAsync(LEGACY_KEY));
      if (fromStore) return fromStore;
    } catch {
      // segue para o AsyncStorage
    }
  }
  try {
    return parseCredentials(await AsyncStorage.getItem(LEGACY_KEY));
  } catch {
    return null;
  }
}

async function deleteLegacy(): Promise<void> {
  await AsyncStorage.removeItem(LEGACY_KEY).catch(() => {});
  if (!canUseNativeStore) return;
  try {
    await SecureStore.deleteItemAsync(LEGACY_KEY);
  } catch {
    // nada a apagar
  }
}

export const biometricService = {
  async getSupport(): Promise<BiometricSupport> {
    if (Platform.OS === 'web') return NOT_AVAILABLE;
    // Sem item protegido por biometria no sistema, a senha não é guardada
    if (!canUseProtectedStore()) return NOT_AVAILABLE;
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

  /**
   * Guarda as credenciais depois de um login com senha que deu certo (ou da
   * senha conferida em Segurança). No Android o próprio sistema pede a
   * biometria para gravar. Lança se o aparelho não conseguir guardar
   * protegido — aí a biometria NÃO é ativada.
   */
  async enable(login: string, password: string, userId?: string): Promise<void> {
    const value: StoredCredentials = { login, password, ...(userId ? { userId } : {}) };
    await protectedSet(PROTECTED_KEY, JSON.stringify(value), 'Confirme para ativar a entrada sem senha');
    await deleteLegacy();
    await AsyncStorage.multiSet([
      [ENABLED_KEY, '1'],
      [OWNER_KEY, JSON.stringify({ userId, login } satisfies Owner)],
      [DECLINED_KEY, ''],
    ]);
  },

  async disable(): Promise<void> {
    await protectedDelete(PROTECTED_KEY);
    await deleteLegacy();
    await AsyncStorage.multiRemove([ENABLED_KEY, OWNER_KEY]).catch(() => {});
  },

  /**
   * A biometria guardada é da conta que acabou de entrar? Compara pelo id da
   * conta (B9: quem ativou com o e-mail e entra pelo celular continua com a
   * biometria). Item antigo, sem id: compara o login com o e-mail ou com os
   * dígitos do celular da conta. null = nada guardado.
   */
  async belongsTo(account: BiometricAccount): Promise<boolean | null> {
    if (!(await this.isEnabled())) return null;
    const owner = await readOwner();
    if (owner?.userId) return owner.userId === account.id;
    const login = owner?.login ?? (await readLegacy())?.login;
    if (!login) return null;
    if (login.includes('@')) return login.trim().toLowerCase() === String(account.email ?? '').trim().toLowerCase();
    const typed = digitsOf(login);
    const phone = digitsOf(account.phone);
    return !!typed && !!phone && (phone === typed || phone.endsWith(typed) || typed.endsWith(phone));
  },

  /** Registra a conta dona (item antigo, que não tinha o id) depois de um login pela biometria. */
  async rememberOwner(account: BiometricAccount, login: string): Promise<void> {
    const owner = await readOwner();
    if (owner?.userId === account.id) return;
    await AsyncStorage.setItem(OWNER_KEY, JSON.stringify({ userId: account.id, login } satisfies Owner)).catch(() => {});
  },

  /** Atualiza a senha guardada (ex.: depois de trocar a senha no app), se estiver ativo */
  async updatePassword(password: string): Promise<void> {
    if (!(await this.isEnabled())) return;
    const owner = await readOwner();
    const login = owner?.login ?? (await readLegacy())?.login;
    if (!login) {
      await this.disable();
      return;
    }
    try {
      await this.enable(login, password, owner?.userId);
    } catch {
      // Sem conseguir regravar protegido: desliga (a senha antiga não serve mais)
      await this.disable();
    }
  },

  /**
   * Pede a biometria e devolve as credenciais guardadas.
   * null = a pessoa cancelou/falhou, ou não há credenciais (aí desativa).
   */
  async unlock(label: string): Promise<StoredCredentials | null> {
    const prompt = `Entrar no Parish com ${label}`;
    try {
      const credentials = parseCredentials(await protectedGet(PROTECTED_KEY, prompt));
      if (credentials) return credentials;
    } catch (error) {
      if (isCancel(error)) return null;
      // Biometria do aparelho mudou (item invalidado) ou Keystore com defeito: desativa
      await this.disable();
      return null;
    }

    // Item antigo (até a 1.1.0): confirma a biometria (sem o código do celular),
    // lê uma última vez e regrava protegido — ou desativa se não der
    const legacy = await readLegacy();
    if (!legacy) {
      await this.disable();
      return null;
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: prompt,
      cancelLabel: 'Cancelar',
      disableDeviceFallback: true,
    });
    if (!result.success) return null;
    try {
      await this.enable(legacy.login, legacy.password, (await readOwner())?.userId);
    } catch {
      // Não deu para proteger: usa esta vez e não guarda mais a senha
      await this.disable();
    }
    return legacy;
  },
};
