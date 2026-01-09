import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { apiKeyMiddleware } from '../middlewares/auth.js';

const router = Router();

router.use(apiKeyMiddleware);

/**
 * POST /api/webhook/advwell
 * Recebe notificacoes do AdvWell (ex: advogado desativou monitoramento)
 */
router.post('/advwell', async (req, res) => {
  const { evento, dados } = req.body;

  switch (evento) {
    case 'advogado.desativar':
      await prisma.advogado.updateMany({
        where: {
          advwellCompanyId: dados.companyId,
          nome: dados.advogadoNome?.toUpperCase(),
        },
        data: { ativo: false },
      });
      break;

    case 'advogado.ativar':
      await prisma.advogado.updateMany({
        where: {
          advwellCompanyId: dados.companyId,
          nome: dados.advogadoNome?.toUpperCase(),
        },
        data: { ativo: true },
      });
      break;

    case 'empresa.desativar':
      await prisma.advogado.updateMany({
        where: { advwellCompanyId: dados.companyId },
        data: { ativo: false },
      });
      break;
  }

  res.json({ received: true });
});

export default router;
