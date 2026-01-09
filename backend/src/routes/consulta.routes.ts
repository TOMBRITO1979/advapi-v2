import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { adicionarConsulta, getQueueStatus } from '../utils/queue.js';
import { apiKeyMiddleware } from '../middlewares/auth.js';
import { AppError } from '../middlewares/error.js';

const router = Router();

// Todas as rotas requerem API Key
router.use(apiKeyMiddleware);

/**
 * POST /api/consulta
 * Endpoint principal para AdvWell solicitar busca de publicacoes
 */
router.post('/', async (req, res) => {
  const {
    companyId,
    advogadoNome,
    advogadoOab,
    ufOab,
    clientId,
    callbackUrl,
    tribunais,
    dataInicio,
    dataFim,
  } = req.body;

  if (!companyId || !advogadoNome) {
    throw new AppError('companyId e advogadoNome sao obrigatorios', 400);
  }

  // Cria ou atualiza advogado
  let advogado = await prisma.advogado.findFirst({
    where: {
      advwellCompanyId: companyId,
      nome: advogadoNome.toUpperCase(),
    },
  });

  if (!advogado) {
    advogado = await prisma.advogado.create({
      data: {
        nome: advogadoNome.toUpperCase(),
        oab: advogadoOab,
        ufOab: ufOab,
        advwellCompanyId: companyId,
        advwellClientId: clientId,
        callbackUrl: callbackUrl,
        tribunais: tribunais || [],
        ativo: true,
      },
    });
  } else {
    // Atualiza dados
    advogado = await prisma.advogado.update({
      where: { id: advogado.id },
      data: {
        advwellClientId: clientId,
        callbackUrl: callbackUrl,
        tribunais: tribunais || advogado.tribunais,
      },
    });
  }

  // Define periodo de busca
  const hoje = new Date();
  const inicio = dataInicio || new Date(hoje.getFullYear() - 1, hoje.getMonth(), hoje.getDate()).toISOString().split('T')[0];
  const fim = dataFim || hoje.toISOString().split('T')[0];

  // Cria consulta no banco
  const consulta = await prisma.consulta.create({
    data: {
      advogadoId: advogado.id,
      dataInicio: new Date(inicio),
      dataFim: new Date(fim),
      tribunal: tribunais?.[0] || null,
      status: 'PENDENTE',
    },
  });

  // Adiciona na fila
  const jobId = await adicionarConsulta({
    advogadoId: advogado.id,
    nome: advogado.nome,
    tribunal: tribunais?.[0],
    dataInicio: inicio,
    dataFim: fim,
    prioridade: 1, // Alta prioridade para requisicoes diretas
  });

  res.status(202).json({
    message: 'Consulta adicionada na fila',
    consultaId: consulta.id,
    jobId,
    advogadoId: advogado.id,
    status: 'PENDENTE',
    estimativa: '1-5 minutos',
  });
});

/**
 * GET /api/consulta/:id/status
 * Verifica status de uma consulta
 */
router.get('/:id/status', async (req, res) => {
  const consulta = await prisma.consulta.findUnique({
    where: { id: req.params.id },
    include: {
      advogado: {
        select: { nome: true, totalPublicacoes: true },
      },
    },
  });

  if (!consulta) {
    throw new AppError('Consulta nao encontrada', 404);
  }

  res.json({
    id: consulta.id,
    status: consulta.status,
    advogado: consulta.advogado.nome,
    publicacoesEncontradas: consulta.publicacoesEncontradas,
    erro: consulta.erro,
    iniciadoEm: consulta.iniciadoEm,
    finalizadoEm: consulta.finalizadoEm,
  });
});

/**
 * GET /api/consulta/fila
 * Status geral das filas
 */
router.get('/fila/status', async (req, res) => {
  const status = await getQueueStatus();
  res.json(status);
});

export default router;
