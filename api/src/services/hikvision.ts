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

function extractXmlTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i'));
  return m ? m[1].trim() : null;
}

export function parseHikvisionPush(body: unknown, contentType = '') {
  let eventData: Record<string, unknown> = {};
  let empName = '';
  let empNo = '';
  let minor = 0;
  let major = 0;
  let timeStr = '';
  let verifyMode = 'face';

  const raw = Buffer.isBuffer(body)
    ? body.toString('utf8')
    : typeof body === 'string'
      ? body
      : '';

  // 1. Intentar parsear como JSON si viene formateado
  if (typeof body === 'object' && body && !Buffer.isBuffer(body)) {
    eventData = body as Record<string, unknown>;
  } else if (raw) {
    // Si viene en multipart o texto plano con JSON embebido
    try {
      if (contentType.includes('json') || raw.trim().startsWith('{')) {
        eventData = JSON.parse(raw);
      } else {
        const firstBrace = raw.indexOf('{');
        const lastBrace = raw.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          eventData = JSON.parse(raw.slice(firstBrace, lastBrace + 1));
        }
      }
    } catch {
      eventData = {};
    }

    // 2. Si no es JSON o faltan datos, intentar extraer etiquetas XML estándar de Hikvision
    if (raw.includes('<') && raw.includes('>')) {
      const xmlName = extractXmlTag(raw, 'name') || extractXmlTag(raw, 'employeeName');
      const xmlNo = extractXmlTag(raw, 'employeeNoString') || extractXmlTag(raw, 'employeeNo') || extractXmlTag(raw, 'cardNo');
      const xmlMinor = extractXmlTag(raw, 'subEventType') || extractXmlTag(raw, 'minor');
      const xmlMajor = extractXmlTag(raw, 'majorEventType') || extractXmlTag(raw, 'major');
      const xmlTime = extractXmlTag(raw, 'time') || extractXmlTag(raw, 'dateTime');
      const xmlMode = extractXmlTag(raw, 'currentVerifyMode');

      if (xmlName && !empName) empName = xmlName;
      if (xmlNo && !empNo) empNo = xmlNo;
      if (xmlMinor && !minor) minor = Number(xmlMinor) || 0;
      if (xmlMajor && !major) major = Number(xmlMajor) || 0;
      if (xmlTime && !timeStr) timeStr = xmlTime;
      if (xmlMode) verifyMode = xmlMode;
    }
  }

  // Extraer desde el objeto JSON si se obtuvo
  const acs = (eventData.AccessControllerEvent ||
    eventData.AcsEvent ||
    eventData) as Record<string, unknown>;

  if (!empName) empName = String(acs.name || acs.employeeName || '');
  if (!empNo) empNo = String(acs.employeeNoString || acs.employeeNo || acs.cardNo || '');
  if (!minor) minor = Number(acs.subEventType || acs.minor || 0);
  if (!major) major = Number(acs.majorEventType || acs.major || 0);
  if (!timeStr) timeStr = String(acs.time || acs.dateTime || '');
  if (acs.currentVerifyMode) verifyMode = String(acs.currentVerifyMode);

  // Normalizar valores
  empName = empName.trim();
  empNo = empNo.trim();
  if (empNo === 'N/A' || empNo === '0' || empNo === 'null' || empNo === 'undefined') empNo = '';
  if (!empName && empNo) empName = `Empleado ${empNo}`;
  if (!empName) empName = 'Desconocido';

  // Solo consideramos asistencia si existe un número de empleado real
  const hasValidEmployee = Boolean(empNo && empNo !== 'N/A');

  // Códigos de eventos biométricos de Hikvision DS-K1T:
  // 75 = Face Pass, 76 = Face+FP, 1 = Card Pass, 10 = FP Pass, 73 = Fingerprint, 100 = Custom pass
  const isBiometricPass = [75, 76, 1, 10, 73, 100].includes(minor) || (major === 5 && minor > 0 && minor < 20);

  const isValidAttendance = Boolean(hasValidEmployee && isBiometricPass);

  return {
    employeeNo: empNo || 'N/A',
    employeeName: empName,
    eventAt: timeStr ? new Date(timeStr) : new Date(),
    major,
    minor,
    verifyMode,
    isValidAttendance,
    raw: Object.keys(eventData).length ? eventData : (raw ? { preview: raw.slice(0, 500) } : {}),
  };
}
