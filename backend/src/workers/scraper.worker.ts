import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import { prisma } from '../utils/prisma.js';
import { scraperService } from '../services/scraper.service.js';
import { callbackService } from '../services/callback.service.js';
import { normalizarNumeroProcesso } from '../utils/processo.js';
import { aplicarRetencaoProcesso } from '../utils/retencao.js';

// Parse Redis URL corretamente (suporta senha)
function parseRedisUrl(url: string | undefined) {
  if (!url) {
    return { host: 'localhost', port: 6379 };
  }

  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || 'localhost',
      port: parseInt(parsed.port) || 6379,
      password: parsed.password || undefined,
    };
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}

const redisConnection = parseRedisUrl(process.env.REDIS_URL);

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
        // Normaliza numero do processo (remove . e -)
        const numeroNormalizado = normalizarNumeroProcesso(processo.numeroProcesso);

        // Verifica se ja existe
        const existe = await prisma.publicacao.findFirst({
          where: {
            advogadoId,
            numeroProcesso: numeroNormalizado,
          },
        });

        if (!existe) {
          const publicacao = await prisma.publicacao.create({
            data: {
              advogadoId,
              numeroProcesso: numeroNormalizado,
              siglaTribunal: processo.siglaTribunal,
              dataPublicacao: processo.dataPublicacao
                ? new Date(processo.dataPublicacao.split('/').reverse().join('-'))
                : null,
              tipoComunicacao: processo.tipoComunicacao,
              textoComunicacao: processo.textoComunicacao,
              textoLimpo: processo.textoLimpo,
              parteAutor: processo.parteAutor,
              parteReu: processo.parteReu,
              comarca: processo.comarca,
              classeProcessual: processo.classeProcessual,
              advogadosProcesso: processo.advogadosProcesso ? JSON.parse(JSON.stringify(processo.advogadosProcesso)) : undefined,
              nomeOrgao: processo.nomeOrgao,
              status: 'NOVA',
            },
          });

          novas++;
          publicacoesNovas.push(publicacao);

          // Aplica politica de retencao: mantem apenas os 3 ultimos andamentos do processo
          await aplicarRetencaoProcesso(numeroNormalizado);
        }
      }

      console.log(`[Worker] ${novas} novas publicacoes salvas`);

      // Conta total de andamentos no banco para este advogado
      const totalAndamentos = await prisma.publicacao.count({
        where: { advogadoId },
      });

      // Atualiza contador do advogado
      await prisma.advogado.update({
        where: { id: advogadoId },
        data: {
          totalPublicacoes: { increment: novas },
          ultimaConsulta: new Date(),
          ultimaSincronizacao: new Date(),
          totalAndamentos,
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
            textoLimpo: p.textoLimpo,
            parteAutor: p.parteAutor,
            parteReu: p.parteReu,
            comarca: p.comarca,
            classeProcessual: p.classeProcessual,
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

// Configuracao de horario de funcionamento
const HORARIO_CONFIG = {
  horaInicio: 6,       // 6h da manha
  minutoInicio: 10,    // 10 minutos (inicia 6:10)
  horaFim: 21,         // 21h (9pm)
  minutoFim: 0,        // 0 minutos (termina 21:00)
  diasSemana: [1, 2, 3, 4, 5, 6], // Segunda(1) a Sabado(6) - Domingo(0) nao roda
  fusoHorario: 'America/Sao_Paulo',
};

// Delay variavel entre consultas (30s a 2min)
const DELAY_MIN_MS = 30 * 1000;  // 30 segundos
const DELAY_MAX_MS = 120 * 1000; // 2 minutos

/**
 * Verifica se esta dentro do horario de funcionamento
 * Segunda a Sabado, das 6:10 as 21:00 (horario de Brasilia)
 */
function dentroDoHorarioFuncionamento(): boolean {
  const agora = new Date();

  // Converte para horario de Brasilia
  const horaBrasilia = new Date(agora.toLocaleString('en-US', { timeZone: HORARIO_CONFIG.fusoHorario }));
  const hora = horaBrasilia.getHours();
  const minuto = horaBrasilia.getMinutes();
  const diaSemana = horaBrasilia.getDay(); // 0=Domingo, 1=Segunda, ..., 6=Sabado

  // Converte para minutos do dia para comparacao mais facil
  const minutosAgora = hora * 60 + minuto;
  const minutosInicio = HORARIO_CONFIG.horaInicio * 60 + HORARIO_CONFIG.minutoInicio;
  const minutosFim = HORARIO_CONFIG.horaFim * 60 + HORARIO_CONFIG.minutoFim;

  const dentroDoHorario = minutosAgora >= minutosInicio && minutosAgora < minutosFim;
  const diaPermitido = HORARIO_CONFIG.diasSemana.includes(diaSemana);

  return dentroDoHorario && diaPermitido;
}

/**
 * Retorna delay aleatorio entre consultas
 */
function getDelayAleatorio(): number {
  return DELAY_MIN_MS + Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS);
}

/**
 * Aguarda um tempo (promise)
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Scheduler para consultas automaticas (MODO BUFFER/CACHE)
async function agendarConsultasAutomaticas(): Promise<void> {
  // Verifica se esta dentro do horario de funcionamento
  if (!dentroDoHorarioFuncionamento()) {
    const agora = new Date();
    const horaBrasilia = new Date(agora.toLocaleString('en-US', { timeZone: HORARIO_CONFIG.fusoHorario }));
    console.log(`\n[Scheduler] Fora do horario de funcionamento (${horaBrasilia.toLocaleString('pt-BR')})`);
    console.log(`[Scheduler] Horario permitido: ${HORARIO_CONFIG.horaInicio}h-${HORARIO_CONFIG.horaFim}h, Segunda a Sabado`);
    return;
  }

  console.log('\n[Scheduler] Verificando advogados para sincronizacao automatica...');
  console.log(`[Scheduler] Horario de funcionamento: ${HORARIO_CONFIG.horaInicio}h-${HORARIO_CONFIG.horaFim}h, Seg-Sab`);

  // Busca advogados com sincronizacao ativa que nao foram sincronizados nas ultimas 24h
  const vinteQuatroHorasAtras = new Date();
  vinteQuatroHorasAtras.setHours(vinteQuatroHorasAtras.getHours() - 24);

  const advogados = await prisma.advogado.findMany({
    where: {
      ativo: true,
      sincronizacaoAtiva: true,
      OR: [
        { ultimaSincronizacao: null },
        { ultimaSincronizacao: { lt: vinteQuatroHorasAtras } },
      ],
    },
    orderBy: [
      { ultimaSincronizacao: 'asc' }, // Prioriza quem nao sincronizou ha mais tempo
    ],
    take: 50, // Limita a 50 por ciclo para nao sobrecarregar
  });

  console.log(`[Scheduler] ${advogados.length} advogados para sincronizar`);

  const { adicionarConsulta } = await import('../utils/queue.js');

  for (let i = 0; i < advogados.length; i++) {
    const advogado = advogados[i];

    // Verifica novamente se ainda esta no horario (pode ter passado durante o loop)
    if (!dentroDoHorarioFuncionamento()) {
      console.log(`[Scheduler] Saiu do horario de funcionamento, pausando...`);
      break;
    }

    const hoje = new Date();
    const fim = hoje.toISOString().split('T')[0];

    // Define periodo baseado se ja foi sincronizado antes
    let inicio: string;
    if (advogado.ultimaSincronizacao) {
      // Ja foi sincronizado: busca ultimos 7 dias
      const dataInicio = new Date(hoje);
      dataInicio.setDate(dataInicio.getDate() - 7);
      inicio = dataInicio.toISOString().split('T')[0];
    } else {
      // Primeira sincronizacao: busca ultimos 3 anos
      inicio = new Date(hoje.getFullYear() - 3, hoje.getMonth(), hoje.getDate())
        .toISOString()
        .split('T')[0];
    }

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

    console.log(`[Scheduler] Sincronizando: ${advogado.nome} | Periodo: ${inicio} a ${fim}`);

    // Delay variavel entre consultas (exceto na ultima)
    if (i < advogados.length - 1) {
      const delay = getDelayAleatorio();
      console.log(`[Scheduler] Aguardando ${Math.round(delay / 1000)}s antes da proxima consulta...`);
      await sleep(delay);
    }
  }

  // Log de status
  const stats = await prisma.advogado.aggregate({
    where: { ativo: true, sincronizacaoAtiva: true },
    _count: true,
  });
  console.log(`[Scheduler] Total advogados ativos com sync: ${stats._count}`);
}

// Executa scheduler a cada 30 minutos (MODO BUFFER)
setInterval(agendarConsultasAutomaticas, 30 * 60 * 1000);

// Executa uma vez ao iniciar (depois de 10 segundos)
setTimeout(agendarConsultasAutomaticas, 10000);

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
