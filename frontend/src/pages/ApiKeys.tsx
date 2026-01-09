import { useState, useEffect } from 'react';
import {
  Key,
  Plus,
  Copy,
  Trash2,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import api from '../services/api';

interface ApiKey {
  id: string;
  nome: string;
  prefixo: string;
  key?: string; // Apenas na criacao
  ativa: boolean;
  totalRequisicoes: number;
  ultimoUso: string | null;
  createdAt: string;
}

interface Stats {
  total: number;
  ativas: number;
  inativas: number;
  totalRequisicoes: number;
}

export default function ApiKeys() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal de criacao
  const [showModal, setShowModal] = useState(false);
  const [novaKeyNome, setNovaKeyNome] = useState('');
  const [criando, setCriando] = useState(false);

  // Key recem criada (para mostrar uma vez)
  const [keyRecemCriada, setKeyRecemCriada] = useState<string | null>(null);
  const [copiada, setCopiada] = useState(false);

  const carregarDados = async () => {
    try {
      setLoading(true);
      const [keysRes, statsRes] = await Promise.all([
        api.get('/api-keys'),
        api.get('/api-keys/stats'),
      ]);
      setApiKeys(keysRes.data);
      setStats(statsRes.data);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao carregar API keys');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, []);

  const criarKey = async () => {
    if (!novaKeyNome.trim()) return;

    try {
      setCriando(true);
      const res = await api.post('/api-keys', { nome: novaKeyNome.trim() });
      setKeyRecemCriada(res.data.key);
      setNovaKeyNome('');
      setShowModal(false);
      carregarDados();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao criar API key');
    } finally {
      setCriando(false);
    }
  };

  const toggleAtiva = async (id: string, ativa: boolean) => {
    try {
      await api.put(`/api-keys/${id}`, { ativa: !ativa });
      setApiKeys(keys =>
        keys.map(k => (k.id === id ? { ...k, ativa: !ativa } : k))
      );
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao atualizar API key');
    }
  };

  const excluirKey = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta API key?')) return;

    try {
      await api.delete(`/api-keys/${id}`);
      setApiKeys(keys => keys.filter(k => k.id !== id));
      carregarDados();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao excluir API key');
    }
  };

  const copiarKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiada(true);
    setTimeout(() => setCopiada(false), 2000);
  };

  const formatarData = (data: string | null) => {
    if (!data) return 'Nunca';
    return new Date(data).toLocaleString('pt-BR');
  };

  if (loading && !apiKeys.length) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
          <p className="text-sm text-gray-500">
            Gerencie as chaves de acesso para integracao com a API
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus size={20} className="mr-2" />
          Nova API Key
        </button>
      </div>

      {/* Erro */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center text-red-800">
            <AlertCircle className="h-5 w-5 mr-2" />
            {error}
          </div>
        </div>
      )}

      {/* Key recem criada */}
      {keyRecemCriada && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-800 font-medium flex items-center">
                <CheckCircle className="h-5 w-5 mr-2" />
                API Key criada com sucesso!
              </p>
              <p className="text-sm text-green-600 mt-1">
                Guarde esta key em local seguro. Ela nao sera mostrada novamente.
              </p>
            </div>
            <button
              onClick={() => setKeyRecemCriada(null)}
              className="text-green-600 hover:text-green-800"
            >
              &times;
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 bg-green-100 px-3 py-2 rounded text-sm font-mono break-all">
              {keyRecemCriada}
            </code>
            <button
              onClick={() => copiarKey(keyRecemCriada)}
              className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              {copiada ? <CheckCircle size={20} /> : <Copy size={20} />}
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">Total de Keys</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">Ativas</p>
            <p className="text-2xl font-bold text-green-600">{stats.ativas}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">Inativas</p>
            <p className="text-2xl font-bold text-gray-400">{stats.inativas}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">Total Requisicoes</p>
            <p className="text-2xl font-bold text-blue-600">{stats.totalRequisicoes}</p>
          </div>
        </div>
      )}

      {/* Lista de API Keys */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold flex items-center">
            <Key size={20} className="mr-2 text-gray-500" />
            Suas API Keys
          </h2>
        </div>

        {apiKeys.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Key size={48} className="mx-auto mb-4 text-gray-300" />
            <p>Nenhuma API key criada ainda.</p>
            <p className="text-sm">Clique em "Nova API Key" para criar uma.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b bg-gray-50">
                  <th className="px-4 py-3 font-medium">Nome</th>
                  <th className="px-4 py-3 font-medium">Key</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Requisicoes</th>
                  <th className="px-4 py-3 font-medium">Ultimo Uso</th>
                  <th className="px-4 py-3 font-medium">Criada em</th>
                  <th className="px-4 py-3 font-medium">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {apiKeys.map(key => (
                  <tr key={key.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{key.nome}</td>
                    <td className="px-4 py-3">
                      <code className="bg-gray-100 px-2 py-1 rounded text-sm">
                        advapi_sk_{key.prefixo}...
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          key.ativa
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {key.ativa ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">{key.totalRequisicoes}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatarData(key.ultimoUso)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatarData(key.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleAtiva(key.id, key.ativa)}
                          className={`p-1 rounded ${
                            key.ativa
                              ? 'text-green-600 hover:bg-green-50'
                              : 'text-gray-400 hover:bg-gray-100'
                          }`}
                          title={key.ativa ? 'Desativar' : 'Ativar'}
                        >
                          {key.ativa ? (
                            <ToggleRight size={20} />
                          ) : (
                            <ToggleLeft size={20} />
                          )}
                        </button>
                        <button
                          onClick={() => excluirKey(key.id)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded"
                          title="Excluir"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Documentacao rapida */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Como usar</h3>
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-medium text-gray-700">1. Adicione o header em suas requisicoes:</p>
            <code className="block bg-gray-100 p-3 rounded mt-2 overflow-x-auto">
              x-api-key: advapi_sk_sua_chave_aqui
            </code>
          </div>
          <div>
            <p className="font-medium text-gray-700">2. Exemplo de requisicao:</p>
            <code className="block bg-gray-100 p-3 rounded mt-2 overflow-x-auto whitespace-pre">
{`curl "https://api.advtom.com/api/consulta/buffer?companyId=...&advogadoNome=..." \\
  -H "x-api-key: advapi_sk_sua_chave_aqui"`}
            </code>
          </div>
        </div>
      </div>

      {/* Modal de criacao */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="p-4 border-b">
              <h3 className="text-lg font-semibold">Nova API Key</h3>
            </div>
            <div className="p-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nome da API Key
              </label>
              <input
                type="text"
                value={novaKeyNome}
                onChange={e => setNovaKeyNome(e.target.value)}
                placeholder="Ex: Producao, Teste, Integracao AdvWell"
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-2">
                De um nome descritivo para identificar onde esta key sera usada.
              </p>
            </div>
            <div className="p-4 border-t flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowModal(false);
                  setNovaKeyNome('');
                }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={criarKey}
                disabled={criando || !novaKeyNome.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {criando ? 'Criando...' : 'Criar API Key'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
