import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

import { router } from './routes/index.js';
import { errorHandler } from './middlewares/error.js';
import { prisma } from './utils/prisma.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middlewares
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Rotas da API
app.use('/api', router);

// Error handler
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM recebido, encerrando...');
  await prisma.$disconnect();
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════════╗
  ║         ADVAPI v2.0 - Servidor Iniciado       ║
  ╠═══════════════════════════════════════════════╣
  ║  URL: http://localhost:${PORT}                   ║
  ║  Env: ${process.env.NODE_ENV || 'development'}                        ║
  ╚═══════════════════════════════════════════════╝
  `);
});

export default app;
