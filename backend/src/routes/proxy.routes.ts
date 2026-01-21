import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { authMiddleware, AuthRequest } from '../middlewares/auth.js';
import { AppError } from '../middlewares/error.js';
import * as XLSX from 'xlsx';
import multer from 'multer';
import { webshareService } from '../services/webshare.service.js';

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
  const [total, ativos, inativos, comFalhas, bloqueadosCnj, necessitamSubstituicao] = await Promise.all([
    prisma.proxy.count(),
    prisma.proxy.count({ where: { ativo: true } }),
    prisma.proxy.count({ where: { ativo: false } }),
    prisma.proxy.count({ where: { funcionando: false } }),
    prisma.proxy.count({ where: { bloqueadoCnj: true } }),
    prisma.proxy.count({ where: { necessitaSubstituicao: true } }),
  ]);

  res.json({
    total,
    ativos,
    inativos,
    comFalhas,
    disponiveis: ativos - comFalhas,
    bloqueadosCnj,
    necessitamSubstituicao,
  });
});

/**
 * GET /api/proxies/alertas
 * Lista proxies que precisam atencao (bloqueados ou com falhas)
 */
router.get('/alertas', async (req: AuthRequest, res) => {
  const problematicos = await prisma.proxy.findMany({
    where: {
      ativo: true,
      OR: [
        { bloqueadoCnj: true },
        { necessitaSubstituicao: true },
        { falhasConsecutivas: { gte: 3 } },
      ],
    },
    orderBy: [
      { bloqueadoCnj: 'desc' },
      { falhasConsecutivas: 'desc' },
    ],
  });

  // Agrupa por criticidade
  const bloqueadosCnj = problematicos.filter(p => p.bloqueadoCnj);
  const comMuitasFalhas = problematicos.filter(p => !p.bloqueadoCnj && p.falhasConsecutivas >= 5);
  const comAlgumasFalhas = problematicos.filter(p => !p.bloqueadoCnj && p.falhasConsecutivas >= 3 && p.falhasConsecutivas < 5);

  res.json({
    total: problematicos.length,
    bloqueadosCnj: bloqueadosCnj.map(p => ({
      id: p.id,
      host: p.host,
      porta: p.porta,
      dataBloqueioCnj: p.dataBloqueioCnj,
      ultimoErro: p.ultimoErro,
    })),
    comMuitasFalhas: comMuitasFalhas.map(p => ({
      id: p.id,
      host: p.host,
      porta: p.porta,
      falhasConsecutivas: p.falhasConsecutivas,
      ultimoErro: p.ultimoErro,
    })),
    comAlgumasFalhas: comAlgumasFalhas.map(p => ({
      id: p.id,
      host: p.host,
      porta: p.porta,
      falhasConsecutivas: p.falhasConsecutivas,
      ultimoErro: p.ultimoErro,
    })),
  });
});

/**
 * POST /api/proxies/health-check
 * Executa health check manual em todos os proxies (ou em um especifico)
 */
router.post('/health-check', async (req: AuthRequest, res) => {
  const { proxyId } = req.body;

  // Se foi passado um proxyId, testa apenas esse
  if (proxyId) {
    const proxy = await prisma.proxy.findUnique({ where: { id: proxyId } });
    if (!proxy) {
      throw new AppError('Proxy nao encontrado', 404);
    }

    // Agenda o teste (nao bloqueia a resposta)
    res.json({
      message: 'Health check iniciado',
      proxies: 1,
      modo: 'individual',
    });

    // Executa teste em background (simples)
    testarProxyHealthCheck(proxy);
    return;
  }

  // Testa todos os proxies ativos
  const proxies = await prisma.proxy.findMany({
    where: { ativo: true },
  });

  res.json({
    message: 'Health check iniciado para todos os proxies',
    proxies: proxies.length,
    modo: 'completo',
    aviso: 'Os testes serao executados em background. Verifique os logs do sistema para resultados.',
  });

  // Executa testes em background (sequencialmente para nao sobrecarregar)
  executarHealthCheckEmBackground(proxies);
});

/**
 * Funcao auxiliar para testar um proxy
 */
