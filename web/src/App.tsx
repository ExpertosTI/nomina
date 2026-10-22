import { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api, getToken, setToken } from './api';

type User = { id: string; email: string; name: string; role: string; companyId: string };

function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api<{ user: User }>('/api/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  return { user, setUser, loading };
}

function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [email, setEmail] = useState('info@renace.tech');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const d = await api<{ token: string; user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setToken(d.token);
      onLogin(d.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>
          Nómina <span style={{ color: 'var(--accent)' }}>·</span> Renace
        </h1>
        <p className="lead">Asistencia Hikvision + nómina</p>
        <div className="field">
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </div>
        <div className="field">
          <label>Contraseña</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
          />
        </div>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy} style={{ width: '100%', marginTop: '0.5rem' }}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}

function Shell({ user, onLogout, children }: { user: User; onLogout: () => void; children: React.ReactNode }) {
  const loc = useLocation();
  const nav = [
    ['/', 'Dashboard'],
    ['/live', 'Asistencia live'],
    ['/devices', 'Dispositivos'],
    ['/employees', 'Empleados'],
    ['/payroll', 'Nómina'],
  ] as const;

  return (
    <div className="shell">
      <aside className="nav">
        <p className="brand">
          Nómina<span>·</span>
        </p>
        <p className="nav-sub">{user.name}</p>
        {nav.map(([to, label]) => (
          <Link key={to} to={to} className={loc.pathname === to ? 'active' : ''}>
            {label}
          </Link>
        ))}
        <button
          className="btn"
          style={{ marginTop: '1.5rem', width: '100%' }}
          onClick={onLogout}
          type="button"
        >
          Salir
        </button>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

function Dashboard() {
  const [d, setD] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    api<Record<string, number>>('/api/payroll/dashboard').then(setD).catch(console.error);
  }, []);
  return (
    <>
      <h1>Dashboard</h1>
      <p className="lead">Resumen operativo de asistencia y nómina</p>
      <div className="grid">
        {[
          ['Empleados', d?.employees],
          ['Dispositivos', d?.devices],
          ['Marcajes hoy', d?.eventsToday],
          ['Lotes nómina', d?.runs],
          ['Payslips', d?.slips],
        ].map(([label, value]) => (
          <div className="stat" key={String(label)}>
            <div className="label">{label}</div>
            <div className="value">{value ?? '—'}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function Live() {
  const [data, setData] = useState<{
    events: Array<Record<string, unknown>>;
    devices: Array<Record<string, unknown>>;
    todayValid: number;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<typeof data>('/api/attendance/live')
        .then((d) => alive && setData(d as NonNullable<typeof data>))
        .catch(console.error);
    load();
    const t = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <>
      <h1>
        Asistencia <span className="pulse" style={{ color: 'var(--accent)' }}>live</span>
      </h1>
      <p className="lead">Marcajes válidos hoy: {data?.todayValid ?? '…'}</p>
      <div className="grid">
        {(data?.devices || []).map((dev) => (
          <div className="stat" key={String(dev.id)}>
            <div className="label">{String(dev.name)}</div>
            <div className="value" style={{ fontSize: '1rem' }}>
              <span className={`badge ${dev.lastStatus === 'online' ? '' : 'off'}`}>
                {String(dev.lastStatus || 'offline')}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="panel">
        <h2>Últimos eventos</h2>
        <table>
          <thead>
            <tr>
              <th>Hora</th>
              <th>Empleado</th>
              <th>PIN</th>
              <th>Modo</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {(data?.events || []).map((e) => (
              <tr key={String(e.id)}>
                <td>{new Date(String(e.eventAt)).toLocaleString('es-DO')}</td>
                <td>{String(e.employeeName)}</td>
                <td>{String(e.employeeNo)}</td>
                <td>{String(e.verifyMode || '—')}</td>
                <td>
                  <span className={`badge ${e.isValidAttendance ? '' : 'off'}`}>
                    {e.isValidAttendance ? 'válido' : 'ignorado'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Devices() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [form, setForm] = useState({
    name: 'Hikvision Lobby',
    ipAddress: '',
    port: '80',
    username: 'admin',
    password: '',
  });
  const [msg, setMsg] = useState('');

  const load = () => api<typeof rows>('/api/devices').then(setRows).catch(console.error);
  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await api('/api/devices', {
      method: 'POST',
      body: JSON.stringify({ ...form, port: Number(form.port) }),
    });
    setForm((f) => ({ ...f, ipAddress: '', password: '' }));
    load();
  }

  async function probe(id: string) {
    setMsg('Probando ISAPI…');
    try {
      await api(`/api/devices/${id}/probe`, { method: 'POST' });
      setMsg('Dispositivo online');
      load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Fallo');
    }
  }

  return (
    <>
      <h1>Dispositivos Hikvision</h1>
      <p className="lead">Push URL se genera por dispositivo para HTTP Listening</p>
      {msg && <p className="lead">{msg}</p>}
      <form className="panel" style={{ padding: '1rem', marginBottom: '1rem' }} onSubmit={create}>
        <div className="row-actions" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '0.5rem' }}>
          {(['name', 'ipAddress', 'port', 'username', 'password'] as const).map((k) => (
            <div className="field" key={k} style={{ margin: 0 }}>
              <label>{k}</label>
              <input
                value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                type={k === 'password' ? 'password' : 'text'}
                required={k === 'name'}
              />
            </div>
          ))}
        </div>
        <button className="btn primary" type="submit">
          Agregar dispositivo
        </button>
      </form>
      <div className="panel">
        <h2>Registrados</h2>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>IP</th>
              <th>Estado</th>
              <th>Push URL</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={String(d.id)}>
                <td>{String(d.name)}</td>
                <td>
                  {String(d.ipAddress || '—')}:{String(d.port)}
                </td>
                <td>
                  <span className={`badge ${d.lastStatus === 'online' ? '' : 'off'}`}>
                    {String(d.lastStatus)}
                  </span>
                </td>
                <td style={{ fontSize: '0.75rem', maxWidth: 280, wordBreak: 'break-all' }}>
                  {String(d.pushUrl || '')}
                </td>
                <td>
                  <button className="btn" type="button" onClick={() => probe(String(d.id))}>
                    Probe
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Employees() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [form, setForm] = useState({
    code: '',
    name: '',
    department: '',
    jobTitle: '',
    wage: '25000',
  });
  const load = () => api<typeof rows>('/api/employees').then(setRows).catch(console.error);
  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await api('/api/employees', {
      method: 'POST',
      body: JSON.stringify({ ...form, wage: Number(form.wage) || undefined }),
    });
    setForm({ code: '', name: '', department: '', jobTitle: '', wage: '25000' });
    load();
  }

  return (
    <>
      <h1>Empleados</h1>
      <p className="lead">El código / PIN biométrico debe coincidir con el del terminal Hikvision</p>
      <form className="panel" style={{ padding: '1rem', marginBottom: '1rem' }} onSubmit={create}>
        <div
          className="row-actions"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '0.5rem' }}
        >
          {(['code', 'name', 'department', 'jobTitle', 'wage'] as const).map((k) => (
            <div className="field" key={k} style={{ margin: 0 }}>
              <label>{k === 'wage' ? 'Salario mensual' : k}</label>
              <input
                value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                required={k === 'code' || k === 'name'}
                type={k === 'wage' ? 'number' : 'text'}
              />
            </div>
          ))}
        </div>
        <button className="btn primary" type="submit">
          Crear empleado
        </button>
      </form>
      <div className="panel">
        <h2>Lista</h2>
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Depto</th>
              <th>Puesto</th>
              <th>PIN</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={String(e.id)}>
                <td>{String(e.code)}</td>
                <td>{String(e.name)}</td>
                <td>{String(e.department || '—')}</td>
                <td>{String(e.jobTitle || '—')}</td>
                <td>{String(e.biometricPin || e.code)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Payroll() {
  const [runs, setRuns] = useState<Array<Record<string, unknown>>>([]);
  const [payslips, setPayslips] = useState<Array<Record<string, unknown>>>([]);
  const [dateStart, setDateStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [dateEnd, setDateEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  const load = () => {
    api<typeof runs>('/api/payroll/runs').then(setRuns).catch(console.error);
    api<typeof payslips>('/api/payroll/payslips').then(setPayslips).catch(console.error);
  };
  useEffect(() => {
    load();
  }, []);

  async function createRun() {
    setBusy(true);
    try {
      await api('/api/payroll/runs', {
        method: 'POST',
        body: JSON.stringify({ dateStart, dateEnd }),
      });
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Nómina</h1>
      <p className="lead">Lotes con OT estimado desde marcajes Hikvision</p>
      <div className="row-actions">
        <div className="field" style={{ margin: 0 }}>
          <label>Desde</label>
          <input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Hasta</label>
          <input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
        </div>
        <button className="btn primary" type="button" disabled={busy} onClick={createRun}>
          Generar lote
        </button>
      </div>
      <div className="panel" style={{ marginBottom: '1rem' }}>
        <h2>Lotes</h2>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Periodo</th>
              <th>Estado</th>
              <th>Payslips</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={String(r.id)}>
                <td>{String(r.name)}</td>
                <td>
                  {String(r.dateStart).slice(0, 10)} → {String(r.dateEnd).slice(0, 10)}
                </td>
                <td>{String(r.state)}</td>
                <td>{String((r._count as { payslips?: number } | undefined)?.payslips ?? '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <h2>Payslips recientes</h2>
        <table>
          <thead>
            <tr>
              <th>Empleado</th>
              <th>Días</th>
              <th>OT</th>
              <th>Bruto</th>
              <th>Deducciones</th>
              <th>Neto</th>
            </tr>
          </thead>
          <tbody>
            {payslips.map((p) => (
              <tr key={String(p.id)}>
                <td>{String((p.employee as { name?: string } | undefined)?.name || p.name)}</td>
                <td>{String(p.workedDays)}</td>
                <td>{String(p.overtimeHours)}</td>
                <td>{Number(p.gross).toLocaleString('es-DO')}</td>
                <td>{Number(p.deductions).toLocaleString('es-DO')}</td>
                <td>
                  <strong>{Number(p.net).toLocaleString('es-DO')}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function App() {
  const { user, setUser, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) return <div className="login-wrap">Cargando…</div>;

  if (!user) {
    return (
      <Login
        onLogin={(u) => {
          setUser(u);
          navigate('/');
        }}
      />
    );
  }

  return (
    <Shell
      user={user}
      onLogout={() => {
        setToken(null);
        setUser(null);
      }}
    >
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/live" element={<Live />} />
        <Route path="/devices" element={<Devices />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/payroll" element={<Payroll />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
