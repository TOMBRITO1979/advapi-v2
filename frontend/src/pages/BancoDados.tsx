import { useState, useEffect } from 'react';
import { bancoDadosService } from '../services/api';
import { Search, Database, Calendar, Filter, X, ExternalLink, User, Scale, FileText } from 'lucide-react';
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

interface AdvogadoProcesso {
  nome: string;
  oab?: string | null;
}

interface PublicacaoDetalhes {
  id: string;
  advogado: string;
  oab: string | null;
  numeroProcesso: string;
  siglaTribunal: string | null;
  orgaoJulgador: string | null;
  nomeOrgao: string | null;
  dataDisponibilizacao: string | null;
  dataPublicacao: string | null;
  tipoComunicacao: string | null;
  textoComunicacao: string | null;
  textoLimpo: string | null;
  linkIntegra: string | null;
  parteAutor: string | null;
  parteReu: string | null;
  comarca: string | null;
  classeProcessual: string | null;
  advogadosProcesso: AdvogadoProcesso[] | null;
  status: string;
  enviadoAdvwell: boolean;
  enviadoEm: string | null;
  fonte: string;
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
  const [selected, setSelected] = useState<PublicacaoDetalhes | null>(null);
  const [loadingDetalhes, setLoadingDetalhes] = useState(false);

  useEffect(() => {
    carregarDados();
  }, [page]);

  const abrirDetalhes = async (id: string) => {
    try {
      setLoadingDetalhes(true);
      const res = await bancoDadosService.buscar(id);
      setSelected(res.data);
    } catch (error) {
      console.error('Erro ao carregar detalhes:', error);
    } finally {
      setLoadingDetalhes(false);
    }
  };

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
                  <tr
                    key={pub.id}
                    className="hover:bg-blue-50 cursor-pointer transition-colors"
                    onClick={() => abrirDetalhes(pub.id)}
                  >
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

      {/* Modal de Detalhes */}
      {(selected || loadingDetalhes) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50">
              <div className="flex items-center gap-3">
                <Scale className="text-blue-600" size={24} />
                <h2 className="text-xl font-bold text-gray-900">Detalhes do Processo</h2>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="p-2 hover:bg-gray-200 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            {loadingDetalhes ? (
              <div className="p-8 flex-1 flex items-center justify-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
              </div>
            ) : selected && (
              <div className="p-6 overflow-y-auto flex-1">
                {/* Numero do Processo */}
                <div className="mb-6">
                  <h3 className="text-lg font-mono font-bold text-blue-800 mb-1">
                    {selected.numeroProcesso}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {selected.siglaTribunal && (
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                        {selected.siglaTribunal}
                      </span>
                    )}
                    {selected.classeProcessual && (
                      <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded">
                        {selected.classeProcessual}
                      </span>
                    )}
                    <span className={`px-2 py-1 text-xs rounded ${
                      selected.status === 'NOVA' ? 'bg-blue-100 text-blue-800' :
                      selected.status === 'ENVIADA' ? 'bg-green-100 text-green-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {selected.status}
                    </span>
                  </div>
                </div>

                {/* Grid de informacoes */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  {/* Coluna 1 */}
                  <div className="space-y-4">
                    {/* Advogado Monitorado */}
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase">Advogado Monitorado</label>
                      <div className="flex items-center gap-2 mt-1">
                        <User size={16} className="text-gray-400" />
                        <span className="font-medium">{selected.advogado}</span>
                        {selected.oab && (
                          <span className="text-sm text-gray-500">OAB: {selected.oab}</span>
                        )}
                      </div>
                    </div>

                    {/* Partes */}
                    {selected.parteAutor && (
                      <div>
                        <label className="text-xs font-medium text-gray-500 uppercase">Autor</label>
                        <p className="text-sm mt-1">{selected.parteAutor}</p>
                      </div>
                    )}
                    {selected.parteReu && (
                      <div>
                        <label className="text-xs font-medium text-gray-500 uppercase">Reu</label>
                        <p className="text-sm mt-1">{selected.parteReu}</p>
                      </div>
                    )}

                    {/* Comarca */}
                    {selected.comarca && (
                      <div>
                        <label className="text-xs font-medium text-gray-500 uppercase">Comarca</label>
                        <p className="text-sm mt-1">{selected.comarca}</p>
                      </div>
                    )}

                    {/* Orgao */}
                    {(selected.nomeOrgao || selected.orgaoJulgador) && (
                      <div>
                        <label className="text-xs font-medium text-gray-500 uppercase">Orgao Julgador</label>
                        <p className="text-sm mt-1">{selected.nomeOrgao || selected.orgaoJulgador}</p>
                      </div>
                    )}
                  </div>

                  {/* Coluna 2 */}
                  <div className="space-y-4">
                    {/* Datas */}
                    <div className="grid grid-cols-2 gap-4">
                      {selected.dataPublicacao && (
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase">Data Publicacao</label>
                          <p className="text-sm mt-1">
                            {format(new Date(selected.dataPublicacao), 'dd/MM/yyyy')}
                          </p>
                        </div>
                      )}
                      {selected.dataDisponibilizacao && (
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase">Disponibilizacao</label>
                          <p className="text-sm mt-1">
                            {format(new Date(selected.dataDisponibilizacao), 'dd/MM/yyyy')}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Tipo Comunicacao */}
                    {selected.tipoComunicacao && (
                      <div>
                        <label className="text-xs font-medium text-gray-500 uppercase">Tipo de Comunicacao</label>
                        <p className="text-sm mt-1">{selected.tipoComunicacao}</p>
                      </div>
                    )}

                    {/* Envio */}
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase">Enviado para AdvWell</label>
                      <p className="text-sm mt-1">
                        {selected.enviadoAdvwell ? (
                          <span className="text-green-600">
                            Sim {selected.enviadoEm && `- ${format(new Date(selected.enviadoEm), 'dd/MM/yyyy HH:mm')}`}
                          </span>
                        ) : (
                          <span className="text-gray-500">Nao</span>
                        )}
                      </p>
                    </div>

                    {/* Data Raspagem */}
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase">Data da Raspagem</label>
                      <p className="text-sm mt-1">
                        {format(new Date(selected.dataRaspagem), 'dd/MM/yyyy HH:mm:ss')}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Advogados do Processo */}
                {selected.advogadosProcesso && selected.advogadosProcesso.length > 0 && (
                  <div className="mb-6">
                    <label className="text-xs font-medium text-gray-500 uppercase mb-2 block">
                      Advogados no Processo ({selected.advogadosProcesso.length})
                    </label>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="flex flex-wrap gap-2">
                        {selected.advogadosProcesso.map((adv, idx) => (
                          <div key={idx} className="bg-white px-3 py-2 rounded border text-sm">
                            <span className="font-medium">{adv.nome}</span>
                            {adv.oab && <span className="text-gray-500 ml-2">OAB: {adv.oab}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Texto da Publicacao */}
                {(selected.textoLimpo || selected.textoComunicacao) && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <FileText size={16} className="text-gray-500" />
                      <label className="text-xs font-medium text-gray-500 uppercase">
                        Texto da Publicacao
                      </label>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 max-h-60 overflow-y-auto whitespace-pre-wrap">
                      {selected.textoLimpo || selected.textoComunicacao}
                    </div>
                  </div>
                )}

                {/* Link Integra */}
                {selected.linkIntegra && (
                  <div className="mt-4">
                    <a
                      href={selected.linkIntegra}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800"
                    >
                      <ExternalLink size={16} />
                      Ver publicacao original
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end">
              <button
                onClick={() => setSelected(null)}
                className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
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
