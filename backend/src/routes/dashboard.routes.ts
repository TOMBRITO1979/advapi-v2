import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { getQueueStatus } from '../utils/queue.js';
import { authMiddleware, AuthRequest } from '../middlewares/auth.js';

const router = Router();

router.use(authMiddleware);

/**
 * GET /api/dashboard
 * Dados gerais do dashboard
 */
router.get('/', async (req: AuthRequest, res) => {
  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const inicioSemana = new Date(hoje);
  inicioSemana.setDate(hoje.getDate() - hoje.getDay());

  const [
    totalAdvogados,
    advogadosAtivos,
    totalPublicacoes,
    publicacoesNovas,
    publicacoesHoje,
    publicacoesSemana,
    publicacoesMes,
    totalProxies,
    proxiesAtivos,
    consultasPendentes,
    consultasProcessando,
    ultimasPublicacoes,
    ultimasConsultas,
    queueStatus,
  ] = await Promise.all([
    prisma.advogado.count(),
    prisma.advogado.count({ where: { ativo: true } }),
    prisma.publicacao.count(),
    prisma.publicacao.count({ where: { status: 'NOVA' } }),
    prisma.publicacao.count({
      where: { createdAt: { gte: new Date(hoje.toISOString().split('T')[0]) } },
    }),
    prisma.publicacao.count({ where: { createdAt: { gte: inicioSemana } } }),
    prisma.publicacao.count({ where: { createdAt: { gte: inicioMes } } }),
    prisma.proxy.count(),
    prisma.proxy.count({ where: { ativo: true } }),
    prisma.consulta.count({ where: { status: 'PENDENTE' } }),
    prisma.consulta.count({ where: { status: 'PROCESSANDO' } }),
    prisma.publicacao.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        advogado: { select: { nome: true } },
      },
    }),
    prisma.consulta.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        advogado: { select: { nome: true } },
      },
    }),
    getQueueStatus(),
  ]);

  res.json({
    resumo: {
      advogados: {
        total: totalAdvogados,
        ativos: advogadosAtivos,
      },
      publicacoes: {
        total: totalPublicacoes,
        novas: publicacoesNovas,
        hoje: publicacoesHoje,
        semana: publicacoesSemana,
        mes: publicacoesMes,
      },
      proxies: {
        total: totalProxies,
        ativos: proxiesAtivos,
      },
      fila: {
        pendentes: consultasPendentes,
        processando: consultasProcessando,
        ...queueStatus,
      },
    },
    ultimasPublicacoes: ultimasPublicacoes.map((p) => ({
      id: p.id,
      numeroProcesso: p.numeroProcesso,
      advogado: p.advogado.nome,
      dataPublicacao: p.dataPublicacao,
      status: p.status,
    })),
    ultimasConsultas: ultimasConsultas.map((c) => ({
      id: c.id,
      advogado: c.advogado.nome,
      status: c.status,
      criadoEm: c.createdAt,
    })),
  });
});

/**
 * GET /api/dashboard/grafico/publicacoes
 * Dados para grafico de publicacoes por dia
 */
router.get('/grafico/publicacoes', async (req: AuthRequest, res) => {
  const { dias = '30' } = req.query;

  const dataInicio = new Date();
  dataInicio.setDate(dataInicio.getDate() - Number(dias));

  const publicacoes = await prisma.$queryRaw<{ data: Date; total: bigint }[]>`
    SELECT DATE("createdAt") as data, COUNT(*) as total
    FROM "Publicacao"
    WHERE "createdAt" >= ${dataInicio}
    GROUP BY DATE("createdAt")
    ORDER BY data ASC
  `;

  res.json(
    publicacoes.map((p) => ({
      data: p.data,
      total: Number(p.total),
    }))
  );
});

/**
 * GET /api/dashboard/grafico/consultas
 * Dados para grafico de consultas por status
 */
router.get('/grafico/consultas', async (req: AuthRequest, res) => {
  const porStatus = await prisma.consulta.groupBy({
    by: ['status'],
    _count: true,
  });

  res.json(
    porStatus.map((item) => ({
      status: item.status,
      total: item._count,
    }))
  );
});

/**
 * GET /api/dashboard/advogados-top
 * Advogados com mais publicacoes
 */
