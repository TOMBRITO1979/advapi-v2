import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { authMiddleware, AuthRequest } from '../middlewares/auth.js';
import { AppError } from '../middlewares/error.js';

const router = Router();

router.use(authMiddleware);

/**
 * GET /api/publicacoes
 * Lista publicacoes com filtros
 */
router.get('/', async (req: AuthRequest, res) => {
  const {
    advogadoId,
    status,
    dataInicio,
    dataFim,
    busca,
    page = '1',
    limit = '50',
  } = req.query;

  const where: any = {};

  if (advogadoId) {
    where.advogadoId = advogadoId;
  }

  if (status) {
    where.status = status;
  }

  if (dataInicio || dataFim) {
    where.dataPublicacao = {};
    if (dataInicio) where.dataPublicacao.gte = new Date(String(dataInicio));
    if (dataFim) where.dataPublicacao.lte = new Date(String(dataFim));
  }

  if (busca) {
    where.OR = [
      { numeroProcesso: { contains: String(busca), mode: 'insensitive' } },
      { textoComunicacao: { contains: String(busca), mode: 'insensitive' } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [publicacoes, total] = await Promise.all([
    prisma.publicacao.findMany({
      where,
      include: {
        advogado: {
          select: { id: true, nome: true, oab: true },
        },
      },
      orderBy: { dataPublicacao: 'desc' },
      skip,
      take: Number(limit),
    }),
    prisma.publicacao.count({ where }),
  ]);

  res.json({
    data: publicacoes,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit)),
    },
  });
});

/**
 * GET /api/publicacoes/:id
 * Detalhes de uma publicacao
 */
router.get('/:id', async (req: AuthRequest, res) => {
  const publicacao = await prisma.publicacao.findUnique({
    where: { id: req.params.id },
    include: {
      advogado: true,
    },
  });

  if (!publicacao) {
    throw new AppError('Publicacao nao encontrada', 404);
  }

  res.json(publicacao);
});

/**
 * PUT /api/publicacoes/:id/status
 * Atualiza status de uma publicacao
 */
router.put('/:id/status', async (req: AuthRequest, res) => {
  const { status } = req.body;

  if (!['NOVA', 'PROCESSANDO', 'ENVIADA', 'ERRO', 'IGNORADA'].includes(status)) {
    throw new AppError('Status invalido', 400);
  }

  const publicacao = await prisma.publicacao.findUnique({
    where: { id: req.params.id },
  });

  if (!publicacao) {
    throw new AppError('Publicacao nao encontrada', 404);
  }

  const atualizada = await prisma.publicacao.update({
    where: { id: req.params.id },
    data: { status },
  });

  res.json(atualizada);
});

/**
 * POST /api/publicacoes/:id/reenviar
 * Reenvia publicacao para o AdvWell
 */
router.post('/:id/reenviar', async (req: AuthRequest, res) => {
  const publicacao = await prisma.publicacao.findUnique({
    where: { id: req.params.id },
    include: { advogado: true },
  });

  if (!publicacao) {
    throw new AppError('Publicacao nao encontrada', 404);
  }

  if (!publicacao.advogado.callbackUrl) {
    throw new AppError('Advogado nao possui URL de callback', 400);
  }

  try {
    const response = await fetch(publicacao.advogado.callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.ADVWELL_API_KEY || '',
      },
      body: JSON.stringify({
        tipo: 'nova_publicacao',
        advogadoId: publicacao.advogado.advwellClientId,
        companyId: publicacao.advogado.advwellCompanyId,
        publicacao: {
          numeroProcesso: publicacao.numeroProcesso,
          siglaTribunal: publicacao.siglaTribunal,
          dataPublicacao: publicacao.dataPublicacao,
          tipoComunicacao: publicacao.tipoComunicacao,
          textoComunicacao: publicacao.textoComunicacao,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    await prisma.publicacao.update({
      where: { id: req.params.id },
      data: { enviadoAdvwell: true, enviadoEm: new Date() },
    });

    res.json({ message: 'Publicacao reenviada com sucesso' });
  } catch (error: any) {
    throw new AppError(`Erro ao reenviar: ${error.message}`, 500);
  }
});

/**
 * GET /api/publicacoes/estatisticas
 * Estatisticas de publicacoes
 */
router.get('/stats/resumo', async (req: AuthRequest, res) => {
  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const inicioSemana = new Date(hoje);
  inicioSemana.setDate(hoje.getDate() - hoje.getDay());

  const [total, novas, doMes, daSemana, porStatus] = await Promise.all([
    prisma.publicacao.count(),
    prisma.publicacao.count({ where: { status: 'NOVA' } }),
    prisma.publicacao.count({
      where: { dataPublicacao: { gte: inicioMes } },
    }),
    prisma.publicacao.count({
      where: { dataPublicacao: { gte: inicioSemana } },
    }),
    prisma.publicacao.groupBy({
      by: ['status'],
      _count: true,
    }),
  ]);

  res.json({
    total,
    novas,
    doMes,
    daSemana,
    porStatus: porStatus.reduce((acc, item) => {
      acc[item.status] = item._count;
      return acc;
    }, {} as Record<string, number>),
  });
});

export default router;
