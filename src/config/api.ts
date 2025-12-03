import axios from 'axios';

// URL do backend NestJS (ajustar se o backend não estiver rodando em localhost:3003)
const API_URL = 'http://localhost:3003/api/v1';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para adicionar o token JWT em todas as requisições
api.interceptors.request.use(
  async (config) => {
    // O token será injetado aqui pelo AuthContext antes de cada requisição
    // Por enquanto, vamos deixar o placeholder
    // const token = await AsyncStorage.getItem('userToken');
    // if (token) {
    //   config.headers.Authorization = `Bearer ${token}`;
    // }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default api;
