import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { requireAuth, signToken } from '../middleware/auth.js';

export const authRouter = Router();

function slugify(input: string) {
  return (
    input
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'empresa'
  );
}

async function uniqueSlug(base: string) {
  let slug = slugify(base);
  let i = 0;
  while (await prisma.company.findUnique({ where: { slug } })) {
    i += 1;
    slug = `${slugify(base).slice(0, 32)}-${i}`;
  }
  return slug;
}

async function ensureStructure(companyId: string) {
  const existing = await prisma.salaryStructure.findFirst({ where: { companyId, code: 'STD' } });
  if (existing) return existing;
  return prisma.salaryStructure.create({
    data: {
      companyId,
      name: 'Estructura estándar RD',
      code: 'STD',
      rules: {
        create: [
          { name: 'AFP (empleado)', code: 'AFP', sequence: 20, category: 'deduction', amountType: 'percent', amount: 2.87 },
          { name: 'SFS (empleado)', code: 'SFS', sequence: 30, category: 'deduction', amountType: 'percent', amount: 3.04 },
        ],
      },
    },
  });
}

function tokenFor(user: { id: string; email: string; role: string; companyId: string; name: string }) {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    companyId: user.companyId,
    name: user.name,
  };
  return { token: signToken(payload), user: payload };
}

authRouter.get('/providers', (_req, res) => {
  res.json({
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  });
});

authRouter.post('/register', async (req, res) => {
  const { companyName, rnc, name, email, password } = req.body || {};
  if (!companyName || !email || !password || !name) {
    return res.status(400).json({ error: 'Empresa, nombre, email y password requeridos' });
  }
  const mail = String(email).toLowerCase();
  if (await prisma.user.findUnique({ where: { email: mail } })) {
    return res.status(409).json({ error: 'Email ya registrado' });
  }
  const slug = await uniqueSlug(String(companyName));
  const company = await prisma.company.create({
    data: {
      name: String(companyName),
      slug,
      rnc: rnc ? String(rnc) : null,
      smtpFromName: `Nomina · ${companyName}`,
    },
  });
  await ensureStructure(company.id);
  const hash = await bcrypt.hash(String(password), 10);
  const user = await prisma.user.create({
    data: {
      email: mail,
      name: String(name),
      passwordHash: hash,
      role: 'admin',
      companyId: company.id,
    },
  });
  res.status(201).json({ ...tokenFor(user), company: { id: company.id, name: company.name, slug: company.slug } });
});

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email y password requeridos' });
  const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } });
  if (!user?.passwordHash || !(await bcrypt.compare(String(password), user.passwordHash))) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }
  res.json(tokenFor(user));
});

authRouter.post('/google', async (req, res) => {
  const { idToken, companyName } = req.body || {};
  if (!idToken) return res.status(400).json({ error: 'idToken requerido' });
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(503).json({ error: 'Google OAuth no configurado' });

  const gRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(String(idToken))}`);
  if (!gRes.ok) return res.status(401).json({ error: 'Token Google inválido' });
  const g = (await gRes.json()) as { aud?: string; email?: string; name?: string; sub?: string; email_verified?: string };
  if (g.aud !== clientId) return res.status(401).json({ error: 'Audience Google inválida' });
  if (!g.email || g.email_verified === 'false') return res.status(401).json({ error: 'Email Google no verificado' });

  const mail = g.email.toLowerCase();
  let user = await prisma.user.findFirst({
    where: { OR: [{ email: mail }, { googleId: g.sub || undefined }] },
  });

  if (!user) {
    const slug = await uniqueSlug(String(companyName || g.name || mail.split('@')[0]));
    const company = await prisma.company.create({
      data: {
        name: String(companyName || `${g.name || 'Empresa'} Nomina`),
        slug,
        smtpFromName: `Nomina · ${companyName || g.name || 'Empresa'}`,
      },
    });
    await ensureStructure(company.id);
    user = await prisma.user.create({
      data: {
        email: mail,
        name: g.name || mail,
        googleId: g.sub || null,
        role: 'admin',
        companyId: company.id,
      },
    });
  } else if (g.sub && !user.googleId) {
    user = await prisma.user.update({ where: { id: user.id }, data: { googleId: g.sub } });
  }

  res.json(tokenFor(user));
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const company = await prisma.company.findUnique({ where: { id: req.user!.companyId } });
  if (!company) return res.status(404).json({ error: 'Compañía no encontrada' });
  const { smtpPass, evolutionToken, ...safe } = company;
  res.json({
    user: req.user,
    company: {
      ...safe,
      smtpConfigured: Boolean(smtpPass || process.env.SMTP_PASS),
      whatsappConfigured: Boolean(process.env.EVOLUTION_API_KEY),
      hasSmtpPass: Boolean(smtpPass),
    },
  });
});
