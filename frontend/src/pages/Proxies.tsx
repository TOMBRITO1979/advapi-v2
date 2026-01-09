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
} from 'lucide-react';

interface Proxy {
  id: string;
  host: string;
  porta: number;
  usuario: string | null;
  tipo: string;
  ativo: boolean;
  usosHoje: number;
  falhasConsecutivas: number;
  ultimoUso: string | null;
}

interface Stats {
  total: number;
  ativos: number;
  inativos: number;
  comFalhas: number;
  disponiveis: number;
}

export default function Proxies() {
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
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
      const [proxiesRes, statsRes] = await Promise.all([
        proxiesService.listar(),
        proxiesService.getEstatisticas(),
      ]);
      setProxies(proxiesRes.data.data);
      setStats(statsRes.data);
    } catch (error) {
      console.error('Erro ao carregar proxies:', error);
    } finally {
      setLoading(false);
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

    // Limpa input
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

      {/* Cards de estatisticas */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
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
              <XCircle className="h-8 w-8 text-red-500" />
              <div className="ml-3">
                <p className="text-sm text-gray-500">Com Falhas</p>
                <p className="text-xl font-bold">{stats.comFalhas}</p>
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
        </div>
      )}

      {/* Tabela */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : proxies.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Server className="mx-auto h-12 w-12 text-gray-300 mb-4" />
            Nenhum proxy cadastrado
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
                  Usos Hoje
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acoes
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {proxies.map((proxy) => (
                <tr key={proxy.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {proxy.host}
                    </div>
                    {proxy.usuario && (
                      <div className="text-xs text-gray-500">
                        {proxy.usuario}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {proxy.porta}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 uppercase">
                    {proxy.tipo}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {proxy.usosHoje}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {proxy.falhasConsecutivas > 0 ? (
                      <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">
                        {proxy.falhasConsecutivas} falhas
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
