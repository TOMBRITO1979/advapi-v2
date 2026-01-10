import { useState, useEffect } from 'react';
import { publicacoesService } from '../services/api';
import { Search, Eye, Send, FileText } from 'lucide-react';
import { format } from 'date-fns';

interface Publicacao {
  id: string;
  numeroProcesso: string;
  siglaTribunal: string | null;
  dataPublicacao: string | null;
  tipoComunicacao: string | null;
  textoComunicacao: string | null;
  textoLimpo: string | null;
  status: string;
  enviadoAdvwell: boolean;
  advogado: {
    id: string;
    nome: string;
    oab: string | null;
  };
  criadoEm: string;
}

export default function Publicacoes() {
  const [publicacoes, setPublicacoes] = useState<Publicacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selected, setSelected] = useState<Publicacao | null>(null);

  useEffect(() => {
    carregarPublicacoes();
  }, [busca, filtroStatus, page]);

  const carregarPublicacoes = async () => {
    try {
      setLoading(true);
      const res = await publicacoesService.listar({
        busca: busca || undefined,
        status: filtroStatus || undefined,
        page,
      });
      setPublicacoes(res.data.data);
      setTotalPages(res.data.pagination.pages);
    } catch (error) {
      console.error('Erro ao carregar publicacoes:', error);
    } finally {
      setLoading(false);
    }
  };

  const reenviar = async (id: string) => {
    try {
      await publicacoesService.reenviar(id);
      alert('Publicacao reenviada!');
      carregarPublicacoes();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Erro ao reenviar');
    }
  };

  const statusColors: Record<string, string> = {
    NOVA: 'bg-blue-100 text-blue-800',
    VISUALIZADA: 'bg-yellow-100 text-yellow-800',
    PROCESSADA: 'bg-green-100 text-green-800',
    ARQUIVADA: 'bg-gray-100 text-gray-800',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Publicacoes</h1>
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
                placeholder="Buscar por numero do processo..."
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
            value={filtroStatus}
            onChange={(e) => {
              setFiltroStatus(e.target.value);
              setPage(1);
            }}
            className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos os status</option>
            <option value="NOVA">Nova</option>
            <option value="VISUALIZADA">Visualizada</option>
            <option value="PROCESSADA">Processada</option>
            <option value="ARQUIVADA">Arquivada</option>
          </select>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : publicacoes.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <FileText className="mx-auto h-12 w-12 text-gray-300 mb-4" />
            Nenhuma publicacao encontrada
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Processo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Advogado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Data
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Enviado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acoes
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {publicacoes.map((pub) => (
                <tr key={pub.id}>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">
                      {pub.numeroProcesso}
                    </div>
                    <div className="text-xs text-gray-500">
                      {pub.siglaTribunal || '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {pub.advogado.nome}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">
                      {pub.dataPublicacao
                        ? format(new Date(pub.dataPublicacao), 'dd/MM/yyyy')
                        : '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${statusColors[pub.status] || 'bg-gray-100'}`}
                    >
                      {pub.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`text-xs ${pub.enviadoAdvwell ? 'text-green-600' : 'text-gray-400'}`}
                    >
                      {pub.enviadoAdvwell ? 'Sim' : 'Nao'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelected(pub)}
                        className="text-gray-600 hover:text-gray-900"
                        title="Ver detalhes"
                      >
                        <Eye size={20} />
                      </button>
                      {!pub.enviadoAdvwell && (
                        <button
                          onClick={() => reenviar(pub.id)}
                          className="text-blue-600 hover:text-blue-800"
                          title="Reenviar"
                        >
                          <Send size={20} />
                        </button>
                      )}
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

      {/* Modal detalhes */}
      {selected && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Detalhes da Publicacao</h2>

            <dl className="divide-y">
              <div className="py-3 flex justify-between">
                <dt className="font-medium text-gray-500">Processo</dt>
                <dd className="text-gray-900">{selected.numeroProcesso}</dd>
              </div>
              <div className="py-3 flex justify-between">
                <dt className="font-medium text-gray-500">Tribunal</dt>
                <dd className="text-gray-900">{selected.siglaTribunal || '-'}</dd>
              </div>
              <div className="py-3 flex justify-between">
                <dt className="font-medium text-gray-500">Data Publicacao</dt>
                <dd className="text-gray-900">
                  {selected.dataPublicacao
                    ? format(new Date(selected.dataPublicacao), 'dd/MM/yyyy')
                    : '-'}
                </dd>
              </div>
              <div className="py-3 flex justify-between">
                <dt className="font-medium text-gray-500">Tipo</dt>
                <dd className="text-gray-900">
                  {selected.tipoComunicacao || '-'}
                </dd>
              </div>
              <div className="py-3 flex justify-between">
                <dt className="font-medium text-gray-500">Advogado</dt>
                <dd className="text-gray-900">{selected.advogado.nome}</dd>
              </div>
              {(selected.textoLimpo || selected.textoComunicacao) && (
                <div className="py-3">
                  <dt className="font-medium text-gray-500 mb-2">Texto</dt>
                  <dd className="text-gray-900 text-sm bg-gray-50 p-3 rounded whitespace-pre-wrap max-h-60 overflow-y-auto">
                    {selected.textoLimpo || selected.textoComunicacao}
                  </dd>
                </div>
              )}
            </dl>

            <div className="flex justify-end mt-6">
              <button
                onClick={() => setSelected(null)}
                className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
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
