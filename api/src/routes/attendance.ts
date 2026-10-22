import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireListenerSecret } from '../middleware/auth.js';
import { parseHikvisionPush } from '../services/hikvision.js';

export const attendanceRouter = Router();

async function ingestEvent(opts: {
  companyId: string;
  deviceId?: string;
  body: unknown;
  contentType?: string;
}) {
  const parsed = parseHikvisionPush(opts.body, opts.contentType);
  let employee = await prisma.employee.findFirst({
    where: {
      companyId: opts.companyId,
      OR: [
        { biometricPin: parsed.employeeNo },
        { code: parsed.employeeNo },
      ],
    },
  });

  if (opts.deviceId) {
    await prisma.device.updateMany({
      where: { id: opts.deviceId },
      data: { lastSync: new Date(), lastStatus: 'online' },
    });
  }

  return prisma.attendanceEvent.create({
    data: {
      companyId: opts.companyId,
      deviceId: opts.deviceId,
      employeeId: employee?.id,
      employeeNo: parsed.employeeNo,
      employeeName: employee?.name || parsed.employeeName,
      eventAt: Number.isNaN(parsed.eventAt.getTime()) ? new Date() : parsed.eventAt,
      major: parsed.major,
      minor: parsed.minor,
      verifyMode: parsed.verifyMode,
      isValidAttendance: parsed.isValidAttendance,
      raw: parsed.raw as object,
    },
  });
}

/** Público vía Traefik /hikvision → listener → API, o directo */
attendanceRouter.post('/hikvision/event', requireListenerSecret, async (req, res) => {
  const deviceId = String(req.query.device_id || req.body?.device_id || '');
  let companyId = String(req.query.company_id || req.body?.company_id || '');

  if (deviceId) {
    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) return res.status(404).json({ statusCode: 0, statusString: 'device not found' });
    companyId = device.companyId;
  }
  if (!companyId) {
    const first = await prisma.company.findFirst();
    companyId = first?.id || '';
  }
  if (!companyId) return res.status(400).json({ statusCode: 0, statusString: 'no company' });

  const event = await ingestEvent({
    companyId,
    deviceId: deviceId || undefined,
    body: req.body,
    contentType: req.headers['content-type'] || '',
  });

  res.json({
    statusCode: 1,
    statusString: 'OK',
    subStatusCode: 'ok',
    eventId: event.id,
  });
});

attendanceRouter.get('/events', requireAuth, async (req, res) => {
  const take = Math.min(Number(req.query.limit || 50), 200);
  const rows = await prisma.attendanceEvent.findMany({
    where: { companyId: req.user!.companyId },
    orderBy: { eventAt: 'desc' },
    take,
    include: { device: { select: { id: true, name: true } } },
  });
  res.json(rows);
});

attendanceRouter.get('/live', requireAuth, async (req, res) => {
  const since = new Date(Date.now() - 24 * 3600_000);
  const rows = await prisma.attendanceEvent.findMany({
    where: { companyId: req.user!.companyId, eventAt: { gte: since } },
    orderBy: { eventAt: 'desc' },
    take: 100,
  });
  const devices = await prisma.device.findMany({
    where: { companyId: req.user!.companyId },
    select: { id: true, name: true, lastStatus: true, lastSync: true },
  });
  res.json({
    events: rows,
    devices,
    todayValid: rows.filter((e) => e.isValidAttendance).length,
  });
});
