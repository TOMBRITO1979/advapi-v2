import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import { prisma } from '../utils/prisma.js';
import { scraperService } from '../services/scraper.service.js';
import { callbackService } from '../services/callback.service.js';

const redisConnection = {
  host: process.env.REDIS_URL?.replace('redis://', '').split(':')[0] || 'localhost',
  port: parseInt(process.env.REDIS_URL?.split(':')[2] || '6379'),
};

interface ConsultaJob {
  advogadoId: string;
  nome: string;
  tribunal?: string;
  dataInicio: string;
  dataFim: string;
  prioridade?: number;
}

console.log('=================================');
console.log('ADVAPI Worker - Scraper de Publicacoes');
console.log('=================================');

// Worker para processar consultas
const worker = new Worker<ConsultaJob>(
  'consultas',
  async (job: Job<ConsultaJob>) => {
    const { advogadoId, nome, tribunal, dataInicio, dataFim } = job.data;

    console.log(`\n[Worker] Processando job ${job.id}`);
    console.log(`[Worker] Advogado: ${nome}`);
    console.log(`[Worker] Periodo: ${dataInicio} a ${dataFim}`);

    // Atualiza status da consulta mais recente
    await prisma.consulta.updateMany({
      where: {
        advogadoId,
        status: 'PENDENTE',
      },
      data: {
        status: 'PROCESSANDO',
        iniciadoEm: new Date(),
      },
    });

    try {
      // Executa scraping
      const processos = await scraperService.buscarPublicacoes(
        nome,
        dataInicio,
        dataFim,
        tribunal
      );

      console.log(`[Worker] Encontrados ${processos.length} processos`);

      // Salva publicacoes no banco
      let novas = 0;
      const publicacoesNovas = [];

      for (const processo of processos) {
        // Verifica se ja existe
        const existe = await prisma.publicacao.findFirst({
          where: {
            advogadoId,
            numeroProcesso: processo.numeroProcesso,
          },
        });

        if (!existe) {
          const publicacao = await prisma.publicacao.create({
            data: {
              advogadoId,
              numeroProcesso: processo.numeroProcesso,
              siglaTribunal: processo.siglaTribunal,
              dataPublicacao: processo.dataPublicacao
                ? new Date(processo.dataPublicacao.split('/').reverse().join('-'))
                : null,
              tipoComunicacao: processo.tipoComunicacao,
              textoComunicacao: processo.textoComunicacao,
              status: 'NOVA',
            },
          });

          novas++;
          publicacoesNovas.push(publicacao);
        }
      }

      console.log(`[Worker] ${novas} novas publicacoes salvas`);

      // Atualiza contador do advogado
      await prisma.advogado.update({
        where: { id: advogadoId },
        data: {
          totalPublicacoes: { increment: novas },
          ultimaConsulta: new Date(),
        },
      });

      // Atualiza status da consulta
      await prisma.consulta.updateMany({
        where: {
          advogadoId,
          status: 'PROCESSANDO',
        },
        data: {
          status: 'CONCLUIDA',
          finalizadoEm: new Date(),
          publicacoesEncontradas: processos.length,
        },
      });

      // Envia novas publicacoes para AdvWell via callback
      if (publicacoesNovas.length > 0) {
        await callbackService.enviarParaAdvwell(
          advogadoId,
          publicacoesNovas.map((p) => ({
            numeroProcesso: p.numeroProcesso,
            siglaTribunal: p.siglaTribunal,
            dataPublicacao: p.dataPublicacao,
            tipoComunicacao: p.tipoComunicacao,
            textoComunicacao: p.textoComunicacao,
          }))
        );
      }

      return { sucesso: true, processos: processos.length, novas };
    } catch (error: any) {
      console.error(`[Worker] Erro: ${error.message}`);

      // Atualiza status da consulta com erro
      await prisma.consulta.updateMany({
        where: {
          advogadoId,
          status: 'PROCESSANDO',
        },
        data: {
          status: 'ERRO',
          finalizadoEm: new Date(),
          erro: error.message,
        },
      });

      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 2, // Processa 2 jobs simultaneamente
    limiter: {
      max: 10,
      duration: 60000, // Max 10 por minuto
    },
  }
);

worker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} concluido`);
});

worker.on('failed', (job, error) => {
  console.error(`[Worker] Job ${job?.id} falhou: ${error.message}`);
});

worker.on('error', (error) => {
  console.error(`[Worker] Erro: ${error.message}`);
});

// Scheduler para consultas automaticas
async function agendarConsultasAutomaticas(): Promise<void> {
  console.log('\n[Scheduler] Verificando advogados para consulta automatica...');

  // Busca advogados ativos que nao foram consultados nas ultimas 24h
  const umDiaAtras = new Date();
  umDiaAtras.setDate(umDiaAtras.getDate() - 1);

  const advogados = await prisma.advogado.findMany({
    where: {
      ativo: true,
      OR: [
        { ultimaConsulta: null },
        { ultimaConsulta: { lt: umDiaAtras } },
      ],
    },
  });

  console.log(`[Scheduler] ${advogados.length} advogados para consultar`);

  const { adicionarConsulta } = await import('../utils/queue.js');

  for (const advogado of advogados) {
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear() - 1, hoje.getMonth(), hoje.getDate())
      .toISOString()
      .split('T')[0];
    const fim = hoje.toISOString().split('T')[0];

    // Cria consulta
    await prisma.consulta.create({
      data: {
        advogadoId: advogado.id,
        dataInicio: new Date(inicio),
        dataFim: new Date(fim),
        status: 'PENDENTE',
      },
    });

    // Adiciona na fila
    await adicionarConsulta({
      advogadoId: advogado.id,
      nome: advogado.nome,
      tribunal: advogado.tribunais[0],
      dataInicio: inicio,
      dataFim: fim,
      prioridade: 0, // Baixa prioridade para automaticas
    });

    console.log(`[Scheduler] Agendado: ${advogado.nome}`);
  }
}

// Executa scheduler a cada hora
setInterval(agendarConsultasAutomaticas, 60 * 60 * 1000);

// Executa uma vez ao iniciar
setTimeout(agendarConsultasAutomaticas, 5000);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\n[Worker] Finalizando...');
  await worker.close();
  await scraperService.finalizar();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n[Worker] Finalizando...');
  await worker.close();
  await scraperService.finalizar();
  process.exit(0);
});

console.log('[Worker] Aguardando jobs...');
