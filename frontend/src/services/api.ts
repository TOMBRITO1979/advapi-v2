import axios from 'axios';

// Sempre usa /api (nginx faz proxy para o backend)
const API_URL = '/api';

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
  listar: (params?: { ativo?: boolean; page?: number; limit?: number }) =>
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
  resetar: (id: string) => api.post(`/proxies/${id}/resetar`),
  resetarTodos: () => api.post('/proxies/resetar/todos'),
  excluirFalhos: () => api.delete('/proxies/falhos/todos'),
  getEstatisticas: () => api.get('/proxies/stats/resumo'),
};

// Fila
export const filaService = {
  getStatus: () => api.get('/dashboard/fila'),
  getConsulta: (id: string) => api.get(`/consulta/${id}/status`),
};

// Metricas
export const metricasService = {
  getMetricas: () => api.get('/dashboard/metricas'),
  getAtividade: (limit = 20) => api.get(`/dashboard/atividade?limit=${limit}`),
};

// Banco de Dados (todas as publicacoes)
export const bancoDadosService = {
  listar: (params?: {
    advogado?: string;
    processo?: string;
    dataInicio?: string;
    dataFim?: string;
    page?: number;
    limit?: number;
  }) => api.get('/dashboard/publicacoes', { params }),
  buscar: (id: string) => api.get(`/dashboard/publicacoes/${id}`),
};

// Logs do Sistema
export const logsService = {
  listar: (params?: {
    tipo?: string;
    categoria?: string;
    lido?: boolean;
    page?: number;
    limit?: number;
  }) => api.get('/logs', { params }),
  getStats: () => api.get('/logs/stats'),
  marcarLido: (id: string) => api.put(`/logs/${id}/lido`),
  marcarResolvido: (id: string) => api.put(`/logs/${id}/resolvido`),
  marcarTodosLidos: () => api.post('/logs/marcar-todos-lidos'),
  excluir: (id: string) => api.delete(`/logs/${id}`),
  limparAntigos: () => api.delete('/logs/limpar/antigos'),
};

// Workers
export const workersService = {
  getStatus: () => api.get('/dashboard/workers'),
};