router.get('/advogados-top', async (req: AuthRequest, res) => {
  const { limit = '10' } = req.query;

  const advogados = await prisma.advogado.findMany({
    take: Number(limit),
    orderBy: { totalPublicacoes: 'desc' },
    select: {
      id: true,
      nome: true,
      oab: true,
      totalPublicacoes: true,
      ativo: true,
    },
  });

  res.json(advogados);
});

/**
 * GET /api/dashboard/fila
 * Status da fila de processamento (para o frontend)
 */
router.get('/fila', async (req: AuthRequest, res) => {
  const status = await getQueueStatus();
  res.json(status);
});

/**
 * GET /api/dashboard/atividade
 * Log de atividades recentes
 */
router.get('/atividade', async (req: AuthRequest, res) => {
  const { limit = '20' } = req.query;

  const [publicacoes, consultas] = await Promise.all([
    prisma.publicacao.findMany({
      take: Number(limit),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        numeroProcesso: true,
        createdAt: true,
        advogado: { select: { nome: true } },
      },
    }),
    prisma.consulta.findMany({
      take: Number(limit),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        createdAt: true,
        finalizadoEm: true,
        advogado: { select: { nome: true } },
      },
    }),
  ]);

  // Combina e ordena por data
  const atividades = [
    ...publicacoes.map((p) => ({
      tipo: 'publicacao',
      id: p.id,
      descricao: `Nova publicacao: ${p.numeroProcesso}`,
      advogado: p.advogado.nome,
      data: p.createdAt,
    })),
    ...consultas.map((c) => ({
      tipo: 'consulta',
      id: c.id,
      descricao: `Consulta ${c.status.toLowerCase()}`,
      advogado: c.advogado.nome,
      data: c.finalizadoEm || c.createdAt,
    })),
  ]
    .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
    .slice(0, Number(limit));

  res.json(atividades);
});

/**
 * GET /api/dashboard/metricas
 * Metricas completas do sistema
 */
