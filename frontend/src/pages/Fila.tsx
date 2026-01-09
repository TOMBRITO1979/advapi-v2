import { useState, useEffect } from 'react';
import { filaService } from '../services/api';
import { Activity, Clock, CheckCircle, XCircle, RefreshCw } from 'lucide-react';

interface QueueStatus {
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
}

export default function Fila() {
  const [status, setStatus] = useState<QueueStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarStatus();
    const interval = setInterval(carregarStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const carregarStatus = async () => {
    try {
      const res = await filaService.getStatus();
      setStatus(res.data);
    } catch (error) {
      console.error('Erro ao carregar status da fila:', error);
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Fila de Processamento</h1>
        <button
          onClick={carregarStatus}
          className="flex items-center px-4 py-2 text-gray-600 hover:text-gray-900"
        >
          <RefreshCw size={20} className="mr-2" />
          Atualizar
        </button>
      </div>

      {/* Consultas */}
      <h2 className="text-lg font-semibold text-gray-700 mb-3">Consultas (Scraping)</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatusCard
          title="Aguardando"
          value={status?.consultas?.aguardando || 0}
          icon={Clock}
          color="yellow"
        />
        <StatusCard
          title="Processando"
          value={status?.consultas?.processando || 0}
          icon={Activity}
          color="blue"
        />
        <StatusCard
          title="Concluidas"
          value={status?.consultas?.concluidas || 0}
          icon={CheckCircle}
          color="green"
        />
        <StatusCard
          title="Falhas"
          value={status?.consultas?.falhas || 0}
          icon={XCircle}
          color="red"
        />
      </div>

      {/* Envios */}
      <h2 className="text-lg font-semibold text-gray-700 mb-3">Envios (AdvWell)</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4 mb-6">
        <StatusCard
          title="Aguardando"
          value={status?.envios?.aguardando || 0}
          icon={Clock}
          color="yellow"
        />
        <StatusCard
          title="Processando"
          value={status?.envios?.processando || 0}
          icon={Activity}
          color="blue"
        />
      </div>

      {/* Info sobre a fila */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Informacoes da Fila
        </h2>

        <div className="space-y-4">
          <div className="flex items-start">
            <div className="flex-shrink-0 h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
              <Activity className="h-5 w-5 text-blue-600" />
            </div>
            <div className="ml-4">
              <h3 className="text-sm font-medium text-gray-900">
                Processamento Automatico
              </h3>
              <p className="text-sm text-gray-500">
                O worker processa consultas automaticamente. Advogados ativos sao
                consultados a cada 24 horas.
              </p>
            </div>
          </div>

          <div className="flex items-start">
            <div className="flex-shrink-0 h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div className="ml-4">
              <h3 className="text-sm font-medium text-gray-900">
                Limite de Requisicoes
              </h3>
              <p className="text-sm text-gray-500">
                Maximo de 10 consultas por minuto para evitar bloqueios.
                Consultas falhas sao reagendadas automaticamente.
              </p>
            </div>
          </div>

          <div className="flex items-start">
            <div className="flex-shrink-0 h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
              <RefreshCw className="h-5 w-5 text-purple-600" />
            </div>
            <div className="ml-4">
              <h3 className="text-sm font-medium text-gray-900">Retentativas</h3>
              <p className="text-sm text-gray-500">
                Em caso de falha, a consulta e reagendada ate 3 vezes com
                intervalo exponencial.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string;
  value: number;
  icon: any;
  color: string;
}) {
  const colors: Record<string, { bg: string; text: string }> = {
    yellow: { bg: 'bg-yellow-100', text: 'text-yellow-600' },
    blue: { bg: 'bg-blue-100', text: 'text-blue-600' },
    green: { bg: 'bg-green-100', text: 'text-green-600' },
    red: { bg: 'bg-red-100', text: 'text-red-600' },
    purple: { bg: 'bg-purple-100', text: 'text-purple-600' },
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
        </div>
      </div>
    </div>
  );
}
