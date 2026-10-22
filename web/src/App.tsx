import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api, getToken, setToken } from './api';

type User = { id: string; email: string; name: string; role: string; companyId: string };
type Employee = { id: string; code: string; name: string; department?: string; jobTitle?: string; biometricPin?: string };
type Novelty = {
  id: string;
  type: string;
  dateFrom: string;
  dateTo?: string;
  days: number | string;
  reason?: string;
  status: string;
  paid: boolean;
  affectsPayroll: boolean;
  employee: { id: string; name: string; code: string };
};

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

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');
}

function typeChip(type: string) {
  if (type === 'falta') return 'danger';
  if (type === 'licencia') return 'warm';
  if (type === 'permiso') return '';
  return 'muted';
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
          Nómina <em>Renace</em>
        </h1>
        <p className="lead">Asistencia live · cuaderno · nómina — fluido y claro.</p>
        <div className="field">
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </div>
        <div className="field">
          <label>Contraseña</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
        </div>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy} style={{ width: '100%', marginTop: '0.35rem' }}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}

function Shell({
  user,
  onLogout,
  children,
}: {
  user: User;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const loc = useLocation();
  const nav = [
    ['/', 'Hoy'],
    ['/cuaderno', 'Cuaderno'],
    ['/equipo', 'Equipo'],
    ['/terminales', 'Terminales'],
    ['/nomina', 'Nómina'],
  ] as const;

  return (
    <div className="shell">
      <aside className="nav">
        <p className="brand">
          Nómina<em>.</em>
        </p>
        <p className="nav-sub">{user.name}</p>
        {nav.map(([to, label]) => (
          <Link key={to} to={to} className={loc.pathname === to ? 'active' : ''}>
            <span className="nav-dot" />
            {label}
          </Link>
        ))}
        <div className="nav-foot">
          <button className="btn" type="button" onClick={onLogout} style={{ width: '100%' }}>
            Salir
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

function Hoy() {
  const [d, setD] = useState<{
    employees: number;
    devices: number;
    eventsToday: number;
    noveltiesOpen: number;
    recentEvents: Array<Record<string, unknown>>;
    recentNovelties: Novelty[];
  } | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<NonNullable<typeof d>>('/api/payroll/dashboard')
        .then((x) => alive && setD(x))
        .catch(console.error);
    load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <>
      <div className="hero-today">
        <div className="hero-band">
          <div className="eyebrow">Hoy · en vivo</div>
          <h2>Tu equipo, en un vistazo</h2>
          <p className="lead" style={{ margin: 0, maxWidth: 420 }}>
            Marcajes Hikvision y novedades del cuaderno, sin ruido.
          </p>
          <div className="hero-metrics">
            <div>
              <strong>{d?.eventsToday ?? '—'}</strong>
              <span>Marcajes hoy</span>
            </div>
            <div>
              <strong>{d?.noveltiesOpen ?? '—'}</strong>
              <span>Novedades del mes</span>
            </div>
            <div>
              <strong>{d?.employees ?? '—'}</strong>
              <span>Empleados</span>
            </div>
            <div>
              <strong>{d?.devices ?? '—'}</strong>
              <span>Terminales</span>
            </div>
          </div>
        </div>
      </div>

      <div className="split">
        <section className="panel">
          <div className="panel-head">
            <h2>Marcajes recientes</h2>
            <span className="live-dot" title="Live" />
          </div>
          {(d?.recentEvents || []).length === 0 && <p className="empty">Esperando push del terminal…</p>}
          {(d?.recentEvents || []).map((e, i) => (
            <div className="feed-item" key={String(e.id)} style={{ animationDelay: `${i * 40}ms` }}>
              <div className="avatar">{initials(String(e.employeeName || '?'))}</div>
              <div>
                <div>{String(e.employeeName)}</div>
                <div className="meta">
                  PIN {String(e.employeeNo)} · {String(e.verifyMode || 'face')}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className={`chip ${e.isValidAttendance ? '' : 'danger'}`}>
                  {e.isValidAttendance ? 'válido' : 'ignorado'}
                </span>
                <div className="meta" style={{ marginTop: 4 }}>
                  {new Date(String(e.eventAt)).toLocaleTimeString('es-DO', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            </div>
          ))}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Cuaderno</h2>
            <Link to="/cuaderno" className="chip">
              Abrir
            </Link>
          </div>
          {(d?.recentNovelties || []).length === 0 && (
            <p className="empty">Sin novedades. Registra faltas o licencias.</p>
          )}
          {(d?.recentNovelties || []).map((n) => (
            <div className="feed-item" key={n.id}>
              <div className="avatar">{initials(n.employee.name)}</div>
              <div>
                <div>{n.employee.name}</div>
                <div className="meta">{n.reason || 'Sin detalle'}</div>
              </div>
              <span className={`chip ${typeChip(n.type)}`}>{n.type}</span>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}

function Cuaderno() {
  const [rows, setRows] = useState<Novelty[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState({
    employeeId: '',
    type: 'falta',
    dateFrom: new Date().toISOString().slice(0, 10),
    dateTo: '',
    days: '1',
    reason: '',
    paid: false,
  });
  const [busy, setBusy] = useState(false);

  const load = () => {
    api<Novelty[]>('/api/novelties').then(setRows).catch(console.error);
    api<Employee[]>('/api/employees').then(setEmployees).catch(console.error);
  };
  useEffect(() => {
    load();
  }, []);

  const visible = useMemo(
    () => (filter === 'all' ? rows : rows.filter((r) => r.type === filter)),
    [rows, filter],
  );

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.employeeId) return;
    setBusy(true);
    try {
      await api('/api/novelties', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          days: Number(form.days) || 1,
          dateTo: form.dateTo || undefined,
          paid: form.type === 'falta' ? false : form.paid,
        }),
      });
      setForm((f) => ({ ...f, reason: '', days: '1' }));
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('¿Eliminar novedad?')) return;
    await api(`/api/novelties/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <>
      <h1 className="page-title">Cuaderno de novedades</h1>
      <p className="lead">Faltas, licencias, permisos y notas — todo en un solo hilo.</p>

      <div className="type-tabs">
        {[
          ['all', 'Todas'],
          ['falta', 'Faltas'],
          ['licencia', 'Licencias'],
          ['permiso', 'Permisos'],
          ['nota', 'Notas'],
        ].map(([id, label]) => (
          <button key={id} type="button" className={filter === id ? 'on' : ''} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>

      <section className="panel" style={{ marginBottom: '1.25rem' }}>
        <form className="composer" onSubmit={create}>
          <div className="row-actions" style={{ marginBottom: 0 }}>
            <div className="field">
              <label>Empleado</label>
              <select
                value={form.employeeId}
                onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                required
              >
                <option value="">Seleccionar…</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.code})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Tipo</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="falta">Falta</option>
                <option value="licencia">Licencia</option>
                <option value="permiso">Permiso</option>
                <option value="nota">Nota</option>
              </select>
            </div>
            <div className="field">
              <label>Desde</label>
              <input
                type="date"
                value={form.dateFrom}
                onChange={(e) => setForm({ ...form, dateFrom: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label>Hasta</label>
              <input
                type="date"
                value={form.dateTo}
                onChange={(e) => setForm({ ...form, dateTo: e.target.value })}
              />
            </div>
            <div className="field" style={{ maxWidth: 100 }}>
              <label>Días</label>
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={form.days}
                onChange={(e) => setForm({ ...form, days: e.target.value })}
              />
            </div>
          </div>
          <div className="field">
            <label>Motivo / detalle</label>
            <input
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="Ej. licencia médica, permiso personal…"
            />
          </div>
          {(form.type === 'licencia' || form.type === 'permiso') && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--muted)', marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={form.paid}
                onChange={(e) => setForm({ ...form, paid: e.target.checked })}
              />
              Remunerada (no descuenta en nómina)
            </label>
          )}
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Guardando…' : 'Registrar en cuaderno'}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Registro</h2>
          <span className="chip muted">{visible.length}</span>
        </div>
        {visible.length === 0 && <p className="empty">El cuaderno está vacío.</p>}
        {visible.map((n) => (
          <div className="novelty-card" key={n.id}>
            <div className="avatar">{initials(n.employee.name)}</div>
            <div>
              <div className="title">
                {n.employee.name}{' '}
                <span className={`chip ${typeChip(n.type)}`} style={{ marginLeft: 6 }}>
                  {n.type}
                </span>
                {n.paid && (
                  <span className="chip" style={{ marginLeft: 6 }}>
                    paga
                  </span>
                )}
              </div>
              <div className="sub">
                {String(n.dateFrom).slice(0, 10)}
                {n.dateTo ? ` → ${String(n.dateTo).slice(0, 10)}` : ''} · {n.days} día(s)
                {n.reason ? ` · ${n.reason}` : ''}
              </div>
            </div>
            <button className="btn" type="button" onClick={() => remove(n.id)}>
              Quitar
            </button>
          </div>
        ))}
      </section>
    </>
  );
}

function Equipo() {
  const [rows, setRows] = useState<Employee[]>([]);
  const [form, setForm] = useState({
    code: '',
    name: '',
    department: '',
    jobTitle: '',
    wage: '25000',
  });

  const load = () => api<Employee[]>('/api/employees').then(setRows).catch(console.error);
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
      <h1 className="page-title">Equipo</h1>
      <p className="lead">El PIN biométrico debe coincidir con el del terminal Hikvision.</p>
      <section className="panel" style={{ marginBottom: '1.25rem' }}>
        <form className="composer" onSubmit={create}>
          <div className="row-actions">
            {(['code', 'name', 'department', 'jobTitle', 'wage'] as const).map((k) => (
              <div className="field" key={k}>
                <label>{k === 'wage' ? 'Salario' : k}</label>
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
            Agregar persona
          </button>
        </form>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>Personas</h2>
        </div>
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
              <tr key={e.id}>
                <td>{e.code}</td>
                <td>{e.name}</td>
                <td>{e.department || '—'}</td>
                <td>{e.jobTitle || '—'}</td>
                <td>{e.biometricPin || e.code}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function Terminales() {
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
      setMsg('Online');
      load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Fallo');
    }
  }

  return (
    <>
      <h1 className="page-title">Terminales</h1>
      <p className="lead">Configura HTTP Listening con la Push URL de cada dispositivo.</p>
      {msg && <p className="lead">{msg}</p>}
      <section className="panel" style={{ marginBottom: '1.25rem' }}>
        <form className="composer" onSubmit={create}>
          <div className="row-actions">
            {(['name', 'ipAddress', 'port', 'username', 'password'] as const).map((k) => (
              <div className="field" key={k}>
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
            Agregar terminal
          </button>
        </form>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>Registrados</h2>
        </div>
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
                  <span className={`chip ${d.lastStatus === 'online' ? '' : 'danger'}`}>
                    {String(d.lastStatus)}
                  </span>
                </td>
                <td style={{ fontSize: '0.75rem', maxWidth: 260, wordBreak: 'break-all' }}>
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
      </section>
    </>
  );
}

function Nomina() {
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
      <h1 className="page-title">Nómina</h1>
      <p className="lead">Lotes con OT de Hikvision y descuentos del cuaderno.</p>
      <div className="row-actions">
        <div className="field">
          <label>Desde</label>
          <input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
        </div>
        <div className="field">
          <label>Hasta</label>
          <input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
        </div>
        <button className="btn primary" type="button" disabled={busy} onClick={createRun}>
          Generar lote
        </button>
      </div>
      <section className="panel" style={{ marginBottom: '1.25rem' }}>
        <div className="panel-head">
          <h2>Lotes</h2>
        </div>
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
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>Payslips</h2>
        </div>
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
      </section>
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
        <Route path="/" element={<Hoy />} />
        <Route path="/cuaderno" element={<Cuaderno />} />
        <Route path="/equipo" element={<Equipo />} />
        <Route path="/terminales" element={<Terminales />} />
        <Route path="/nomina" element={<Nomina />} />
        <Route path="/live" element={<Navigate to="/" replace />} />
        <Route path="/devices" element={<Navigate to="/terminales" replace />} />
        <Route path="/employees" element={<Navigate to="/equipo" replace />} />
        <Route path="/payroll" element={<Navigate to="/nomina" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
