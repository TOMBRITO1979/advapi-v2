import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { authMiddleware, AuthRequest } from '../middlewares/auth.js';
import { AppError } from '../middlewares/error.js';

const router = Router();

router.use(authMiddleware);

/**
 * GET /api/logs
 * Lista logs do sistema
 */
router.get('/', async (req: AuthRequest, res) => {
  const { tipo, categoria, lido, page = '1', limit = '50' } = req.query;

  const where: any = {};

  if (tipo) {
    where.tipo = tipo;
  }

  if (categoria) {
    where.categoria = categoria;
  }

  if (lido !== undefined) {
    where.lido = lido === 'true';
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [logs, total, naoLidos] = await Promise.all([
    prisma.logSistema.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: Number(limit),
    }),
    prisma.logSistema.count({ where }),
    prisma.logSistema.count({ where: { lido: false } }),
  ]);

  res.json({
    data: logs,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit)),
    },
    naoLidos,
  });
});

/**
 * GET /api/logs/stats
 * Estatisticas de logs
 */
router.get('/stats', async (req: AuthRequest, res) => {
  const [total, naoLidos, erros, criticos, porCategoria] = await Promise.all([
    prisma.logSistema.count(),
    prisma.logSistema.count({ where: { lido: false } }),
    prisma.logSistema.count({ where: { tipo: 'ERRO', lido: false } }),
    prisma.logSistema.count({ where: { tipo: 'CRITICO', lido: false } }),
    prisma.logSistema.groupBy({
      by: ['categoria'],
      where: { lido: false },
      _count: true,
    }),
  ]);

  res.json({
    total,
    naoLidos,
    erros,
    criticos,
    porCategoria: porCategoria.reduce((acc: any, item) => {
      acc[item.categoria] = item._count;
      return acc;
    }, {}),
  });
});

/**
 * PUT /api/logs/:id/lido
 * Marca log como lido
 */
router.put('/:id/lido', async (req: AuthRequest, res) => {
  const log = await prisma.logSistema.findUnique({
    where: { id: req.params.id },
  });

  if (!log) {
    throw new AppError('Log nao encontrado', 404);
  }

  const atualizado = await prisma.logSistema.update({
    where: { id: req.params.id },
    data: { lido: true },
  });

  res.json(atualizado);
});

/**
 * PUT /api/logs/:id/resolvido
 * Marca log como resolvido
 */
router.put('/:id/resolvido', async (req: AuthRequest, res) => {
  const log = await prisma.logSistema.findUnique({
    where: { id: req.params.id },
  });

  if (!log) {
    throw new AppError('Log nao encontrado', 404);
  }

  const atualizado = await prisma.logSistema.update({
    where: { id: req.params.id },
    data: {
      resolvido: true,
      resolvidoEm: new Date(),
      lido: true,
    },
  });

  res.json(atualizado);
});

/**
 * POST /api/logs/marcar-todos-lidos
 * Marca todos os logs como lidos
 */
router.post('/marcar-todos-lidos', async (req: AuthRequest, res) => {
  const resultado = await prisma.logSistema.updateMany({
    where: { lido: false },
    data: { lido: true },
  });

  res.json({
    message: `${resultado.count} logs marcados como lidos`,
    atualizados: resultado.count,
  });
});

/**
 * DELETE /api/logs/:id
 * Remove log
 */
router.delete('/:id', async (req: AuthRequest, res) => {
  const log = await prisma.logSistema.findUnique({
    where: { id: req.params.id },
  });

  if (!log) {
    throw new AppError('Log nao encontrado', 404);
  }

  await prisma.logSistema.delete({
    where: { id: req.params.id },
  });

  res.json({ message: 'Log removido' });
});

/**
 * DELETE /api/logs/limpar
 * Remove logs antigos (mais de 30 dias)
 */
router.delete('/limpar/antigos', async (req: AuthRequest, res) => {
  const trintaDiasAtras = new Date();
  trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

  const resultado = await prisma.logSistema.deleteMany({
    where: {
      createdAt: { lt: trintaDiasAtras },
      resolvido: true,
    },
  });

  res.json({
    message: `${resultado.count} logs antigos removidos`,
    removidos: resultado.count,
  });
});

export default router;
