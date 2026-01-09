import { Router } from 'express';
import advogadoRoutes from './advogado.routes.js';
import publicacaoRoutes from './publicacao.routes.js';
import proxyRoutes from './proxy.routes.js';
import consultaRoutes from './consulta.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import authRoutes from './auth.routes.js';
import webhookRoutes from './webhook.routes.js';

export const router = Router();

// Rotas publicas
router.use('/auth', authRoutes);

// Rotas de integracao (API Key)
router.use('/webhook', webhookRoutes);
router.use('/consulta', consultaRoutes);

// Rotas do dashboard (JWT)
router.use('/advogados', advogadoRoutes);
router.use('/publicacoes', publicacaoRoutes);
router.use('/proxies', proxyRoutes);
router.use('/dashboard', dashboardRoutes);
