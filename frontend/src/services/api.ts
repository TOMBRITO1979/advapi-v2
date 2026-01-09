import axios from 'axios';

// Em produção, usa api.advtom.com; em dev, usa /api (proxy)
const API_URL = import.meta.env.PROD
  ? 'https://api.advtom.com/api'
  : '/api';

const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

// Auth
export const authService = {
  login: (email: string, senha: string) =>
    api.post('/auth/login', { email, senha }),
  setup: (nome: string, email: string, senha: string) =>
    api.post('/auth/setup', { nome, email, senha }),
};

// Dashboard
export const dashboardService = {
  getResumo: () => api.get('/dashboard'),
  getGraficoPublicacoes: (dias = 30) =>
    api.get(`/dashboard/grafico/publicacoes?dias=${dias}`),
  getAdvogadosTop: (limit = 10) =>
    api.get(`/dashboard/advogados-top?limit=${limit}`),
};

// Advogados
export const advogadosService = {
  listar: (params?: { ativo?: boolean; busca?: string; page?: number }) =>
    api.get('/advogados', { params }),
  buscar: (id: string) => api.get(`/advogados/${id}`),
  criar: (data: any) => api.post('/advogados', data),
  atualizar: (id: string, data: any) => api.put(`/advogados/${id}`, data),
  excluir: (id: string) => api.delete(`/advogados/${id}`),
  consultar: (id: string, data?: any) =>
    api.post(`/advogados/${id}/consultar`, data),
};

// Publicacoes
export const publicacoesService = {
  listar: (params?: {
    advogadoId?: string;
    status?: string;
    busca?: string;
    page?: number;
  }) => api.get('/publicacoes', { params }),
  buscar: (id: string) => api.get(`/publicacoes/${id}`),
  atualizarStatus: (id: string, status: string) =>
    api.put(`/publicacoes/${id}/status`, { status }),
  reenviar: (id: string) => api.post(`/publicacoes/${id}/reenviar`),
  getEstatisticas: () => api.get('/publicacoes/stats/resumo'),
};

// Proxies
export const proxiesService = {
  listar: (params?: { ativo?: boolean; page?: number }) =>
    api.get('/proxies', { params }),
  criar: (data: any) => api.post('/proxies', data),
  atualizar: (id: string, data: any) => api.put(`/proxies/${id}`, data),
  excluir: (id: string) => api.delete(`/proxies/${id}`),
  upload: (file: File) => {
    const formData = new FormData();
    formData.append('arquivo', file);
    return api.post('/proxies/upload', formData);
  },
  testar: (id: string) => api.post(`/proxies/${id}/testar`),
  getEstatisticas: () => api.get('/proxies/stats/resumo'),
};

// Fila
export const filaService = {
  getStatus: () => api.get('/consulta/fila/status'),
  getConsulta: (id: string) => api.get(`/consulta/${id}/status`),
};