router.get('/metricas', async (req: AuthRequest, res) => {
  const hoje = new Date();
  const inicioHoje = new Date(hoje.toISOString().split('T')[0]);
  const inicioSemana = new Date(hoje);
  inicioSemana.setDate(hoje.getDate() - 7);
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

  const [
    // Advogados
    totalAdvogados,
    advogadosAtivos,
    advogadosComPublicacoes,

    // Consultas
    totalConsultas,
    consultasConcluidas,
    consultasErro,
    consultasPendentes,
    consultasHoje,
    consultasSemana,

    // Publicacoes
    totalPublicacoes,
    publicacoesNovas,
    publicacoesEnviadas,
    publicacoesErro,
    publicacoesHoje,
    publicacoesSemana,
    publicacoesMes,

    // Proxies
    totalProxies,
    proxiesAtivos,
    proxiesFuncionando,

    // Callbacks (logs de envio)
    logsEnvio,

    // Top advogados
    topAdvogados,

    // Fila atual
    queueStatus,
  ] = await Promise.all([
    // Advogados
    prisma.advogado.count(),
    prisma.advogado.count({ where: { ativo: true } }),
    prisma.advogado.count({ where: { totalPublicacoes: { gt: 0 } } }),

    // Consultas
    prisma.consulta.count(),
    prisma.consulta.count({ where: { status: 'CONCLUIDA' } }),
    prisma.consulta.count({ where: { status: 'ERRO' } }),
    prisma.consulta.count({ where: { status: 'PENDENTE' } }),
    prisma.consulta.count({ where: { createdAt: { gte: inicioHoje } } }),
    prisma.consulta.count({ where: { createdAt: { gte: inicioSemana } } }),

    // Publicacoes
    prisma.publicacao.count(),
    prisma.publicacao.count({ where: { status: 'NOVA' } }),
    prisma.publicacao.count({ where: { status: 'ENVIADA' } }),
    prisma.publicacao.count({ where: { status: 'ERRO' } }),
    prisma.publicacao.count({ where: { createdAt: { gte: inicioHoje } } }),
    prisma.publicacao.count({ where: { createdAt: { gte: inicioSemana } } }),
    prisma.publicacao.count({ where: { createdAt: { gte: inicioMes } } }),

    // Proxies
    prisma.proxy.count(),
    prisma.proxy.count({ where: { ativo: true } }),
    prisma.proxy.count({ where: { ativo: true, funcionando: true } }),

    // Logs de envio (callbacks)
    prisma.execucaoLog.findMany({
      where: { tipo: 'ENVIO' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),

    // Top advogados
    prisma.advogado.findMany({
      take: 10,
      orderBy: { totalPublicacoes: 'desc' },
      select: {
        id: true,
        nome: true,
        totalPublicacoes: true,
        ultimaConsulta: true,
        ativo: true,
        _count: {
          select: { consultas: true },
        },
      },
    }),

    // Fila
    getQueueStatus(),
  ]);

  // Calcula totais de callbacks
  let callbacksSucesso = 0;
  let callbacksFalha = 0;
  for (const log of logsEnvio) {
    const detalhes = log.detalhes as any;
    if (detalhes) {
      callbacksSucesso += detalhes.sucesso || 0;
      callbacksFalha += detalhes.falhas || 0;
    }
  }

  // Calcula taxa de sucesso
  const taxaSucessoConsultas = totalConsultas > 0
    ? Math.round((consultasConcluidas / totalConsultas) * 100)
    : 0;
  const taxaSucessoCallbacks = (callbacksSucesso + callbacksFalha) > 0
    ? Math.round((callbacksSucesso / (callbacksSucesso + callbacksFalha)) * 100)
    : 100;

  res.json({
    advogados: {
      total: totalAdvogados,
      ativos: advogadosAtivos,
      comPublicacoes: advogadosComPublicacoes,
    },
    consultas: {
      total: totalConsultas,
      concluidas: consultasConcluidas,
      erros: consultasErro,
      pendentes: consultasPendentes,
      hoje: consultasHoje,
      semana: consultasSemana,
      taxaSucesso: taxaSucessoConsultas,
    },
    publicacoes: {
      total: totalPublicacoes,
      novas: publicacoesNovas,
      enviadas: publicacoesEnviadas,
      erros: publicacoesErro,
      hoje: publicacoesHoje,
      semana: publicacoesSemana,
      mes: publicacoesMes,
    },
    proxies: {
      total: totalProxies,
      ativos: proxiesAtivos,
      funcionando: proxiesFuncionando,
      offline: proxiesAtivos - proxiesFuncionando,
    },
    callbacks: {
      totalEnvios: logsEnvio.length,
      sucesso: callbacksSucesso,
      falhas: callbacksFalha,
      taxaSucesso: taxaSucessoCallbacks,
    },
    fila: queueStatus,
    topAdvogados: topAdvogados.map((a) => ({
      id: a.id,
      nome: a.nome,
      publicacoes: a.totalPublicacoes,
      consultas: a._count.consultas,
      ultimaConsulta: a.ultimaConsulta,
      ativo: a.ativo,
    })),
  });
});

/**
 * GET /api/dashboard/workers
 * Status dos workers e fila de processamento
 */
router.get('/workers', async (req: AuthRequest, res) => {
  const agora = new Date();
  const vinteQuatroHorasAtras = new Date(agora.getTime() - 24 * 60 * 60 * 1000);

  // Configuracao de horario (deve bater com o worker)
  const HORARIO_CONFIG = {
    horaInicio: 6,
    horaFim: 21,
    diasSemana: [1, 2, 3, 4, 5, 6],
  };

  // Verifica se esta dentro do horario de funcionamento
  const horaBrasilia = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const hora = horaBrasilia.getHours();
  const diaSemana = horaBrasilia.getDay();
  const dentroHorarioFuncionamento =
    hora >= HORARIO_CONFIG.horaInicio &&
    hora < HORARIO_CONFIG.horaFim &&
    HORARIO_CONFIG.diasSemana.includes(diaSemana);

  const [
    queueStatus,
    consultasProcessando,
    consultasConcluidas24h,
    consultasFalhas24h,
    ultimaConsultaConcluida,
    proximosAdvogados,
    jobsRecentes,
  ] = await Promise.all([
    getQueueStatus(),
    prisma.consulta.findMany({
      where: { status: 'PROCESSANDO' },
      include: { advogado: { select: { nome: true } } },
      orderBy: { iniciadoEm: 'asc' },
    }),
    prisma.consulta.count({
      where: { status: 'CONCLUIDA', finalizadoEm: { gte: vinteQuatroHorasAtras } },
    }),
    prisma.consulta.count({
      where: { status: 'ERRO', finalizadoEm: { gte: vinteQuatroHorasAtras } },
    }),
    prisma.consulta.findFirst({
      where: { status: 'CONCLUIDA' },
      orderBy: { finalizadoEm: 'desc' },
      include: { advogado: { select: { nome: true } } },
    }),
    prisma.advogado.findMany({
      where: {
        ativo: true,
        sincronizacaoAtiva: true,
        OR: [
          { ultimaSincronizacao: null },
          { ultimaSincronizacao: { lt: vinteQuatroHorasAtras } },
        ],
      },
      orderBy: { ultimaSincronizacao: 'asc' },
      take: 10,
      select: { id: true, nome: true, ultimaSincronizacao: true },
    }),
    prisma.consulta.findMany({
      where: { createdAt: { gte: vinteQuatroHorasAtras } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { advogado: { select: { nome: true } } },
    }),
  ]);

  // Determina status do worker baseado em atividade recente
  const ultimaAtividade = ultimaConsultaConcluida?.finalizadoEm || null;
  const tempoDesdeUltimaAtividade = ultimaAtividade
    ? (agora.getTime() - new Date(ultimaAtividade).getTime()) / 1000 / 60
    : null;

  // Worker esta online se completou algo nos ultimos 60 min dentro do horario
  const workerOnline = dentroHorarioFuncionamento &&
    (consultasProcessando.length > 0 || (tempoDesdeUltimaAtividade !== null && tempoDesdeUltimaAtividade < 60));

  // Calcula proxima raspagem estimada
  let proximaRaspagem: Date | null = null;
  if (proximosAdvogados.length > 0 && dentroHorarioFuncionamento) {
    proximaRaspagem = new Date(agora.getTime() + 30 * 60 * 1000); // Proximo ciclo em 30 min
  }

  res.json({
    worker: {
      status: workerOnline ? 'ONLINE' : (dentroHorarioFuncionamento ? 'AGUARDANDO' : 'FORA_HORARIO'),
      ultimaAtividade,
      tempoDesdeUltimaAtividade: tempoDesdeUltimaAtividade ? Math.round(tempoDesdeUltimaAtividade) : null,
    },
    horario: {
      dentroHorarioFuncionamento,
      horaAtual: hora,
      diaAtual: diaSemana,
      horarioPermitido: `${HORARIO_CONFIG.horaInicio}h-${HORARIO_CONFIG.horaFim}h`,
      diasPermitidos: 'Seg-Sab',
    },
    fila: {
      aguardando: queueStatus.consultas.aguardando || 0,
      processando: consultasProcessando.length,
      concluidos24h: consultasConcluidas24h,
      falhas24h: consultasFalhas24h,
    },
    jobsAtivos: consultasProcessando.map((c) => ({
      id: c.id,
      advogado: c.advogado.nome,
      iniciadoEm: c.iniciadoEm,
      duracao: c.iniciadoEm ? Math.round((agora.getTime() - new Date(c.iniciadoEm).getTime()) / 1000) : null,
    })),
    proximosNaFila: proximosAdvogados.map((a) => ({
      id: a.id,
      advogado: a.nome,
      ultimaSincronizacao: a.ultimaSincronizacao,
    })),
    jobsRecentes: jobsRecentes.map((j) => ({
      id: j.id,
      advogado: j.advogado.nome,
      status: j.status,
      iniciadoEm: j.iniciadoEm,
      finalizadoEm: j.finalizadoEm,
      publicacoesEncontradas: j.publicacoesEncontradas,
      erro: j.erro,
    })),
    proximaRaspagem,
  });
});

/**
 * GET /api/dashboard/publicacoes/:id
 * Retorna todos os detalhes de uma publicacao especifica
 */
router.get('/publicacoes/:id', async (req: AuthRequest, res) => {
  const { id } = req.params;

  const publicacao = await prisma.publicacao.findUnique({
    where: { id },
    include: {
      advogado: {
        select: { nome: true, oab: true },
      },
    },
  });

  if (!publicacao) {
    return res.status(404).json({ error: 'Publicacao nao encontrada' });
  }

  res.json({
    id: publicacao.id,
    advogado: publicacao.advogado.nome,
    oab: publicacao.advogado.oab,
    numeroProcesso: publicacao.numeroProcesso,
    siglaTribunal: publicacao.siglaTribunal,
    orgaoJulgador: publicacao.orgaoJulgador,
    nomeOrgao: publicacao.nomeOrgao,
    dataDisponibilizacao: publicacao.dataDisponibilizacao,
    dataPublicacao: publicacao.dataPublicacao,
    tipoComunicacao: publicacao.tipoComunicacao,
    textoComunicacao: publicacao.textoComunicacao,
    textoLimpo: publicacao.textoLimpo,
    linkIntegra: publicacao.linkIntegra,
    parteAutor: publicacao.parteAutor,
    parteReu: publicacao.parteReu,
    comarca: publicacao.comarca,
    classeProcessual: publicacao.classeProcessual,
    advogadosProcesso: publicacao.advogadosProcesso,
    status: publicacao.status,
    enviadoAdvwell: publicacao.enviadoAdvwell,
    enviadoEm: publicacao.enviadoEm,
    fonte: publicacao.fonte,
    dataRaspagem: publicacao.createdAt,
  });
});

/**
 * GET /api/dashboard/publicacoes
 * Lista todas as publicacoes do banco com filtros e paginacao
 */
router.get('/publicacoes', async (req: AuthRequest, res) => {
  const {
    page = '1',
    limit = '500',
    advogado,
    processo,
    dataInicio,
    dataFim,
  } = req.query;

  const where: any = {};

  // Filtro por nome do advogado
  if (advogado) {
    where.advogado = {
      nome: { contains: String(advogado).toUpperCase(), mode: 'insensitive' },
    };
  }

  // Filtro por numero do processo (busca parcial)
  if (processo) {
    where.numeroProcesso = { contains: String(processo) };
  }

  // Filtro por data de raspagem
  if (dataInicio || dataFim) {
    where.createdAt = {};
    if (dataInicio) {
      where.createdAt.gte = new Date(String(dataInicio));
    }
    if (dataFim) {
      const fim = new Date(String(dataFim));
      fim.setHours(23, 59, 59, 999);
      where.createdAt.lte = fim;
    }
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [publicacoes, total] = await Promise.all([
    prisma.publicacao.findMany({
      where,
      include: {
        advogado: {
          select: { nome: true, oab: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: Number(limit),
    }),
    prisma.publicacao.count({ where }),
  ]);

  res.json({
    data: publicacoes.map((p) => ({
      id: p.id,
      advogado: p.advogado.nome,
      oab: p.advogado.oab,
      numeroProcesso: p.numeroProcesso,
      siglaTribunal: p.siglaTribunal,
      dataPublicacao: p.dataPublicacao,
      tipoComunicacao: p.tipoComunicacao,
      textoComunicacao: p.textoComunicacao?.substring(0, 200),
      status: p.status,
      dataRaspagem: p.createdAt,
    })),
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit)),
    },
  });
});

// ============================================================================
// LOGS DE REQUISICOES API
// ============================================================================

/**
 * GET /api/dashboard/requests
 * Lista historico de requisicoes API com filtros
 */
router.get('/requests', async (req: AuthRequest, res) => {
  const {
    page = '1',
    limit = '50',
    metodo,
    path,
    sucesso,
    origem,
    companyId,
    dataInicio,
    dataFim,
  } = req.query;

  const where: any = {};

  if (metodo) {
    where.metodo = String(metodo).toUpperCase();
  }

  if (path) {
    where.path = { contains: String(path) };
  }

  if (sucesso !== undefined) {
    where.sucesso = sucesso === 'true';
  }

  if (origem) {
    where.origem = String(origem);
  }

  if (companyId) {
    where.companyId = String(companyId);
  }

  if (dataInicio || dataFim) {
    where.createdAt = {};
    if (dataInicio) {
      where.createdAt.gte = new Date(String(dataInicio));
    }
    if (dataFim) {
      const fim = new Date(String(dataFim));
      fim.setHours(23, 59, 59, 999);
      where.createdAt.lte = fim;
    }
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [requests, total] = await Promise.all([
    prisma.apiRequestLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: Number(limit),
    }),
    prisma.apiRequestLog.count({ where }),
  ]);

  res.json({
    data: requests.map((r) => ({
      id: r.id,
      metodo: r.metodo,
      path: r.path,
      statusCode: r.statusCode,
      sucesso: r.sucesso,
      erro: r.erro,
      origem: r.origem,
      ip: r.ip,
      responseTime: r.responseTime,
      companyId: r.companyId,
      advogadoId: r.advogadoId,
      consultaId: r.consultaId,
      apiKeyPrefixo: r.apiKeyPrefixo,
      createdAt: r.createdAt,
    })),
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit)),
    },
  });
});

