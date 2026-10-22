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
  res.json(
    await prisma.payslip.findMany({
      where: { employee: { companyId: req.user!.companyId } },
      include: { employee: true, run: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  );
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
