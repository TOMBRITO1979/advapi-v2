import { Router } from 'express';
import crypto from 'crypto';
import { prisma } from '../utils/prisma.js';
import { authMiddleware, AuthRequest } from '../middlewares/auth.js';
import { AppError } from '../middlewares/error.js';

const router = Router();

// Todas as rotas requerem autenticacao do dashboard
router.use(authMiddleware);

/**
 * Gera uma API key segura no formato:
 * advapi_sk_<64 chars hex SHA256>
 */
function gerarApiKey(): { keyCompleta: string; keyHash: string; prefixo: string } {
  // Gera 32 bytes aleatorios
  const randomBytes = crypto.randomBytes(32);

  // Cria hash SHA256 dos bytes
  const hash = crypto.createHash('sha256').update(randomBytes).digest('hex');

  // Key completa com prefixo
  const keyCompleta = `advapi_sk_${hash}`;

  // Prefixo para identificacao (primeiros 8 chars do hash)
  const prefixo = hash.substring(0, 8);

  // Hash da key completa para armazenar no banco
  const keyHash = crypto.createHash('sha256').update(keyCompleta).digest('hex');

  return { keyCompleta, keyHash, prefixo };
}

/**
 * GET /api/api-keys
 * Lista todas as API keys do usuario
 */
router.get('/', async (req: AuthRequest, res) => {
  const apiKeys = await prisma.apiKey.findMany({
    where: { usuarioId: req.userId },
    select: {
      id: true,
      nome: true,
      prefixo: true,
      ativa: true,
      totalRequisicoes: true,
      ultimoUso: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json(apiKeys);
});

/**
 * POST /api/api-keys
 * Cria uma nova API key
 */
router.post('/', async (req: AuthRequest, res) => {
  const { nome } = req.body;

  if (!nome || nome.trim().length < 3) {
    throw new AppError('Nome deve ter pelo menos 3 caracteres', 400);
  }

  // Gera a key
  const { keyCompleta, keyHash, prefixo } = gerarApiKey();

  // Salva no banco (apenas o hash)
  const apiKey = await prisma.apiKey.create({
    data: {
      nome: nome.trim(),
      key: keyHash,
      prefixo,
      usuarioId: req.userId!,
    },
    select: {
      id: true,
      nome: true,
      prefixo: true,
      ativa: true,
      createdAt: true,
    },
  });

  // Retorna a key completa APENAS na criacao
  // Depois so mostramos o prefixo
  res.status(201).json({
    ...apiKey,
    key: keyCompleta,
    aviso: 'Guarde esta key em local seguro. Ela nao sera mostrada novamente.',
  });
});

/**
 * PUT /api/api-keys/:id
 * Atualiza uma API key (ativar/desativar ou renomear)
 */
router.put('/:id', async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { nome, ativa } = req.body;

  // Verifica se a key pertence ao usuario
  const apiKey = await prisma.apiKey.findFirst({
    where: { id, usuarioId: req.userId },
  });

  if (!apiKey) {
    throw new AppError('API Key nao encontrada', 404);
  }

  const updateData: any = {};
  if (nome !== undefined) updateData.nome = nome.trim();
  if (ativa !== undefined) updateData.ativa = ativa;

  const updated = await prisma.apiKey.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      nome: true,
      prefixo: true,
      ativa: true,
      totalRequisicoes: true,
      ultimoUso: true,
      createdAt: true,
    },
  });

  res.json(updated);
});

/**
 * DELETE /api/api-keys/:id
 * Exclui uma API key
 */
router.delete('/:id', async (req: AuthRequest, res) => {
  const { id } = req.params;

  // Verifica se a key pertence ao usuario
  const apiKey = await prisma.apiKey.findFirst({
    where: { id, usuarioId: req.userId },
  });

  if (!apiKey) {
    throw new AppError('API Key nao encontrada', 404);
  }

  await prisma.apiKey.delete({ where: { id } });

  res.json({ message: 'API Key excluida com sucesso' });
});

/**
 * GET /api/api-keys/stats
 * Estatisticas gerais das API keys
 */
router.get('/stats', async (req: AuthRequest, res) => {
  const stats = await prisma.apiKey.aggregate({
    where: { usuarioId: req.userId },
    _count: { id: true },
    _sum: { totalRequisicoes: true },
  });

  const ativas = await prisma.apiKey.count({
    where: { usuarioId: req.userId, ativa: true },
  });

  res.json({
    total: stats._count.id,
    ativas,
    inativas: stats._count.id - ativas,
    totalRequisicoes: stats._sum.totalRequisicoes || 0,
  });
});

export default router;