/**
 * GET /api/dashboard/requests/:id
 * Detalhes completos de uma requisicao
 */
router.get('/requests/:id', async (req: AuthRequest, res) => {
  const { id } = req.params;

  const request = await prisma.apiRequestLog.findUnique({
    where: { id },
  });

  if (!request) {
    return res.status(404).json({ error: 'Requisicao nao encontrada' });
  }

  res.json({
    id: request.id,
    metodo: request.metodo,
    path: request.path,
    queryParams: request.queryParams,
    ip: request.ip,
    userAgent: request.userAgent,
    origem: request.origem,
    apiKeyId: request.apiKeyId,
    apiKeyPrefixo: request.apiKeyPrefixo,
    requestBody: request.requestBody,
    requestHeaders: request.requestHeaders,
    statusCode: request.statusCode,
    responseBody: request.responseBody,
    responseTime: request.responseTime,
    sucesso: request.sucesso,
    erro: request.erro,
    advogadoId: request.advogadoId,
    consultaId: request.consultaId,
    companyId: request.companyId,
    createdAt: request.createdAt,
  });
});

/**
 * GET /api/dashboard/requests/stats
 * Estatisticas de requisicoes
 */
router.get('/requests/stats', async (req: AuthRequest, res) => {
  const hoje = new Date();
  const inicioHoje = new Date(hoje.toISOString().split('T')[0]);
  const inicioSemana = new Date(hoje);
  inicioSemana.setDate(hoje.getDate() - 7);
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

  const [
    totalRequests,
    requestsHoje,
    requestsSemana,
    requestsMes,
    requestsSucesso,
    requestsErro,
    porOrigem,
    porPath,
    tempoMedioResponse,
  ] = await Promise.all([
    prisma.apiRequestLog.count(),
    prisma.apiRequestLog.count({ where: { createdAt: { gte: inicioHoje } } }),
    prisma.apiRequestLog.count({ where: { createdAt: { gte: inicioSemana } } }),
    prisma.apiRequestLog.count({ where: { createdAt: { gte: inicioMes } } }),
    prisma.apiRequestLog.count({ where: { sucesso: true } }),
    prisma.apiRequestLog.count({ where: { sucesso: false } }),
    prisma.apiRequestLog.groupBy({
      by: ['origem'],
      _count: true,
      orderBy: { _count: { origem: 'desc' } },
    }),
    prisma.apiRequestLog.groupBy({
      by: ['path'],
      _count: true,
      orderBy: { _count: { path: 'desc' } },
      take: 10,
    }),
    prisma.apiRequestLog.aggregate({
      _avg: { responseTime: true },
    }),
  ]);

  const taxaSucesso = totalRequests > 0
    ? Math.round((requestsSucesso / totalRequests) * 100)
    : 100;

  res.json({
    resumo: {
      total: totalRequests,
      hoje: requestsHoje,
      semana: requestsSemana,
      mes: requestsMes,
      sucesso: requestsSucesso,
      erro: requestsErro,
      taxaSucesso,
      tempoMedioMs: Math.round(tempoMedioResponse._avg.responseTime || 0),
    },
    porOrigem: porOrigem.map((o) => ({
      origem: o.origem || 'UNKNOWN',
      total: o._count,
    })),
    porPath: porPath.map((p) => ({
      path: p.path,
      total: p._count,
    })),
  });
});