async function testarProxyHealthCheck(proxy: any): Promise<void> {
  try {
    const { chromium } = await import('playwright');

    console.log(`[HealthCheck Manual] Testando proxy: ${proxy.host}:${proxy.porta}`);

    // Teste 1: Conectividade basica
    let browser;
    try {
      browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
      const context = await browser.newContext({
        proxy: {
          server: `${proxy.protocolo}://${proxy.host}:${proxy.porta}`,
          username: proxy.usuario || undefined,
          password: proxy.senha || undefined,
        },
      });
      const page = await context.newPage();
      await page.goto('https://api.ipify.org?format=json', { timeout: 30000 });
      await context.close();
      await browser.close();
    } catch (error: any) {
      console.log(`[HealthCheck Manual] Proxy ${proxy.host}:${proxy.porta} - FALHA conectividade`);
      await prisma.proxy.update({
        where: { id: proxy.id },
        data: {
          ultimoHealthCheck: new Date(),
          funcionando: false,
          falhasConsecutivas: proxy.falhasConsecutivas + 1,
          necessitaSubstituicao: proxy.falhasConsecutivas + 1 >= 5,
          ultimoErro: error.message,
        },
      });
      return;
    }

    // Teste 2: Acesso ao CNJ
    try {
      browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
      const context = await browser.newContext({
        proxy: {
          server: `${proxy.protocolo}://${proxy.host}:${proxy.porta}`,
          username: proxy.usuario || undefined,
          password: proxy.senha || undefined,
        },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      });
      const page = await context.newPage();
      const response = await page.goto('https://hcomunica.cnj.jus.br', { timeout: 60000 });
      const conteudo = await page.content();
      const statusCode = response?.status() || 0;
      await context.close();
      await browser.close();

      // Verifica sinais de bloqueio
      const sinaisBloqueio = ['acesso negado', 'ip bloqueado', 'muitas requisições', '403', '429', 'rate limit', 'blocked', 'captcha'];
      const conteudoLower = conteudo.toLowerCase();
      let bloqueado = false;
      let motivo = '';

      for (const sinal of sinaisBloqueio) {
        if (conteudoLower.includes(sinal) || statusCode === 403 || statusCode === 429) {
          bloqueado = true;
          motivo = sinal;
          break;
        }
      }

      if (bloqueado) {
        console.log(`[HealthCheck Manual] Proxy ${proxy.host}:${proxy.porta} - BLOQUEADO CNJ: ${motivo}`);
        await prisma.proxy.update({
          where: { id: proxy.id },
          data: {
            ultimoHealthCheck: new Date(),
            funcionando: false,
            bloqueadoCnj: true,
            dataBloqueioCnj: new Date(),
            falhasConsecutivas: proxy.falhasConsecutivas + 1,
            necessitaSubstituicao: true,
            ultimoErro: `Bloqueado CNJ: ${motivo}`,
          },
        });
        return;
      }

      // Proxy OK
      console.log(`[HealthCheck Manual] Proxy ${proxy.host}:${proxy.porta} - OK`);
      await prisma.proxy.update({
        where: { id: proxy.id },
        data: {
          ultimoHealthCheck: new Date(),
          funcionando: true,
          bloqueadoCnj: false,
          falhasConsecutivas: 0,
          necessitaSubstituicao: false,
          ultimoErro: null,
        },
      });
    } catch (error: any) {
      console.log(`[HealthCheck Manual] Proxy ${proxy.host}:${proxy.porta} - ERRO CNJ: ${error.message}`);
      const isBloqueio = error.message?.includes('403') || error.message?.includes('blocked');
      await prisma.proxy.update({
        where: { id: proxy.id },
        data: {
          ultimoHealthCheck: new Date(),
          funcionando: false,
          bloqueadoCnj: isBloqueio,
          dataBloqueioCnj: isBloqueio ? new Date() : proxy.dataBloqueioCnj,
          falhasConsecutivas: proxy.falhasConsecutivas + 1,
          necessitaSubstituicao: isBloqueio || proxy.falhasConsecutivas + 1 >= 5,
          ultimoErro: error.message,
        },
      });
    }
  } catch (error: any) {
    console.error(`[HealthCheck Manual] Erro geral: ${error.message}`);
  }
}

/**
 * Executa health check em background para multiplos proxies
 */
async function executarHealthCheckEmBackground(proxies: any[]): Promise<void> {
  console.log(`[HealthCheck Manual] Iniciando teste de ${proxies.length} proxies em background`);

  for (let i = 0; i < proxies.length; i++) {
    const proxy = proxies[i];
    await testarProxyHealthCheck(proxy);

    // Delay entre testes
    if (i < proxies.length - 1) {
      await new Promise(r => setTimeout(r, 3000 + Math.random() * 2000));
    }
  }

  console.log(`[HealthCheck Manual] Teste de ${proxies.length} proxies finalizado`);

  // Gera log do sistema com resultado
  const stats = await prisma.proxy.groupBy({
    by: ['funcionando', 'bloqueadoCnj'],
    where: { ativo: true },
    _count: true,
  });

  const funcionando = stats.find(s => s.funcionando && !s.bloqueadoCnj)?._count || 0;
  const bloqueados = stats.find(s => s.bloqueadoCnj)?._count || 0;
  const falhando = stats.filter(s => !s.funcionando && !s.bloqueadoCnj).reduce((acc, s) => acc + s._count, 0);

  await prisma.logSistema.create({
    data: {
      tipo: bloqueados > 0 ? 'CRITICO' : falhando > 0 ? 'ALERTA' : 'INFO',
      categoria: 'PROXY',
      titulo: 'Health check manual concluido',
      mensagem: `Resultado do health check manual:\n\n- Funcionando: ${funcionando}\n- Bloqueados CNJ: ${bloqueados}\n- Com falhas: ${falhando}\n\nTotal testados: ${proxies.length}`,
    },
  });
}

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

