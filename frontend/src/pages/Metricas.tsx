import { useState, useEffect } from 'react';
import { metricasService } from '../services/api';
import {
  BarChart3,
  Users,
  FileText,
  Server,
  Send,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  RefreshCw,
} from 'lucide-react';

interface Metricas {
  advogados: {
    total: number;
    ativos: number;
    comPublicacoes: number;
  };
  consultas: {
    total: number;
    concluidas: number;
    erros: number;
    pendentes: number;
    hoje: number;
    semana: number;
    taxaSucesso: number;
  };
  publicacoes: {
    total: number;
    novas: number;
    enviadas: number;
    erros: number;
    hoje: number;
    semana: number;
    mes: number;
  };
  proxies: {
    total: number;
    ativos: number;
    funcionando: number;
    offline: number;
  };
  callbacks: {
    totalEnvios: number;
    sucesso: number;
    falhas: number;
    taxaSucesso: number;
  };
  fila: {
    consultas: {
      aguardando: number;
      processando: number;
      concluidas: number;
      falhas: number;
    };
    envios: {
      aguardando: number;
      processando: number;
    };
  };
  topAdvogados: {
    id: string;
    nome: string;
    publicacoes: number;
    consultas: number;
    ultimaConsulta: string | null;
    ativo: boolean;
  }[];
}

