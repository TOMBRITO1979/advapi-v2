import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../middlewares/error.js';

const router = Router();

// Login
router.post('/login', async (req, res) => {
  const { email, senha } = req.body;

  const usuario = await prisma.usuario.findUnique({ where: { email } });

  if (!usuario || !usuario.ativo) {
    throw new AppError('Credenciais invalidas', 401);
  }

  const senhaValida = await bcrypt.compare(senha, usuario.senha);

  if (!senhaValida) {
    throw new AppError('Credenciais invalidas', 401);
  }

  const token = jwt.sign(
    { id: usuario.id, role: usuario.role },
    process.env.JWT_SECRET!,
    { expiresIn: '7d' }
  );

  res.json({
    token,
    usuario: {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      role: usuario.role,
    },
  });
});

// Criar usuario inicial (apenas se nao existir nenhum)
router.post('/setup', async (req, res) => {
  const count = await prisma.usuario.count();

  if (count > 0) {
    throw new AppError('Setup ja realizado', 400);
  }

  const { nome, email, senha } = req.body;

  const senhaHash = await bcrypt.hash(senha, 10);

  const usuario = await prisma.usuario.create({
    data: {
      nome,
      email,
      senha: senhaHash,
      role: 'admin',
    },
  });

  res.status(201).json({
    message: 'Usuario admin criado',
    usuario: {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
    },
  });
});

export default router;
