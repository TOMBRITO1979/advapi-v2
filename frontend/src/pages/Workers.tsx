import { useState, useEffect } from 'react';
import {
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  RefreshCw,
  Cpu,
  Calendar,
  Timer,
  Users,
} from 'lucide-react';
import { workersService } from '../services/api';

interface WorkerStatus {
  worker: {
    status: 'ONLINE' | 'AGUARDANDO' | 'FORA_HORARIO';
    ultimaAtividade: string | null;
    tempoDesdeUltimaAtividade: number | null;
  };
  horario: {
    dentroHorarioFuncionamento: boolean;
    horaAtual: number;
    diaAtual: number;
    horarioPermitido: string;
    diasPermitidos: string;
  };
  fila: {
    aguardando: number;
    processando: number;
    concluidos24h: number;
    falhas24h: number;
  };
  jobsAtivos: Array<{
    id: string;
    advogado: string;
    iniciadoEm: string;
    duracao: number | null;
  }>;
  proximosNaFila: Array<{
    id: string;
    advogado: string;
    ultimaSincronizacao: string | null;
  }>;
  jobsRecentes: Array<{
    id: string;
    advogado: string;
    status: string;
    iniciadoEm: string | null;
    finalizadoEm: string | null;
    publicacoesEncontradas: number | null;
    erro: string | null;
  }>;
  proximaRaspagem: string | null;
}

function StatusCard({
  title,
  value,
  icon: Icon,
  color,
  subtitle,
}: {
  title: string;
  value: string | number;
  icon: any;
  color: string;
  subtitle?: string;
}) {
  const colors: Record<string, { bg: string; text: string }> = {
    green: { bg: 'bg-green-100', text: 'text-green-600' },
    yellow: { bg: 'bg-yellow-100', text: 'text-yellow-600' },
    blue: { bg: 'bg-blue-100', text: 'text-blue-600' },
    red: { bg: 'bg-red-100', text: 'text-red-600' },
    gray: { bg: 'bg-gray-100', text: 'text-gray-600' },
    orange: { bg: 'bg-orange-100', text: 'text-orange-600' },
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center">
        <div className={`${colors[color].bg} p-3 rounded-lg`}>
          <Icon className={`h-6 w-6 ${colors[color].text}`} />
        </div>
        <div className="ml-4">
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ONLINE: 'bg-green-100 text-green-800',
    AGUARDANDO: 'bg-yellow-100 text-yellow-800',
    FORA_HORARIO: 'bg-gray-100 text-gray-800',
    PENDENTE: 'bg-yellow-100 text-yellow-800',
    PROCESSANDO: 'bg-blue-100 text-blue-800',
    CONCLUIDA: 'bg-green-100 text-green-800',
    ERRO: 'bg-red-100 text-red-800',
  };

  const labels: Record<string, string> = {
    ONLINE: 'Online',
    AGUARDANDO: 'Aguardando',
    FORA_HORARIO: 'Fora do Horario',
    PENDENTE: 'Pendente',
    PROCESSANDO: 'Processando',
    CONCLUIDA: 'Concluida',
    ERRO: 'Erro',
  };

  return (
    <span
      className={`px-2 py-1 text-xs rounded-full ${styles[status] || 'bg-gray-100 text-gray-800'}`}
    >
      {labels[status] || status}
    </span>
  );
}

function formatarData(data: string | null): string {
  if (!data) return '-';
  return new Date(data).toLocaleString('pt-BR');
}

function formatarDuracao(segundos: number | null): string {
  if (segundos === null) return '-';
  if (segundos < 60) return `${segundos}s`;
  const minutos = Math.floor(segundos / 60);
  const segs = segundos % 60;
  return `${minutos}m ${segs}s`;
}

