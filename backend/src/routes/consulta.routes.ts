import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { adicionarConsulta, getQueueStatus } from '../utils/queue.js';
import { apiKeyMiddleware } from '../middlewares/auth.js';
import { AppError } from '../middlewares/error.js';
import { normalizarNumeroProcesso } from '../utils/processo.js';

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

  // Flag para saber se é advogado novo
  const isNovoAdvogado = !advogado;

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

  // Define periodo de busca baseado se é novo ou existente
  const hoje = new Date();
  const fim = dataFim || hoje.toISOString().split('T')[0];

  let inicio: string;
  let tipoBusca: string;

  if (dataInicio) {
    // Se passou data especifica, usa ela
    inicio = dataInicio;
    tipoBusca = 'PERSONALIZADA';
  } else if (isNovoAdvogado) {
    // NOVO ADVOGADO: busca ultimos 5 anos (historico completo)
    inicio = new Date(hoje.getFullYear() - 5, hoje.getMonth(), hoje.getDate()).toISOString().split('T')[0];
    tipoBusca = 'HISTORICO_5_ANOS';
  } else {
    // ADVOGADO EXISTENTE: busca ultimos 5 anos (historico completo)
    inicio = new Date(hoje.getFullYear() - 5, hoje.getMonth(), hoje.getDate()).toISOString().split('T')[0];
    tipoBusca = 'HISTORICO_5_ANOS';
  }

  console.log(`[Consulta] Advogado: ${advogado.nome} | Tipo: ${tipoBusca} | Periodo: ${inicio} a ${fim}`);

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

/**
 * GET /api/consulta/buffer/:advogadoNome
 * Consulta DIRETA no banco (modo buffer/cache)
 * Retorna dados ja salvos instantaneamente, sem fila
 */
router.get('/buffer', async (req, res) => {
  const { companyId, advogadoNome, limite = '50' } = req.query;

  if (!companyId || !advogadoNome) {
    throw new AppError('companyId e advogadoNome sao obrigatorios', 400);
  }

  // Busca advogado
  const advogado = await prisma.advogado.findFirst({
    where: {
      advwellCompanyId: String(companyId),
      nome: String(advogadoNome).toUpperCase(),
    },
  });

  if (!advogado) {
    // Advogado nao existe ainda - retorna vazio mas sugere cadastrar
    return res.json({
      encontrado: false,
      message: 'Advogado nao cadastrado. Use POST /api/consulta para cadastrar e iniciar monitoramento.',
      publicacoes: [],
    });
  }

  // Busca publicacoes do banco (ultimas N)
  const publicacoes = await prisma.publicacao.findMany({
    where: { advogadoId: advogado.id },
    orderBy: { dataPublicacao: 'desc' },
    take: Number(limite),
    select: {
      id: true,
      numeroProcesso: true,
      siglaTribunal: true,
      dataPublicacao: true,
      tipoComunicacao: true,
      textoComunicacao: true,
      textoLimpo: true,
      parteAutor: true,
      parteReu: true,
      comarca: true,
      classeProcessual: true,
      advogadosProcesso: true,
      nomeOrgao: true,
      status: true,
      createdAt: true,
    },
  });

  res.json({
    encontrado: true,
    advogado: {
      id: advogado.id,
      nome: advogado.nome,
      oab: advogado.oab,
      totalAndamentos: advogado.totalAndamentos,
      ultimaSincronizacao: advogado.ultimaSincronizacao,
      sincronizacaoAtiva: advogado.sincronizacaoAtiva,
    },
    totalPublicacoes: publicacoes.length,
    publicacoes,
  });
});

/**
 * GET /api/consulta/buffer/processo/:numeroProcesso
 * Consulta publicacoes de um processo especifico (ultimos 3 andamentos)
 */
router.get('/buffer/processo/:numeroProcesso', async (req, res) => {
  const { numeroProcesso } = req.params;
  const { companyId } = req.query;

  // Normaliza numero do processo (remove . e -)
  const numeroNormalizado = normalizarNumeroProcesso(numeroProcesso);

  // Busca publicacoes do processo
  const publicacoes = await prisma.publicacao.findMany({
    where: {
      numeroProcesso: numeroNormalizado,
      ...(companyId && {
        advogado: { advwellCompanyId: String(companyId) },
      }),
    },
    orderBy: { dataPublicacao: 'desc' },
    take: 3, // Ultimos 3 andamentos
    select: {
      id: true,
      dataPublicacao: true,
      tipoComunicacao: true,
      textoComunicacao: true,
      textoLimpo: true,
      parteAutor: true,
      parteReu: true,
      comarca: true,
      classeProcessual: true,
      advogadosProcesso: true,
      nomeOrgao: true,
      siglaTribunal: true,
      createdAt: true,
      advogado: {
        select: { nome: true, oab: true },
      },
    },
  });

  res.json({
    numeroProcesso: numeroNormalizado,
    totalAndamentos: publicacoes.length,
    andamentos: publicacoes.map((p) => ({
      id: p.id,
      dataPublicacao: p.dataPublicacao,
      tipoComunicacao: p.tipoComunicacao,
      textoComunicacao: p.textoComunicacao,
      textoLimpo: p.textoLimpo,
      parteAutor: p.parteAutor,
      parteReu: p.parteReu,
      comarca: p.comarca,
      classeProcessual: p.classeProcessual,
      advogadosProcesso: p.advogadosProcesso,
      nomeOrgao: p.nomeOrgao,
      siglaTribunal: p.siglaTribunal,
      advogadoMonitorado: p.advogado.nome,
      criadoEm: p.createdAt,
    })),
  });
});

export default router;
