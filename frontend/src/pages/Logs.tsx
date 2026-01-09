import { useState, useEffect } from 'react';
import { logsService } from '../services/api';
import {
  AlertCircle,
  AlertTriangle,
  Info,
  XCircle,
  CheckCircle,
  Trash2,
  Eye,
  RefreshCw,
  Filter,
  Bell,
} from 'lucide-react';

interface Log {
  id: string;
  tipo: 'INFO' | 'ALERTA' | 'ERRO' | 'CRITICO';
  categoria: string;
  titulo: string;
  mensagem: string;
  proxyId: string | null;
  advogadoId: string | null;
  consultaId: string | null;
  lido: boolean;
  resolvido: boolean;
  resolvidoEm: string | null;
  createdAt: string;
}

interface Stats {
  total: number;
  naoLidos: number;
  erros: number;
  criticos: number;
  porCategoria: Record<string, number>;
}

export default function Logs() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState<string>('');
  const [filtroCategoria, setFiltroCategoria] = useState<string>('');
  const [filtroLido, setFiltroLido] = useState<string>('');
  const [logSelecionado, setLogSelecionado] = useState<Log | null>(null);

  useEffect(() => {
    carregarDados();
  }, [filtroTipo, filtroCategoria, filtroLido]);

  const carregarDados = async () => {
    try {
      setLoading(true);
      const params: any = { limit: 100 };
      if (filtroTipo) params.tipo = filtroTipo;
      if (filtroCategoria) params.categoria = filtroCategoria;
      if (filtroLido) params.lido = filtroLido === 'true';

      const [logsRes, statsRes] = await Promise.all([
        logsService.listar(params),
        logsService.getStats(),
      ]);
      setLogs(logsRes.data.data);
      setStats(statsRes.data);
    } catch (error) {
      console.error('Erro ao carregar logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const marcarLido = async (id: string) => {
    try {
      await logsService.marcarLido(id);
      carregarDados();
    } catch (error) {
      console.error('Erro ao marcar como lido:', error);
    }
  };

  const marcarResolvido = async (id: string) => {
    try {
      await logsService.marcarResolvido(id);
      setLogSelecionado(null);
      carregarDados();
    } catch (error) {
      console.error('Erro ao marcar como resolvido:', error);
    }
  };

  const marcarTodosLidos = async () => {
    try {
      const res = await logsService.marcarTodosLidos();
      alert(res.data.message);
      carregarDados();
    } catch (error) {
      console.error('Erro ao marcar todos como lidos:', error);
    }
  };

  const excluirLog = async (id: string) => {
    if (!confirm('Excluir este log?')) return;

    try {
      await logsService.excluir(id);
      setLogSelecionado(null);
      carregarDados();
    } catch (error) {
      console.error('Erro ao excluir log:', error);
    }
  };

  const limparAntigos = async () => {
    if (!confirm('Limpar logs resolvidos com mais de 30 dias?')) return;

    try {
      const res = await logsService.limparAntigos();
      alert(res.data.message);
      carregarDados();
    } catch (error) {
      console.error('Erro ao limpar logs:', error);
    }
  };

  const getIconeTipo = (tipo: string) => {
    switch (tipo) {
      case 'CRITICO':
        return <XCircle className="h-5 w-5 text-red-600" />;
      case 'ERRO':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      case 'ALERTA':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      default:
        return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  const getCorTipo = (tipo: string) => {
    switch (tipo) {
      case 'CRITICO':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'ERRO':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'ALERTA':
        return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      default:
        return 'bg-blue-50 text-blue-700 border-blue-200';
    }
  };

  const formatarData = (data: string) => {
    return new Date(data).toLocaleString('pt-BR');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Logs do Sistema</h1>
          {stats && stats.naoLidos > 0 && (
            <span className="px-3 py-1 text-sm font-medium rounded-full bg-red-100 text-red-800">
              {stats.naoLidos} nao lidos
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={carregarDados}
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
              <Bell className="h-8 w-8 text-blue-500" />
              <div className="ml-3">
                <p className="text-sm text-gray-500">Total</p>
                <p className="text-xl font-bold">{stats.total}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <AlertCircle className="h-8 w-8 text-orange-500" />
              <div className="ml-3">
                <p className="text-sm text-gray-500">Nao Lidos</p>
                <p className="text-xl font-bold text-orange-600">{stats.naoLidos}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <AlertTriangle className="h-8 w-8 text-red-500" />
              <div className="ml-3">
                <p className="text-sm text-gray-500">Erros</p>
                <p className="text-xl font-bold text-red-600">{stats.erros}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <XCircle className="h-8 w-8 text-red-700" />
              <div className="ml-3">
                <p className="text-sm text-gray-500">Criticos</p>
                <p className="text-xl font-bold text-red-700">{stats.criticos}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Barra de filtros e acoes */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Filtros */}
          <div className="flex items-center gap-3">
            <Filter size={20} className="text-gray-500" />

            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos os tipos</option>
              <option value="CRITICO">Critico</option>
              <option value="ERRO">Erro</option>
              <option value="ALERTA">Alerta</option>
              <option value="INFO">Info</option>
            </select>

            <select
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
              className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todas categorias</option>
              <option value="PROXY">Proxy</option>
              <option value="SCRAPER">Scraper</option>
              <option value="CALLBACK">Callback</option>
              <option value="SISTEMA">Sistema</option>
            </select>

            <select
              value={filtroLido}
              onChange={(e) => setFiltroLido(e.target.value)}
              className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos</option>
              <option value="false">Nao lidos</option>
              <option value="true">Lidos</option>
            </select>
          </div>

          {/* Acoes em lote */}
          <div className="flex gap-2">
            {stats && stats.naoLidos > 0 && (
              <button
                onClick={marcarTodosLidos}
                className="flex items-center px-3 py-2 text-blue-600 hover:text-blue-800 border border-blue-300 rounded-lg hover:bg-blue-50"
              >
                <Eye size={18} className="mr-2" />
                Marcar todos como lidos
              </button>
            )}
            <button
              onClick={limparAntigos}
              className="flex items-center px-3 py-2 text-gray-600 hover:text-gray-800 border rounded-lg hover:bg-gray-50"
            >
              <Trash2 size={18} className="mr-2" />
              Limpar antigos
            </button>
          </div>
        </div>
      </div>

      {/* Lista de logs */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Bell className="mx-auto h-12 w-12 text-gray-300 mb-4" />
            Nenhum log encontrado
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {logs.map((log) => (
              <div
                key={log.id}
                className={`p-4 hover:bg-gray-50 cursor-pointer ${
                  !log.lido ? 'bg-blue-50' : ''
                } ${log.resolvido ? 'opacity-60' : ''}`}
                onClick={() => {
                  setLogSelecionado(log);
                  if (!log.lido) marcarLido(log.id);
                }}
              >
                <div className="flex items-start gap-4">
                  {/* Icone */}
                  <div className="flex-shrink-0 mt-1">{getIconeTipo(log.tipo)}</div>

                  {/* Conteudo */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded border ${getCorTipo(
                          log.tipo
                        )}`}
                      >
                        {log.tipo}
                      </span>
                      <span className="px-2 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-600">
                        {log.categoria}
                      </span>
                      {!log.lido && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-600">
                          Novo
                        </span>
                      )}
                      {log.resolvido && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded bg-green-100 text-green-600">
                          Resolvido
                        </span>
                      )}
                    </div>

                    <h3 className="text-sm font-medium text-gray-900">{log.titulo}</h3>
                    <p className="text-sm text-gray-500 truncate">{log.mensagem}</p>

                    <p className="text-xs text-gray-400 mt-1">{formatarData(log.createdAt)}</p>
                  </div>

                  {/* Acoes */}
                  <div className="flex-shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        excluirLog(log.id);
                      }}
                      className="text-gray-400 hover:text-red-600"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal detalhes do log */}
      {logSelecionado && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                {getIconeTipo(logSelecionado.tipo)}
                <div>
                  <h2 className="text-xl font-bold">{logSelecionado.titulo}</h2>
                  <div className="flex gap-2 mt-1">
                    <span
                      className={`px-2 py-0.5 text-xs font-medium rounded border ${getCorTipo(
                        logSelecionado.tipo
                      )}`}
                    >
                      {logSelecionado.tipo}
                    </span>
                    <span className="px-2 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-600">
                      {logSelecionado.categoria}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setLogSelecionado(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-1">Mensagem</h3>
                <p className="text-gray-900 bg-gray-50 p-3 rounded-lg whitespace-pre-wrap">
                  {logSelecionado.mensagem}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-1">Data/Hora</h3>
                  <p className="text-gray-900">{formatarData(logSelecionado.createdAt)}</p>
                </div>
                {logSelecionado.resolvidoEm && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-1">Resolvido em</h3>
                    <p className="text-gray-900">{formatarData(logSelecionado.resolvidoEm)}</p>
                  </div>
                )}
              </div>

              {(logSelecionado.proxyId ||
                logSelecionado.advogadoId ||
                logSelecionado.consultaId) && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-1">Referencias</h3>
                  <div className="text-sm text-gray-600 space-y-1">
                    {logSelecionado.proxyId && <p>Proxy ID: {logSelecionado.proxyId}</p>}
                    {logSelecionado.advogadoId && <p>Advogado ID: {logSelecionado.advogadoId}</p>}
                    {logSelecionado.consultaId && <p>Consulta ID: {logSelecionado.consultaId}</p>}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              {!logSelecionado.resolvido && (
                <button
                  onClick={() => marcarResolvido(logSelecionado.id)}
                  className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  <CheckCircle size={18} className="mr-2" />
                  Marcar como Resolvido
                </button>
              )}
              <button
                onClick={() => excluirLog(logSelecionado.id)}
                className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                <Trash2 size={18} className="mr-2" />
                Excluir
              </button>
              <button
                onClick={() => setLogSelecionado(null)}
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
