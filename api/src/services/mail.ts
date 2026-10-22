import nodemailer from 'nodemailer';

export type SmtpConfig = {
  host?: string | null;
  port?: number | null;
  user?: string | null;
  pass?: string | null;
  fromName?: string | null;
};

export function resolveSmtp(company: SmtpConfig) {
  return {
    host: company.host || process.env.SMTP_HOST || 'smtp.hostinger.com',
    port: Number(company.port || process.env.SMTP_PORT || 465),
    user: company.user || process.env.SMTP_USER || 'info@renace.tech',
    pass: company.pass || process.env.SMTP_PASS || '',
    fromName: company.fromName || process.env.SMTP_FROM_NAME || 'Nomina RENACE',
  };
}

export async function sendMail(
  company: SmtpConfig,
  opts: { to: string; subject: string; html: string; text?: string },
) {
  const smtp = resolveSmtp(company);
  if (!smtp.pass) throw new Error('SMTP sin contraseña configurada');
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.pass },
  });
  await transporter.sendMail({
    from: `"${smtp.fromName}" <${smtp.user}>`,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });
  return { ok: true, from: smtp.user };
}
