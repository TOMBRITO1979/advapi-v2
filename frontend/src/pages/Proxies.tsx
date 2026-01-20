import { useState, useEffect, useRef } from 'react';
import { proxiesService } from '../services/api';
import {
  Plus,
  Upload,
  Trash2,
  Play,
  Server,
  CheckCircle,
  XCircle,
  RefreshCw,
  RotateCcw,
  AlertTriangle,
  Filter,
  ShieldAlert,
  Activity,
  Ban,
} from 'lucide-react';

interface Proxy {
  id: string;
  host: string;
  porta: number;
  usuario: string | null;
  tipo: string;
  ativo: boolean;
  funcionando: boolean;
  usosHoje: number;
  falhasConsecutivas: number;
  ultimoUso: string | null;
  ultimoErro: string | null;
  totalConsultas: number;
  consultasSucesso: number;
  consultasFalha: number;
  bloqueadoCnj?: boolean;
  dataBloqueioCnj?: string | null;
  necessitaSubstituicao?: boolean;
}

interface Stats {
  total: number;
  ativos: number;
  inativos: number;
  comFalhas: number;
  disponiveis: number;
  bloqueadosCnj?: number;
  necessitamSubstituicao?: number;
}

interface ProxyAlerta {
  id: string;
  host: string;
  porta: number;
  dataBloqueioCnj?: string;
  falhasConsecutivas?: number;
  ultimoErro?: string;
}

interface Alertas {
  total: number;
  bloqueadosCnj: ProxyAlerta[];
  comMuitasFalhas: ProxyAlerta[];
  comAlgumasFalhas: ProxyAlerta[];
}

type FiltroStatus = 'todos' | 'funcionando' | 'falhos';

