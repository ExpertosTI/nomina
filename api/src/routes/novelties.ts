import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

export const noveltiesRouter = Router();
noveltiesRouter.use(requireAuth);

const TYPES = new Set(['falta', 'licencia', 'permiso', 'nota']);

noveltiesRouter.get('/', async (req, res) => {
  const take = Math.min(Number(req.query.limit || 100), 300);
  const type = req.query.type ? String(req.query.type) : undefined;
  const rows = await prisma.novelty.findMany({
    where: {
      companyId: req.user!.companyId,
      ...(type ? { type } : {}),
    },
    orderBy: [{ dateFrom: 'desc' }, { createdAt: 'desc' }],
    take,
    include: { employee: { select: { id: true, name: true, code: true } } },
  });
  res.json(rows);
});

noveltiesRouter.post('/', async (req, res) => {
  const b = req.body || {};
  if (!b.employeeId || !b.type || !b.dateFrom) {
    return res.status(400).json({ error: 'employeeId, type y dateFrom requeridos' });
  }
  if (!TYPES.has(String(b.type))) {
    return res.status(400).json({ error: 'type inválido' });
  }
  const emp = await prisma.employee.findFirst({
    where: { id: b.employeeId, companyId: req.user!.companyId },
  });
  if (!emp) return res.status(404).json({ error: 'Empleado no encontrado' });

  const dateFrom = new Date(b.dateFrom);
  const dateTo = b.dateTo ? new Date(b.dateTo) : dateFrom;
  let days = Number(b.days);
  if (!days || days <= 0) {
    days = Math.max(1, Math.round((dateTo.getTime() - dateFrom.getTime()) / 86_400_000) + 1);
  }

  const paid = b.paid != null ? Boolean(b.paid) : b.type === 'licencia' || b.type === 'permiso';
  const affectsPayroll =
    b.affectsPayroll != null ? Boolean(b.affectsPayroll) : b.type === 'falta' || !paid;

  const row = await prisma.novelty.create({
    data: {
      companyId: req.user!.companyId,
      employeeId: emp.id,
      type: String(b.type),
      dateFrom,
      dateTo,
      days,
      reason: b.reason ? String(b.reason) : null,
      status: String(b.status || 'approved'),
      affectsPayroll,
      paid,
    },
    include: { employee: { select: { id: true, name: true, code: true } } },
  });
  res.status(201).json(row);
});

noveltiesRouter.patch('/:id', async (req, res) => {
  const existing = await prisma.novelty.findFirst({
    where: { id: req.params.id, companyId: req.user!.companyId },
  });
  if (!existing) return res.status(404).json({ error: 'No encontrado' });
  const b = req.body || {};
  const row = await prisma.novelty.update({
    where: { id: existing.id },
    data: {
      ...(b.type && TYPES.has(b.type) ? { type: b.type } : {}),
      ...(b.dateFrom ? { dateFrom: new Date(b.dateFrom) } : {}),
      ...(b.dateTo !== undefined ? { dateTo: b.dateTo ? new Date(b.dateTo) : null } : {}),
      ...(b.days != null ? { days: Number(b.days) } : {}),
      ...(b.reason !== undefined ? { reason: b.reason } : {}),
      ...(b.status ? { status: String(b.status) } : {}),
      ...(b.affectsPayroll != null ? { affectsPayroll: Boolean(b.affectsPayroll) } : {}),
      ...(b.paid != null ? { paid: Boolean(b.paid) } : {}),
    },
    include: { employee: { select: { id: true, name: true, code: true } } },
  });
  res.json(row);
});

noveltiesRouter.delete('/:id', async (req, res) => {
  const existing = await prisma.novelty.findFirst({
    where: { id: req.params.id, companyId: req.user!.companyId },
  });
  if (!existing) return res.status(404).json({ error: 'No encontrado' });
  await prisma.novelty.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});
