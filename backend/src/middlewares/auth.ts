import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../utils/prisma.js';
import { AppError } from './error.js';

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
  apiKeyId?: string;
}

// Auth para dashboard (JWT)
export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    throw new AppError('Token nao fornecido', 401);
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    req.userId = decoded.id;
    req.userRole = decoded.role;
    next();
  } catch {
    throw new AppError('Token invalido', 401);
  }
}

// Auth para integracao com AdvWell (API Key)
export async function apiKeyMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    throw new AppError('API Key nao fornecida', 401);
  }

  // 1. Primeiro verifica keys estaticas do ambiente
  const validEnvKeys = [
    process.env.ADVWELL_API_KEY,
    process.env.API_KEY,
  ].filter(Boolean);

  if (validEnvKeys.includes(apiKey)) {
    return next();
  }

  // 2. Verifica se e uma API key do banco (formato: advapi_sk_...)
  if (apiKey.startsWith('advapi_sk_')) {
    try {
      // Faz hash da key para comparar com o banco
      const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

      // Busca no banco
      const dbKey = await prisma.apiKey.findFirst({
        where: {
          key: keyHash,
          ativa: true,
        },
      });

      if (dbKey) {
        // Atualiza metricas de uso (async, nao bloqueia)
        prisma.apiKey.update({
          where: { id: dbKey.id },
          data: {
            totalRequisicoes: { increment: 1 },
            ultimoUso: new Date(),
          },
        }).catch(() => {}); // Ignora erros de metricas

        req.apiKeyId = dbKey.id;
        return next();
      }
    } catch (error) {
      console.error('[Auth] Erro ao verificar API key:', error);
    }
  }

  throw new AppError('API Key invalida', 401);
}
