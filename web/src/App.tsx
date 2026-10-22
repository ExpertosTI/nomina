import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api, getToken, setToken } from './api';

type User = { id: string; email: string; name: string; role: string; companyId: string };
type Employee = {
  id: string;
  code: string;
  name: string;
  department?: string;
  jobTitle?: string;
  biometricPin?: string;
  email?: string;
  phone?: string;
};
type Contract = {
  id: string;
  name: string;
  wage: number | string;
  state: string;
  dateStart: string;
  employee: Employee;
  structure?: { id: string; name: string; code: string } | null;
};
type Run = {
  id: string;
  name: string;
  dateStart: string;
  dateEnd: string;
  state: string;
  _count?: { payslips: number };
};
type Payslip = {
  id: string;
  name: string;
  state: string;
  workedDays: number;
  overtimeHours: number | string;
  basicWage: number | string;
  gross: number | string;
  deductions: number | string;
  net: number | string;
  lines: Array<{ code: string; name: string; category: string; amount: number }>;
  employee?: Employee;
  run?: Run | null;
};
type Novelty = {
  id: string;
  type: string;
  dateFrom: string;
  dateTo?: string;
  days: number | string;
  reason?: string;
  paid: boolean;
  employee: { id: string; name: string; code: string };
};
type Device = Record<string, unknown>;

