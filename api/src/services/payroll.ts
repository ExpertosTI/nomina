import { prisma } from '../lib/prisma.js';
import { Decimal } from '@prisma/client/runtime/library';

function n(v: Decimal | number | string) {
  return Number(v);
}

/** Cuenta días con marcaje válido y estima OT (>8h/día) en el rango. */
export async function attendanceStats(
  companyId: string,
  employeeId: string,
  dateFrom: Date,
  dateTo: Date,
) {
  const events = await prisma.attendanceEvent.findMany({
    where: {
      companyId,
      employeeId,
      isValidAttendance: true,
      eventAt: { gte: dateFrom, lte: dateTo },
    },
    orderBy: { eventAt: 'asc' },
  });

  const byDay = new Map<string, Date[]>();
  for (const e of events) {
    const key = e.eventAt.toISOString().slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(e.eventAt);
  }

  let overtimeHours = 0;
  for (const stamps of byDay.values()) {
    if (stamps.length < 2) continue;
    const first = stamps[0].getTime();
    const last = stamps[stamps.length - 1].getTime();
    const hours = (last - first) / 3_600_000;
    if (hours > 8) overtimeHours += hours - 8;
  }

  return {
    workedDays: byDay.size,
    overtimeHours: Math.round(overtimeHours * 100) / 100,
    eventsCount: events.length,
  };
}

export async function computePayslip(opts: {
  companyId: string;
  employeeId: string;
  contractId: string;
  runId?: string;
  dateFrom: Date;
  dateTo: Date;
  name?: string;
}) {
  const contract = await prisma.contract.findUniqueOrThrow({
    where: { id: opts.contractId },
    include: {
      structure: { include: { rules: { where: { active: true }, orderBy: { sequence: 'asc' } } } },
      employee: true,
    },
  });

  const stats = await attendanceStats(
    opts.companyId,
    opts.employeeId,
    opts.dateFrom,
    opts.dateTo,
  );

  const basic = n(contract.wage);
  const lines: Array<{
    code: string;
    name: string;
    category: string;
    amount: number;
  }> = [];

  lines.push({
    code: 'BASIC',
    name: 'Salario base',
    category: 'basic',
    amount: basic,
  });

  const otRate = basic / 30 / 8;
  const otAmount = Math.round(stats.overtimeHours * otRate * 1.5 * 100) / 100;
  if (otAmount > 0) {
    lines.push({
      code: 'OT',
      name: 'Horas extras (desde Hikvision)',
      category: 'allowance',
      amount: otAmount,
    });
  }

  for (const rule of contract.structure?.rules || []) {
    const amount =
      rule.amountType === 'percent'
        ? Math.round(basic * (n(rule.amount) / 100) * 100) / 100
        : n(rule.amount);
    lines.push({
      code: rule.code,
      name: rule.name,
      category: rule.category,
      amount,
    });
  }

  const novelties = await prisma.novelty.findMany({
    where: {
      companyId: opts.companyId,
      employeeId: opts.employeeId,
      status: 'approved',
      affectsPayroll: true,
      dateFrom: { lte: opts.dateTo },
      OR: [{ dateTo: null }, { dateTo: { gte: opts.dateFrom } }],
    },
  });

  const daily = basic / 30;
  let unpaidDays = 0;
  for (const nov of novelties) {
    if (nov.paid) continue;
    const days = n(nov.days);
    unpaidDays += days;
    const amount = Math.round(days * daily * 100) / 100;
    if (amount <= 0) continue;
    lines.push({
      code: `NOV_${nov.type.toUpperCase()}_${nov.id.slice(-4)}`,
      name: `${nov.type}: ${nov.reason || `${days} día(s)`}`,
      category: 'deduction',
      amount,
    });
  }

  const debts = await prisma.employeeDebt.findMany({
    where: { employeeId: opts.employeeId, active: true, remaining: { gt: 0 } },
  });
  for (const d of debts) {
    const take = Math.min(n(d.remaining), basic * 0.3);
    if (take <= 0) continue;
    lines.push({
      code: `DEBT_${d.id.slice(-4)}`,
      name: `Deuda: ${d.name}`,
      category: 'deduction',
      amount: take,
    });
  }

  const gross = lines
    .filter((l) => ['basic', 'allowance'].includes(l.category))
    .reduce((s, l) => s + l.amount, 0);
  const deductions = lines
    .filter((l) => l.category === 'deduction')
    .reduce((s, l) => s + l.amount, 0);
  const net = Math.round((gross - deductions) * 100) / 100;

  return prisma.payslip.create({
    data: {
      runId: opts.runId,
      employeeId: opts.employeeId,
      contractId: contract.id,
      structureId: contract.structureId || undefined,
      name: opts.name || `Nómina ${contract.employee.name}`,
      dateFrom: opts.dateFrom,
      dateTo: opts.dateTo,
      state: 'draft',
      workedDays: Math.max(0, stats.workedDays - Math.round(unpaidDays)),
      overtimeHours: stats.overtimeHours,
      basicWage: basic,
      gross,
      deductions,
      net,
      lines,
    },
  });
}
