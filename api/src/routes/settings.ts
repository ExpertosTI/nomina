import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { sendMail } from '../services/mail.js';
import {
  connectInstance,
  createInstance,
  evoConfigured,
  extractQr,
  instanceStatus,
  nominaInstanceName,
  sendText,
} from '../services/evolution.js';

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

settingsRouter.get('/', async (req, res) => {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: req.user!.companyId } });
  res.json({
    id: company.id,
    name: company.name,
    slug: company.slug,
    rnc: company.rnc,
    smtpHost: company.smtpHost || process.env.SMTP_HOST || 'smtp.hostinger.com',
    smtpPort: company.smtpPort || Number(process.env.SMTP_PORT || 465),
    smtpUser: company.smtpUser || process.env.SMTP_USER || 'info@renace.tech',
    smtpFromName: company.smtpFromName || `Nomina · ${company.name}`,
    hasSmtpPass: Boolean(company.smtpPass || process.env.SMTP_PASS),
    evolutionInstance: company.evolutionInstance,
    whatsappStatus: company.whatsappStatus,
    evolutionReady: evoConfigured(),
    googleReady: Boolean(process.env.GOOGLE_CLIENT_ID),
  });
});

settingsRouter.patch('/', async (req, res) => {
  const b = req.body || {};
  const data: Record<string, unknown> = {};
  if (b.name != null) data.name = String(b.name);
  if (b.rnc != null) data.rnc = String(b.rnc);
  if (b.smtpHost != null) data.smtpHost = String(b.smtpHost);
  if (b.smtpPort != null) data.smtpPort = Number(b.smtpPort);
  if (b.smtpUser != null) data.smtpUser = String(b.smtpUser);
  if (b.smtpFromName != null) data.smtpFromName = String(b.smtpFromName);
  if (b.smtpPass != null && String(b.smtpPass).length > 0) data.smtpPass = String(b.smtpPass);

  const company = await prisma.company.update({
    where: { id: req.user!.companyId },
    data,
  });
  res.json({ ok: true, name: company.name, slug: company.slug });
});

settingsRouter.post('/mail/test', async (req, res) => {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: req.user!.companyId } });
  const to = String(req.body?.to || req.user!.email);
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
        subject: `Prueba SMTP · ${company.name}`,
        html: `<p>Correo de prueba desde <strong>Nomina RENACE</strong> (${company.slug}).</p>`,
        text: `Prueba SMTP Nomina RENACE (${company.slug})`,
      },
    );
    res.json({ ok: true, to });
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : 'Fallo SMTP' });
  }
});

settingsRouter.post('/whatsapp/connect', async (req, res) => {
  if (!evoConfigured()) return res.status(503).json({ error: 'Evolution API no configurada en el servidor' });
  const company = await prisma.company.findUniqueOrThrow({ where: { id: req.user!.companyId } });
  let instance = company.evolutionInstance?.trim() || '';
  if (!instance) {
    instance = nominaInstanceName(company.slug, company.id);
    await prisma.company.update({
      where: { id: company.id },
      data: { evolutionInstance: instance, whatsappStatus: 'connecting' },
    });
    try {
      await createInstance(instance);
    } catch (e) {
      // may already exist
      console.warn('createInstance', e);
    }
  }

  const connected = await connectInstance(instance);
  const qr = extractQr(connected.data);
  const status = await instanceStatus(instance);
  await prisma.company.update({
    where: { id: company.id },
    data: {
      whatsappStatus: status.state === 'open' ? 'connected' : 'connecting',
    },
  });

  res.json({
    instance,
    state: status.state,
    qrBase64: qr.base64,
    qrCode: qr.code,
  });
});

settingsRouter.get('/whatsapp/status', async (req, res) => {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: req.user!.companyId } });
  if (!company.evolutionInstance) {
    return res.json({ instance: null, state: 'disconnected', evolutionReady: evoConfigured() });
  }
  if (!evoConfigured()) {
    return res.json({ instance: company.evolutionInstance, state: company.whatsappStatus, evolutionReady: false });
  }
  const status = await instanceStatus(company.evolutionInstance);
  const next = status.state === 'open' ? 'connected' : status.state === 'close' ? 'disconnected' : 'connecting';
  if (next !== company.whatsappStatus) {
    await prisma.company.update({ where: { id: company.id }, data: { whatsappStatus: next } });
  }
  res.json({ instance: company.evolutionInstance, state: status.state, evolutionReady: true });
});

settingsRouter.post('/whatsapp/test', async (req, res) => {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: req.user!.companyId } });
  if (!company.evolutionInstance) return res.status(400).json({ error: 'WhatsApp no vinculado' });
  const phone = String(req.body?.phone || '');
  if (!phone) return res.status(400).json({ error: 'phone requerido' });
  try {
    await sendText(
      company.evolutionInstance,
      phone,
      `Nomina RENACE (${company.name}): WhatsApp conectado ✔`,
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : 'Fallo envío' });
  }
});