export default function Proxies() {
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [alertas, setAlertas] = useState<Alertas | null>(null);
  const [loading, setLoading] = useState(true);
  const [executandoHealthCheck, setExecutandoHealthCheck] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('todos');
  const [novoProxy, setNovoProxy] = useState({
    host: '',
    porta: '',
    usuario: '',
    senha: '',
    tipo: 'http',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      setLoading(true);
      const [proxiesRes, statsRes, alertasRes] = await Promise.all([
        proxiesService.listar({ limit: 500 }),
        proxiesService.getEstatisticas(),
        proxiesService.getAlertas(),
      ]);
      setProxies(proxiesRes.data.data);
      setStats(statsRes.data);
      setAlertas(alertasRes.data);
    } catch (error) {
      console.error('Erro ao carregar proxies:', error);
    } finally {
      setLoading(false);
    }
  };

  const executarHealthCheck = async () => {
    if (executandoHealthCheck) return;

    if (!confirm('Executar health check em todos os proxies? Isso pode demorar alguns minutos.')) return;

    try {
      setExecutandoHealthCheck(true);
      const res = await proxiesService.executarHealthCheck();
      alert(`${res.data.message}\n\nAcompanhe o progresso nos logs do sistema.`);
    } catch (error) {
      console.error('Erro ao executar health check:', error);
      alert('Erro ao iniciar health check');
    } finally {
      setExecutandoHealthCheck(false);
    }
  };

  const criarProxy = async () => {
    if (!novoProxy.host || !novoProxy.porta) return;

    try {
      await proxiesService.criar({
        ...novoProxy,
        porta: parseInt(novoProxy.porta),
      });
      setShowModal(false);
      setNovoProxy({ host: '', porta: '', usuario: '', senha: '', tipo: 'http' });
      carregarDados();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Erro ao criar proxy');
    }
  };

  const uploadArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const res = await proxiesService.upload(file);
      alert(
        `Upload concluido!\nInseridos: ${res.data.resultados.inseridos}\nDuplicados: ${res.data.resultados.duplicados}\nErros: ${res.data.resultados.erros}`
      );
      carregarDados();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Erro ao fazer upload');
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const excluirProxy = async (id: string) => {
    if (!confirm('Excluir este proxy?')) return;

    try {
      await proxiesService.excluir(id);
      carregarDados();
    } catch (error) {
      console.error('Erro ao excluir proxy:', error);
    }
  };

  const testarProxy = async (id: string) => {
    try {
      const res = await proxiesService.testar(id);
      if (res.data.sucesso) {
        alert('Proxy funcionando!');
      } else {
        alert(`Falha: ${res.data.message}`);
      }
      carregarDados();
    } catch (error) {
      console.error('Erro ao testar proxy:', error);
    }
  };

  const resetarProxy = async (id: string) => {
    try {
      await proxiesService.resetar(id);
      carregarDados();
    } catch (error) {
      console.error('Erro ao resetar proxy:', error);
    }
  };

  const resetarTodos = async () => {
    if (!confirm('Resetar status de todos os proxies com falha?')) return;

    try {
      const res = await proxiesService.resetarTodos();
      alert(res.data.message);
      carregarDados();
    } catch (error) {
      console.error('Erro ao resetar proxies:', error);
    }
  };

  const excluirFalhos = async () => {
    if (!confirm('Excluir TODOS os proxies que nao estao funcionando? Esta acao nao pode ser desfeita!')) return;

    try {
      const res = await proxiesService.excluirFalhos();
      alert(res.data.message);
      carregarDados();
    } catch (error) {
      console.error('Erro ao excluir proxies:', error);
    }
  };

  // Filtra proxies
  const proxiesFiltrados = proxies.filter((proxy) => {
    if (filtroStatus === 'funcionando') return proxy.funcionando;
    if (filtroStatus === 'falhos') return !proxy.funcionando;
    return true;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Proxies</h1>
        <div className="flex gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={uploadArquivo}
            accept=".xlsx,.xls,.csv"
            className="hidden"
          />
          <button
            onClick={executarHealthCheck}
            disabled={executandoHealthCheck}
            className="flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
          >
            <Activity size={20} className="mr-2" />
            {executandoHealthCheck ? 'Executando...' : 'Health Check'}
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <Upload size={20} className="mr-2" />
            Upload Planilha
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus size={20} className="mr-2" />
            Novo Proxy
          </button>
        </div>
      </div>

      {/* Banner de Alertas - Proxies Bloqueados CNJ */}
      {alertas && alertas.bloqueadosCnj.length > 0 && (
        <div className="mb-6 bg-red-50 border-l-4 border-red-500 rounded-lg p-4">
          <div className="flex items-start">
            <Ban className="h-6 w-6 text-red-500 mt-0.5" />
            <div className="ml-3 flex-1">
              <h3 className="text-red-800 font-semibold flex items-center">
                <ShieldAlert className="h-5 w-5 mr-2" />
                {alertas.bloqueadosCnj.length} Proxy(s) Bloqueado(s) pelo CNJ
              </h3>
              <p className="text-red-700 text-sm mt-1">
                Estes proxies foram detectados como bloqueados pelo CNJ e precisam ser substituidos urgentemente.
              </p>
              <div className="mt-3 space-y-2">
                {alertas.bloqueadosCnj.map((proxy) => (
                  <div key={proxy.id} className="flex items-center justify-between bg-red-100 rounded px-3 py-2">
                    <div>
                      <span className="font-mono text-red-900">{proxy.host}:{proxy.porta}</span>
                      {proxy.dataBloqueioCnj && (
                        <span className="text-red-600 text-xs ml-2">
                          (bloqueado em {new Date(proxy.dataBloqueioCnj).toLocaleString('pt-BR')})
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => excluirProxy(proxy.id)}
                      className="text-red-700 hover:text-red-900 text-sm underline"
                    >
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Banner de Alertas - Proxies com Muitas Falhas */}
      {alertas && alertas.comMuitasFalhas.length > 0 && (
        <div className="mb-6 bg-orange-50 border-l-4 border-orange-500 rounded-lg p-4">
          <div className="flex items-start">
            <AlertTriangle className="h-6 w-6 text-orange-500 mt-0.5" />
            <div className="ml-3 flex-1">
              <h3 className="text-orange-800 font-semibold">
                {alertas.comMuitasFalhas.length} Proxy(s) com Muitas Falhas (5+)
              </h3>
              <p className="text-orange-700 text-sm mt-1">
                Estes proxies tiveram 5 ou mais falhas consecutivas e podem precisar de substituicao.
              </p>
              <div className="mt-3 space-y-2">
                {alertas.comMuitasFalhas.map((proxy) => (
                  <div key={proxy.id} className="flex items-center justify-between bg-orange-100 rounded px-3 py-2">
                    <div>
                      <span className="font-mono text-orange-900">{proxy.host}:{proxy.porta}</span>
                      <span className="text-orange-600 text-xs ml-2">
                        ({proxy.falhasConsecutivas} falhas)
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => resetarProxy(proxy.id)}
                        className="text-orange-700 hover:text-orange-900 text-sm underline"
                      >
                        Resetar
                      </button>
                      <button
                        onClick={() => excluirProxy(proxy.id)}
                        className="text-red-700 hover:text-red-900 text-sm underline"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Banner de Alertas - Proxies com Algumas Falhas (Warning) */}
      {alertas && alertas.comAlgumasFalhas.length > 0 && (
        <div className="mb-6 bg-yellow-50 border-l-4 border-yellow-500 rounded-lg p-4">
          <div className="flex items-start">
            <AlertTriangle className="h-6 w-6 text-yellow-500 mt-0.5" />
            <div className="ml-3 flex-1">
              <h3 className="text-yellow-800 font-semibold">
                {alertas.comAlgumasFalhas.length} Proxy(s) com Falhas Intermitentes (3-4)
              </h3>
              <p className="text-yellow-700 text-sm mt-1">
                Estes proxies apresentaram algumas falhas e devem ser monitorados.
              </p>
              <details className="mt-2">
                <summary className="text-yellow-700 text-sm cursor-pointer hover:underline">
                  Ver detalhes
                </summary>
                <div className="mt-2 space-y-1">
                  {alertas.comAlgumasFalhas.map((proxy) => (
                    <div key={proxy.id} className="text-sm text-yellow-800">
                      <span className="font-mono">{proxy.host}:{proxy.porta}</span>
                      <span className="ml-2">({proxy.falhasConsecutivas} falhas)</span>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          </div>
        </div>
      )}

      {/* Cards de estatisticas */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <Server className="h-8 w-8 text-blue-500" />
              <div className="ml-3">
                <p className="text-sm text-gray-500">Total</p>
                <p className="text-xl font-bold">{stats.total}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <CheckCircle className="h-8 w-8 text-green-500" />
              <div className="ml-3">
                <p className="text-sm text-gray-500">Ativos</p>
                <p className="text-xl font-bold">{stats.ativos}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <Server className="h-8 w-8 text-purple-500" />
              <div className="ml-3">
                <p className="text-sm text-gray-500">Disponiveis</p>
                <p className="text-xl font-bold">{stats.disponiveis}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <XCircle className="h-8 w-8 text-red-500" />
              <div className="ml-3">
                <p className="text-sm text-gray-500">Com Falhas</p>
                <p className="text-xl font-bold text-red-600">{stats.comFalhas}</p>
              </div>
            </div>
          </div>
          <div className={`rounded-lg shadow p-4 ${(stats.bloqueadosCnj || 0) > 0 ? 'bg-red-50 border border-red-200' : 'bg-white'}`}>
            <div className="flex items-center">
              <Ban className={`h-8 w-8 ${(stats.bloqueadosCnj || 0) > 0 ? 'text-red-600' : 'text-gray-400'}`} />
              <div className="ml-3">
                <p className="text-sm text-gray-500">Bloqueados CNJ</p>
                <p className={`text-xl font-bold ${(stats.bloqueadosCnj || 0) > 0 ? 'text-red-600' : ''}`}>
                  {stats.bloqueadosCnj || 0}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <AlertTriangle className="h-8 w-8 text-yellow-500" />
              <div className="ml-3">
                <p className="text-sm text-gray-500">Inativos</p>
                <p className="text-xl font-bold">{stats.inativos}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Barra de acoes */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Filtros */}
          <div className="flex items-center gap-2">
            <Filter size={20} className="text-gray-500" />
            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value as FiltroStatus)}
              className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="todos">Todos ({proxies.length})</option>
              <option value="funcionando">
                Funcionando ({proxies.filter((p) => p.funcionando).length})
              </option>
              <option value="falhos">
                Com Falhas ({proxies.filter((p) => !p.funcionando).length})
              </option>
            </select>
          </div>

          {/* Acoes em lote */}
          <div className="flex gap-2">
            <button
              onClick={carregarDados}
              className="flex items-center px-3 py-2 text-gray-600 hover:text-gray-900 border rounded-lg hover:bg-gray-50"
            >
              <RefreshCw size={18} className="mr-2" />
              Atualizar
            </button>
            {stats && stats.comFalhas > 0 && (
              <>
                <button
                  onClick={resetarTodos}
                  className="flex items-center px-3 py-2 text-yellow-600 hover:text-yellow-800 border border-yellow-300 rounded-lg hover:bg-yellow-50"
                >
                  <RotateCcw size={18} className="mr-2" />
                  Resetar Falhos ({stats.comFalhas})
                </button>
                <button
                  onClick={excluirFalhos}
                  className="flex items-center px-3 py-2 text-red-600 hover:text-red-800 border border-red-300 rounded-lg hover:bg-red-50"
                >
                  <Trash2 size={18} className="mr-2" />
                  Excluir Falhos ({stats.comFalhas})
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : proxiesFiltrados.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Server className="mx-auto h-12 w-12 text-gray-300 mb-4" />
            {filtroStatus === 'todos'
              ? 'Nenhum proxy cadastrado'
              : filtroStatus === 'funcionando'
              ? 'Nenhum proxy funcionando'
              : 'Nenhum proxy com falhas'}
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Host
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Porta
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tipo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Usos
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Erro
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acoes
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {proxiesFiltrados.map((proxy) => (
                <tr key={proxy.id} className={proxy.bloqueadoCnj ? 'bg-red-100' : !proxy.funcionando ? 'bg-red-50' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {proxy.host}
                    </div>
                    {proxy.usuario && (
                      <div className="text-xs text-gray-500">{proxy.usuario}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {proxy.porta}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 uppercase">
                    {proxy.tipo}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{proxy.totalConsultas || 0}</div>
                    <div className="text-xs text-gray-500">
                      <span className="text-green-600">{proxy.consultasSucesso || 0}</span>
                      {' / '}
                      <span className="text-red-600">{proxy.consultasFalha || 0}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {proxy.bloqueadoCnj ? (
                      <span className="px-2 py-1 text-xs rounded-full bg-red-200 text-red-900 font-semibold">
                        Bloqueado CNJ
                      </span>
                    ) : !proxy.funcionando ? (
                      <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">
                        Falhou
                      </span>
                    ) : proxy.ativo ? (
                      <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                        OK
                      </span>
                    ) : (
                      <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800">
                        Inativo
                      </span>
                    )}
                    {proxy.falhasConsecutivas > 0 && !proxy.bloqueadoCnj && (
                      <span className="ml-1 text-xs text-orange-600">
                        ({proxy.falhasConsecutivas} falhas)
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {proxy.ultimoErro && (
                      <div className="text-xs text-red-600 max-w-xs truncate" title={proxy.ultimoErro}>
                        {proxy.ultimoErro}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex gap-2">
                      <button
                        onClick={() => testarProxy(proxy.id)}
                        className="text-blue-600 hover:text-blue-800"
                        title="Testar"
                      >
                        <Play size={20} />
                      </button>
                      {!proxy.funcionando && (
                        <button
                          onClick={() => resetarProxy(proxy.id)}
                          className="text-yellow-600 hover:text-yellow-800"
                          title="Resetar status"
                        >
                          <RotateCcw size={20} />
                        </button>
                      )}
                      <button
                        onClick={() => excluirProxy(proxy.id)}
                        className="text-red-600 hover:text-red-800"
                        title="Excluir"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal novo proxy */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Novo Proxy</h2>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Host *
                  </label>
                  <input
                    type="text"
                    value={novoProxy.host}
                    onChange={(e) =>
                      setNovoProxy({ ...novoProxy, host: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="1.2.3.4"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Porta *
                  </label>
                  <input
                    type="text"
                    value={novoProxy.porta}
                    onChange={(e) =>
                      setNovoProxy({ ...novoProxy, porta: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="8080"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Usuario
                  </label>
                  <input
                    type="text"
                    value={novoProxy.usuario}
                    onChange={(e) =>
                      setNovoProxy({ ...novoProxy, usuario: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Senha
                  </label>
                  <input
                    type="password"
                    value={novoProxy.senha}
                    onChange={(e) =>
                      setNovoProxy({ ...novoProxy, senha: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo
                </label>
                <select
                  value={novoProxy.tipo}
                  onChange={(e) =>
                    setNovoProxy({ ...novoProxy, tipo: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="http">HTTP</option>
                  <option value="https">HTTPS</option>
                  <option value="socks5">SOCKS5</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={criarProxy}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Criar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
