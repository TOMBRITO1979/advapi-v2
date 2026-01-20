import { useState, useEffect } from 'react';
import { consultasService } from '../services/api';
import {
  Search,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Filter,
  Eye,
  AlertTriangle,
  FileText,
  Server,
  Timer,
  Layers,
  Activity,
} from 'lucide-react';

interface Consulta {
  id: string;
  advogado: string;
  oab: string | null;
  status: string;
  dataInicio: string;
  dataFim: string;
  tribunal: string | null;
  publicacoesEncontradas: number | null;
  publicacoesNovas: number | null;
  tentativas: number;
  erro: string | null;
  duracaoMs: number | null;
  duracaoFormatada: string | null;
  paginasNavegadas: number | null;
  blocosProcessados: number | null;
  captchaDetectado: boolean;
  bloqueioDetectado: boolean;
  proxy: {
    host: string;
    porta: number;
    provedor: string | null;
  } | null;
  iniciadoEm: string | null;
  finalizadoEm: string | null;
  createdAt: string;
}

interface ConsultaDetalhes {
  id: string;
  status: string;
  createdAt: string;
  advogado: {
    id: string;
    nome: string;
    oab: string | null;
    ufOab: string | null;
  };
  parametros: {
    dataInicio: string;
    dataFim: string;
    tribunal: string | null;
  };
  resultado: {
    publicacoesEncontradas: number | null;
    publicacoesNovas: number | null;
    erro: string | null;
  };
  raspagem: {
    duracaoMs: number | null;
    duracaoFormatada: string | null;
    paginasNavegadas: number | null;
    blocosProcessados: number | null;
    captchaDetectado: boolean;
    bloqueioDetectado: boolean;
    detalhesExtras: any;
  };
  proxy: {
    id: string;
    host: string;
    porta: number;
    provedor: string | null;
    funcionando: boolean;
  } | null;
  execucao: {
    tentativas: number;
    maxTentativas: number;
    prioridade: number;
    agendadoPara: string;
    iniciadoEm: string | null;
    finalizadoEm: string | null;
  };
  publicacoesEncontradas: Array<{
    id: string;
    numeroProcesso: string;
    dataPublicacao: string;
    tipoComunicacao: string;
    status: string;
  }>;
}

