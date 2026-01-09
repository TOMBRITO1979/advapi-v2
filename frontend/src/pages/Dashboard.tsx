import { useState, useEffect } from 'react';
import { dashboardService } from '../services/api';
import {
  Users,
  FileText,
  Server,
  Clock,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface DashboardData {
  resumo: {
    advogados: { total: number; ativos: number };
    publicacoes: {
      total: number;
      novas: number;
      hoje: number;
      semana: number;
      mes: number;
    };
    proxies: { total: number; ativos: number };
    fila: { pendentes: number; processando: number };
  };
  ultimasPublicacoes: any[];
  ultimasConsultas: any[];
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [grafico, setGrafico] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarDados();
    const interval = setInterval(carregarDados, 30000);
    return () => clearInterval(interval);
  }, []);

  const carregarDados = async () => {
    try {
      const [resumoRes, graficoRes] = await Promise.all([
        dashboardService.getResumo(),
        dashboardService.getGraficoPublicacoes(30),
      ]);

      setData(resumoRes.data);
      setGrafico(
        graficoRes.data.map((item: any) => ({
          ...item,
          dataFormatada: format(new Date(item.data), 'dd/MM', { locale: ptBR }),
        }))
      );
    } catch (error) {
      console.error('Erro ao carregar dashboard:', error);
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

  if (!data) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="mx-auto h-12 w-12 text-red-500" />
        <p className="mt-4 text-gray-600">Erro ao carregar dados</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      {/* Cards de estatisticas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Advogados Ativos"
          value={data.resumo.advogados.ativos}
          subtitle={`${data.resumo.advogados.total} total`}
          icon={Users}
          color="blue"
        />
        <StatCard
          title="Publicacoes Novas"
          value={data.resumo.publicacoes.novas}
          subtitle={`${data.resumo.publicacoes.hoje} hoje`}
          icon={FileText}
          color="green"
        />
        <StatCard
          title="Proxies Ativos"
          value={data.resumo.proxies.ativos}
          subtitle={`${data.resumo.proxies.total} total`}
          icon={Server}
          color="purple"
        />
        <StatCard
          title="Na Fila"
          value={data.resumo.fila.pendentes + data.resumo.fila.processando}
          subtitle={`${data.resumo.fila.processando} processando`}
          icon={Clock}
          color="orange"
        />
      </div>

      {/* Grafico de publicacoes */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Publicacoes - Ultimos 30 dias
          </h2>
          <TrendingUp className="text-gray-400" />
        </div>

        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={grafico}>
            <XAxis dataKey="dataFormatada" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="total"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Tabelas lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ultimas publicacoes */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">
              Ultimas Publicacoes
            </h2>
          </div>
          <div className="p-4">
            {data.ultimasPublicacoes.length === 0 ? (
              <p className="text-gray-500 text-center py-4">
                Nenhuma publicacao
              </p>
            ) : (
              <ul className="divide-y">
                {data.ultimasPublicacoes.map((pub) => (
                  <li key={pub.id} className="py-3">
                    <p className="text-sm font-medium text-gray-900">
                      {pub.numeroProcesso}
                    </p>
                    <p className="text-xs text-gray-500">
                      {pub.advogado} -{' '}
                      {pub.dataPublicacao
                        ? format(new Date(pub.dataPublicacao), 'dd/MM/yyyy')
                        : 'Sem data'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Ultimas consultas */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">
              Ultimas Consultas
            </h2>
          </div>
          <div className="p-4">
            {data.ultimasConsultas.length === 0 ? (
              <p className="text-gray-500 text-center py-4">Nenhuma consulta</p>
            ) : (
              <ul className="divide-y">
                {data.ultimasConsultas.map((cons) => (
                  <li key={cons.id} className="py-3 flex justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {cons.advogado}
                      </p>
                      <p className="text-xs text-gray-500">
                        {format(new Date(cons.criadoEm), 'dd/MM HH:mm')}
                      </p>
                    </div>
                    <StatusBadge status={cons.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
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
  const colors: Record<string, string> = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    purple: 'bg-purple-500',
    orange: 'bg-orange-500',
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center">
        <div className={`${colors[color]} p-3 rounded-lg`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
        <div className="ml-4">
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-xs text-gray-400">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PENDENTE: 'bg-yellow-100 text-yellow-800',
    PROCESSANDO: 'bg-blue-100 text-blue-800',
    CONCLUIDA: 'bg-green-100 text-green-800',
    ERRO: 'bg-red-100 text-red-800',
  };

  return (
    <span
      className={`px-2 py-1 text-xs rounded-full ${styles[status] || 'bg-gray-100 text-gray-800'}`}
    >
      {status}
    </span>
  );
}