function money(n: number | string) {
  return Number(n).toLocaleString('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 2 });
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');
}

function stateChip(state: string) {
  if (state === 'done' || state === 'paid' || state === 'online' || state === 'open') return 'ok';
  if (state === 'close') return 'teal';
  if (state === 'draft') return 'warn';
  if (state === 'offline' || state === 'cancel') return 'danger';
  return 'muted';
}

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
          Nomina <span>RENACE</span>
        </h1>
        <p className="lead">Asistencia Hikvision · contratos · lotes de nómina</p>
        <div className="field">
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </div>
        <div className="field">
          <label>Contraseña</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
        </div>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy} style={{ width: '100%' }}>
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
    ['/', 'Inicio'],
    ['/asistencia', 'Asistencia'],
    ['/empleados', 'Empleados'],
    ['/contratos', 'Contratos'],
    ['/lotes', 'Lotes de nómina'],
    ['/cuaderno', 'Cuaderno'],
    ['/terminales', 'Terminales'],
  ] as const;

  return (
    <div className="shell">
      <aside className="nav">
        <p className="brand">
          Nomina <span>RENACE</span>
        </p>
        <p className="nav-sub">{user.name}</p>
        {nav.map(([to, label]) => (
          <Link key={to} to={to} className={loc.pathname === to || loc.pathname.startsWith(to + '/') ? 'active' : ''}>
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

function Inicio() {
  const [d, setD] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    api('/api/payroll/dashboard').then(setD).catch(console.error);
  }, []);
  const nav = useNavigate();

  return (
    <>
      <h1 className="page-title">Nomina RENACE</h1>
      <p className="lead">Flujo: registrar empleado → contrato → generar lote → confirmar payslips.</p>

      <div className="quick-steps">
        <div className="quick-title">Proceso rápido</div>
        <div className="quick-actions">
          <button className="btn primary" type="button" onClick={() => nav('/empleados')}>
            Registrar empleado
          </button>
          <button className="btn" type="button" onClick={() => nav('/contratos')}>
            Ver contratos
          </button>
          <button className="btn accent" type="button" onClick={() => nav('/lotes')}>
            Generar nómina
          </button>
          <button className="btn" type="button" onClick={() => nav('/asistencia')}>
            Ver asistencias
          </button>
        </div>
      </div>

      <div className="metrics">
        {[
          ['Empleados', d?.employees],
          ['Asistencias hoy', d?.eventsToday],
          ['Terminales', d?.devices],
          ['Lotes', d?.runs],
          ['Payslips', d?.slips],
          ['Novedades mes', d?.noveltiesOpen],
        ].map(([label, value]) => (
          <div className="metric" key={String(label)}>
            <div className="label">{label}</div>
            <div className="value">{(value as number) ?? '—'}</div>
          </div>
        ))}
      </div>

      <div className="split">
        <section className="panel">
          <div className="panel-head">
            <h2>Últimas asistencias</h2>
            <span className="live-dot" />
          </div>
          {((d?.recentEvents as Array<Record<string, unknown>>) || []).length === 0 && (
            <p className="empty">Sin marcajes aún. Configura el Push del terminal.</p>
          )}
          {((d?.recentEvents as Array<Record<string, unknown>>) || []).map((e) => (
            <div className="feed-item" key={String(e.id)}>
              <div className="avatar">{initials(String(e.employeeName || '?'))}</div>
              <div>
                <div>{String(e.employeeName)}</div>
                <div className="meta">
                  PIN {String(e.employeeNo)} · {new Date(String(e.eventAt)).toLocaleString('es-DO')}
                </div>
              </div>
              <span className={`chip ${e.isValidAttendance ? 'ok' : 'danger'}`}>
                {e.isValidAttendance ? 'válido' : 'denegado'}
              </span>
            </div>
          ))}
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>Cuaderno reciente</h2>
            <Link to="/cuaderno" className="chip teal">
              Abrir
            </Link>
          </div>
          {((d?.recentNovelties as Novelty[]) || []).length === 0 && (
            <p className="empty">Sin faltas ni licencias registradas.</p>
          )}
          {((d?.recentNovelties as Novelty[]) || []).map((n) => (
            <div className="feed-item" key={n.id}>
              <div className="avatar">{initials(n.employee.name)}</div>
              <div>
                <div>{n.employee.name}</div>
                <div className="meta">{n.reason || n.type}</div>
              </div>
              <span className={`chip ${n.type === 'falta' ? 'danger' : 'warn'}`}>{n.type}</span>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}

function Asistencia() {
  const [data, setData] = useState<{
    events: Array<Record<string, unknown>>;
    devices: Array<Record<string, unknown>>;
    todayValid: number;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<NonNullable<typeof data>>('/api/attendance/live')
        .then((x) => alive && setData(x))
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
      <h1 className="page-title">Registro de asistencias</h1>
      <p className="lead">Eventos en vivo desde Hikvision DS-K1T321EFWX (HTTP Push).</p>
      <div className="metrics">
        <div className="metric">
          <div className="label">Válidas (24h)</div>
          <div className="value">{data?.todayValid ?? '—'}</div>
        </div>
        {(data?.devices || []).map((dev) => (
          <div className="metric" key={String(dev.id)}>
            <div className="label">{String(dev.name)}</div>
            <div className="value" style={{ fontSize: '1rem' }}>
              <span className={`chip ${stateChip(String(dev.lastStatus))}`}>{String(dev.lastStatus)}</span>
            </div>
          </div>
        ))}
      </div>
      <section className="panel">
        <div className="panel-head">
          <h2>Eventos</h2>
          <span className="live-dot" />
        </div>
        <table>
          <thead>
            <tr>
              <th>Fecha / hora</th>
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
                  <span className={`chip ${e.isValidAttendance ? 'ok' : 'danger'}`}>
                    {e.isValidAttendance ? 'asistencia' : 'denegado'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function Empleados() {
  const [rows, setRows] = useState<Employee[]>([]);
  const [form, setForm] = useState({
    code: '',
    name: '',
    department: '',
    jobTitle: '',
    email: '',
    phone: '',
    biometricPin: '',
    wage: '25000',
  });
  const [msg, setMsg] = useState('');

  const load = () => api<Employee[]>('/api/employees').then(setRows).catch(console.error);
  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    await api('/api/employees', {
      method: 'POST',
      body: JSON.stringify({
        ...form,
        biometricPin: form.biometricPin || form.code,
        wage: Number(form.wage) || undefined,
      }),
    });
    setMsg('Empleado registrado' + (form.wage ? ' con contrato abierto' : ''));
    setForm({
      code: '',
      name: '',
      department: '',
      jobTitle: '',
      email: '',
      phone: '',
      biometricPin: '',
      wage: '25000',
    });
    load();
  }

  return (
    <>
      <h1 className="page-title">Empleados</h1>
      <p className="lead">Alta como en Nomina RENACE: ficha + salario crea contrato con estructura STD.</p>

      <section className="panel">
        <div className="panel-head">
          <h2>Registrar empleado</h2>
        </div>
        <form className="composer" onSubmit={create}>
          <div className="row-actions">
            {(
              [
                ['code', 'Código / ID'],
                ['biometricPin', 'PIN biométrico'],
                ['name', 'Nombre completo'],
                ['jobTitle', 'Puesto'],
                ['department', 'Departamento'],
                ['email', 'Email'],
                ['phone', 'Teléfono'],
                ['wage', 'Salario mensual (DOP)'],
              ] as const
            ).map(([k, label]) => (
              <div className="field" key={k}>
                <label>{label}</label>
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
            Guardar empleado
          </button>
          {msg && <p className="lead" style={{ margin: '0.75rem 0 0' }}>{msg}</p>}
        </form>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Lista</h2>
          <span className="chip muted">{rows.length}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Puesto</th>
              <th>Depto</th>
              <th>PIN</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td>{e.code}</td>
                <td>{e.name}</td>
                <td>{e.jobTitle || '—'}</td>
                <td>{e.department || '—'}</td>
                <td>{e.biometricPin || e.code}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function Contratos() {
  const [rows, setRows] = useState<Contract[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [structures, setStructures] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [form, setForm] = useState({
    employeeId: '',
    wage: '25000',
    structureId: '',
    name: 'Contrato',
    dateStart: new Date().toISOString().slice(0, 10),
  });

  const load = () => {
    api<Contract[]>('/api/payroll/contracts').then(setRows).catch(console.error);
    api<Employee[]>('/api/employees').then(setEmployees).catch(console.error);
    api<typeof structures>('/api/payroll/structures').then(setStructures).catch(console.error);
  };
  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await api('/api/payroll/contracts', {
      method: 'POST',
      body: JSON.stringify({
        ...form,
        wage: Number(form.wage),
        structureId: form.structureId || structures.find((s) => s.code === 'STD')?.id,
      }),
    });
    load();
  }

  return (
    <>
      <h1 className="page-title">Contratos</h1>
      <p className="lead">Salario base + estructura salarial (AFP/SFS). Requerido para generar nómina.</p>
      <section className="panel">
        <div className="panel-head">
          <h2>Nuevo contrato</h2>
        </div>
        <form className="composer" onSubmit={create}>
          <div className="row-actions">
            <div className="field">
              <label>Empleado</label>
              <select
                required
                value={form.employeeId}
                onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
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
              <label>Salario</label>
              <input
                type="number"
                value={form.wage}
                onChange={(e) => setForm({ ...form, wage: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label>Estructura</label>
              <select value={form.structureId} onChange={(e) => setForm({ ...form, structureId: e.target.value })}>
                <option value="">STD (default)</option>
                {structures.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Inicio</label>
              <input
                type="date"
                value={form.dateStart}
                onChange={(e) => setForm({ ...form, dateStart: e.target.value })}
              />
            </div>
          </div>
          <button className="btn primary" type="submit">
            Crear contrato
          </button>
        </form>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>Contratos abiertos</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Empleado</th>
              <th>Nombre</th>
              <th>Salario</th>
              <th>Estructura</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>{c.employee?.name}</td>
                <td>{c.name}</td>
                <td>{money(c.wage)}</td>
                <td>{c.structure?.code || '—'}</td>
                <td>
                  <span className={`chip ${stateChip(c.state)}`}>{c.state}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function Lotes() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Payslip | null>(null);
  const [dateStart, setDateStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [dateEnd, setDateEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = async () => {
    const r = await api<Run[]>('/api/payroll/runs');
    setRuns(r);
    const slips = await api<Payslip[]>(
      selected ? `/api/payroll/payslips?runId=${selected}` : '/api/payroll/payslips',
    );
    setPayslips(slips);
  };

  useEffect(() => {
    load().catch(console.error);
  }, [selected]);

  async function createRunAndGenerate() {
    setBusy(true);
    setMsg('');
    try {
      const d = await api<{ run: Run; payslips: Payslip[] }>('/api/payroll/runs', {
        method: 'POST',
        body: JSON.stringify({
          name: name || `Nómina ${dateStart} → ${dateEnd}`,
          dateStart,
          dateEnd,
        }),
      });
      setSelected(d.run.id);
      setMsg(`Lote creado · ${d.payslips.length} nómina(s) calculadas (asistencia + cuaderno)`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  async function generateOnRun(id: string) {
    setBusy(true);
    try {
      const d = await api<{ created: number }>(`/api/payroll/runs/${id}/generate`, { method: 'POST', body: '{}' });
      setMsg(`Generadas ${d.created} nómina(s) adicionales`);
      setSelected(id);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  async function closeRun(id: string) {
    await api(`/api/payroll/runs/${id}/close`, { method: 'POST', body: '{}' });
    setMsg('Lote cerrado · payslips confirmados');
    await load();
  }

  async function confirmSlip(id: string) {
    await api(`/api/payroll/payslips/${id}/confirm`, { method: 'POST', body: '{}' });
    await load();
  }

  async function markPaid(id: string) {
    await api(`/api/payroll/payslips/${id}/paid`, { method: 'POST', body: '{}' });
    await load();
  }

  async function openDetail(id: string) {
    setDetail(await api<Payslip>(`/api/payroll/payslips/${id}`));
  }

  const visible = useMemo(
    () => (selected ? payslips.filter((p) => p.run?.id === selected || true) : payslips),
    [payslips, selected],
  );

  return (
    <>
      <h1 className="page-title">Lotes de nómina</h1>
      <p className="lead">Como Nomina RENACE: crear lote → generar y calcular → confirmar → cerrar.</p>

      <div className="quick-steps">
        <div className="quick-title">Proceso rápido</div>
        <div className="row-actions" style={{ marginBottom: 0 }}>
          <div className="field">
            <label>Nombre lote</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nómina quincena…" />
          </div>
          <div className="field">
            <label>Desde</label>
            <input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
          </div>
          <div className="field">
            <label>Hasta</label>
            <input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
          </div>
          <button className="btn primary" type="button" disabled={busy} onClick={createRunAndGenerate}>
            Generar y calcular
          </button>
        </div>
        {msg && <p className="lead" style={{ margin: '0.75rem 0 0' }}>{msg}</p>}
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Lotes</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Periodo</th>
              <th>Estado</th>
              <th>Nóminas</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} style={{ background: selected === r.id ? '#eff6ff' : undefined }}>
                <td>
                  <button className="btn" type="button" onClick={() => setSelected(r.id)}>
                    {r.name}
                  </button>
                </td>
                <td>
                  {String(r.dateStart).slice(0, 10)} → {String(r.dateEnd).slice(0, 10)}
                </td>
                <td>
                  <span className={`chip ${stateChip(r.state)}`}>{r.state}</span>
                </td>
                <td>{r._count?.payslips ?? '—'}</td>
                <td>
                  <div className="quick-actions">
                    {r.state === 'draft' && (
                      <>
                        <button className="btn" type="button" disabled={busy} onClick={() => generateOnRun(r.id)}>
                          Generar nóminas
                        </button>
                        <button className="btn accent" type="button" onClick={() => closeRun(r.id)}>
                          Cerrar lote
                        </button>
                      </>
                    )}
                    <button className="btn" type="button" onClick={() => setSelected(r.id)}>
                      Ver nóminas
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Nóminas {selected ? 'del lote' : 'recientes'}</h2>
          {selected && (
            <button className="btn" type="button" onClick={() => setSelected(null)}>
              Ver todas
            </button>
          )}
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
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.id}>
                <td>{p.employee?.name || p.name}</td>
                <td>{p.workedDays}</td>
                <td>{p.overtimeHours}</td>
                <td>{money(p.gross)}</td>
                <td>{money(p.deductions)}</td>
                <td>
                  <strong>{money(p.net)}</strong>
                </td>
                <td>
                  <span className={`chip ${stateChip(p.state)}`}>{p.state}</span>
                </td>
                <td>
                  <div className="quick-actions">
                    <button className="btn" type="button" onClick={() => openDetail(p.id)}>
                      Detalle
                    </button>
                    {p.state === 'draft' && (
                      <button className="btn primary" type="button" onClick={() => confirmSlip(p.id)}>
                        Confirmar
                      </button>
                    )}
                    {p.state === 'done' && (
                      <button className="btn accent" type="button" onClick={() => markPaid(p.id)}>
                        Marcar pagada
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {detail && (
        <div className="modal-back" onClick={() => setDetail(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <header>
              <strong>{detail.employee?.name || detail.name}</strong>
              <button className="btn" type="button" onClick={() => setDetail(null)}>
                Cerrar
              </button>
            </header>
            <div className="body">
              <p className="lead" style={{ marginBottom: '0.75rem' }}>
                Neto {money(detail.net)} · Bruto {money(detail.gross)} · Deducciones {money(detail.deductions)}
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Concepto</th>
                    <th>Tipo</th>
                    <th>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.lines || []).map((l, i) => (
                    <tr key={`${l.code}-${i}`}>
                      <td>{l.code}</td>
                      <td>{l.name}</td>
                      <td>{l.category}</td>
                      <td>{money(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Cuaderno() {
  const [rows, setRows] = useState<Novelty[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [form, setForm] = useState({
    employeeId: '',
    type: 'falta',
    dateFrom: new Date().toISOString().slice(0, 10),
    dateTo: '',
    days: '1',
    reason: '',
    paid: false,
  });

  const load = () => {
    api<Novelty[]>('/api/novelties').then(setRows).catch(console.error);
    api<Employee[]>('/api/employees').then(setEmployees).catch(console.error);
  };
  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await api('/api/novelties', {
      method: 'POST',
      body: JSON.stringify({
        ...form,
        days: Number(form.days) || 1,
        dateTo: form.dateTo || undefined,
        paid: form.type === 'falta' ? false : form.paid,
      }),
    });
    setForm((f) => ({ ...f, reason: '' }));
    load();
  }

  return (
    <>
      <h1 className="page-title">Cuaderno de novedades</h1>
      <p className="lead">Faltas y licencias se descuentan al generar la nómina del periodo.</p>
      <section className="panel">
        <form className="composer" onSubmit={create}>
          <div className="row-actions">
            <div className="field">
              <label>Empleado</label>
              <select
                required
                value={form.employeeId}
                onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
              >
                <option value="">Seleccionar…</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
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
              <input type="date" value={form.dateFrom} onChange={(e) => setForm({ ...form, dateFrom: e.target.value })} />
            </div>
            <div className="field">
              <label>Hasta</label>
              <input type="date" value={form.dateTo} onChange={(e) => setForm({ ...form, dateTo: e.target.value })} />
            </div>
            <div className="field" style={{ maxWidth: 100 }}>
              <label>Días</label>
              <input value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>Motivo</label>
            <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>
          {(form.type === 'licencia' || form.type === 'permiso') && (
            <label style={{ display: 'flex', gap: 8, marginBottom: 12, color: 'var(--muted)' }}>
              <input
                type="checkbox"
                checked={form.paid}
                onChange={(e) => setForm({ ...form, paid: e.target.checked })}
              />
              Remunerada
            </label>
          )}
          <button className="btn primary" type="submit">
            Registrar novedad
          </button>
        </form>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>Registro</h2>
        </div>
        {rows.map((n) => (
          <div className="feed-item" key={n.id}>
            <div className="avatar">{initials(n.employee.name)}</div>
            <div>
              <div>
                {n.employee.name}{' '}
                <span className={`chip ${n.type === 'falta' ? 'danger' : 'warn'}`}>{n.type}</span>
              </div>
              <div className="meta">
                {String(n.dateFrom).slice(0, 10)} · {n.days} día(s) · {n.reason || '—'}
              </div>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}

function Terminales() {
  const [rows, setRows] = useState<Device[]>([]);
  const [form, setForm] = useState({
    name: 'Facial Entrada Principal',
    ipAddress: '',
    port: '80',
    username: 'admin',
    password: '',
  });
  const [msg, setMsg] = useState('');

  const load = () => api<Device[]>('/api/devices').then(setRows).catch(console.error);
  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await api('/api/devices', {
      method: 'POST',
      body: JSON.stringify({ ...form, port: Number(form.port) }),
    });
    load();
  }

  async function probe(id: string) {
    setMsg('Verificando conexión ISAPI…');
    try {
      await api(`/api/devices/${id}/probe`, { method: 'POST' });
      setMsg('Terminal online');
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Fallo');
    }
  }

  return (
    <>
      <h1 className="page-title">Terminales Hikvision</h1>
      <p className="lead">Copia la Push URL en HTTP Listening del DS-K1T321EFWX.</p>
      {msg && <p className="lead">{msg}</p>}
      <section className="panel">
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
            Registrar terminal
          </button>
        </form>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>Dispositivos</h2>
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
                  <span className={`chip ${stateChip(String(d.lastStatus))}`}>{String(d.lastStatus)}</span>
                </td>
                <td style={{ fontSize: '0.75rem', wordBreak: 'break-all', maxWidth: 280 }}>
                  {String(d.pushUrl || '')}
                </td>
                <td>
                  <button className="btn" type="button" onClick={() => probe(String(d.id))}>
                    Verificar conexión
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
        <Route path="/" element={<Inicio />} />
        <Route path="/asistencia" element={<Asistencia />} />
        <Route path="/empleados" element={<Empleados />} />
        <Route path="/contratos" element={<Contratos />} />
        <Route path="/lotes" element={<Lotes />} />
        <Route path="/cuaderno" element={<Cuaderno />} />
        <Route path="/terminales" element={<Terminales />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
