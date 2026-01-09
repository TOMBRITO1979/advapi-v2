import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from './error.js';

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
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
export function apiKeyMiddleware(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    throw new AppError('API Key nao fornecida', 401);
  }

  // Verifica se a API Key e valida (pode ser do AdvWell ou configurada)
  const validKeys = [
    process.env.ADVWELL_API_KEY,
    process.env.API_KEY,
  ].filter(Boolean);

  if (!validKeys.includes(apiKey)) {
    throw new AppError('API Key invalida', 401);
  }

  next();
}
