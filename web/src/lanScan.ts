/** Descubre IPv4 local del navegador (misma LAN que la terminal). */
export async function detectLocalIpv4(timeoutMs = 2500): Promise<string | null> {
  return new Promise((resolve) => {
    const pc = new RTCPeerConnection({ iceServers: [] });
    const done = (ip: string | null) => {
      try {
        pc.close();
      } catch {
        /* ignore */
      }
      resolve(ip);
    };
    const timer = window.setTimeout(() => done(null), timeoutMs);
    pc.createDataChannel('lan');
    pc.onicecandidate = (ev) => {
      const cand = ev.candidate?.candidate || '';
      const m = cand.match(
        /([0-9]{1,3}(?:\.[0-9]{1,3}){3})/,
      );
      if (!m) return;
      const ip = m[1];
      if (
        ip.startsWith('127.') ||
        ip.startsWith('0.') ||
        ip.startsWith('169.254.') ||
        ip.startsWith('::')
      ) {
        return;
      }
      window.clearTimeout(timer);
      done(ip);
    };
    pc.createOffer()
      .then((o) => pc.setLocalDescription(o))
      .catch(() => {
        window.clearTimeout(timer);
        done(null);
      });
  });
}

export function subnetPrefix(ip: string) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

export type LanHost = {
  ip: string;
  ms: number;
  likelyHikvision: boolean;
};

/**
 * Barrido en la LAN del navegador (misma red que la terminal).
 * Usa fetch no-cors + timeout: detecta hosts que responden en :80/:443.
 */
export async function scanSubnet(
  prefix: string,
  opts: {
    from?: number;
    to?: number;
    concurrency?: number;
    timeoutMs?: number;
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<LanHost[]> {
  const from = opts.from ?? 1;
  const to = opts.to ?? 254;
  const concurrency = opts.concurrency ?? 32;
  const timeoutMs = opts.timeoutMs ?? 900;
  const ips: string[] = [];
  for (let i = from; i <= to; i++) ips.push(`${prefix}.${i}`);

  const found: LanHost[] = [];
  let done = 0;

  async function probe(ip: string) {
    const start = performance.now();
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      // no-cors: no leemos body, pero hosts vivos suelen completar o fallar distinto a timeout
      await fetch(`http://${ip}/`, {
        method: 'GET',
        mode: 'no-cors',
        cache: 'no-store',
        signal: ctrl.signal,
      });
      const ms = Math.round(performance.now() - start);
      // Respuesta opaca rápida ≈ algo escuchando en :80
      if (ms < timeoutMs - 50) {
        found.push({ ip, ms, likelyHikvision: ms < 400 });
      }
    } catch {
      /* timeout / unreachable */
    } finally {
      window.clearTimeout(t);
      done += 1;
      opts.onProgress?.(done, ips.length);
    }
  }

  let idx = 0;
  async function worker() {
    while (idx < ips.length) {
      const i = idx++;
      await probe(ips[i]);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return found.sort((a, b) => a.ms - b.ms);
}
