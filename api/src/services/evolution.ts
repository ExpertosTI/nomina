const DEFAULT_URL = 'https://evoapi.renace.tech';

function env(name: string, fallback = '') {
  return String(process.env[name] ?? fallback).trim().replace(/^["']|["']$/g, '');
}

export function evoConfigured() {
  const key = env('EVOLUTION_API_KEY');
  return Boolean(key && key.length >= 20);
}

export function evoBase() {
  return env('EVOLUTION_API_URL', DEFAULT_URL).replace(/\/$/, '');
}

export function evoKey() {
  return env('EVOLUTION_API_KEY');
}

function headers() {
  return { apikey: evoKey(), 'Content-Type': 'application/json' };
}

export function nominaInstanceName(slug: string, companyId: string) {
  const clean = slug.replace(/[^a-z0-9-]/gi, '').slice(0, 18) || 'tenant';
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const tail = companyId.slice(-4);
  return `nomina-${clean}-${day}${tail}`.slice(0, 60);
}

export async function createInstance(instanceName: string) {
  const res = await fetch(`${evoBase()}/instance/create`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
    }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error((data as { message?: string }).message || `Evolution create HTTP ${res.status}`);
  }
  return data;
}

export async function connectInstance(instanceName: string) {
  const res = await fetch(`${evoBase()}/instance/connect/${encodeURIComponent(instanceName)}`, {
    method: 'GET',
    headers: headers(),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}

export async function instanceStatus(instanceName: string) {
  const res = await fetch(
    `${evoBase()}/instance/connectionState/${encodeURIComponent(instanceName)}`,
    { headers: headers() },
  );
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const state =
    (data as { instance?: { state?: string } }).instance?.state ||
    (data as { state?: string }).state ||
    'unknown';
  return { ok: res.ok, state: String(state), data };
}

export async function sendText(instanceName: string, number: string, text: string) {
  const digits = number.replace(/\D/g, '');
  const res = await fetch(`${evoBase()}/message/sendText/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ number: digits, text }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`WhatsApp send HTTP ${res.status}`);
  return data;
}

export function extractQr(payload: Record<string, unknown>) {
  const qrcode = payload.qrcode as Record<string, unknown> | undefined;
  const base64 =
    (qrcode?.base64 as string) ||
    (payload.base64 as string) ||
    ((payload.qr as Record<string, unknown>)?.base64 as string) ||
    '';
  const code = (qrcode?.code as string) || (payload.code as string) || '';
  return { base64, code };
}
