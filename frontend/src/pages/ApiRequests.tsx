import { useState, useEffect } from 'react';
import { requestsService } from '../services/api';
import {
  Globe,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Filter,
  Trash2,
  Eye,
  Server,
  Activity,
} from 'lucide-react';

interface ApiRequest {
  id: string;
  metodo: string;
  path: string;
  statusCode: number;
  sucesso: boolean;
  erro: string | null;
  origem: string;
  ip: string;
  responseTime: number;
  companyId: string | null;
  advogadoId: string | null;
  consultaId: string | null;
  apiKeyPrefixo: string | null;
  createdAt: string;
}

interface ApiRequestDetalhes extends ApiRequest {
  queryParams: any;
  userAgent: string | null;
  apiKeyId: string | null;
  requestBody: any;
  requestHeaders: any;
  responseBody: any;
}

interface Stats {
  resumo: {
    total: number;
    hoje: number;
    semana: number;
    mes: number;
    sucesso: number;
    erro: number;
    taxaSucesso: number;
    tempoMedioMs: number;
  };
  porOrigem: Array<{ origem: string; total: number }>;
  porPath: Array<{ path: string; total: number }>;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export default function ApiRequests() {
  const [requests, setRequests] = useState<ApiRequest[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);

  // Filtros
  const [filtroMetodo, setFiltroMetodo] = useState<string>('');
  const [filtroSucesso, setFiltroSucesso] = useState<string>('');
  const [filtroOrigem, setFiltroOrigem] = useState<string>('');

  // Modal
  const [requestSelecionado, setRequestSelecionado] = useState<ApiRequestDetalhes | null>(null);

  useEffect(() => {
    carregarDados();
  }, [page, filtroMetodo, filtroSucesso, filtroOrigem]);

  useEffect(() => {
    carregarStats();
  }, []);

  const carregarDados = async () => {
    try {
      setLoading(true);
      const params: any = { page, limit: 50 };
      if (filtroMetodo) params.metodo = filtroMetodo;
      if (filtroSucesso) params.sucesso = filtroSucesso === 'true';
      if (filtroOrigem) params.origem = filtroOrigem;

      const res = await requestsService.listar(params);
      setRequests(res.data.data);
      setPagination(res.data.pagination);
    } catch (error) {
      console.error('Erro ao carregar requisicoes:', error);
    } finally {
      setLoading(false);
    }
  };

  const carregarStats = async () => {
    try {
      const res = await requestsService.getStats();
      setStats(res.data);
    } catch (error) {
      console.error('Erro ao carregar estatisticas:', error);
    }
  };

  const verDetalhes = async (id: string) => {
    try {
      const res = await requestsService.buscar(id);
      setRequestSelecionado(res.data);
    } catch (error) {
      console.error('Erro ao carregar detalhes:', error);
    }
  };

  const limparAntigos = async () => {
    if (!confirm('Remover requisicoes com mais de 30 dias?')) return;

    try {
      const res = await requestsService.limparAntigos();
      alert(res.data.message);
      carregarDados();
      carregarStats();
    } catch (error) {
      console.error('Erro ao limpar requisicoes:', error);
    }
  };

  const formatarData = (data: string) => {
    return new Date(data).toLocaleString('pt-BR');
  };

  const getCorMetodo = (metodo: string) => {
    switch (metodo) {
      case 'GET':
        return 'bg-green-100 text-green-800';
      case 'POST':
        return 'bg-blue-100 text-blue-800';
      case 'PUT':
        return 'bg-yellow-100 text-yellow-800';
      case 'DELETE':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getCorStatus = (statusCode: number) => {
    if (statusCode >= 200 && statusCode < 300) return 'text-green-600';
    if (statusCode >= 400 && statusCode < 500) return 'text-yellow-600';
    if (statusCode >= 500) return 'text-red-600';
    return 'text-gray-600';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Requisicoes API</h1>
          {stats && (
            <span className="px-3 py-1 text-sm font-medium rounded-full bg-blue-100 text-blue-800">
              {stats.resumo.hoje} hoje
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { carregarDados(); carregarStats(); }}
            className="flex items-center px-4 py-2 text-gray-600 hover:text-gray-900 border rounded-lg hover:bg-gray-50"
          >
            <RefreshCw size={20} className="mr-2" />
            Atualizar
          </button>
        </div>
      </div>

      {/* Cards de estatisticas */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <Globe className="h-8 w-8 text-blue-500" />
              <div className="ml-3">
                <p className="text-sm text-gray-500">Total</p>
                <p className="text-xl font-bold">{stats.resumo.total.toLocaleString()}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <CheckCircle className="h-8 w-8 text-green-500" />
              <div className="ml-3">
                <p className="text-sm text-gray-500">Taxa Sucesso</p>
                <p className="text-xl font-bold text-green-600">{stats.resumo.taxaSucesso}%</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <XCircle className="h-8 w-8 text-red-500" />
              <div className="ml-3">
                <p className="text-sm text-gray-500">Erros</p>
                <p className="text-xl font-bold text-red-600">{stats.resumo.erro}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <Clock className="h-8 w-8 text-purple-500" />
              <div className="ml-3">
                <p className="text-sm text-gray-500">Tempo Medio</p>
                <p className="text-xl font-bold">{stats.resumo.tempoMedioMs}ms</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Resumo por origem e path */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-medium text-gray-900 mb-3 flex items-center">
              <Server size={18} className="mr-2" />
              Por Origem
            </h3>
            <div className="space-y-2">
              {stats.porOrigem.map((item) => (
                <div key={item.origem} className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">{item.origem}</span>
                  <span className="text-sm font-medium">{item.total}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-medium text-gray-900 mb-3 flex items-center">
              <Activity size={18} className="mr-2" />
              Endpoints Mais Acessados
            </h3>
            <div className="space-y-2">
              {stats.porPath.slice(0, 5).map((item) => (
                <div key={item.path} className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 truncate max-w-[200px]">{item.path}</span>
                  <span className="text-sm font-medium">{item.total}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Filter size={20} className="text-gray-500" />

            <select
              value={filtroMetodo}
              onChange={(e) => { setFiltroMetodo(e.target.value); setPage(1); }}
              className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos metodos</option>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>

            <select
              value={filtroSucesso}
              onChange={(e) => { setFiltroSucesso(e.target.value); setPage(1); }}
              className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos status</option>
              <option value="true">Sucesso</option>
              <option value="false">Erro</option>
            </select>

            <select
              value={filtroOrigem}
              onChange={(e) => { setFiltroOrigem(e.target.value); setPage(1); }}
              className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todas origens</option>
              <option value="API_KEY">API Key</option>
              <option value="ADVWELL">AdvWell</option>
              <option value="DASHBOARD">Dashboard</option>
              <option value="EXTERNAL">Externa</option>
            </select>
          </div>

          <button
            onClick={limparAntigos}
            className="flex items-center px-3 py-2 text-gray-600 hover:text-gray-800 border rounded-lg hover:bg-gray-50"
          >
            <Trash2 size={18} className="mr-2" />
            Limpar antigos
          </button>
        </div>
      </div>

      {/* Tabela de requisicoes */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : requests.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Globe className="mx-auto h-12 w-12 text-gray-300 mb-4" />
            Nenhuma requisicao encontrada
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Metodo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Path</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Origem</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tempo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acoes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {requests.map((req) => (
                    <tr key={req.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs font-medium rounded ${getCorMetodo(req.metodo)}`}>
                          {req.metodo}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-900 font-mono">{req.path}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {req.sucesso ? (
                            <CheckCircle size={16} className="text-green-500" />
                          ) : (
                            <XCircle size={16} className="text-red-500" />
                          )}
                          <span className={`text-sm font-medium ${getCorStatus(req.statusCode)}`}>
                            {req.statusCode}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600">{req.origem || '-'}</span>
                        {req.apiKeyPrefixo && (
                          <span className="ml-1 text-xs text-gray-400">({req.apiKeyPrefixo}...)</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600">{req.responseTime}ms</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-500">{formatarData(req.createdAt)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => verDetalhes(req.id)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <Eye size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginacao */}
            {pagination && pagination.pages > 1 && (
              <div className="px-4 py-3 border-t flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  Pagina {pagination.page} de {pagination.pages} ({pagination.total} registros)
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
                  >
                    Anterior
                  </button>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={page === pagination.pages}
                    className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
                  >
                    Proximo
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal de detalhes */}
      {requestSelecionado && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-1 text-sm font-medium rounded ${getCorMetodo(requestSelecionado.metodo)}`}>
                    {requestSelecionado.metodo}
                  </span>
                  <span className="text-lg font-mono">{requestSelecionado.path}</span>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  {requestSelecionado.sucesso ? (
                    <span className="flex items-center text-green-600">
                      <CheckCircle size={16} className="mr-1" /> Sucesso
                    </span>
                  ) : (
                    <span className="flex items-center text-red-600">
                      <XCircle size={16} className="mr-1" /> Erro
                    </span>
                  )}
                  <span className={`font-medium ${getCorStatus(requestSelecionado.statusCode)}`}>
                    Status {requestSelecionado.statusCode}
                  </span>
                  <span className="text-gray-500">{requestSelecionado.responseTime}ms</span>
                </div>
              </div>
              <button
                onClick={() => setRequestSelecionado(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle size={24} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-gray-50 p-3 rounded-lg">
                <h4 className="text-sm font-medium text-gray-500 mb-1">Origem</h4>
                <p className="text-gray-900">{requestSelecionado.origem || '-'}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <h4 className="text-sm font-medium text-gray-500 mb-1">IP</h4>
                <p className="text-gray-900 font-mono">{requestSelecionado.ip || '-'}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <h4 className="text-sm font-medium text-gray-500 mb-1">Data/Hora</h4>
                <p className="text-gray-900">{formatarData(requestSelecionado.createdAt)}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <h4 className="text-sm font-medium text-gray-500 mb-1">API Key</h4>
                <p className="text-gray-900 font-mono">{requestSelecionado.apiKeyPrefixo || '-'}</p>
              </div>
            </div>

            {requestSelecionado.userAgent && (
              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-500 mb-1">User Agent</h4>
                <p className="text-xs text-gray-600 bg-gray-50 p-2 rounded font-mono break-all">
                  {requestSelecionado.userAgent}
                </p>
              </div>
            )}

            {requestSelecionado.erro && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <h4 className="text-sm font-medium text-red-800 mb-1">Erro</h4>
                <p className="text-red-700">{requestSelecionado.erro}</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {requestSelecionado.requestBody && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-1">Request Body</h4>
                  <pre className="text-xs bg-gray-900 text-green-400 p-3 rounded-lg overflow-x-auto max-h-48">
                    {JSON.stringify(requestSelecionado.requestBody, null, 2)}
                  </pre>
                </div>
              )}
              {requestSelecionado.responseBody && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-1">Response Body</h4>
                  <pre className="text-xs bg-gray-900 text-green-400 p-3 rounded-lg overflow-x-auto max-h-48">
                    {JSON.stringify(requestSelecionado.responseBody, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {(requestSelecionado.companyId || requestSelecionado.advogadoId || requestSelecionado.consultaId) && (
              <div className="mt-4 pt-4 border-t">
                <h4 className="text-sm font-medium text-gray-500 mb-2">Contexto</h4>
                <div className="flex flex-wrap gap-2">
                  {requestSelecionado.companyId && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                      Company: {requestSelecionado.companyId}
                    </span>
                  )}
                  {requestSelecionado.advogadoId && (
                    <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded">
                      Advogado: {requestSelecionado.advogadoId}
                    </span>
                  )}
                  {requestSelecionado.consultaId && (
                    <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                      Consulta: {requestSelecionado.consultaId}
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end mt-6 pt-4 border-t">
              <button
                onClick={() => setRequestSelecionado(null)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
