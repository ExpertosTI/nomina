import DigestFetch from 'digest-fetch';

export type DeviceCreds = {
  ipAddress: string;
  port: number;
  useHttps: boolean;
  username: string;
  password: string;
};

export function deviceBaseUrl(d: DeviceCreds) {
  const proto = d.useHttps ? 'https' : 'http';
  return `${proto}://${d.ipAddress}:${d.port}`;
}

export async function probeDevice(d: DeviceCreds) {
  const client = new DigestFetch(d.username, d.password);
  const url = `${deviceBaseUrl(d)}/ISAPI/System/deviceInfo`;
  const res = await client.fetch(url, { method: 'GET' });
  if (!res.ok) throw new Error(`ISAPI deviceInfo HTTP ${res.status}`);
  const xml = await res.text();
  const pick = (tag: string) => {
    const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i'));
    return m?.[1] || null;
  };
  return {
    model: pick('model'),
    serialNumber: pick('serialNumber'),
    firmware: pick('firmwareVersion'),
    macAddress: pick('macAddress'),
    deviceName: pick('deviceName'),
    deviceType: pick('deviceType'),
    raw: xml.slice(0, 2000),
  };
}

export function parseHikvisionPush(body: unknown, contentType = '') {
  let eventData: Record<string, unknown> = {};
  if (typeof body === 'object' && body && !Buffer.isBuffer(body)) {
    eventData = body as Record<string, unknown>;
  } else {
    const raw = Buffer.isBuffer(body)
      ? body.toString('utf8')
      : typeof body === 'string'
        ? body
        : '';
    try {
      if (contentType.includes('json') || raw.trim().startsWith('{')) {
        eventData = JSON.parse(raw);
      } else {
        for (const line of raw.split(/\r?\n/)) {
          const t = line.trim();
          if (t.startsWith('{') && t.endsWith('}')) {
            eventData = JSON.parse(t);
            break;
          }
        }
      }
    } catch {
      eventData = {};
    }
  }

  const acs = (eventData.AccessControllerEvent ||
    eventData.AcsEvent ||
    eventData) as Record<string, unknown>;

  const empName = String(acs.name || acs.employeeName || 'Desconocido');
  const empNo = String(
    acs.employeeNoString || acs.employeeNo || acs.cardNo || 'N/A',
  );
  const minor = Number(acs.subEventType || acs.minor || 0);
  const major = Number(acs.majorEventType || acs.major || 5);
  const timeStr = String(acs.time || acs.dateTime || new Date().toISOString());
  const verifyMode = String(acs.currentVerifyMode || 'face');
  const isSuccess =
    [75, 76, 1, 10, 73, 100].includes(minor) || (major === 5 && minor < 20);

  return {
    employeeNo: empNo,
    employeeName: empName,
    eventAt: new Date(timeStr),
    major,
    minor,
    verifyMode,
    isValidAttendance: isSuccess,
    raw: eventData,
  };
}