/**
 * DELETE /api/dashboard/requests/limpar/antigos
 * Remove requisicoes com mais de 30 dias
 */
router.delete('/requests/limpar/antigos', async (req: AuthRequest, res) => {
  const trintaDiasAtras = new Date();
  trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

  const deleted = await prisma.apiRequestLog.deleteMany({
    where: {
      createdAt: { lt: trintaDiasAtras },
    },
  });

  res.json({
    message: `${deleted.count} requisicoes antigas removidas`,
    removidos: deleted.count,
  });
});

// ============================================================================
// DETALHES DE CONSULTAS/RASPAGENS
// ============================================================================

/**
 * GET /api/dashboard/consultas
 * Lista consultas/raspagens com detalhes expandidos
 */
router.get('/consultas', async (req: AuthRequest, res) => {
  const {
    page = '1',
    limit = '50',
    status,
    advogadoId,
    dataInicio,
    dataFim,
  } = req.query;

  const where: any = {};

  if (status) {
    where.status = String(status).toUpperCase();
  }

  if (advogadoId) {
    where.advogadoId = String(advogadoId);
  }

  if (dataInicio || dataFim) {
    where.createdAt = {};
    if (dataInicio) {
      where.createdAt.gte = new Date(String(dataInicio));
    }
    if (dataFim) {
      const fim = new Date(String(dataFim));
      fim.setHours(23, 59, 59, 999);
      where.createdAt.lte = fim;
    }
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [consultas, total] = await Promise.all([
    prisma.consulta.findMany({
      where,
      include: {
        advogado: { select: { nome: true, oab: true } },
        proxy: { select: { host: true, porta: true, provedor: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: Number(limit),
    }),
    prisma.consulta.count({ where }),
  ]);

  res.json({
    data: consultas.map((c) => ({
      id: c.id,
      advogado: c.advogado.nome,
      oab: c.advogado.oab,
      status: c.status,
      dataInicio: c.dataInicio,
      dataFim: c.dataFim,
      tribunal: c.tribunal,
      publicacoesEncontradas: c.publicacoesEncontradas,
      publicacoesNovas: c.publicacoesNovas,
      tentativas: c.tentativas,
      erro: c.erro,
      // Detalhes de raspagem
      duracaoMs: c.duracaoMs,
      duracaoFormatada: c.duracaoMs ? formatarDuracao(c.duracaoMs) : null,
      paginasNavegadas: c.paginasNavegadas,
      blocosProcessados: c.blocosProcessados,
      captchaDetectado: c.captchaDetectado,
      bloqueioDetectado: c.bloqueioDetectado,
      // Proxy usado
      proxy: c.proxy ? {
        host: c.proxy.host,
        porta: c.proxy.porta,
        provedor: c.proxy.provedor,
      } : null,
      // Timestamps
      iniciadoEm: c.iniciadoEm,
      finalizadoEm: c.finalizadoEm,
      createdAt: c.createdAt,
    })),
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit)),
    },
  });
});

/**
 * GET /api/dashboard/consultas/:id
 * Detalhes completos de uma consulta/raspagem
 */
router.get('/consultas/:id', async (req: AuthRequest, res) => {
  const { id } = req.params;

  const consulta = await prisma.consulta.findUnique({
    where: { id },
    include: {
      advogado: { select: { id: true, nome: true, oab: true, ufOab: true } },
      proxy: true,
    },
  });

  if (!consulta) {
    return res.status(404).json({ error: 'Consulta nao encontrada' });
  }

  // Busca publicacoes encontradas nesta consulta (aproximado por data)
  const publicacoes = await prisma.publicacao.findMany({
    where: {
      advogadoId: consulta.advogadoId,
      createdAt: {
        gte: consulta.iniciadoEm || consulta.createdAt,
        lte: consulta.finalizadoEm || new Date(),
      },
    },
    orderBy: { dataPublicacao: 'desc' },
    take: 20,
  });

  res.json({
    id: consulta.id,
    advogado: {
      id: consulta.advogado.id,
      nome: consulta.advogado.nome,
      oab: consulta.advogado.oab,
      ufOab: consulta.advogado.ufOab,
    },
    parametros: {
      dataInicio: consulta.dataInicio,
      dataFim: consulta.dataFim,
      tribunal: consulta.tribunal,
    },
    status: consulta.status,
    resultado: {
      publicacoesEncontradas: consulta.publicacoesEncontradas,
      publicacoesNovas: consulta.publicacoesNovas,
      erro: consulta.erro,
    },
    raspagem: {
      duracaoMs: consulta.duracaoMs,
      duracaoFormatada: consulta.duracaoMs ? formatarDuracao(consulta.duracaoMs) : null,
      paginasNavegadas: consulta.paginasNavegadas,
      blocosProcessados: consulta.blocosProcessados,
      captchaDetectado: consulta.captchaDetectado,
      bloqueioDetectado: consulta.bloqueioDetectado,
      detalhesExtras: consulta.detalhesRaspagem,
    },
    proxy: consulta.proxy ? {
      id: consulta.proxy.id,
      host: consulta.proxy.host,
      porta: consulta.proxy.porta,
      provedor: consulta.proxy.provedor,
      funcionando: consulta.proxy.funcionando,
    } : null,
    execucao: {
      tentativas: consulta.tentativas,
      maxTentativas: consulta.maxTentativas,
      prioridade: consulta.prioridade,
      agendadoPara: consulta.agendadoPara,
      iniciadoEm: consulta.iniciadoEm,
      finalizadoEm: consulta.finalizadoEm,
    },
    publicacoesEncontradas: publicacoes.map((p) => ({
      id: p.id,
      numeroProcesso: p.numeroProcesso,
      dataPublicacao: p.dataPublicacao,
      tipoComunicacao: p.tipoComunicacao,
      status: p.status,
    })),
    createdAt: consulta.createdAt,
  });
});

/**
 * GET /api/dashboard/consultas/stats
 * Estatisticas de consultas/raspagens
 */
router.get('/consultas/stats', async (req: AuthRequest, res) => {
  const hoje = new Date();
  const inicioHoje = new Date(hoje.toISOString().split('T')[0]);
  const inicioSemana = new Date(hoje);
  inicioSemana.setDate(hoje.getDate() - 7);

  const [
    totalConsultas,
    consultasHoje,
    consultasSemana,
    porStatus,
    comCaptcha,
    comBloqueio,
    tempoMedio,
    paginasMedias,
  ] = await Promise.all([
    prisma.consulta.count(),
    prisma.consulta.count({ where: { createdAt: { gte: inicioHoje } } }),
    prisma.consulta.count({ where: { createdAt: { gte: inicioSemana } } }),
    prisma.consulta.groupBy({
      by: ['status'],
      _count: true,
    }),
    prisma.consulta.count({ where: { captchaDetectado: true } }),
    prisma.consulta.count({ where: { bloqueioDetectado: true } }),
    prisma.consulta.aggregate({
      _avg: { duracaoMs: true },
      where: { status: 'CONCLUIDA' },
    }),
    prisma.consulta.aggregate({
      _avg: { paginasNavegadas: true },
      where: { status: 'CONCLUIDA' },
    }),
  ]);

  const statusMap = porStatus.reduce((acc, s) => {
    acc[s.status] = s._count;
    return acc;
  }, {} as Record<string, number>);

  res.json({
    resumo: {
      total: totalConsultas,
      hoje: consultasHoje,
      semana: consultasSemana,
      pendentes: statusMap['PENDENTE'] || 0,
      processando: statusMap['PROCESSANDO'] || 0,
      concluidas: statusMap['CONCLUIDA'] || 0,
      erros: statusMap['ERRO'] || 0,
      canceladas: statusMap['CANCELADA'] || 0,
    },
    problemas: {
      captchasDetectados: comCaptcha,
      bloqueiosDetectados: comBloqueio,
    },
    performance: {
      tempoMedioMs: Math.round(tempoMedio._avg.duracaoMs || 0),
      tempoMedioFormatado: formatarDuracao(Math.round(tempoMedio._avg.duracaoMs || 0)),
      paginasMedias: Math.round(paginasMedias._avg.paginasNavegadas || 0),
    },
  });
});

/**
 * Formata duracao em ms para string legivel
 */
function formatarDuracao(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60000);
  const sec = Math.round((ms % 60000) / 1000);
  return `${min}m ${sec}s`;
}

export default router;
