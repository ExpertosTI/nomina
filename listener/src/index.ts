import express from 'express';
import morgan from 'morgan';

const app = express();
const port = Number(process.env.PORT || 9095);
const apiUrl = (process.env.API_INTERNAL_URL || 'http://nomina_api:3000').replace(/\/$/, '');
const forwardSecret = process.env.LISTENER_FORWARD_SECRET || '';

app.use(morgan('tiny'));
app.use(
  express.raw({
    type: () => true,
    limit: '4mb',
  }),
);

function hikOk(res: express.Response) {
  res.status(200).json({ statusCode: 1, statusString: 'OK', subStatusCode: 'ok' });
}

app.get(['/', '/hikvision/event', '/ISAPI/Event/notification/httpHosts', '/health'], (_req, res) => {
  hikOk(res);
});

app.post(['/hikvision/event', '/ISAPI/Event/notification/alertStream', '/'], async (req, res) => {
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const contentType = req.headers['content-type'] || 'application/octet-stream';
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');

  try {
    const forward = await fetch(`${apiUrl}/api/hikvision/event${qs}`, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        ...(forwardSecret ? { 'x-listener-secret': forwardSecret } : {}),
      },
      body,
    });
    const text = await forward.text();
    try {
      const json = JSON.parse(text);
      return res.status(200).json(json);
    } catch {
      return hikOk(res);
    }
  } catch (e) {
    console.error('forward failed', e);
    // Always ACK to Hikvision so the device does not retry-storm
    return hikOk(res);
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`nomina-hikvision-listener on :${port} → ${apiUrl}`);
});
