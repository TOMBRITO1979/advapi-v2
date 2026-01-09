import { useState, useEffect } from 'react';
import { bancoDadosService } from '../services/api';
import { Search, Database, Calendar, Filter } from 'lucide-react';
import { format } from 'date-fns';

interface PublicacaoDB {
  id: string;
  advogado: string;
  oab: string | null;
  numeroProcesso: string;
  siglaTribunal: string | null;
  dataPublicacao: string | null;
  tipoComunicacao: string | null;
  textoComunicacao: string | null;
  status: string;
  dataRaspagem: string;
}

export default function BancoDados() {
  const [publicacoes, setPublicacoes] = useState<PublicacaoDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroAdvogado, setFiltroAdvogado] = useState('');
  const [filtroProcesso, setFiltroProcesso] = useState('');
  const [filtroDataInicio, setFiltroDataInicio] = useState('');
  const [filtroDataFim, setFiltroDataFim] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    carregarDados();
  }, [page]);

  const carregarDados = async () => {
    try {
      setLoading(true);
      const res = await bancoDadosService.listar({
        advogado: filtroAdvogado || undefined,
        processo: filtroProcesso || undefined,
        dataInicio: filtroDataInicio || undefined,
        dataFim: filtroDataFim || undefined,
        page,
        limit: 500,
      });
      setPublicacoes(res.data.data);
      setTotalPages(res.data.pagination.pages);
      setTotal(res.data.pagination.total);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const aplicarFiltros = () => {
    setPage(1);
    carregarDados();
  };

  const limparFiltros = () => {
    setFiltroAdvogado('');
    setFiltroProcesso('');
    setFiltroDataInicio('');
    setFiltroDataFim('');
    setPage(1);
    setTimeout(carregarDados, 100);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Database className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Banco de Dados</h1>
            <p className="text-sm text-gray-500">
              {total.toLocaleString()} registros no banco
            </p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={20} className="text-gray-500" />
          <span className="font-medium text-gray-700">Filtros</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Filtro Advogado */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nome do Advogado
            </label>
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={18}
              />
              <input
                type="text"
                placeholder="Buscar advogado..."
                value={filtroAdvogado}
                onChange={(e) => setFiltroAdvogado(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Filtro Processo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Numero do Processo
            </label>
            <input
              type="text"
              placeholder="Ex: 0001234-56.2024..."
              value={filtroProcesso}
              onChange={(e) => setFiltroProcesso(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Data Inicio */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Data Raspagem (De)
            </label>
            <div className="relative">
              <Calendar
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={18}
              />
              <input
                type="date"
                value={filtroDataInicio}
                onChange={(e) => setFiltroDataInicio(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Data Fim */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Data Raspagem (Ate)
            </label>
            <div className="relative">
              <Calendar
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={18}
              />
              <input
                type="date"
                value={filtroDataFim}
                onChange={(e) => setFiltroDataFim(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-4">
          <button
            onClick={limparFiltros}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            Limpar
          </button>
          <button
            onClick={aplicarFiltros}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Aplicar Filtros
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-500 mt-2">Carregando...</p>
          </div>
        ) : publicacoes.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Database className="mx-auto h-12 w-12 text-gray-300 mb-4" />
            Nenhum registro encontrado
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Advogado
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Processo
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tribunal
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Data Pub.
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Data Raspagem
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {publicacoes.map((pub) => (
                  <tr key={pub.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">
                        {pub.advogado}
                      </div>
                      {pub.oab && (
                        <div className="text-xs text-gray-500">
                          OAB: {pub.oab}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-900 font-mono">
                        {pub.numeroProcesso}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">
                        {pub.siglaTribunal || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm text-gray-600">
                        {pub.dataPublicacao
                          ? format(new Date(pub.dataPublicacao), 'dd/MM/yyyy')
                          : '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {format(new Date(pub.dataRaspagem), 'dd/MM/yyyy')}
                      </div>
                      <div className="text-xs text-gray-500">
                        {format(new Date(pub.dataRaspagem), 'HH:mm:ss')}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          pub.status === 'NOVA'
                            ? 'bg-blue-100 text-blue-800'
                            : pub.status === 'ENVIADA'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {pub.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginacao */}
        {totalPages > 0 && (
          <div className="px-6 py-4 border-t flex items-center justify-between bg-gray-50">
            <div className="text-sm text-gray-600">
              Mostrando {((page - 1) * 500) + 1} - {Math.min(page * 500, total)} de {total.toLocaleString()} registros
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 border rounded disabled:opacity-50 hover:bg-white"
              >
                Anterior
              </button>
              <span className="text-sm text-gray-600 px-2">
                Pagina {page} de {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 border rounded disabled:opacity-50 hover:bg-white"
              >
                Proxima
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
