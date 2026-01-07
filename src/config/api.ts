import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================
// CONFIGURAÇÃO
// ============================================

// URL do backend NestJS
// Em desenvolvimento: ajustar para o IP da máquina ou usar localhost com proxy
// Em produção: usar a URL do servidor
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

// Chaves do AsyncStorage
export const STORAGE_KEYS = {
  ACCESS_TOKEN: '@parish:access_token',
  REFRESH_TOKEN: '@parish:refresh_token',
  USER: '@parish:user',
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
 * Interceptor de request: adiciona o token JWT em todas as requisições
 */
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // Não adicionar token em rotas públicas
    const publicRoutes = ['/auth/login', '/auth/register', '/auth/refresh'];
    const isPublicRoute = publicRoutes.some((route) => config.url?.includes(route));

    if (!isPublicRoute) {
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

        // Tenta renovar o token
        const response = await axios.post(`${API_URL}/auth/refresh`, {
          refreshToken,
        });

        const { accessToken: newAccessToken, refreshToken: newRefreshToken } = response.data;

        // Salva os novos tokens
        await saveTokens(newAccessToken, newRefreshToken);

        // Processa a fila de requisições que estavam esperando
        processQueue(null, newAccessToken);

        // Refaz a requisição original com o novo token
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Se o refresh falhar, limpa os tokens e processa a fila com erro
        processQueue(refreshError, null);
        await clearTokens();
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
