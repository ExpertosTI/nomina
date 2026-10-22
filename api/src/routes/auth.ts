import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { requireAuth, signToken } from '../middleware/auth.js';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email y password requeridos' });
  const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } });
  if (!user || !(await bcrypt.compare(String(password), user.passwordHash))) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    companyId: user.companyId,
    name: user.name,
  };
  res.json({ token: signToken(payload), user: payload });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const company = await prisma.company.findUnique({ where: { id: req.user!.companyId } });
  res.json({ user: req.user, company });
});
