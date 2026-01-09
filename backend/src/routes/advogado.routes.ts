import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { authMiddleware, AuthRequest } from '../middlewares/auth.js';
import { AppError } from '../middlewares/error.js';

const router = Router();

// Todas as rotas requerem autenticacao JWT
router.use(authMiddleware);

/**
 * GET /api/advogados
 * Lista todos os advogados monitorados
 */
router.get('/', async (req: AuthRequest, res) => {
  const { ativo, busca, page = '1', limit = '50' } = req.query;

  const where: any = {};

  if (ativo !== undefined) {
    where.ativo = ativo === 'true';
  }

  if (busca) {
    where.nome = { contains: String(busca).toUpperCase(), mode: 'insensitive' };
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [advogados, total] = await Promise.all([
    prisma.advogado.findMany({
      where,
      include: {
        _count: {
          select: { publicacoes: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: Number(limit),
    }),
    prisma.advogado.count({ where }),
  ]);

  res.json({
    data: advogados.map((adv) => ({
      ...adv,
      totalPublicacoes: adv._count.publicacoes,
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
 * GET /api/advogados/:id
 * Detalhes de um advogado
 */
router.get('/:id', async (req: AuthRequest, res) => {
  const advogado = await prisma.advogado.findUnique({
    where: { id: req.params.id },
    include: {
      publicacoes: {
        take: 10,
        orderBy: { dataPublicacao: 'desc' },
      },
      consultas: {
        take: 5,
        orderBy: { createdAt: 'desc' },
      },
      _count: {
        select: { publicacoes: true, consultas: true },
      },
    },
  });

  if (!advogado) {
    throw new AppError('Advogado nao encontrado', 404);
  }

  res.json(advogado);
});

/**
 * POST /api/advogados
 * Cadastra novo advogado para monitoramento
 */
router.post('/', async (req: AuthRequest, res) => {
  const { nome, oab, ufOab, advwellCompanyId, tribunais, callbackUrl } = req.body;

  if (!nome) {
    throw new AppError('Nome e obrigatorio', 400);
  }

  // Verifica se ja existe
  const existe = await prisma.advogado.findFirst({
    where: {
      nome: nome.toUpperCase(),
      advwellCompanyId: advwellCompanyId || 'manual',
    },
  });

  if (existe) {
    throw new AppError('Advogado ja cadastrado', 409);
  }

  const advogado = await prisma.advogado.create({
    data: {
      nome: nome.toUpperCase(),
      oab,
      ufOab,
      advwellCompanyId: advwellCompanyId || 'manual',
      tribunais: tribunais || [],
      callbackUrl,
      ativo: true,
    },
  });

  res.status(201).json(advogado);
});

/**
 * PUT /api/advogados/:id
 * Atualiza dados de um advogado
 */
router.put('/:id', async (req: AuthRequest, res) => {
  const { nome, oab, ufOab, tribunais, callbackUrl, ativo } = req.body;

  const advogado = await prisma.advogado.findUnique({
    where: { id: req.params.id },
  });

  if (!advogado) {
    throw new AppError('Advogado nao encontrado', 404);
  }

  const atualizado = await prisma.advogado.update({
    where: { id: req.params.id },
    data: {
      nome: nome ? nome.toUpperCase() : undefined,
      oab,
      ufOab,
      tribunais,
      callbackUrl,
      ativo,
    },
  });

  res.json(atualizado);
});

/**
 * DELETE /api/advogados/:id
 * Remove advogado permanentemente (e todas as publicacoes/consultas relacionadas)
 */
router.delete('/:id', async (req: AuthRequest, res) => {
  const advogado = await prisma.advogado.findUnique({
    where: { id: req.params.id },
  });

  if (!advogado) {
    throw new AppError('Advogado nao encontrado', 404);
  }

  // Deleta em cascata: primeiro as dependencias, depois o advogado
  await prisma.$transaction([
    // Remove publicacoes
    prisma.publicacao.deleteMany({
      where: { advogadoId: req.params.id },
    }),
    // Remove consultas
    prisma.consulta.deleteMany({
      where: { advogadoId: req.params.id },
    }),
    // Remove o advogado
    prisma.advogado.delete({
      where: { id: req.params.id },
    }),
  ]);

  res.json({ message: 'Advogado excluido permanentemente' });
});

/**
 * POST /api/advogados/:id/consultar
 * Dispara nova consulta para um advogado
 * - Se nunca foi consultado: busca historico completo (12 meses)
 * - Se ja foi consultado: busca apenas atualizacoes desde ultima consulta
 */
router.post('/:id/consultar', async (req: AuthRequest, res) => {
  const { dataInicio, dataFim, tribunal, forcarHistorico } = req.body;
  const { adicionarConsulta } = await import('../utils/queue.js');

  const advogado = await prisma.advogado.findUnique({
    where: { id: req.params.id },
  });

  if (!advogado) {
    throw new AppError('Advogado nao encontrado', 404);
  }

  const hoje = new Date();
  const fim = dataFim || hoje.toISOString().split('T')[0];

  let inicio: string;
  let tipoBusca: string;

  if (dataInicio) {
    // Data especifica informada
    inicio = dataInicio;
    tipoBusca = 'PERSONALIZADA';
  } else if (forcarHistorico || !advogado.ultimaConsulta) {
    // PRIMEIRA CONSULTA ou forcado: busca ultimos 12 meses
    inicio = new Date(hoje.getFullYear() - 1, hoje.getMonth(), hoje.getDate()).toISOString().split('T')[0];
    tipoBusca = 'HISTORICO_COMPLETO';
  } else {
    // JA FOI CONSULTADO: busca desde ultima consulta
    const ultimaConsulta = new Date(advogado.ultimaConsulta);
    // Margem de 1 dia para garantir
    ultimaConsulta.setDate(ultimaConsulta.getDate() - 1);
    inicio = ultimaConsulta.toISOString().split('T')[0];
    tipoBusca = 'ATUALIZACAO';
  }

  console.log(`[Dashboard] Advogado: ${advogado.nome} | Tipo: ${tipoBusca} | Periodo: ${inicio} a ${fim}`);

  const consulta = await prisma.consulta.create({
    data: {
      advogadoId: advogado.id,
      dataInicio: new Date(inicio),
      dataFim: new Date(fim),
      tribunal: tribunal || null,
      status: 'PENDENTE',
    },
  });

  const jobId = await adicionarConsulta({
    advogadoId: advogado.id,
    nome: advogado.nome,
    tribunal,
    dataInicio: inicio,
    dataFim: fim,
    prioridade: 2, // Prioridade manual
  });

  res.status(202).json({
    message: 'Consulta adicionada na fila',
    consultaId: consulta.id,
    jobId,
    tipoBusca,
    periodo: { inicio, fim },
  });
});

export default router;
