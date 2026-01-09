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

export default router;
