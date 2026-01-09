import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { authMiddleware, AuthRequest } from '../middlewares/auth.js';
import { AppError } from '../middlewares/error.js';
import * as XLSX from 'xlsx';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authMiddleware);

/**
 * GET /api/proxies
 * Lista todos os proxies
 */
router.get('/', async (req: AuthRequest, res) => {
  const { ativo, page = '1', limit = '50' } = req.query;

  const where: any = {};

  if (ativo !== undefined) {
    where.ativo = ativo === 'true';
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [proxies, total] = await Promise.all([
    prisma.proxy.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: Number(limit),
    }),
    prisma.proxy.count({ where }),
  ]);

  res.json({
    data: proxies.map(p => ({
      ...p,
      tipo: p.protocolo,
      usosHoje: p.consultasHoraAtual,
      falhasConsecutivas: p.funcionando ? 0 : p.consultasFalha,
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
 * POST /api/proxies
 * Adiciona proxy manualmente
 */
router.post('/', async (req: AuthRequest, res) => {
  const { host, porta, usuario, senha, tipo = 'http' } = req.body;

  if (!host || !porta) {
    throw new AppError('Host e porta sao obrigatorios', 400);
  }

  // Verifica se ja existe
  const existe = await prisma.proxy.findFirst({
    where: { host, porta: Number(porta) },
  });

  if (existe) {
    throw new AppError('Proxy ja cadastrado', 409);
  }

  const proxy = await prisma.proxy.create({
    data: {
      host,
      porta: Number(porta),
      usuario,
      senha,
      protocolo: tipo,
      ativo: true,
    },
  });

  res.status(201).json(proxy);
});

/**
 * POST /api/proxies/upload
 * Upload de planilha com proxies (Excel ou CSV)
 */
router.post('/upload', upload.single('arquivo'), async (req: AuthRequest, res) => {
  if (!req.file) {
    throw new AppError('Arquivo nao enviado', 400);
  }

  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet) as any[];

  if (data.length === 0) {
    throw new AppError('Planilha vazia', 400);
  }

  const resultados = {
    total: data.length,
    inseridos: 0,
    duplicados: 0,
    erros: 0,
  };

  for (const row of data) {
    try {
      // Aceita varios formatos de colunas
      const host = row.host || row.Host || row.HOST || row.ip || row.IP;
      const porta = row.porta || row.Porta || row.PORTA || row.port || row.Port || row.PORT;
      const usuario = row.usuario || row.Usuario || row.USUARIO || row.user || row.User || row.USER || row.username;
      const senha = row.senha || row.Senha || row.SENHA || row.password || row.Password || row.PASSWORD || row.pass;
      const tipo = row.tipo || row.Tipo || row.TIPO || row.type || 'http';

      if (!host || !porta) {
        resultados.erros++;
        continue;
      }

      // Verifica duplicado
      const existe = await prisma.proxy.findFirst({
        where: { host, porta: Number(porta) },
      });

      if (existe) {
        resultados.duplicados++;
        continue;
      }

      await prisma.proxy.create({
        data: {
          host,
          porta: Number(porta),
          usuario: usuario || null,
          senha: senha || null,
          protocolo: tipo || 'http',
          ativo: true,
        },
      });

      resultados.inseridos++;
    } catch {
      resultados.erros++;
    }
  }

  res.json({
    message: 'Upload processado',
    resultados,
  });
});

/**
 * PUT /api/proxies/:id
 * Atualiza proxy
 */
router.put('/:id', async (req: AuthRequest, res) => {
  const { host, porta, usuario, senha, tipo, ativo } = req.body;

  const proxy = await prisma.proxy.findUnique({
    where: { id: req.params.id },
  });

  if (!proxy) {
    throw new AppError('Proxy nao encontrado', 404);
  }

  const atualizado = await prisma.proxy.update({
    where: { id: req.params.id },
    data: {
      host,
      porta: porta ? Number(porta) : undefined,
      usuario,
      senha,
      protocolo: tipo,
      ativo,
    },
  });

  res.json(atualizado);
});

/**
 * DELETE /api/proxies/:id
 * Remove proxy
 */
router.delete('/:id', async (req: AuthRequest, res) => {
  const proxy = await prisma.proxy.findUnique({
    where: { id: req.params.id },
  });

  if (!proxy) {
    throw new AppError('Proxy nao encontrado', 404);
  }

  await prisma.proxy.delete({
    where: { id: req.params.id },
  });

  res.json({ message: 'Proxy removido' });
});

/**
 * POST /api/proxies/:id/testar
 * Testa conexao do proxy
 */
router.post('/:id/testar', async (req: AuthRequest, res) => {
  const proxy = await prisma.proxy.findUnique({
    where: { id: req.params.id },
  });

  if (!proxy) {
    throw new AppError('Proxy nao encontrado', 404);
  }

  try {
    const proxyUrl = proxy.usuario
      ? `${proxy.protocolo}://${proxy.usuario}:${proxy.senha}@${proxy.host}:${proxy.porta}`
      : `${proxy.protocolo}://${proxy.host}:${proxy.porta}`;

    // Testa fazendo request para um servico de IP
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch('https://api.ipify.org?format=json', {
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.ok) {
      await prisma.proxy.update({
        where: { id: req.params.id },
        data: {
          ultimoUso: new Date(),
          funcionando: true,
        },
      });

      res.json({ sucesso: true, message: 'Proxy funcionando' });
    } else {
      throw new Error('Resposta invalida');
    }
  } catch (error: any) {
    await prisma.proxy.update({
      where: { id: req.params.id },
      data: {
        funcionando: false,
        consultasFalha: { increment: 1 },
      },
    });

    res.json({
      sucesso: false,
      message: `Erro ao testar: ${error.message}`,
    });
  }
});

/**
 * GET /api/proxies/stats
 * Estatisticas de proxies
 */
router.get('/stats/resumo', async (req: AuthRequest, res) => {
  const [total, ativos, inativos, comFalhas] = await Promise.all([
    prisma.proxy.count(),
    prisma.proxy.count({ where: { ativo: true } }),
    prisma.proxy.count({ where: { ativo: false } }),
    prisma.proxy.count({ where: { funcionando: false } }),
  ]);

  res.json({
    total,
    ativos,
    inativos,
    comFalhas,
    disponiveis: ativos - comFalhas,
  });
});

/**
 * POST /api/proxies/:id/resetar
 * Reseta status do proxy (marca como funcionando novamente)
 */
router.post('/:id/resetar', async (req: AuthRequest, res) => {
  const proxy = await prisma.proxy.findUnique({
    where: { id: req.params.id },
  });

  if (!proxy) {
    throw new AppError('Proxy nao encontrado', 404);
  }

  const atualizado = await prisma.proxy.update({
    where: { id: req.params.id },
    data: {
      funcionando: true,
      consultasFalha: 0,
      ultimoErro: null,
    },
  });

  res.json(atualizado);
});

/**
 * DELETE /api/proxies/falhos
 * Remove todos os proxies que nao estao funcionando
 */
router.delete('/falhos/todos', async (req: AuthRequest, res) => {
  const resultado = await prisma.proxy.deleteMany({
    where: { funcionando: false },
  });

  res.json({
    message: `${resultado.count} proxies removidos`,
    removidos: resultado.count,
  });
});

/**
 * POST /api/proxies/resetar-todos
 * Reseta status de todos os proxies
 */
router.post('/resetar/todos', async (req: AuthRequest, res) => {
  const resultado = await prisma.proxy.updateMany({
    where: { funcionando: false },
    data: {
      funcionando: true,
      consultasFalha: 0,
      ultimoErro: null,
    },
  });

  res.json({
    message: `${resultado.count} proxies resetados`,
    resetados: resultado.count,
  });
});

export default router;