interface Stats {
  resumo: {
    total: number;
    hoje: number;
    semana: number;
    pendentes: number;
    processando: number;
    concluidas: number;
    erros: number;
    canceladas: number;
  };
  problemas: {
    captchasDetectados: number;
    bloqueiosDetectados: number;
  };
  performance: {
    tempoMedioMs: number;
    tempoMedioFormatado: string;
    paginasMedias: number;
  };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export default function Consultas() {
  const [consultas, setConsultas] = useState<Consulta[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);

  // Filtros
  const [filtroStatus, setFiltroStatus] = useState<string>('');

  // Modal
  const [consultaSelecionada, setConsultaSelecionada] = useState<ConsultaDetalhes | null>(null);

  useEffect(() => {
    carregarDados();
  }, [page, filtroStatus]);

  useEffect(() => {
    carregarStats();
  }, []);

  const carregarDados = async () => {
    try {
      setLoading(true);
      const params: any = { page, limit: 50 };
      if (filtroStatus) params.status = filtroStatus;

      const res = await consultasService.listar(params);
      setConsultas(res.data.data);
      setPagination(res.data.pagination);
    } catch (error) {
      console.error('Erro ao carregar consultas:', error);
    } finally {
      setLoading(false);
    }
  };

  const carregarStats = async () => {
    try {
      const res = await consultasService.getStats();
      setStats(res.data);
    } catch (error) {
      console.error('Erro ao carregar estatisticas:', error);
    }
  };

  const verDetalhes = async (id: string) => {
    try {
      const res = await consultasService.buscar(id);
      setConsultaSelecionada(res.data);
    } catch (error) {
      console.error('Erro ao carregar detalhes:', error);
    }
  };

  const formatarData = (data: string) => {
    return new Date(data).toLocaleString('pt-BR');
  };

  const formatarDataCurta = (data: string) => {
    return new Date(data).toLocaleDateString('pt-BR');
  };

  const getCorStatus = (status: string) => {
    switch (status) {
      case 'CONCLUIDA':
        return 'bg-green-100 text-green-800';
      case 'PROCESSANDO':
        return 'bg-blue-100 text-blue-800';
      case 'PENDENTE':
        return 'bg-yellow-100 text-yellow-800';
      case 'ERRO':
        return 'bg-red-100 text-red-800';
      case 'CANCELADA':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getIconeStatus = (status: string) => {
    switch (status) {
      case 'CONCLUIDA':
        return <CheckCircle size={16} className="text-green-600" />;
      case 'PROCESSANDO':
        return <RefreshCw size={16} className="text-blue-600 animate-spin" />;
      case 'PENDENTE':
        return <Clock size={16} className="text-yellow-600" />;
      case 'ERRO':
        return <XCircle size={16} className="text-red-600" />;
      default:
        return <Clock size={16} className="text-gray-600" />;
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Consultas / Raspagens</h1>
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
              <Search className="h-8 w-8 text-blue-500" />
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
                <p className="text-sm text-gray-500">Concluidas</p>
                <p className="text-xl font-bold text-green-600">{stats.resumo.concluidas}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <Timer className="h-8 w-8 text-purple-500" />
              <div className="ml-3">
                <p className="text-sm text-gray-500">Tempo Medio</p>
                <p className="text-xl font-bold">{stats.performance.tempoMedioFormatado}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <XCircle className="h-8 w-8 text-red-500" />
              <div className="ml-3">
                <p className="text-sm text-gray-500">Erros</p>
                <p className="text-xl font-bold text-red-600">{stats.resumo.erros}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cards de problemas e performance */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-medium text-gray-900 mb-3 flex items-center">
              <Activity size={18} className="mr-2" />
              Status da Fila
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Pendentes</span>
                <span className="text-sm font-medium text-yellow-600">{stats.resumo.pendentes}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Processando</span>
                <span className="text-sm font-medium text-blue-600">{stats.resumo.processando}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Canceladas</span>
                <span className="text-sm font-medium text-gray-600">{stats.resumo.canceladas}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-medium text-gray-900 mb-3 flex items-center">
              <AlertTriangle size={18} className="mr-2 text-orange-500" />
              Problemas Detectados
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Captchas</span>
                <span className={`text-sm font-medium ${stats.problemas.captchasDetectados > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                  {stats.problemas.captchasDetectados}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Bloqueios</span>
                <span className={`text-sm font-medium ${stats.problemas.bloqueiosDetectados > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                  {stats.problemas.bloqueiosDetectados}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-medium text-gray-900 mb-3 flex items-center">
              <Layers size={18} className="mr-2" />
              Performance Media
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Duracao</span>
                <span className="text-sm font-medium">{stats.performance.tempoMedioFormatado}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Paginas/consulta</span>
                <span className="text-sm font-medium">{stats.performance.paginasMedias}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex items-center gap-3">
          <Filter size={20} className="text-gray-500" />

          <select
            value={filtroStatus}
            onChange={(e) => { setFiltroStatus(e.target.value); setPage(1); }}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos status</option>
            <option value="PENDENTE">Pendente</option>
            <option value="PROCESSANDO">Processando</option>
            <option value="CONCLUIDA">Concluida</option>
            <option value="ERRO">Erro</option>
            <option value="CANCELADA">Cancelada</option>
          </select>
        </div>
      </div>

      {/* Tabela de consultas */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : consultas.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Search className="mx-auto h-12 w-12 text-gray-300 mb-4" />
            Nenhuma consulta encontrada
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Advogado</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Periodo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Resultados</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duracao</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Problemas</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acoes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {consultas.map((consulta) => (
                    <tr key={consulta.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{consulta.advogado}</p>
                          {consulta.oab && (
                            <p className="text-xs text-gray-500">OAB: {consulta.oab}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded ${getCorStatus(consulta.status)}`}>
                          {getIconeStatus(consulta.status)}
                          {consulta.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600">
                          {formatarDataCurta(consulta.dataInicio)} - {formatarDataCurta(consulta.dataFim)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {consulta.publicacoesEncontradas !== null ? (
                          <div className="text-sm">
                            <span className="font-medium">{consulta.publicacoesEncontradas}</span>
                            <span className="text-gray-500"> encontradas</span>
                            {consulta.publicacoesNovas !== null && consulta.publicacoesNovas > 0 && (
                              <span className="ml-1 text-green-600">({consulta.publicacoesNovas} novas)</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {consulta.duracaoFormatada ? (
                          <div className="text-sm">
                            <span className="font-medium">{consulta.duracaoFormatada}</span>
                            {consulta.paginasNavegadas && (
                              <span className="text-gray-500 text-xs block">{consulta.paginasNavegadas} pags</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {consulta.captchaDetectado && (
                            <span className="px-2 py-0.5 text-xs bg-orange-100 text-orange-800 rounded" title="Captcha detectado">
                              CAPTCHA
                            </span>
                          )}
                          {consulta.bloqueioDetectado && (
                            <span className="px-2 py-0.5 text-xs bg-red-100 text-red-800 rounded" title="Bloqueio detectado">
                              BLOQUEIO
                            </span>
                          )}
                          {!consulta.captchaDetectado && !consulta.bloqueioDetectado && (
                            <span className="text-gray-400">-</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-500">{formatarData(consulta.createdAt)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => verDetalhes(consulta.id)}
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
      {consultaSelecionada && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {consultaSelecionada.advogado.nome}
                </h2>
                <div className="flex items-center gap-3 mt-2">
                  <span className={`inline-flex items-center gap-1 px-2 py-1 text-sm font-medium rounded ${getCorStatus(consultaSelecionada.status)}`}>
                    {getIconeStatus(consultaSelecionada.status)}
                    {consultaSelecionada.status}
                  </span>
                  {consultaSelecionada.advogado.oab && (
                    <span className="text-gray-500">OAB: {consultaSelecionada.advogado.oab}/{consultaSelecionada.advogado.ufOab}</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setConsultaSelecionada(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle size={24} />
              </button>
            </div>

            {/* Erro */}
            {consultaSelecionada.resultado.erro && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <h4 className="text-sm font-medium text-red-800 mb-1">Erro</h4>
                <p className="text-red-700">{consultaSelecionada.resultado.erro}</p>
              </div>
            )}

            {/* Parametros */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="bg-gray-50 p-3 rounded-lg">
                <h4 className="text-sm font-medium text-gray-500 mb-1">Data Inicio</h4>
                <p className="text-gray-900">{formatarDataCurta(consultaSelecionada.parametros.dataInicio)}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <h4 className="text-sm font-medium text-gray-500 mb-1">Data Fim</h4>
                <p className="text-gray-900">{formatarDataCurta(consultaSelecionada.parametros.dataFim)}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <h4 className="text-sm font-medium text-gray-500 mb-1">Tribunal</h4>
                <p className="text-gray-900">{consultaSelecionada.parametros.tribunal || 'Todos'}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <h4 className="text-sm font-medium text-gray-500 mb-1">Prioridade</h4>
                <p className="text-gray-900">{consultaSelecionada.execucao.prioridade}</p>
              </div>
            </div>

            {/* Resultados */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="bg-blue-50 p-3 rounded-lg">
                <h4 className="text-sm font-medium text-blue-800 mb-1">Publicacoes Encontradas</h4>
                <p className="text-2xl font-bold text-blue-900">{consultaSelecionada.resultado.publicacoesEncontradas || 0}</p>
              </div>
              <div className="bg-green-50 p-3 rounded-lg">
                <h4 className="text-sm font-medium text-green-800 mb-1">Publicacoes Novas</h4>
                <p className="text-2xl font-bold text-green-900">{consultaSelecionada.resultado.publicacoesNovas || 0}</p>
              </div>
              <div className="bg-purple-50 p-3 rounded-lg">
                <h4 className="text-sm font-medium text-purple-800 mb-1">Duracao</h4>
                <p className="text-2xl font-bold text-purple-900">{consultaSelecionada.raspagem.duracaoFormatada || '-'}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Tentativas</h4>
                <p className="text-2xl font-bold text-gray-900">{consultaSelecionada.execucao.tentativas}/{consultaSelecionada.execucao.maxTentativas}</p>
              </div>
            </div>

            {/* Detalhes de raspagem */}
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                <Activity size={18} className="mr-2" />
                Detalhes da Raspagem
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Paginas Navegadas</p>
                  <p className="font-medium">{consultaSelecionada.raspagem.paginasNavegadas || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Blocos Processados</p>
                  <p className="font-medium">{consultaSelecionada.raspagem.blocosProcessados || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Captcha Detectado</p>
                  <p className={`font-medium ${consultaSelecionada.raspagem.captchaDetectado ? 'text-orange-600' : 'text-green-600'}`}>
                    {consultaSelecionada.raspagem.captchaDetectado ? 'Sim' : 'Nao'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Bloqueio Detectado</p>
                  <p className={`font-medium ${consultaSelecionada.raspagem.bloqueioDetectado ? 'text-red-600' : 'text-green-600'}`}>
                    {consultaSelecionada.raspagem.bloqueioDetectado ? 'Sim' : 'Nao'}
                  </p>
                </div>
              </div>
            </div>

            {/* Proxy usado */}
            {consultaSelecionada.proxy && (
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                  <Server size={18} className="mr-2" />
                  Proxy Utilizado
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Host</p>
                    <p className="font-mono">{consultaSelecionada.proxy.host}:{consultaSelecionada.proxy.porta}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Provedor</p>
                    <p className="font-medium">{consultaSelecionada.proxy.provedor || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Status</p>
                    <p className={`font-medium ${consultaSelecionada.proxy.funcionando ? 'text-green-600' : 'text-red-600'}`}>
                      {consultaSelecionada.proxy.funcionando ? 'Funcionando' : 'Inativo'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Timestamps */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-gray-50 p-3 rounded-lg">
                <h4 className="text-sm font-medium text-gray-500 mb-1">Agendado Para</h4>
                <p className="text-gray-900">{formatarData(consultaSelecionada.execucao.agendadoPara)}</p>
              </div>
              {consultaSelecionada.execucao.iniciadoEm && (
                <div className="bg-gray-50 p-3 rounded-lg">
                  <h4 className="text-sm font-medium text-gray-500 mb-1">Iniciado Em</h4>
                  <p className="text-gray-900">{formatarData(consultaSelecionada.execucao.iniciadoEm)}</p>
                </div>
              )}
              {consultaSelecionada.execucao.finalizadoEm && (
                <div className="bg-gray-50 p-3 rounded-lg">
                  <h4 className="text-sm font-medium text-gray-500 mb-1">Finalizado Em</h4>
                  <p className="text-gray-900">{formatarData(consultaSelecionada.execucao.finalizadoEm)}</p>
                </div>
              )}
            </div>

            {/* Publicacoes encontradas */}
            {consultaSelecionada.publicacoesEncontradas && consultaSelecionada.publicacoesEncontradas.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <h4 className="font-medium text-gray-900 p-3 bg-gray-50 flex items-center">
                  <FileText size={18} className="mr-2" />
                  Publicacoes Encontradas ({consultaSelecionada.publicacoesEncontradas.length})
                </h4>
                <div className="divide-y max-h-48 overflow-y-auto">
                  {consultaSelecionada.publicacoesEncontradas.map((pub) => (
                    <div key={pub.id} className="p-3 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-mono text-sm">{pub.numeroProcesso}</p>
                          <p className="text-xs text-gray-500">
                            {pub.tipoComunicacao} - {formatarDataCurta(pub.dataPublicacao)}
                          </p>
                        </div>
                        <span className={`px-2 py-0.5 text-xs rounded ${
                          pub.status === 'ENVIADA' ? 'bg-green-100 text-green-800' :
                          pub.status === 'NOVA' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {pub.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end mt-6 pt-4 border-t">
              <button
                onClick={() => setConsultaSelecionada(null)}
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