export default function Metricas() {
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarMetricas();
    const interval = setInterval(carregarMetricas, 30000);
    return () => clearInterval(interval);
  }, []);

  const carregarMetricas = async () => {
    try {
      const res = await metricasService.getMetricas();
      setMetricas(res.data);
    } catch (error) {
      console.error('Erro ao carregar metricas:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!metricas) {
    return (
      <div className="text-center text-gray-500 py-8">
        Erro ao carregar metricas
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Metricas do Sistema</h1>
        <button
          onClick={carregarMetricas}
          className="flex items-center px-4 py-2 text-gray-600 hover:text-gray-900"
        >
          <RefreshCw size={20} className="mr-2" />
          Atualizar
        </button>
      </div>

      {/* Cards principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          title="Advogados"
          value={metricas.advogados.total}
          subtitle={`${metricas.advogados.ativos} ativos`}
          icon={Users}
          color="blue"
        />
        <MetricCard
          title="Consultas"
          value={metricas.consultas.total}
          subtitle={`${metricas.consultas.taxaSucesso}% sucesso`}
          icon={BarChart3}
          color="green"
        />
        <MetricCard
          title="Publicacoes"
          value={metricas.publicacoes.total}
          subtitle={`${metricas.publicacoes.novas} novas`}
          icon={FileText}
          color="purple"
        />
        <MetricCard
          title="Proxies"
          value={metricas.proxies.funcionando}
          subtitle={`de ${metricas.proxies.total} total`}
          icon={Server}
          color="orange"
        />
      </div>

      {/* Detalhes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Consultas */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <BarChart3 className="mr-2 text-green-600" size={20} />
            Consultas ao CNJ
          </h2>
          <div className="space-y-3">
            <StatRow label="Total de consultas" value={metricas.consultas.total} />
            <StatRow label="Concluidas com sucesso" value={metricas.consultas.concluidas} color="green" />
            <StatRow label="Com erro" value={metricas.consultas.erros} color="red" />
            <StatRow label="Pendentes" value={metricas.consultas.pendentes} color="yellow" />
            <div className="border-t pt-3 mt-3">
              <StatRow label="Hoje" value={metricas.consultas.hoje} />
              <StatRow label="Ultima semana" value={metricas.consultas.semana} />
            </div>
            <div className="bg-green-50 rounded-lg p-3 mt-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-green-800">Taxa de Sucesso</span>
                <span className="text-xl font-bold text-green-600">{metricas.consultas.taxaSucesso}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Publicacoes */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <FileText className="mr-2 text-purple-600" size={20} />
            Publicacoes Encontradas
          </h2>
          <div className="space-y-3">
            <StatRow label="Total de publicacoes" value={metricas.publicacoes.total} />
            <StatRow label="Novas (nao processadas)" value={metricas.publicacoes.novas} color="blue" />
            <StatRow label="Enviadas para AdvWell" value={metricas.publicacoes.enviadas} color="green" />
            <StatRow label="Com erro de envio" value={metricas.publicacoes.erros} color="red" />
            <div className="border-t pt-3 mt-3">
              <StatRow label="Hoje" value={metricas.publicacoes.hoje} />
              <StatRow label="Ultima semana" value={metricas.publicacoes.semana} />
              <StatRow label="Este mes" value={metricas.publicacoes.mes} />
            </div>
          </div>
        </div>

        {/* Callbacks */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Send className="mr-2 text-blue-600" size={20} />
            Callbacks para AdvWell
          </h2>
          <div className="space-y-3">
            <StatRow label="Total de envios" value={metricas.callbacks.totalEnvios} />
            <StatRow label="Publicacoes enviadas" value={metricas.callbacks.sucesso} color="green" />
            <StatRow label="Falhas de envio" value={metricas.callbacks.falhas} color="red" />
            <div className="bg-blue-50 rounded-lg p-3 mt-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-blue-800">Taxa de Sucesso</span>
                <span className="text-xl font-bold text-blue-600">{metricas.callbacks.taxaSucesso}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Proxies */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Server className="mr-2 text-orange-600" size={20} />
            Proxies Brasileiros
          </h2>
          <div className="space-y-3">
            <StatRow label="Total cadastrados" value={metricas.proxies.total} />
            <StatRow label="Ativos" value={metricas.proxies.ativos} color="blue" />
            <StatRow label="Funcionando" value={metricas.proxies.funcionando} color="green" />
            <StatRow label="Offline/Bloqueados" value={metricas.proxies.offline} color="red" />
            <div className="bg-orange-50 rounded-lg p-3 mt-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-orange-800">Disponibilidade</span>
                <span className="text-xl font-bold text-orange-600">
                  {metricas.proxies.total > 0
                    ? Math.round((metricas.proxies.funcionando / metricas.proxies.total) * 100)
                    : 0}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Fila atual */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <Clock className="mr-2 text-blue-600" size={20} />
          Fila de Processamento (Tempo Real)
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <QueueCard label="Aguardando" value={metricas.fila.consultas.aguardando} color="yellow" />
          <QueueCard label="Processando" value={metricas.fila.consultas.processando} color="blue" />
          <QueueCard label="Concluidas" value={metricas.fila.consultas.concluidas} color="green" />
          <QueueCard label="Falhas" value={metricas.fila.consultas.falhas} color="red" />
          <QueueCard label="Envios Pendentes" value={metricas.fila.envios.aguardando} color="purple" />
          <QueueCard label="Enviando" value={metricas.fila.envios.processando} color="indigo" />
        </div>
      </div>

      {/* Top Advogados */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <TrendingUp className="mr-2 text-green-600" size={20} />
          Top 10 Advogados (por publicacoes)
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Advogado</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Publicacoes</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Consultas</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ultima Consulta</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {metricas.topAdvogados.map((adv, idx) => (
                <tr key={adv.id}>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{idx + 1}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{adv.nome}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 font-bold">{adv.publicacoes}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{adv.consultas}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {adv.ultimaConsulta
                      ? new Date(adv.ultimaConsulta).toLocaleString('pt-BR')
                      : 'Nunca'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {adv.ativo ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <CheckCircle size={12} className="mr-1" /> Ativo
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        <AlertCircle size={12} className="mr-1" /> Inativo
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
}: {
  title: string;
  value: number;
  subtitle: string;
  icon: any;
  color: string;
}) {
  const colors: Record<string, { bg: string; text: string; iconBg: string }> = {
    blue: { bg: 'bg-blue-50', text: 'text-blue-600', iconBg: 'bg-blue-100' },
    green: { bg: 'bg-green-50', text: 'text-green-600', iconBg: 'bg-green-100' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-600', iconBg: 'bg-purple-100' },
    orange: { bg: 'bg-orange-50', text: 'text-orange-600', iconBg: 'bg-orange-100' },
  };

  return (
    <div className={`${colors[color].bg} rounded-lg p-6`}>
      <div className="flex items-center">
        <div className={`${colors[color].iconBg} p-3 rounded-lg`}>
          <Icon className={`h-6 w-6 ${colors[color].text}`} />
        </div>
        <div className="ml-4">
          <p className="text-sm text-gray-600">{title}</p>
          <p className={`text-2xl font-bold ${colors[color].text}`}>{value.toLocaleString()}</p>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}

function StatRow({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  const colorClasses: Record<string, string> = {
    green: 'text-green-600',
    red: 'text-red-600',
    yellow: 'text-yellow-600',
    blue: 'text-blue-600',
  };

  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-gray-600">{label}</span>
      <span className={`font-semibold ${color ? colorClasses[color] : 'text-gray-900'}`}>
        {value.toLocaleString()}
      </span>
    </div>
  );
}

function QueueCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const colors: Record<string, { bg: string; text: string }> = {
    yellow: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
    blue: { bg: 'bg-blue-100', text: 'text-blue-800' },
    green: { bg: 'bg-green-100', text: 'text-green-800' },
    red: { bg: 'bg-red-100', text: 'text-red-800' },
    purple: { bg: 'bg-purple-100', text: 'text-purple-800' },
    indigo: { bg: 'bg-indigo-100', text: 'text-indigo-800' },
  };

  return (
    <div className={`${colors[color].bg} rounded-lg p-4 text-center`}>
      <p className={`text-2xl font-bold ${colors[color].text}`}>{value}</p>
      <p className="text-xs text-gray-600">{label}</p>
    </div>
  );
}
