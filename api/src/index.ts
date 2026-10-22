import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { authRouter } from './routes/auth.js';
import { employeesRouter } from './routes/employees.js';
import { devicesRouter } from './routes/devices.js';
import { attendanceRouter } from './routes/attendance.js';
import { payrollRouter } from './routes/payroll.js';
import { noveltiesRouter } from './routes/novelties.js';
import { settingsRouter } from './routes/settings.js';
import { reportsRouter } from './routes/reports.js';

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors());
app.use(morgan('tiny'));
app.use(express.json({ limit: '2mb' }));
app.use(express.text({ type: ['text/*', 'application/xml'], limit: '2mb' }));
app.use(
  express.raw({
    type: ['multipart/*', 'application/octet-stream'],
    limit: '2mb',
  }),
);

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'nomina-api',
    version: '1.0.0',
    time: new Date().toISOString(),
  });
});

app.use('/api/auth', authRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/devices', devicesRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/payroll', payrollRouter);
app.use('/api/novelties', noveltiesRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/reports', reportsRouter);

// Hikvision ACK path also mounted under /api for internal forward
app.use('/api', attendanceRouter);

app.listen(port, '0.0.0.0', () => {
  console.log(`nomina-api listening on :${port}`);
});
