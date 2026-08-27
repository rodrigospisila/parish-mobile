import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Device from 'expo-device';

// ============================================
// CONFIGURAÇÃO
// ============================================

// URL do backend NestJS
// Em desenvolvimento: ajustar para o IP da máquina ou usar localhost com proxy
// Em produção: usar a URL do servidor
//
// SEGURANÇA: dados mock NUNCA são usados em produção. USE_MOCK só pode ser
// ativado em build de desenvolvimento (__DEV__), mesmo que a env esteja setada.
export const USE_MOCK = __DEV__ && process.env.EXPO_PUBLIC_USE_MOCK === 'true';
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3003/api/v1';

// Chaves do AsyncStorage
export const STORAGE_KEYS = {
  ACCESS_TOKEN: '@parish:access_token',
  REFRESH_TOKEN: '@parish:refresh_token',
  USER: '@parish:user',
  DEVICE_ID: '@parish:device_id',
};

// ============================================
// IDENTIFICAÇÃO DO DISPOSITIVO (Dízimo D4.7 — governança de acesso)
// ============================================

/**
 * Gera um identificador aleatório (hex, 32 caracteres). Usa crypto.randomUUID
 * quando disponível; senão cai em Math.random — suficiente para distinguir
 * aparelhos (não é segredo, é só um rótulo estável por instalação).
 */
const generateDeviceId = (): string => {
  const cryptoObj = (globalThis as any)?.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    try {
      return String(cryptoObj.randomUUID()).replace(/-/g, '');
    } catch {
      // cai no fallback abaixo
    }
  }
  let id = '';
  for (let i = 0; i < 32; i++) {
    id += Math.floor(Math.random() * 16).toString(16);
  }
  return id;
};

let deviceIdPromise: Promise<string> | null = null;

/**
 * Obtém o ID do dispositivo (gerado uma única vez e persistido no AsyncStorage,
 * ao lado dos tokens). Sobrevive a logout — `clearTokens` não o remove — para
 * que o backend reconheça o mesmo aparelho em logins futuros.
 */
export const getDeviceId = async (): Promise<string> => {
  if (!deviceIdPromise) {
    deviceIdPromise = (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEYS.DEVICE_ID);
        if (stored) return stored;
        const fresh = generateDeviceId();
        await AsyncStorage.setItem(STORAGE_KEYS.DEVICE_ID, fresh);
        return fresh;
      } catch (error) {
        console.error('Erro ao obter ID do dispositivo:', error);
        // Sem storage, usa um ID efêmero (válido só nesta execução)
        return generateDeviceId();
      }
    })();
  }
  return deviceIdPromise;
};

/**
 * Nome legível do aparelho (ex.: "iPhone 15", "SM-G991B"). Cabeçalhos HTTP
 * só aceitam ASCII imprimível, então caracteres fora disso são descartados.
 */
export const getDeviceName = (): string => {
  const raw = Device.modelName ?? Platform.OS;
  const ascii = String(raw)
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
    .slice(0, 64);
  return ascii || Platform.OS;
};

/**
 * Cabeçalhos de identificação do dispositivo enviados em TODAS as requisições
 * (inclusive login e refresh) — o backend usa para reconhecer "novo aparelho".
 */
export const getDeviceHeaders = async (): Promise<Record<string, string>> => {
  const deviceId = await getDeviceId();
  return {
    'X-Device-Id': deviceId,
    'X-Device-Name': getDeviceName(),
  };
};

// ============================================
// INSTÂNCIA DO AXIOS
// ============================================

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000, // 30 segundos
  headers: {
    'Content-Type': 'application/json',
  },
});

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

/**
 * Obtém o access token do AsyncStorage
 */
export const getAccessToken = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  } catch (error) {
    console.error('Erro ao obter access token:', error);
    return null;
  }
};

/**
 * Obtém o refresh token do AsyncStorage
 */
export const getRefreshToken = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
  } catch (error) {
    console.error('Erro ao obter refresh token:', error);
    return null;
  }
};

/**
 * Salva os tokens no AsyncStorage
 */
export const saveTokens = async (accessToken: string, refreshToken: string): Promise<void> => {
  try {
    await AsyncStorage.multiSet([
      [STORAGE_KEYS.ACCESS_TOKEN, accessToken],
      [STORAGE_KEYS.REFRESH_TOKEN, refreshToken],
    ]);
  } catch (error) {
    console.error('Erro ao salvar tokens:', error);
  }
};

/**
 * Remove os tokens do AsyncStorage
 */
export const clearTokens = async (): Promise<void> => {
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.ACCESS_TOKEN,
      STORAGE_KEYS.REFRESH_TOKEN,
      STORAGE_KEYS.USER,
    ]);
  } catch (error) {
    console.error('Erro ao limpar tokens:', error);
  }
};

/**
 * Salva o usuário no AsyncStorage
 */
export const saveUser = async (user: any): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  } catch (error) {
    console.error('Erro ao salvar usuário:', error);
  }
};

/**
 * Obtém o usuário do AsyncStorage
 */
export const getStoredUser = async (): Promise<any | null> => {
  try {
    const userJson = await AsyncStorage.getItem(STORAGE_KEYS.USER);
    return userJson ? JSON.parse(userJson) : null;
  } catch (error) {
    console.error('Erro ao obter usuário:', error);
    return null;
  }
};

// ============================================
// SESSÃO EXPIRADA (refresh token definitivamente inválido)
// ============================================

