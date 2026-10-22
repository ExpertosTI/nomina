import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { computePayslip } from '../services/payroll.js';

export const payrollRouter = Router();
payrollRouter.use(requireAuth);

payrollRouter.get('/structures', async (req, res) => {
  res.json(
    await prisma.salaryStructure.findMany({
      where: { companyId: req.user!.companyId },
      include: { rules: { orderBy: { sequence: 'asc' } } },
    }),
  );
});

payrollRouter.post('/structures', async (req, res) => {
  const { name, code, rules } = req.body || {};
  if (!name || !code) return res.status(400).json({ error: 'name y code requeridos' });
  const row = await prisma.salaryStructure.create({
    data: {
      companyId: req.user!.companyId,
      name,
      code,
      rules: {
        create: (rules || []).map((r: Record<string, unknown>, i: number) => ({
          name: String(r.name || `Regla ${i + 1}`),
          code: String(r.code || `R${i + 1}`),
          sequence: Number(r.sequence || (i + 1) * 10),
          category: String(r.category || 'allowance'),
          amountType: String(r.amountType || 'fixed'),
          amount: Number(r.amount || 0),
        })),
      },
    },
    include: { rules: true },
  });
  res.status(201).json(row);
});

payrollRouter.get('/contracts', async (req, res) => {
  res.json(
    await prisma.contract.findMany({
      where: { companyId: req.user!.companyId },
      include: { employee: true, structure: true },
      orderBy: { createdAt: 'desc' },
    }),
  );
});

payrollRouter.post('/contracts', async (req, res) => {
  const b = req.body || {};
  if (!b.employeeId || b.wage == null) {
    return res.status(400).json({ error: 'employeeId y wage requeridos' });
  }
  const row = await prisma.contract.create({
    data: {
      companyId: req.user!.companyId,
      employeeId: b.employeeId,
      name: b.name || 'Contrato',
      wage: Number(b.wage),
      structureId: b.structureId || null,
      dateStart: new Date(b.dateStart || Date.now()),
      dateEnd: b.dateEnd ? new Date(b.dateEnd) : null,
      state: 'open',
    },
  });
  res.status(201).json(row);
});