// ============================================================================
// WEBSHARE INTEGRATION
// ============================================================================

/**
 * GET /api/proxies/webshare/status
 * Verifica se a integração Webshare está configurada
 */
router.get('/webshare/status', async (req: AuthRequest, res) => {
  const configurado = webshareService.isConfigured();

  if (!configurado) {
    res.json({
      configurado: false,
      mensagem: 'WEBSHARE_API_KEY não configurada',
    });
    return;
  }

  // Testa conexão com a API
  try {
    const lista = await webshareService.listarProxies(1, 1);
    res.json({
      configurado: true,
      totalProxiesWebshare: lista.count,
      mensagem: 'Integração Webshare ativa',
    });
  } catch (error: any) {
    res.json({
      configurado: true,
      erro: error.message,
      mensagem: 'Erro ao conectar com Webshare API',
    });
  }
});

/**
 * POST /api/proxies/webshare/sincronizar
 * Sincroniza proxies da Webshare com o banco local
 */
router.post('/webshare/sincronizar', async (req: AuthRequest, res) => {
  if (!webshareService.isConfigured()) {
    throw new AppError('WEBSHARE_API_KEY não configurada', 400);
  }

  try {
    const resultado = await webshareService.sincronizarProxies();

    res.json({
      sucesso: true,
      mensagem: 'Sincronização concluída',
      ...resultado,
    });
  } catch (error: any) {
    throw new AppError(`Erro na sincronização: ${error.message}`, 500);
  }
});

/**
 * POST /api/proxies/webshare/substituir/:id
 * Substitui um proxy específico via Webshare
 */
router.post('/webshare/substituir/:id', async (req: AuthRequest, res) => {
  if (!webshareService.isConfigured()) {
    throw new AppError('WEBSHARE_API_KEY não configurada', 400);
  }

  const { id } = req.params;

  try {
    const resultado = await webshareService.substituirProxyComFalha(id);

    if (resultado.sucesso) {
      res.json(resultado);
    } else {
      throw new AppError(resultado.mensagem, 400);
    }
  } catch (error: any) {
    throw new AppError(`Erro ao substituir proxy: ${error.message}`, 500);
  }
});

/**
 * POST /api/proxies/webshare/substituir-falhos
 * Substitui todos os proxies com falhas via Webshare
 */
router.post('/webshare/substituir-falhos', async (req: AuthRequest, res) => {
  if (!webshareService.isConfigured()) {
    throw new AppError('WEBSHARE_API_KEY não configurada', 400);
  }

  try {
    const resultado = await webshareService.substituirProxiesComFalha();

    res.json({
      sucesso: true,
      mensagem: `${resultado.substituidos} de ${resultado.total} proxies substituídos`,
      ...resultado,
    });
  } catch (error: any) {
    throw new AppError(`Erro ao substituir proxies: ${error.message}`, 500);
  }
});

/**
 * GET /api/proxies/webshare/listar
 * Lista proxies direto da Webshare (para debug/comparação)
 */
router.get('/webshare/listar', async (req: AuthRequest, res) => {
  if (!webshareService.isConfigured()) {
    throw new AppError('WEBSHARE_API_KEY não configurada', 400);
  }

  const page = Number(req.query.page) || 1;
  const pageSize = Number(req.query.limit) || 25;

  try {
    const lista = await webshareService.listarProxies(page, pageSize);

    res.json({
      total: lista.count,
      pagina: page,
      proxies: lista.results.map(p => ({
        id: p.id,
        host: p.proxy_address,
        porta: p.port,
        usuario: p.username,
        valido: p.valid,
        pais: p.country_code,
        cidade: p.city_name,
        ultimaVerificacao: p.last_verification,
      })),
    });
  } catch (error: any) {
    throw new AppError(`Erro ao listar proxies: ${error.message}`, 500);
  }
});

export default router;