export default function Workers() {
  const [status, setStatus] = useState<WorkerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date | null>(null);

  const carregarStatus = async () => {
    try {
      const res = await workersService.getStatus();
      setStatus(res.data);
      setUltimaAtualizacao(new Date());
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarStatus();
    const interval = setInterval(carregarStatus, 5000); // Atualiza a cada 5s
    return () => clearInterval(interval);
  }, []);

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center text-red-800">
          <AlertCircle className="h-5 w-5 mr-2" />
          {error}
        </div>
      </div>
    );
  }

  if (!status) return null;

  const workerColor =
    status.worker.status === 'ONLINE'
      ? 'green'
      : status.worker.status === 'AGUARDANDO'
      ? 'yellow'
      : 'gray';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Monitor de Workers</h1>
          <p className="text-sm text-gray-500">
            Status em tempo real do sistema de raspagem
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-400">
            Atualizado: {ultimaAtualizacao?.toLocaleTimeString('pt-BR')}
          </span>
          <button
            onClick={carregarStatus}
            className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <RefreshCw size={16} className="mr-2" />
            Atualizar
          </button>
        </div>
      </div>

      {/* Status Principal */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatusCard
          title="Status do Worker"
          value={
            status.worker.status === 'ONLINE'
              ? 'Online'
              : status.worker.status === 'AGUARDANDO'
              ? 'Aguardando'
              : 'Fora do Horario'
          }
          icon={Cpu}
          color={workerColor}
          subtitle={
            status.worker.tempoDesdeUltimaAtividade
              ? `Ha ${status.worker.tempoDesdeUltimaAtividade} min`
              : undefined
          }
        />
        <StatusCard
          title="Jobs Processando"
          value={status.fila.processando}
          icon={Activity}
          color={status.fila.processando > 0 ? 'blue' : 'gray'}
        />
        <StatusCard
          title="Concluidos (24h)"
          value={status.fila.concluidos24h}
          icon={CheckCircle}
          color="green"
        />
        <StatusCard
          title="Falhas (24h)"
          value={status.fila.falhas24h}
          icon={XCircle}
          color={status.fila.falhas24h > 0 ? 'red' : 'gray'}
        />
      </div>

      {/* Horario de Funcionamento */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center">
          <Calendar size={20} className="mr-2 text-gray-500" />
          Horario de Funcionamento
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center">
            <div
              className={`w-3 h-3 rounded-full mr-3 ${
                status.horario.dentroHorarioFuncionamento ? 'bg-green-500' : 'bg-gray-400'
              }`}
            />
            <div>
              <p className="text-sm font-medium">
                {status.horario.dentroHorarioFuncionamento
                  ? 'Dentro do horario'
                  : 'Fora do horario'}
              </p>
              <p className="text-xs text-gray-500">
                Atual: {status.horario.horaAtual}h
              </p>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium">Horario Permitido</p>
            <p className="text-xs text-gray-500">{status.horario.horarioPermitido}</p>
          </div>
          <div>
            <p className="text-sm font-medium">Dias Permitidos</p>
            <p className="text-xs text-gray-500">{status.horario.diasPermitidos}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Jobs Ativos */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center">
            <Activity size={20} className="mr-2 text-blue-500" />
            Jobs em Processamento
          </h2>
          {status.jobsAtivos.length === 0 ? (
            <p className="text-gray-500 text-sm">Nenhum job em processamento</p>
          ) : (
            <div className="space-y-3">
              {status.jobsAtivos.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between p-3 bg-blue-50 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-sm">{job.advogado}</p>
                    <p className="text-xs text-gray-500">
                      Iniciado: {formatarData(job.iniciadoEm)}
                    </p>
                  </div>
                  <div className="flex items-center">
                    <Timer size={14} className="mr-1 text-blue-600" />
                    <span className="text-sm text-blue-600">
                      {formatarDuracao(job.duracao)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Proximos na Fila */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center">
            <Users size={20} className="mr-2 text-orange-500" />
            Proximos a Sincronizar
          </h2>
          {status.proximosNaFila.length === 0 ? (
            <p className="text-gray-500 text-sm">Nenhum advogado pendente</p>
          ) : (
            <div className="space-y-2">
              {status.proximosNaFila.map((adv) => (
                <div
                  key={adv.id}
                  className="flex items-center justify-between p-2 hover:bg-gray-50 rounded"
                >
                  <span className="text-sm">{adv.advogado}</span>
                  <span className="text-xs text-gray-500">
                    {adv.ultimaSincronizacao
                      ? `Ultima: ${formatarData(adv.ultimaSincronizacao)}`
                      : 'Nunca sincronizado'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Jobs Recentes */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center">
          <Clock size={20} className="mr-2 text-gray-500" />
          Jobs Recentes (24h)
        </h2>
        {status.jobsRecentes.length === 0 ? (
          <p className="text-gray-500 text-sm">Nenhum job nas ultimas 24 horas</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b">
                  <th className="pb-2 font-medium">Advogado</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Inicio</th>
                  <th className="pb-2 font-medium">Fim</th>
                  <th className="pb-2 font-medium">Publicacoes</th>
                  <th className="pb-2 font-medium">Erro</th>
                </tr>
              </thead>
              <tbody>
                {status.jobsRecentes.map((job) => (
                  <tr key={job.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3 text-sm">{job.advogado}</td>
                    <td className="py-3">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="py-3 text-sm text-gray-500">
                      {formatarData(job.iniciadoEm)}
                    </td>
                    <td className="py-3 text-sm text-gray-500">
                      {formatarData(job.finalizadoEm)}
                    </td>
                    <td className="py-3 text-sm">
                      {job.publicacoesEncontradas ?? '-'}
                    </td>
                    <td className="py-3 text-sm text-red-600">
                      {job.erro ? job.erro.substring(0, 50) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
