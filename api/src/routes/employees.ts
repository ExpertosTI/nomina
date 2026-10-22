import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

export const employeesRouter = Router();
employeesRouter.use(requireAuth);

employeesRouter.get('/', async (req, res) => {
  const rows = await prisma.employee.findMany({
    where: { companyId: req.user!.companyId },
    orderBy: { name: 'asc' },
    include: { contracts: { where: { state: 'open' }, take: 1 } },
  });
  res.json(rows);
});

employeesRouter.post('/', async (req, res) => {
  const { code, name, email, phone, department, jobTitle, biometricPin, wage } = req.body || {};
  if (!code || !name) return res.status(400).json({ error: 'code y name requeridos' });
  const row = await prisma.employee.create({
    data: {
      companyId: req.user!.companyId,
      code: String(code),
      name: String(name),
      email,
      phone,
      department,
      jobTitle,
      biometricPin: biometricPin ? String(biometricPin) : String(code),
    },
  });
  if (wage != null && Number(wage) > 0) {
    const structure = await prisma.salaryStructure.findFirst({
      where: { companyId: req.user!.companyId, code: 'STD' },
    });
    await prisma.contract.create({
      data: {
        companyId: req.user!.companyId,
        employeeId: row.id,
        name: `Contrato ${row.name}`,
        wage: Number(wage),
        structureId: structure?.id,
        dateStart: new Date(),
        state: 'open',
      },
    });
  }
  res.status(201).json(row);
});

employeesRouter.patch('/:id', async (req, res) => {
  const row = await prisma.employee.updateMany({
    where: { id: req.params.id, companyId: req.user!.companyId },
    data: req.body || {},
  });
  if (!row.count) return res.status(404).json({ error: 'No encontrado' });
  res.json(await prisma.employee.findUnique({ where: { id: req.params.id } }));
});
