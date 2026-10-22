import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { probeDevice } from '../services/hikvision.js';

export const devicesRouter = Router();
devicesRouter.use(requireAuth);

devicesRouter.get('/', async (req, res) => {
  const rows = await prisma.device.findMany({
    where: { companyId: req.user!.companyId },
    orderBy: { name: 'asc' },
  });
  const base = process.env.PUBLIC_SITE_URL || '';
  res.json(
    rows.map((d) => ({
      ...d,
      password: d.password ? '••••••' : '',
      pushUrl: `${base}/hikvision/event?device_id=${d.id}&company_id=${d.companyId}`,
    })),
  );
});

devicesRouter.post('/', async (req, res) => {
  const b = req.body || {};
  const row = await prisma.device.create({
    data: {
      companyId: req.user!.companyId,
      name: b.name || 'Hikvision DS-K1T321EFWX',
      model: b.model || 'DS-K1T321EFWX',
      ipAddress: b.ipAddress,
      port: Number(b.port || 80),
      useHttps: Boolean(b.useHttps),
      username: b.username || 'admin',
      password: b.password || '',
      connectionType: b.connectionType || 'push',
      timezone: b.timezone || 'America/Santo_Domingo',
    },
  });
  res.status(201).json(row);
});

devicesRouter.post('/:id/probe', async (req, res) => {
  const device = await prisma.device.findFirst({
    where: { id: req.params.id, companyId: req.user!.companyId },
  });
  if (!device || !device.ipAddress) return res.status(404).json({ error: 'Dispositivo sin IP' });
  try {
    const info = await probeDevice({
      ipAddress: device.ipAddress,
      port: device.port,
      useHttps: device.useHttps,
      username: device.username,
      password: device.password,
    });
    const updated = await prisma.device.update({
      where: { id: device.id },
      data: {
        lastStatus: 'online',
        lastSync: new Date(),
        serialNumber: info.serialNumber || device.serialNumber,
        firmware: info.firmware || device.firmware,
        macAddress: info.macAddress || device.macAddress,
        model: info.model || device.model,
      },
    });
    res.json({ ok: true, device: updated, info });
  } catch (e) {
    await prisma.device.update({
      where: { id: device.id },
      data: { lastStatus: 'offline' },
    });
    res.status(502).json({ error: e instanceof Error ? e.message : 'Fallo ISAPI' });
  }
});
