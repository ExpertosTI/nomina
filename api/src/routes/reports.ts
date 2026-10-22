import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { sendMail } from '../services/mail.js';
import { sendText } from '../services/evolution.js';

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

reportsRouter.get('/attendance', async (req, res) => {
  const from = new Date(String(req.query.from || new Date(new Date().setDate(1)).toISOString()));
  const to = new Date(String(req.query.to || new Date().toISOString()));
  const events = await prisma.attendanceEvent.findMany({
    where: {
      companyId: req.user!.companyId,
      eventAt: { gte: from, lte: to },
    },
    orderBy: { eventAt: 'asc' },
    include: { device: { select: { name: true } }, employee: { select: { code: true, name: true } } },
  });

  const byEmployee = new Map<string, { name: string; code: string; days: Set<string>; events: number; valid: number }>();
  for (const e of events) {
    const key = e.employeeId || e.employeeNo;
    if (!byEmployee.has(key)) {
      byEmployee.set(key, {
        name: e.employee?.name || e.employeeName,
        code: e.employee?.code || e.employeeNo,
        days: new Set(),
        events: 0,
        valid: 0,
      });
    }
    const row = byEmployee.get(key)!;
    row.events += 1;
    if (e.isValidAttendance) {
      row.valid += 1;
      row.days.add(e.eventAt.toISOString().slice(0, 10));
    }
  }

  res.json({
    from,
    to,
    totals: {
      events: events.length,
      valid: events.filter((e) => e.isValidAttendance).length,
      employees: byEmployee.size,
    },
    employees: [...byEmployee.values()].map((r) => ({
      name: r.name,
      code: r.code,
      workedDays: r.days.size,
      events: r.events,
      valid: r.valid,
    })),
    events: events.slice(-200).map((e) => ({
      id: e.id,
      eventAt: e.eventAt,
      employeeName: e.employee?.name || e.employeeName,
      employeeNo: e.employeeNo,
      device: e.device?.name,
      verifyMode: e.verifyMode,
      isValidAttendance: e.isValidAttendance,
    })),
  });
});

reportsRouter.get('/payroll/:runId', async (req, res) => {
  const run = await prisma.payslipRun.findFirst({
    where: { id: req.params.runId, companyId: req.user!.companyId },
    include: {
      payslips: {
        include: { employee: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!run) return res.status(404).json({ error: 'Lote no encontrado' });
  const totalNet = run.payslips.reduce((s, p) => s + Number(p.net), 0);
  const totalGross = run.payslips.reduce((s, p) => s + Number(p.gross), 0);
  const totalDed = run.payslips.reduce((s, p) => s + Number(p.deductions), 0);
  res.json({
    run: {
      id: run.id,
      name: run.name,
      dateStart: run.dateStart,
      dateEnd: run.dateEnd,
      state: run.state,
    },
    totals: { net: totalNet, gross: totalGross, deductions: totalDed, count: run.payslips.length },
    payslips: run.payslips.map((p) => ({
      id: p.id,
      employee: p.employee.name,
      code: p.employee.code,
      workedDays: p.workedDays,
      overtimeHours: p.overtimeHours,
      basicWage: p.basicWage,
      gross: p.gross,
      deductions: p.deductions,
      net: p.net,
      state: p.state,
      lines: p.lines,
    })),
  });
});

reportsRouter.post('/payroll/:runId/email', async (req, res) => {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: req.user!.companyId } });
  const run = await prisma.payslipRun.findFirst({
    where: { id: req.params.runId, companyId: company.id },
    include: { payslips: { include: { employee: true } } },
  });
  if (!run) return res.status(404).json({ error: 'Lote no encontrado' });
  const to = String(req.body?.to || req.user!.email);
  const rows = run.payslips
    .map(
      (p) =>
        `<tr><td>${p.employee.name}</td><td>${Number(p.gross).toFixed(2)}</td><td>${Number(p.deductions).toFixed(2)}</td><td><b>${Number(p.net).toFixed(2)}</b></td></tr>`,
    )
    .join('');
  try {
    await sendMail(
      {
        host: company.smtpHost,
        port: company.smtpPort,
        user: company.smtpUser,
        pass: company.smtpPass,
        fromName: company.smtpFromName,
      },
      {
        to,
        subject: `Reporte nómina · ${run.name}`,
        html: `<h2>${run.name}</h2><p>${String(run.dateStart).slice(0, 10)} → ${String(run.dateEnd).slice(0, 10)}</p>
        <table border="1" cellpadding="6" cellspacing="0"><tr><th>Empleado</th><th>Bruto</th><th>Deducciones</th><th>Neto</th></tr>${rows}</table>`,
      },
    );
    res.json({ ok: true, to });
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : 'Fallo correo' });
  }
});

reportsRouter.post('/payroll/:runId/whatsapp', async (req, res) => {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: req.user!.companyId } });
  if (!company.evolutionInstance || company.whatsappStatus !== 'connected') {
    return res.status(400).json({ error: 'WhatsApp no conectado. Ve a Ajustes.' });
  }
  const run = await prisma.payslipRun.findFirst({
    where: { id: req.params.runId, companyId: company.id },
    include: { payslips: true },
  });
  if (!run) return res.status(404).json({ error: 'Lote no encontrado' });
  const phone = String(req.body?.phone || '');
  if (!phone) return res.status(400).json({ error: 'phone requerido' });
  const total = run.payslips.reduce((s, p) => s + Number(p.net), 0);
  try {
    await sendText(
      company.evolutionInstance,
      phone,
      `*${company.name}*\nLote: ${run.name}\nPayslips: ${run.payslips.length}\nNeto total: RD$ ${total.toFixed(2)}`,
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : 'Fallo WhatsApp' });
  }
});
