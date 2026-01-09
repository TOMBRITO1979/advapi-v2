import { useState, useEffect } from 'react';
import { advogadosService } from '../services/api';
import { Search, Plus, RefreshCw, ToggleLeft, ToggleRight, Pencil, Trash2 } from 'lucide-react';

interface Advogado {
  id: string;
  nome: string;
  oab: string | null;
  ufOab: string | null;
  ativo: boolean;
  totalPublicacoes: number;
  ultimaConsulta: string | null;
  criadoEm: string;
  totalAndamentos: number;
  ultimaSincronizacao: string | null;
  sincronizacaoAtiva: boolean;
}

export default function Advogados() {
  const [advogados, setAdvogados] = useState<Advogado[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroAtivo, setFiltroAtivo] = useState<boolean | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [novoAdvogado, setNovoAdvogado] = useState({ nome: '', oab: '', ufOab: '' });
  const [editAdvogado, setEditAdvogado] = useState<{ id: string; nome: string; oab: string; ufOab: string } | null>(null);
  const [consultarAoCriar, setConsultarAoCriar] = useState(true);

  useEffect(() => {
    carregarAdvogados();
  }, [busca, filtroAtivo, page]);

  const carregarAdvogados = async () => {
    try {
      setLoading(true);
      const res = await advogadosService.listar({
        busca: busca || undefined,
        ativo: filtroAtivo,
        page,
      });
      setAdvogados(res.data.data);
      setTotalPages(res.data.pagination.pages);
    } catch (error) {
      console.error('Erro ao carregar advogados:', error);
    } finally {
      setLoading(false);
    }
  };

  const criarAdvogado = async () => {
    if (!novoAdvogado.nome) return;

    try {
      const res = await advogadosService.criar(novoAdvogado);
      const advogadoId = res.data.id;

      // Se marcou para consultar automaticamente, dispara a consulta
      if (consultarAoCriar && advogadoId) {
        await advogadosService.consultar(advogadoId);
        alert('Advogado criado e consulta de processos iniciada!');
      }

      setShowModal(false);
      setNovoAdvogado({ nome: '', oab: '', ufOab: '' });
      setConsultarAoCriar(true);
      carregarAdvogados();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Erro ao criar advogado');
    }
  };

  const alternarAtivo = async (id: string, ativoAtual: boolean) => {
    try {
      await advogadosService.atualizar(id, { ativo: !ativoAtual });
      carregarAdvogados();
    } catch (error) {
      console.error('Erro ao atualizar advogado:', error);
    }
  };

  const dispararConsulta = async (id: string) => {
    try {
      await advogadosService.consultar(id);
      alert('Consulta adicionada na fila!');
    } catch (error: any) {
      alert(error.response?.data?.error || 'Erro ao disparar consulta');
    }
  };

  const abrirEdicao = (adv: Advogado) => {
    setEditAdvogado({
      id: adv.id,
      nome: adv.nome,
      oab: adv.oab || '',
      ufOab: adv.ufOab || '',
    });
    setShowEditModal(true);
  };

  const salvarEdicao = async () => {
    if (!editAdvogado) return;

    try {
      await advogadosService.atualizar(editAdvogado.id, {
        nome: editAdvogado.nome,
        oab: editAdvogado.oab || null,
        ufOab: editAdvogado.ufOab || null,
      });
      setShowEditModal(false);
      setEditAdvogado(null);
      carregarAdvogados();
      alert('Advogado atualizado com sucesso!');
    } catch (error: any) {
      alert(error.response?.data?.error || 'Erro ao atualizar advogado');
    }
  };

  const excluirAdvogado = async (id: string, nome: string) => {
    if (!confirm(`Tem certeza que deseja excluir o advogado "${nome}"?\n\nIsso ira desativar o advogado e parar o monitoramento.`)) {
      return;
    }

    try {
      await advogadosService.excluir(id);
      carregarAdvogados();
      alert('Advogado excluido com sucesso!');
    } catch (error: any) {
      alert(error.response?.data?.error || 'Erro ao excluir advogado');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Advogados</h1>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus size={20} className="mr-2" />
          Novo Advogado
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={20}
              />
              <input
                type="text"
                placeholder="Buscar por nome..."
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <select
            value={filtroAtivo === undefined ? '' : String(filtroAtivo)}
            onChange={(e) => {
              setFiltroAtivo(
                e.target.value === '' ? undefined : e.target.value === 'true'
              );
              setPage(1);
            }}
            className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos</option>
            <option value="true">Ativos</option>
            <option value="false">Inativos</option>
          </select>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : advogados.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            Nenhum advogado encontrado
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Nome
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  OAB
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Andamentos
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ultima Sync
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
              {advogados.map((adv) => (
                <tr key={adv.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {adv.nome}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">
                      {adv.oab ? `${adv.oab}/${adv.ufOab || ''}` : '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {adv.totalAndamentos || 0}
                    </div>
                    <div className="text-xs text-gray-500">
                      {adv.totalPublicacoes || 0} publicacoes
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {adv.ultimaSincronizacao
                        ? new Date(adv.ultimaSincronizacao).toLocaleString('pt-BR')
                        : 'Nunca'}
                    </div>
                    <div className={`text-xs ${adv.sincronizacaoAtiva ? 'text-green-600' : 'text-gray-400'}`}>
                      {adv.sincronizacaoAtiva ? 'Sync ativo' : 'Sync pausado'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => alternarAtivo(adv.id, adv.ativo)}
                      className={`flex items-center ${
                        adv.ativo ? 'text-green-600' : 'text-gray-400'
                      }`}
                    >
                      {adv.ativo ? (
                        <ToggleRight size={24} />
                      ) : (
                        <ToggleLeft size={24} />
                      )}
                      <span className="ml-2 text-sm">
                        {adv.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex gap-2">
                      <button
                        onClick={() => dispararConsulta(adv.id)}
                        className="text-blue-600 hover:text-blue-800"
                        title="Consultar agora"
                      >
                        <RefreshCw size={20} />
                      </button>
                      <button
                        onClick={() => abrirEdicao(adv)}
                        className="text-gray-600 hover:text-gray-800"
                        title="Editar"
                      >
                        <Pencil size={20} />
                      </button>
                      <button
                        onClick={() => excluirAdvogado(adv.id, adv.nome)}
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

        {/* Paginacao */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t flex items-center justify-between">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 border rounded disabled:opacity-50"
            >
              Anterior
            </button>
            <span className="text-sm text-gray-600">
              Pagina {page} de {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 border rounded disabled:opacity-50"
            >
              Proxima
            </button>
          </div>
        )}
      </div>

      {/* Modal novo advogado */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Novo Advogado</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome *
                </label>
                <input
                  type="text"
                  value={novoAdvogado.nome}
                  onChange={(e) =>
                    setNovoAdvogado({ ...novoAdvogado, nome: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Nome completo"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    OAB
                  </label>
                  <input
                    type="text"
                    value={novoAdvogado.oab}
                    onChange={(e) =>
                      setNovoAdvogado({ ...novoAdvogado, oab: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="123456"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    UF
                  </label>
                  <input
                    type="text"
                    value={novoAdvogado.ufOab}
                    onChange={(e) =>
                      setNovoAdvogado({ ...novoAdvogado, ufOab: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="SP"
                    maxLength={2}
                  />
                </div>
              </div>

              <div className="flex items-center mt-2">
                <input
                  type="checkbox"
                  id="consultarAoCriar"
                  checked={consultarAoCriar}
                  onChange={(e) => setConsultarAoCriar(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="consultarAoCriar" className="ml-2 block text-sm text-gray-700">
                  Buscar todos os processos automaticamente (ultimos 12 meses)
                </label>
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
                onClick={criarAdvogado}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Criar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar advogado */}
      {showEditModal && editAdvogado && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Editar Advogado</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome *
                </label>
                <input
                  type="text"
                  value={editAdvogado.nome}
                  onChange={(e) =>
                    setEditAdvogado({ ...editAdvogado, nome: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Nome completo"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    OAB
                  </label>
                  <input
                    type="text"
                    value={editAdvogado.oab}
                    onChange={(e) =>
                      setEditAdvogado({ ...editAdvogado, oab: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="123456"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    UF
                  </label>
                  <input
                    type="text"
                    value={editAdvogado.ufOab}
                    onChange={(e) =>
                      setEditAdvogado({ ...editAdvogado, ufOab: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="SP"
                    maxLength={2}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditAdvogado(null);
                }}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={salvarEdicao}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