type AuthFailureListener = () => void;
const authFailureListeners = new Set<AuthFailureListener>();

/**
 * Registra um ouvinte para quando a sessão morre de vez (refresh token
 * rejeitado pelo servidor). O AuthContext usa isso para zerar o usuário em
 * memória e mandar o app de volta à tela de login — sem isso o estado fica
 * "logado" com o storage limpo e todas as requisições falham em loop.
 */
export const onAuthFailure = (listener: AuthFailureListener): (() => void) => {
  authFailureListeners.add(listener);
  return () => authFailureListeners.delete(listener);
};

const emitAuthFailure = () => {
  authFailureListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // ouvinte não pode quebrar o interceptor
    }
  });
};

// ============================================
// INTERCEPTOR DE REQUEST
// ============================================

// Flag para evitar múltiplas tentativas de refresh simultâneas
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
};

/**
 * Rotas que não exigem sessão (sem Bearer e sem tentativa de refresh no 401 —
 * um 401 aqui significa credencial/código inválido, não sessão expirada).
 */
const PUBLIC_ROUTES = [
  '/auth/login',
  '/auth/2fa/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/otp/send',
  '/auth/otp/verify',
];

const isPublicRoute = (url?: string): boolean =>
  !!url && PUBLIC_ROUTES.some((route) => url.includes(route));

/**
 * Interceptor de request: adiciona o token JWT e os cabeçalhos de dispositivo
 * em todas as requisições
 */
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // Identificação do aparelho — vai em todas as requisições
    try {
      const deviceHeaders = await getDeviceHeaders();
      Object.entries(deviceHeaders).forEach(([key, value]) => {
        config.headers.set(key, value);
      });
    } catch {
      // identificação do aparelho nunca pode bloquear a requisição
    }

    // Não adicionar token em rotas públicas
    if (!isPublicRoute(config.url)) {
      const token = await getAccessToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// ============================================
// INTERCEPTOR DE RESPONSE
// ============================================

/**
 * Interceptor de response: trata erros e renova token automaticamente
 */
api.interceptors.response.use(
  (response) => {
    // Resposta bem-sucedida
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Se não houver config ou já tentou retry, rejeita
    if (!originalRequest) {
      return Promise.reject(error);
    }

    // Se o erro for 401 (Unauthorized) e não for uma tentativa de retry
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Se for a rota de refresh, não tenta novamente
      if (originalRequest.url?.includes('/auth/refresh')) {
        await clearTokens();
        emitAuthFailure();
        return Promise.reject(error);
      }

      // Rotas públicas (login, 2FA, registro...): o 401 é "credencial inválida",
      // não sessão expirada. Devolve o erro original para a tela mostrar a
      // mensagem da API em vez de tentar um refresh sem sessão.
      if (isPublicRoute(originalRequest.url)) {
        return Promise.reject(error);
      }

      // Se já está fazendo refresh, adiciona à fila
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await getRefreshToken();

        if (!refreshToken) {
          throw new Error('No refresh token available');
        }

        // Tenta renovar o token (com os cabeçalhos de dispositivo — o backend
        // pode vincular o refresh token ao aparelho)
        const response = await axios.post(
          `${API_URL}/auth/refresh`,
          { refreshToken },
          { headers: await getDeviceHeaders() },
        );

        const { accessToken: newAccessToken, refreshToken: newRefreshToken } = response.data;

        // Salva os novos tokens
        await saveTokens(newAccessToken, newRefreshToken);

        // Processa a fila de requisições que estavam esperando
        processQueue(null, newAccessToken);

        // Refaz a requisição original com o novo token
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        // Só desloga se o SERVIDOR rejeitou o refresh (token inválido/expirado).
        // Falha de REDE (offline, backend fora do ar) mantém a sessão — o app
        // continua com o cache offline e tenta de novo quando reconectar.
        const isServerRejection = axios.isAxiosError(refreshError) && !!refreshError.response;
        if (isServerRejection || !axios.isAxiosError(refreshError)) {
          await clearTokens();
          emitAuthFailure();
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // Para outros erros, apenas rejeita
    return Promise.reject(error);
  }
);

// ============================================
// TIPOS DE ERRO
// ============================================

export interface ApiError {
  message: string;
  statusCode: number;
  error?: string;
}

/**
 * Extrai a mensagem de erro de uma resposta da API
 */
export const getErrorMessage = (error: any): string => {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ApiError>;
    
    // Erro de rede
    if (!axiosError.response) {
      return 'Erro de conexão. Verifique sua internet.';
    }

    // Erro da API
    const apiError = axiosError.response.data;
    if (apiError?.message) {
      // Se for array de mensagens (validação)
      if (Array.isArray(apiError.message)) {
        return apiError.message.join(', ');
      }
      return apiError.message;
    }

    // Mensagens padrão por status
    switch (axiosError.response.status) {
      case 400:
        return 'Dados inválidos. Verifique as informações.';
      case 401:
        return 'Sessão expirada. Faça login novamente.';
      case 403:
        return 'Você não tem permissão para esta ação.';
      case 404:
        return 'Recurso não encontrado.';
      case 409:
        return 'Conflito de dados. Este registro já existe.';
      case 500:
        return 'Erro interno do servidor. Tente novamente.';
      default:
        return 'Ocorreu um erro. Tente novamente.';
    }
  }

  return 'Ocorreu um erro inesperado.';
};

export default api;
