import { Queue } from 'bullmq';

const redisConnection = {
  host: process.env.REDIS_URL?.replace('redis://', '').split(':')[0] || 'localhost',
  port: parseInt(process.env.REDIS_URL?.split(':')[2] || '6379'),
};

// Fila de consultas ao HComunica
export const consultaQueue = new Queue('consultas', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

// Fila de envio para AdvWell
export const envioQueue = new Queue('envios', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 10000,
    },
  },
});

// Adicionar consulta na fila
export async function adicionarConsulta(data: {
  advogadoId: string;
  nome: string;
  tribunal?: string;
  dataInicio: string;
  dataFim: string;
  prioridade?: number;
}) {
  const job = await consultaQueue.add('processar-consulta', data, {
    priority: data.prioridade || 0,
  });
  return job.id;
}

// Adicionar envio na fila
export async function adicionarEnvio(data: {
  advogadoId: string;
  callbackUrl: string;
  publicacoes: any[];
}) {
  const job = await envioQueue.add('enviar-advwell', data);
  return job.id;
}

// Status das filas
export async function getQueueStatus() {
  const [consultaWaiting, consultaActive, consultaCompleted, consultaFailed] = await Promise.all([
    consultaQueue.getWaitingCount(),
    consultaQueue.getActiveCount(),
    consultaQueue.getCompletedCount(),
    consultaQueue.getFailedCount(),
  ]);

  const [envioWaiting, envioActive] = await Promise.all([
    envioQueue.getWaitingCount(),
    envioQueue.getActiveCount(),
  ]);

  return {
    consultas: {
      aguardando: consultaWaiting,
      processando: consultaActive,
      concluidas: consultaCompleted,
      falhas: consultaFailed,
    },
    envios: {
      aguardando: envioWaiting,
      processando: envioActive,
    },
  };
}
