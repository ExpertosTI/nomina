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

devicesRouter.delete('/:id', async (req, res) => {
  const device = await prisma.device.findFirst({
    where: { id: req.params.id, companyId: req.user!.companyId },
  });
  if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });
  await prisma.device.delete({ where: { id: device.id } });
  res.json({ ok: true, message: 'Dispositivo eliminado' });
});

devicesRouter.post('/:id/probe', async (req, res) => {
  const device = await prisma.device.findFirst({
    where: { id: req.params.id, companyId: req.user!.companyId },
  });
  if (!device || !device.ipAddress) return res.status(404).json({ error: 'Dispositivo sin IP' });

  // Si el dispositivo está en red LAN privada (10.x, 192.168.x, 172.16-31.x)
  // la conexión directa ISAPI desde la nube no es alcanzable sin VPN.
  const isPrivateIp = /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(device.ipAddress);

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
    // Si es IP privada y el terminal ya estaba online por HTTP Push, conservamos su estado
    if (isPrivateIp && device.lastStatus === 'online') {
      return res.json({
        ok: true,
        device,
        info: {
          note: 'Terminal en línea vía HTTP Push. La IP privada no permite sondeo directo ISAPI desde la nube, pero los eventos están activos.',
        },
      });
    }

    if (!isPrivateIp) {
      await prisma.device.update({
        where: { id: device.id },
        data: { lastStatus: 'offline' },
      });
    }
    res.status(isPrivateIp ? 200 : 502).json({
      ok: device.lastStatus === 'online',
      error: isPrivateIp
        ? 'IP privada LAN (10.x / 192.168.x): El terminal opera mediante Push hacia la nube. Realiza una marcación en el equipo para refrescar el estado.'
        : e instanceof Error ? e.message : 'Fallo ISAPI',
    });
  }
});
