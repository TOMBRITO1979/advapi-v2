import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { AuthRequest } from './auth.js';

// Paths que devem ser logados (apenas rotas de integracao)
const PATHS_TO_LOG = [
  '/api/consulta',
  '/api/webhook',
];

// Paths que NAO devem ser logados
const PATHS_TO_SKIP = [
  '/health',
  '/api/auth',
  '/api/dashboard',
  '/api/advogados',
  '/api/proxies',
  '/api/logs',
  '/api/api-keys',
];

// Campos sensiveis que devem ser mascarados
const SENSITIVE_FIELDS = ['senha', 'password', 'secret', 'token', 'key', 'apiKey'];

/**
 * Remove campos sensiveis de um objeto
 */
function sanitizeBody(body: any): any {
  if (!body || typeof body !== 'object') return body;

  const sanitized: any = Array.isArray(body) ? [] : {};

  for (const key of Object.keys(body)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_FIELDS.some(field => lowerKey.includes(field))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof body[key] === 'object' && body[key] !== null) {
      sanitized[key] = sanitizeBody(body[key]);
    } else {
      sanitized[key] = body[key];
    }
  }

  return sanitized;
}

/**
 * Limita tamanho do body para nao salvar dados muito grandes
 */
function truncateBody(body: any, maxSize: number = 5000): any {
  if (!body) return body;

  const str = JSON.stringify(body);
  if (str.length <= maxSize) return body;

  return {
    _truncated: true,
    _originalSize: str.length,
    _preview: str.substring(0, maxSize) + '...',
  };
}

/**
 * Extrai headers relevantes (sem dados sensiveis)
 */
function extractHeaders(req: Request): Record<string, string> {
  const relevant = [
    'content-type',
    'user-agent',
    'x-forwarded-for',
    'x-real-ip',
    'origin',
    'referer',
  ];

  const headers: Record<string, string> = {};
  for (const key of relevant) {
    const value = req.headers[key];
    if (value) {
      headers[key] = Array.isArray(value) ? value[0] : value;
    }
  }

  return headers;
}

/**
 * Obtem IP real do cliente
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0].trim();
  }
  return req.headers['x-real-ip'] as string || req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Determina origem da requisicao
 */
function getOrigin(req: AuthRequest): string {
  // Se tem apiKeyId, veio de integracao
  if (req.apiKeyId) return 'API_KEY';

  // Se tem JWT (userId), veio do dashboard
  if (req.userId) return 'DASHBOARD';

  // Verifica header de origem
  const origin = req.headers.origin || req.headers.referer;
  if (origin) {
    if (origin.includes('advwell')) return 'ADVWELL';
    if (origin.includes('localhost')) return 'LOCALHOST';
    return 'EXTERNAL';
  }

  return 'UNKNOWN';
}

/**
 * Verifica se o path deve ser logado
 */
function shouldLog(path: string): boolean {
  // Verifica se deve pular
  if (PATHS_TO_SKIP.some(p => path.startsWith(p))) {
    return false;
  }

  // Verifica se deve logar
  return PATHS_TO_LOG.some(p => path.startsWith(p));
}

/**
 * Middleware para logar requisicoes API
 */
export function requestLoggerMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  // Verifica se deve logar este path
  if (!shouldLog(req.path)) {
    return next();
  }

  const startTime = Date.now();

  // Captura o body original da resposta
  const originalJson = res.json.bind(res);
  let responseBody: any = null;

  res.json = function(body: any) {
    responseBody = body;
    return originalJson(body);
  };

  // Quando a resposta terminar, salva o log
  res.on('finish', async () => {
    try {
      const responseTime = Date.now() - startTime;
      const sucesso = res.statusCode >= 200 && res.statusCode < 400;

      // Extrai dados do body da requisicao
      const reqBody = sanitizeBody(req.body);
      const companyId = req.body?.companyId || null;
      const advogadoNome = req.body?.advogadoNome || null;

      // Extrai dados da resposta
      const resBody = truncateBody(sanitizeBody(responseBody));
      const advogadoId = responseBody?.advogadoId || null;
      const consultaId = responseBody?.consultaId || null;
      const erro = !sucesso ? (responseBody?.error || responseBody?.message || null) : null;

      // Busca prefixo da API key se existir
      let apiKeyPrefixo: string | null = null;
      if (req.apiKeyId) {
        const apiKey = await prisma.apiKey.findUnique({
          where: { id: req.apiKeyId },
          select: { prefixo: true },
        });
        apiKeyPrefixo = apiKey?.prefixo || null;
      }

      // Salva o log
      await prisma.apiRequestLog.create({
        data: {
          metodo: req.method,
          path: req.path,
          queryParams: Object.keys(req.query).length > 0 ? JSON.parse(JSON.stringify(req.query)) : undefined,
          ip: getClientIp(req),
          userAgent: req.headers['user-agent'] || null,
          apiKeyId: req.apiKeyId || null,
          apiKeyPrefixo,
          origem: getOrigin(req),
          requestBody: truncateBody(reqBody),
          requestHeaders: extractHeaders(req),
          statusCode: res.statusCode,
          responseBody: resBody,
          responseTime,
          sucesso,
          erro,
          advogadoId,
          consultaId,
          companyId,
        },
      });

      // Log no console tambem
      console.log(
        `[API Log] ${req.method} ${req.path} | ` +
        `Status: ${res.statusCode} | ` +
        `Tempo: ${responseTime}ms | ` +
        `Origem: ${getOrigin(req)} | ` +
        `${advogadoNome ? `Advogado: ${advogadoNome}` : ''}`
      );
    } catch (error) {
      // Nao deixa erro de logging afetar a aplicacao
      console.error('[API Log] Erro ao salvar log:', error);
    }
  });

  next();
}
