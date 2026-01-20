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
 * Cadastra novo advogado para monitoramento ou reutiliza existente
 * Enfileira automaticamente a consulta (historico 5 anos)
 */
router.post('/', async (req: AuthRequest, res) => {
  const { nome, oab, ufOab, advwellCompanyId, advwellClientId, tribunais, callbackUrl } = req.body;
  const { adicionarConsulta } = await import('../utils/queue.js');

  if (!nome) {
    throw new AppError('Nome e obrigatorio', 400);
  }

  // Verifica se ja existe pelo nome (e OAB se fornecido)
  const whereConditions: any[] = [
    { nome: nome.toUpperCase() },
  ];

  // Se tiver OAB, busca tambem por OAB
  if (oab) {
    whereConditions.push({ oab: oab });
  }

  let advogado = await prisma.advogado.findFirst({
    where: {
      OR: whereConditions,
    },
  });

  let isNovo = false;

  if (advogado) {
    // Advogado ja existe - atualiza dados se necessario
    const dadosAtualizar: any = {};

    if (callbackUrl && callbackUrl !== advogado.callbackUrl) {
      dadosAtualizar.callbackUrl = callbackUrl;
    }
    if (advwellCompanyId && advwellCompanyId !== advogado.advwellCompanyId) {
      dadosAtualizar.advwellCompanyId = advwellCompanyId;
    }
    if (advwellClientId && advwellClientId !== advogado.advwellClientId) {
      dadosAtualizar.advwellClientId = advwellClientId;
    }
    if (oab && !advogado.oab) {
      dadosAtualizar.oab = oab;
    }
    if (ufOab && !advogado.ufOab) {
      dadosAtualizar.ufOab = ufOab;
    }

    // Atualiza se houver mudancas
    if (Object.keys(dadosAtualizar).length > 0) {
      advogado = await prisma.advogado.update({
        where: { id: advogado.id },
        data: dadosAtualizar,
      });
      console.log(`[Cadastro] Advogado ${advogado.nome} atualizado | Campos: ${Object.keys(dadosAtualizar).join(', ')}`);
    }

    console.log(`[Cadastro] Advogado ${advogado.nome} ja existe, reutilizando...`);
  } else {
    // Advogado nao existe - cria novo
    advogado = await prisma.advogado.create({
      data: {
        nome: nome.toUpperCase(),
        oab,
        ufOab,
        advwellCompanyId: advwellCompanyId || 'manual',
        advwellClientId,
        tribunais: tribunais || [],
        callbackUrl,
        ativo: true,
      },
    });
    isNovo = true;
    console.log(`[Cadastro] Novo advogado ${advogado.nome} cadastrado`);
  }

  // Enfileira consulta (historico 5 anos)
  const hoje = new Date();
  const fim = hoje.toISOString().split('T')[0];
  const inicio = new Date(hoje.getFullYear() - 5, hoje.getMonth(), hoje.getDate()).toISOString().split('T')[0];

  const consulta = await prisma.consulta.create({
    data: {
      advogadoId: advogado.id,
      dataInicio: new Date(inicio),
      dataFim: new Date(fim),
      status: 'PENDENTE',
    },
  });

  const jobId = await adicionarConsulta({
    advogadoId: advogado.id,
    nome: advogado.nome,
    dataInicio: inicio,
    dataFim: fim,
    prioridade: 2, // Prioridade alta para execucao imediata
  });

  console.log(`[Cadastro] Advogado ${advogado.nome} enfileirado | Job: ${jobId} | Periodo: ${inicio} a ${fim}`);

  res.status(isNovo ? 201 : 200).json({
    ...advogado,
    isNovo,
    consultaInicial: {
      consultaId: consulta.id,
      jobId,
      tipoBusca: 'HISTORICO_5_ANOS',
      periodo: { inicio, fim },
    },
  });
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
  } else {
    // SEMPRE busca ultimos 5 anos para garantir historico completo
    inicio = new Date(hoje.getFullYear() - 5, hoje.getMonth(), hoje.getDate()).toISOString().split('T')[0];
    tipoBusca = 'HISTORICO_5_ANOS';
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
