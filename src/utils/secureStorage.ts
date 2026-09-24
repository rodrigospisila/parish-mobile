import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Armazenamento protegido para segredos (tokens de sessão, credenciais da
 * biometria): Keychain no iOS e Keystore no Android, via expo-secure-store.
 *
 * - No web não há SecureStore: cai no AsyncStorage (localStorage).
 * - Se o SecureStore falhar no aparelho (Keystore corrompido etc.), também cai
 *   no AsyncStorage — melhor manter a pessoa logada do que travar o app.
 * - `legacyKey`: chave antiga do AsyncStorage. Na primeira leitura o valor é
 *   migrado para o SecureStore e apagado de lá (quem já estava logado continua).
 */

const canUseSecureStore = Platform.OS === 'ios' || Platform.OS === 'android';

/** Só depois de desbloquear o aparelho, e nunca vai para backup/outro aparelho */
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const secureGet = async (key: string, legacyKey?: string): Promise<string | null> => {
  if (!canUseSecureStore) {
    return AsyncStorage.getItem(legacyKey ?? key);
  }
  try {
    const value = await SecureStore.getItemAsync(key, OPTIONS);
    if (value != null) return value;
    if (!legacyKey) return null;
    // Migração: valor que ainda está no AsyncStorage (versões antigas do app)
    const legacy = await AsyncStorage.getItem(legacyKey);
    if (legacy != null) {
      await SecureStore.setItemAsync(key, legacy, OPTIONS);
      await AsyncStorage.removeItem(legacyKey);
    }
    return legacy;
  } catch (error) {
    console.warn('SecureStore indisponível, usando armazenamento comum:', error);
    return AsyncStorage.getItem(legacyKey ?? key);
  }
};

export const secureSet = async (key: string, value: string, legacyKey?: string): Promise<void> => {
  if (!canUseSecureStore) {
    await AsyncStorage.setItem(legacyKey ?? key, value);
    return;
  }
  try {
    await SecureStore.setItemAsync(key, value, OPTIONS);
    if (legacyKey) await AsyncStorage.removeItem(legacyKey);
  } catch (error) {
    console.warn('SecureStore indisponível, usando armazenamento comum:', error);
    await AsyncStorage.setItem(legacyKey ?? key, value);
  }
};

export const secureDelete = async (key: string, legacyKey?: string): Promise<void> => {
  if (legacyKey || !canUseSecureStore) {
    await AsyncStorage.removeItem(legacyKey ?? key).catch(() => {});
  }
  if (!canUseSecureStore) return;
  try {
    await SecureStore.deleteItemAsync(key, OPTIONS);
  } catch (error) {
    console.warn('Erro ao apagar do SecureStore:', error);
  }
};
