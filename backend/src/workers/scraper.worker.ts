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
      // Executa scraping em blocos de 1 ano (evita limite de 50 paginas)
      const resultado = await scraperService.buscarPublicacoesEmBlocos(
        nome,
        dataInicio,
        dataFim,
        tribunal
      );

      const { processos, detalhes } = resultado;

      console.log(`[Worker] Encontrados ${processos.length} processos`);
      console.log(`[Worker] Detalhes: ${detalhes.blocosProcessados} blocos, ${detalhes.paginasNavegadas} paginas, ${detalhes.duracaoMs}ms`);

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

      // Atualiza status da consulta com detalhes de raspagem
      await prisma.consulta.updateMany({
        where: {
          advogadoId,
          status: 'PROCESSANDO',
        },
        data: {
          status: 'CONCLUIDA',
          finalizadoEm: new Date(),
          publicacoesEncontradas: processos.length,
          publicacoesNovas: novas,
          duracaoMs: detalhes.duracaoMs,
          paginasNavegadas: detalhes.paginasNavegadas,
          blocosProcessados: detalhes.blocosProcessados,
          captchaDetectado: detalhes.captchaDetectado,
          bloqueioDetectado: detalhes.bloqueioDetectado,
          proxyId: detalhes.proxyUsado?.id || null,
          detalhesRaspagem: detalhes.detalhesExtras,
        },
      });

      // Envia novas publicacoes para AdvWell via callback
      if (publicacoesNovas.length > 0) {
        await callbackService.enviarParaAdvwell(
          advogadoId,
          publicacoesNovas.map((p) => ({
            numeroProcesso: p.numeroProcesso,
            siglaTribunal: p.siglaTribunal,
            orgaoJulgador: p.orgaoJulgador,
            dataDisponibilizacao: p.dataDisponibilizacao,
            dataPublicacao: p.dataPublicacao,
            tipoComunicacao: p.tipoComunicacao,
            textoComunicacao: p.textoComunicacao,
            textoLimpo: p.textoLimpo,
            linkIntegra: p.linkIntegra,
            parteAutor: p.parteAutor,
            parteReu: p.parteReu,
            comarca: p.comarca,
            classeProcessual: p.classeProcessual,
            advogadosProcesso: p.advogadosProcesso,
            nomeOrgao: p.nomeOrgao,
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
    concurrency: 3, // Processa 3 jobs simultaneamente por worker
    limiter: {
      max: 5,
      duration: 60000, // Max 5 por minuto (conservador para CNJ)
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

    // Define periodo: sempre busca ultimos 5 anos
    const inicio = new Date(hoje.getFullYear() - 5, hoje.getMonth(), hoje.getDate())
      .toISOString()
      .split('T')[0];

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

// Reset de contadores de proxy a cada hora (distribui uso entre todos os proxies)
async function resetarContadoresProxy(): Promise<void> {
  try {
    const resultado = await prisma.proxy.updateMany({
      where: { ativo: true },
      data: { consultasHoraAtual: 0 },
    });
    console.log(`[Proxy] Contadores resetados: ${resultado.count} proxies`);
  } catch (error: any) {
    console.error(`[Proxy] Erro ao resetar contadores: ${error.message}`);
  }
}

// Executa reset de proxies a cada hora
setInterval(resetarContadoresProxy, 60 * 60 * 1000);

// Reset inicial ao iniciar (garante distribuicao desde o inicio)
setTimeout(resetarContadoresProxy, 5000);

// ============================================================================
// HEALTH CHECK DE PROXIES (2x ao dia - 8h e 20h)
// ============================================================================

const HEALTH_CHECK_HORAS = [8, 20]; // Horarios de health check (Brasilia)
let ultimoHealthCheckHora: number | null = null; // Evita executar mais de 1x na mesma hora

/**
 * Testa conectividade basica do proxy via ipify.org
 */
async function testarConectividadeProxy(proxy: { host: string; porta: number; usuario?: string | null; senha?: string | null; protocolo: string }): Promise<{ ok: boolean; erro?: string }> {
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

    const contextOptions: any = {
      proxy: {
        server: `${proxy.protocolo}://${proxy.host}:${proxy.porta}`,
        username: proxy.usuario || undefined,
        password: proxy.senha || undefined,
      },
    };

    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();

    // Timeout de 30 segundos para teste
    await page.goto('https://api.ipify.org?format=json', { timeout: 30000 });
    const conteudo = await page.content();

    await context.close();
    await browser.close();

    if (conteudo.includes('ip')) {
      return { ok: true };
    }
    return { ok: false, erro: 'Resposta invalida do ipify' };
  } catch (error: any) {
    return { ok: false, erro: error.message };
  }
}

/**
 * Testa acesso ao HComunica CNJ e detecta bloqueio
 */
async function testarAcessoCnj(proxy: { host: string; porta: number; usuario?: string | null; senha?: string | null; protocolo: string }): Promise<{ ok: boolean; bloqueadoCnj: boolean; motivo?: string }> {
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

    const contextOptions: any = {
      proxy: {
        server: `${proxy.protocolo}://${proxy.host}:${proxy.porta}`,
        username: proxy.usuario || undefined,
        password: proxy.senha || undefined,
      },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();

    // Tenta acessar o HComunica
    const response = await page.goto('https://hcomunica.cnj.jus.br', { timeout: 60000 });
    const conteudo = await page.content();
    const statusCode = response?.status() || 0;

    await context.close();
    await browser.close();

    // Detecta sinais de bloqueio
    const sinaisBloqueio = [
      'acesso negado',
      'ip bloqueado',
      'muitas requisições',
      'muitas requisicoes',
      'tente novamente mais tarde',
      'rate limit',
      'too many requests',
      'access denied',
      'blocked',
    ];

    const conteudoLower = conteudo.toLowerCase();
    for (const sinal of sinaisBloqueio) {
      if (conteudoLower.includes(sinal)) {
        return { ok: false, bloqueadoCnj: true, motivo: sinal };
      }
    }

    // Verifica status HTTP
    if (statusCode === 403 || statusCode === 429) {
      return { ok: false, bloqueadoCnj: true, motivo: `HTTP ${statusCode}` };
    }

    if (statusCode >= 500) {
      return { ok: false, bloqueadoCnj: false, motivo: `Erro servidor: HTTP ${statusCode}` };
    }

    // Verifica se a pagina carregou corretamente (deve ter o titulo do HComunica)
    if (conteudoLower.includes('hcomunica') || conteudoLower.includes('consulta pública')) {
      return { ok: true, bloqueadoCnj: false };
    }

    // Se chegou aqui, pode ser captcha ou outro problema
    if (conteudoLower.includes('captcha') || conteudoLower.includes('recaptcha')) {
      return { ok: false, bloqueadoCnj: true, motivo: 'CAPTCHA detectado' };
    }

    return { ok: true, bloqueadoCnj: false };
  } catch (error: any) {
    const mensagem = error.message || '';
    const isBloqueio = mensagem.includes('403') || mensagem.includes('blocked') || mensagem.includes('rate limit');
    return { ok: false, bloqueadoCnj: isBloqueio, motivo: mensagem };
  }
}

/**
 * Executa health check completo em um proxy
 */
async function executarHealthCheckProxy(proxyId: string): Promise<void> {
  const proxy = await prisma.proxy.findUnique({ where: { id: proxyId } });
  if (!proxy) return;

  console.log(`[HealthCheck] Testando proxy: ${proxy.host}:${proxy.porta}`);

  // Teste 1: Conectividade basica
  const conectividade = await testarConectividadeProxy(proxy);

  if (!conectividade.ok) {
    console.log(`[HealthCheck] Proxy ${proxy.host}:${proxy.porta} - FALHA conectividade: ${conectividade.erro}`);

    await prisma.proxy.update({
      where: { id: proxyId },
      data: {
        ultimoHealthCheck: new Date(),
        funcionando: false,
        falhasConsecutivas: proxy.falhasConsecutivas + 1,
        necessitaSubstituicao: proxy.falhasConsecutivas + 1 >= 5,
        ultimoErro: conectividade.erro,
      },
    });
    return;
  }

  // Teste 2: Acesso ao CNJ
  const acessoCnj = await testarAcessoCnj(proxy);

  if (!acessoCnj.ok) {
    console.log(`[HealthCheck] Proxy ${proxy.host}:${proxy.porta} - FALHA CNJ: ${acessoCnj.motivo} (bloqueado: ${acessoCnj.bloqueadoCnj})`);

    await prisma.proxy.update({
      where: { id: proxyId },
      data: {
        ultimoHealthCheck: new Date(),
        funcionando: !acessoCnj.bloqueadoCnj, // Se bloqueado CNJ, marca como nao funcionando
        bloqueadoCnj: acessoCnj.bloqueadoCnj,
        dataBloqueioCnj: acessoCnj.bloqueadoCnj ? new Date() : proxy.dataBloqueioCnj,
        falhasConsecutivas: proxy.falhasConsecutivas + 1,
        necessitaSubstituicao: acessoCnj.bloqueadoCnj || proxy.falhasConsecutivas + 1 >= 5,
        ultimoErro: acessoCnj.motivo,
      },
    });
    return;
  }

  // Proxy OK - reseta contadores
  console.log(`[HealthCheck] Proxy ${proxy.host}:${proxy.porta} - OK`);

  await prisma.proxy.update({
    where: { id: proxyId },
    data: {
      ultimoHealthCheck: new Date(),
      funcionando: true,
      bloqueadoCnj: false,
      falhasConsecutivas: 0,
      necessitaSubstituicao: false,
      ultimoErro: null,
    },
  });
}

/**
 * Gera alertas para proxies problematicos
 */
async function gerarAlertasProxies(): Promise<void> {
  // Busca proxies que precisam substituicao
  const problematicos = await prisma.proxy.findMany({
    where: {
      ativo: true,
      OR: [
        { bloqueadoCnj: true },
        { necessitaSubstituicao: true },
        { falhasConsecutivas: { gte: 3 } },
      ],
    },
  });

  if (problematicos.length === 0) {
    console.log('[HealthCheck] Nenhum proxy problematico encontrado');
    return;
  }

  // Separa por criticidade
  const bloqueadosCnj = problematicos.filter(p => p.bloqueadoCnj);
  const comMuitasFalhas = problematicos.filter(p => !p.bloqueadoCnj && p.falhasConsecutivas >= 5);
  const comAlgumasFalhas = problematicos.filter(p => !p.bloqueadoCnj && p.falhasConsecutivas >= 3 && p.falhasConsecutivas < 5);

  // Alerta CRITICO para bloqueados CNJ
  if (bloqueadosCnj.length > 0) {
    await prisma.logSistema.create({
      data: {
        tipo: 'CRITICO',
        categoria: 'PROXY',
        titulo: `${bloqueadosCnj.length} proxy(s) bloqueado(s) pelo CNJ`,
        mensagem: `Os seguintes proxies foram bloqueados pelo CNJ e precisam ser substituidos URGENTEMENTE:\n\n${bloqueadosCnj.map(p => `- ${p.host}:${p.porta} (bloqueado em ${p.dataBloqueioCnj?.toLocaleString('pt-BR') || 'N/A'})`).join('\n')}`,
      },
    });
    console.log(`[HealthCheck] Alerta CRITICO: ${bloqueadosCnj.length} proxies bloqueados pelo CNJ`);
  }

  // Alerta ERRO para muitas falhas
  if (comMuitasFalhas.length > 0) {
    await prisma.logSistema.create({
      data: {
        tipo: 'ERRO',
        categoria: 'PROXY',
        titulo: `${comMuitasFalhas.length} proxy(s) com muitas falhas`,
        mensagem: `Os seguintes proxies tiveram 5+ falhas consecutivas e precisam ser verificados:\n\n${comMuitasFalhas.map(p => `- ${p.host}:${p.porta} (${p.falhasConsecutivas} falhas) - ${p.ultimoErro || 'Sem detalhes'}`).join('\n')}`,
      },
    });
    console.log(`[HealthCheck] Alerta ERRO: ${comMuitasFalhas.length} proxies com muitas falhas`);
  }

  // Alerta WARNING para algumas falhas
  if (comAlgumasFalhas.length > 0) {
    await prisma.logSistema.create({
      data: {
        tipo: 'ALERTA',
        categoria: 'PROXY',
        titulo: `${comAlgumasFalhas.length} proxy(s) com falhas intermitentes`,
        mensagem: `Os seguintes proxies tiveram 3+ falhas consecutivas e devem ser monitorados:\n\n${comAlgumasFalhas.map(p => `- ${p.host}:${p.porta} (${p.falhasConsecutivas} falhas)`).join('\n')}`,
      },
    });
    console.log(`[HealthCheck] Alerta WARNING: ${comAlgumasFalhas.length} proxies com falhas intermitentes`);
  }
}

/**
 * Executa health check de todos os proxies ativos (roda 2x ao dia)
 */
async function executarHealthCheckProxies(): Promise<void> {
  const agora = new Date();
  const horaBrasilia = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const hora = horaBrasilia.getHours();

  // Verifica se esta nas horas configuradas
  if (!HEALTH_CHECK_HORAS.includes(hora)) {
    return;
  }

  // Evita executar mais de 1x na mesma hora
  if (ultimoHealthCheckHora === hora) {
    return;
  }

  console.log(`\n[HealthCheck] ========================================`);
  console.log(`[HealthCheck] Iniciando health check de proxies (${horaBrasilia.toLocaleString('pt-BR')})`);
  console.log(`[HealthCheck] ========================================`);

  ultimoHealthCheckHora = hora;

  // Busca proxies ativos
  const proxies = await prisma.proxy.findMany({
    where: { ativo: true },
    orderBy: { ultimoHealthCheck: 'asc' }, // Prioriza quem nao foi testado ha mais tempo
  });

  console.log(`[HealthCheck] ${proxies.length} proxies para testar`);

  // Testa cada proxy sequencialmente (evita sobrecarregar)
  for (let i = 0; i < proxies.length; i++) {
    const proxy = proxies[i];
    console.log(`[HealthCheck] Testando ${i + 1}/${proxies.length}: ${proxy.host}:${proxy.porta}`);

    await executarHealthCheckProxy(proxy.id);

    // Delay entre testes (5-10s)
    if (i < proxies.length - 1) {
      const delay = 5000 + Math.random() * 5000;
      await new Promise(r => setTimeout(r, delay));
    }
  }

  console.log(`[HealthCheck] Testes concluidos, gerando alertas...`);

  // Gera alertas apos todos os testes
  await gerarAlertasProxies();

  console.log(`[HealthCheck] Health check finalizado`);
  console.log(`[HealthCheck] ========================================\n`);
}

// Executa verificacao de health check a cada hora (verifica se esta nas horas configuradas)
setInterval(executarHealthCheckProxies, 60 * 60 * 1000);

// Executa verificacao inicial apos 30 segundos
setTimeout(executarHealthCheckProxies, 30000);

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