payrollRouter.get('/runs', async (req, res) => {
  res.json(
    await prisma.payslipRun.findMany({
      where: { companyId: req.user!.companyId },
      include: { _count: { select: { payslips: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  );
});

payrollRouter.post('/runs', async (req, res) => {
  const { name, dateStart, dateEnd, employeeIds } = req.body || {};
  if (!dateStart || !dateEnd) return res.status(400).json({ error: 'dateStart y dateEnd requeridos' });
  const from = new Date(dateStart);
  const to = new Date(dateEnd);

  const run = await prisma.payslipRun.create({
    data: {
      companyId: req.user!.companyId,
      name: name || `Nómina ${from.toISOString().slice(0, 10)}`,
      dateStart: from,
      dateEnd: to,
      state: 'draft',
    },
  });

  const contracts = await prisma.contract.findMany({
    where: {
      companyId: req.user!.companyId,
      state: 'open',
      ...(employeeIds?.length ? { employeeId: { in: employeeIds } } : {}),
    },
  });

  const payslips = [];
  for (const c of contracts) {
    payslips.push(
      await computePayslip({
        companyId: req.user!.companyId,
        employeeId: c.employeeId,
        contractId: c.id,
        runId: run.id,
        dateFrom: from,
        dateTo: to,
      }),
    );
  }

  res.status(201).json({ run, payslips });
});

payrollRouter.get('/payslips', async (req, res) => {
  const runId = req.query.runId ? String(req.query.runId) : undefined;
  res.json(
    await prisma.payslip.findMany({
      where: {
        employee: { companyId: req.user!.companyId },
        ...(runId ? { runId } : {}),
      },
      include: { employee: true, run: true, contract: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
  );
});

payrollRouter.get('/payslips/:id', async (req, res) => {
  const row = await prisma.payslip.findFirst({
    where: { id: req.params.id, employee: { companyId: req.user!.companyId } },
    include: { employee: true, run: true, contract: true, structure: true },
  });
  if (!row) return res.status(404).json({ error: 'No encontrado' });
  res.json(row);
});

payrollRouter.post('/payslips/:id/confirm', async (req, res) => {
  const existing = await prisma.payslip.findFirst({
    where: { id: req.params.id, employee: { companyId: req.user!.companyId } },
  });
  if (!existing) return res.status(404).json({ error: 'No encontrado' });
  if (existing.state !== 'draft') return res.status(400).json({ error: 'Solo borrador se confirma' });
  res.json(await prisma.payslip.update({ where: { id: existing.id }, data: { state: 'done' } }));
});

payrollRouter.post('/payslips/:id/paid', async (req, res) => {
  const existing = await prisma.payslip.findFirst({
    where: { id: req.params.id, employee: { companyId: req.user!.companyId } },
  });
  if (!existing) return res.status(404).json({ error: 'No encontrado' });
  if (existing.state !== 'done') return res.status(400).json({ error: 'Confirma la nómina primero' });
  res.json(await prisma.payslip.update({ where: { id: existing.id }, data: { state: 'paid' } }));
});

payrollRouter.post('/runs/:id/close', async (req, res) => {
  const run = await prisma.payslipRun.findFirst({
    where: { id: req.params.id, companyId: req.user!.companyId },
  });
  if (!run) return res.status(404).json({ error: 'Lote no encontrado' });
  await prisma.payslip.updateMany({
    where: { runId: run.id, state: 'draft' },
    data: { state: 'done' },
  });
  res.json(await prisma.payslipRun.update({ where: { id: run.id }, data: { state: 'close' } }));
});

payrollRouter.post('/runs/:id/draft', async (req, res) => {
  const run = await prisma.payslipRun.findFirst({
    where: { id: req.params.id, companyId: req.user!.companyId },
  });
  if (!run) return res.status(404).json({ error: 'Lote no encontrado' });
  res.json(await prisma.payslipRun.update({ where: { id: run.id }, data: { state: 'draft' } }));
});

payrollRouter.post('/runs/:id/generate', async (req, res) => {
  const run = await prisma.payslipRun.findFirst({
    where: { id: req.params.id, companyId: req.user!.companyId },
  });
  if (!run) return res.status(404).json({ error: 'Lote no encontrado' });
  if (run.state !== 'draft') return res.status(400).json({ error: 'Lote cerrado' });

  const existing = await prisma.payslip.findMany({ where: { runId: run.id }, select: { employeeId: true } });
  const have = new Set(existing.map((p) => p.employeeId));
  const employeeIds = (req.body?.employeeIds as string[] | undefined) || undefined;

  const contracts = await prisma.contract.findMany({
    where: {
      companyId: req.user!.companyId,
      state: 'open',
      ...(employeeIds?.length ? { employeeId: { in: employeeIds } } : {}),
    },
  });

  const payslips = [];
  for (const c of contracts) {
    if (have.has(c.employeeId)) continue;
    payslips.push(
      await computePayslip({
        companyId: req.user!.companyId,
        employeeId: c.employeeId,
        contractId: c.id,
        runId: run.id,
        dateFrom: run.dateStart,
        dateTo: run.dateEnd,
      }),
    );
  }
  res.status(201).json({ run, payslips, created: payslips.length });
});

payrollRouter.get('/dashboard', async (req, res) => {
  const companyId = req.user!.companyId;
  const startOfDay = new Date(new Date().setHours(0, 0, 0, 0));
  const [employees, devices, eventsToday, runs, slips, noveltiesOpen, recentEvents, recentNovelties] =
    await Promise.all([
      prisma.employee.count({ where: { companyId, active: true } }),
      prisma.device.count({ where: { companyId, isActive: true } }),
      prisma.attendanceEvent.count({
        where: { companyId, isValidAttendance: true, eventAt: { gte: startOfDay } },
      }),
      prisma.payslipRun.count({ where: { companyId } }),
      prisma.payslip.count({ where: { employee: { companyId } } }),
      prisma.novelty.count({
        where: { companyId, status: 'approved', dateFrom: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } },
      }),
      prisma.attendanceEvent.findMany({
        where: { companyId },
        orderBy: { eventAt: 'desc' },
        take: 8,
      }),
      prisma.novelty.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { employee: { select: { name: true, code: true } } },
      }),
    ]);
  res.json({
    employees,
    devices,
    eventsToday,
    runs,
    slips,
    noveltiesOpen,
    recentEvents,
    recentNovelties,
  });
});
