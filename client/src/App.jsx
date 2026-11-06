import { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowDown, ArrowUpRight, BarChart3, Bell, Check, ChevronDown, CircleHelp, CloudUpload, Database, FileSpreadsheet, FileText, LayoutDashboard, MoreHorizontal, Plus, Search, Settings, ShieldCheck, Sparkles, Table2, Trash2, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const API_URL = 'http://localhost:5000/api';

const sampleRows = [
  { date: 'Jan', revenue: 28, orders: 18 }, { date: 'Feb', revenue: 36, orders: 23 },
  { date: 'Mar', revenue: 31, orders: 20 }, { date: 'Apr', revenue: 48, orders: 29 },
  { date: 'May', revenue: 42, orders: 27 }, { date: 'Jun', revenue: 59, orders: 35 },
  { date: 'Jul', revenue: 52, orders: 31 }, { date: 'Aug', revenue: 72, orders: 42 },
  { date: 'Sep', revenue: 65, orders: 37 }, { date: 'Oct', revenue: 83, orders: 48 },
  { date: 'Nov', revenue: 76, orders: 43 }, { date: 'Dec', revenue: 94, orders: 55 },
];
function App() {
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem('datalens-session') || 'null'); } catch { return null; }
  });
  const [authMode, setAuthMode] = useState('login');
  const [datasets, setDatasets] = useState([]);
  const [active, setActive] = useState(null);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [uploading, setUploading] = useState(false);
  const visibleDatasets = useMemo(() => datasets.filter((item) => item.name.toLowerCase().includes(search.toLowerCase())), [datasets, search]);
  const totalRows = datasets.reduce((sum, item) => sum + Number(item.rowCount || 0), 0);

  function saveSession(nextSession) {
    localStorage.setItem('datalens-session', JSON.stringify(nextSession));
    setSession(nextSession);
    setNotice('');
  }

  function signOut() {
    localStorage.removeItem('datalens-session');
    setSession(null);
    setDatasets([]);
    setActive(null);
  }

  useEffect(() => {
    if (!session?.token) return;
    fetch(`${API_URL}/datasets`, { headers: { Authorization: `Bearer ${session.token}` } })
      .then((response) => { if (!response.ok) throw new Error('API unavailable'); return response.json(); })
      .then((items) => {
        const formatted = items.map(formatDataset);
        setDatasets(formatted);
        setActive(formatted[0] || null);
      })
      .catch(() => setNotice('Start the API and MongoDB to load saved datasets.'));
  }, [session?.token]);

  async function uploadFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) { setNotice('Please choose a CSV file.'); return; }
    setUploading(true);
    const form = new FormData();
    form.append('file', file);
    try {
      const response = await fetch(`${API_URL}/datasets/analyze`, { method: 'POST', headers: { Authorization: `Bearer ${session.token}` }, body: form });
      if (!response.ok) throw new Error('API unavailable');
      const report = await response.json();
      if (!report.id) {
        setNotice('CSV analyzed, but not saved. Start MongoDB and set MONGODB_URI to save reports.');
        setUploading(false);
        return;
      }
      const item = formatDataset(report);
      setDatasets((current) => [item, ...current]);
      setActive(item);
      setNotice(`${file.name} analyzed successfully.`);
    } catch {
      setNotice('Could not reach the API. Start the server with npm run dev, then upload again.');
    } finally { setUploading(false); }
  }

  async function deleteDataset(item) {
    if (!item.id) return;
    try {
      const response = await fetch(`${API_URL}/datasets/${item.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${session.token}` } });
      if (!response.ok) throw new Error('Delete failed');
      const next = datasets.filter((dataset) => dataset.id !== item.id);
      setDatasets(next);
      if (active?.id === item.id) setActive(next[0] || null);
      setNotice(`${item.name} deleted.`);
    } catch { setNotice('Could not delete this dataset.'); }
  }

  async function renameDataset(item) {
    const name = window.prompt('Enter a new dataset name', item.name);
    if (!name || !name.trim() || name.trim() === item.name) return;
    try {
      const response = await fetch(`${API_URL}/datasets/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` }, body: JSON.stringify({ name: name.trim() }),
      });
      if (!response.ok) throw new Error('Rename failed');
      const updated = formatDataset(await response.json());
      setDatasets((current) => current.map((dataset) => dataset.id === item.id ? updated : dataset));
      if (active?.id === item.id) setActive(updated);
      setNotice('Dataset renamed.');
    } catch { setNotice('Could not rename this dataset.'); }
  }

  if (!session?.token) return <AuthScreen mode={authMode} setMode={setAuthMode} onSuccess={saveSession} />;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Activity size={18} strokeWidth={2.8} /></div><span>data<span className="brand-light">lens</span></span><span className="brand-beta">BETA</span></div>
      <div className="workspace-switch"><div className="workspace-avatar">{session.user.name.slice(0, 1).toUpperCase()}</div><div className="workspace-copy"><b>{session.user.name}'s workspace</b><span>Free plan</span></div><ChevronDown size={15} /></div>
      <div className="nav-caption">WORKSPACE</div>
      <nav className="main-nav"><a className="nav-item active"><LayoutDashboard size={17} />Overview</a><a className="nav-item"><Database size={17} />My datasets<span className="nav-count">{datasets.length}</span></a><a className="nav-item"><FileText size={17} />Reports</a></nav>
      <div className="side-divider" /><div className="nav-caption">PREFERENCES</div>
      <nav className="main-nav"><a className="nav-item"><Settings size={17} />Settings</a><a className="nav-item"><CircleHelp size={17} />Help center</a></nav>
      <div className="sidebar-bottom"><div className="upgrade-card"><div className="upgrade-icon"><Sparkles size={15} /></div><b>Make more of your data</b><p>Upgrade your plan for unlimited datasets and more.</p><button className="upgrade-button">Explore plans <ArrowUpRight size={14} /></button></div><button className="profile profile-button" onClick={signOut}><div className="profile-avatar">{session.user.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</div><div className="profile-copy"><b>{session.user.name}</b><span>{session.user.email}</span></div><span className="signout-label">Sign out</span></button></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <b>Overview</b></div><div className="top-actions"><div className="status-pill"><span /> All systems operational</div><button className="icon-button"><Bell size={18} /><i /></button><div className="top-avatar">{session.user.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</div></div></header>
      <div className="content">
        <section className="welcome-row"><div><div className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase()}</div><h1>Good morning, {session.user.name.split(' ')[0]} <span className="wave">✳</span></h1><p className="subheading">Here's what's happening with your data today.</p></div><label className={`primary-button ${uploading ? 'is-loading' : ''}`}><Plus size={17} />{uploading ? 'Analyzing…' : 'Upload dataset'}<input type="file" accept=".csv,text/csv" onChange={uploadFile} /></label></section>
        {notice && <div className="notice"><Check size={15} />{notice}<button onClick={() => setNotice('')}><X size={15} /></button></div>}
        <section className="stats-grid">
          <StatCard label="Total datasets" value={String(datasets.length).padStart(2, '0')} note="Saved in your workspace" icon={<Database size={17} />} tone="violet" trend="Saved reports" />
          <StatCard label="Rows analyzed" value={totalRows.toLocaleString()} note="Across saved datasets" icon={<Table2 size={17} />} tone="blue" trend="All time" />
          <StatCard label="Reports generated" value={String(datasets.length)} note="Ready to revisit" icon={<FileText size={17} />} tone="orange" trend="Saved reports" />
          <StatCard label="Data quality" value={datasets.length ? `${Math.round(datasets.reduce((sum, item) => sum + (item.report?.columns?.length ? item.report.columns.reduce((colSum, col) => colSum + (1 - col.missingCount / Math.max(item.rowCount, 1)), 0) / item.report.columns.length : 1), 0) / datasets.length * 100)}%` : '—'} note="Average completeness" icon={<ShieldCheck size={17} />} tone="green" trend="From reports" />
        </section>
        <section className="middle-grid">
          <div className="panel chart-panel"><div className="panel-heading"><div><div className="panel-title">Dataset activity</div><div className="panel-description">Rows analyzed over the last 12 months</div></div><button className="select-button">This year <ChevronDown size={14} /></button></div><div className="chart-legend"><span><i className="legend-dot revenue-dot" />Rows analyzed</span><span><i className="legend-dot orders-dot" />Datasets</span></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={sampleRows} margin={{ top: 8, right: 2, left: -16, bottom: 0 }} barGap={5}><CartesianGrid vertical={false} stroke="#edf0f4" /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#9ba3b1', fontSize: 11 }} dy={9} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#a5acb7', fontSize: 10 }} ticks={[0, 25, 50, 75, 100]} /><Tooltip cursor={{ fill: '#f7f8fb' }} contentStyle={{ border: '1px solid #eceef2', borderRadius: 10, fontSize: 12 }} /><Bar dataKey="revenue" fill="#6558e8" radius={[4, 4, 0, 0]} maxBarSize={16} /><Bar dataKey="orders" fill="#c9c3fb" radius={[4, 4, 0, 0]} maxBarSize={16} /></BarChart></ResponsiveContainer></div></div>
          <div className="panel quality-panel"><div className="panel-heading"><div><div className="panel-title">Data quality overview</div><div className="panel-description">Average across your datasets</div></div><button className="dots-button"><MoreHorizontal size={18} /></button></div><div className="quality-score"><div className="score-ring"><div><strong>94</strong><small>/ 100</small></div></div><div className="score-copy"><b>Looking good!</b><span>Your data is in great shape</span><div className="score-change"><ArrowUpRight size={13} /> 2.1% this month</div></div></div><div className="quality-list"><QualityRow label="Completeness" value="96.8%" percent="96.8%" color="purple" /><QualityRow label="Uniqueness" value="91.4%" percent="91.4%" color="blue" /><QualityRow label="Consistency" value="94.5%" percent="94.5%" color="orange" /></div><div className="quality-footer"><span><Check size={14} /> No critical issues found</span><ArrowUpRight size={15} /></div></div>
        </section>
        <section className="panel datasets-panel"><div className="datasets-heading"><div><div className="panel-title">Your datasets <span className="table-count">{datasets.length}</span></div><div className="panel-description">Manage and explore your uploaded files</div></div><div className="table-actions"><div className="search-box"><Search size={15} /><input placeholder="Search datasets..." value={search} onChange={(event) => setSearch(event.target.value)} /></div><button className="filter-button">Last 30 days <ChevronDown size={14} /></button></div></div><div className="dataset-table"><div className="table-header"><span>NAME</span><span>ROWS</span><span>COLUMNS</span><span>LAST ANALYZED</span><span>STATUS</span><span /></div>{visibleDatasets.length ? visibleDatasets.map((item) => <DatasetRow key={item.id || item.name} item={item} isActive={active?.id === item.id} onSelect={() => setActive(item)} onRename={() => renameDataset(item)} onDelete={() => deleteDataset(item)} />) : <div className="empty-search">{search ? `No datasets match “${search}”` : 'No datasets yet. Upload a CSV to get started.'}</div>}</div><div className="table-footer"><span>Showing <b>{visibleDatasets.length}</b> of <b>{datasets.length}</b> datasets</span><button onClick={() => document.querySelector('input[type="file"]')?.click()}>Upload a dataset <ArrowUpRight size={14} /></button></div></section>
        {active?.report && <ReportPanel dataset={active} />}
        <footer className="page-footer"><span>© 2024 DataLens, Inc.</span><span><a>Privacy</a><a>Terms</a><a>Status <i className="footer-status" /></a></span><span>Made for curious minds <span className="heart">♥</span></span></footer>
      </div>
    </main>
  </div>;
}

function formatDataset(item) {
  const color = ['mint', 'lavender', 'peach'][Math.abs((item.name || '').length) % 3];
  return {
    ...item,
    name: item.name || item.fileName || 'Untitled dataset',
    rows: Number(item.rowCount || 0).toLocaleString(),
    columnsCount: String(item.columnCount || 0),
    date: item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'Just now',
    type: 'CSV',
    color,
    report: item.report || item,
  };
}

function AuthScreen({ mode, setMode, onSuccess }) {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const isRegister = mode === 'register';

  async function submit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/${mode}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Could not sign in.');
      onSuccess(result);
    } catch (requestError) {
      setError(requestError.message === 'Failed to fetch' ? 'Could not connect to the API. Start the server and MongoDB, then try again.' : requestError.message);
    } finally { setLoading(false); }
  }

  return <main className="auth-page"><div className="auth-card"><div className="brand auth-brand"><div className="brand-mark"><Activity size={18} strokeWidth={2.8} /></div><span>data<span className="brand-light">lens</span></span><span className="brand-beta">BETA</span></div><div className="auth-intro"><div className="eyebrow">YOUR DATA, MADE CLEAR</div><h1>{isRegister ? 'Create your account' : 'Welcome back'}</h1><p>{isRegister ? 'Start exploring your datasets in a few clicks.' : 'Sign in to continue to your workspace.'}</p></div><form className="auth-form" onSubmit={submit}>{isRegister && <label>Your name<input autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Jawad Khan" required /></label>}<label>Email address<input type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="you@example.com" required /></label><label>Password<input type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} minLength={isRegister ? 8 : undefined} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder={isRegister ? 'At least 8 characters' : 'Enter your password'} required /></label>{error && <div className="auth-error">{error}</div>}<button className="auth-submit" disabled={loading}>{loading ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}<ArrowUpRight size={15} /></button></form><div className="auth-switch">{isRegister ? 'Already have an account?' : 'New to DataLens?'} <button onClick={() => { setError(''); setMode(isRegister ? 'login' : 'register'); }}>{isRegister ? 'Sign in' : 'Create an account'}</button></div><div className="auth-note"><ShieldCheck size={14} /> Your datasets are private to your account</div></div></main>;
}

function ReportPanel({ dataset }) {
  const report = dataset.report;
  const columns = report.columns || [];
  const preview = report.preview || [];
  return <section className="panel report-panel"><div className="datasets-heading"><div><div className="panel-title">Analysis report</div><div className="panel-description">{dataset.name} · {Number(dataset.rowCount || 0).toLocaleString()} rows · {dataset.columnCount} columns · {report.duplicateCount || 0} duplicate rows</div></div><span className="report-badge"><Check size={13} /> Saved report</span></div><div className="report-columns">{columns.map((column) => <div className="report-column" key={column.name}><div className="report-column-heading"><b>{column.name}</b><span>{column.type}</span></div><div className="report-column-meta">{column.missingCount} missing · {column.type === 'numeric' ? `mean ${column.mean}, median ${column.median}` : `${column.uniqueCount} unique values`}</div>{column.type === 'numeric' && <div className="report-column-range">Range {column.min} – {column.max} <span>SD {column.standardDeviation}</span></div>}</div>)}</div>{preview.length > 0 && <div className="preview-wrap"><div className="preview-title">First rows</div><div className="preview-table-wrap"><table className="preview-table"><thead><tr>{Object.keys(preview[0]).map((name) => <th key={name}>{name}</th>)}</tr></thead><tbody>{preview.map((row, index) => <tr key={index}>{Object.values(row).map((value, cellIndex) => <td key={cellIndex}>{value === '' ? <span className="missing-value">Missing</span> : String(value)}</td>)}</tr>)}</tbody></table></div></div>}</section>;
}

function StatCard({ label, value, note, icon, tone, trend }) { return <div className="stat-card"><div className="stat-top"><div className={`stat-icon ${tone}`}>{icon}</div><span className="stat-trend"><ArrowUpRight size={13} />{trend}</span></div><div className="stat-value">{value}</div><div className="stat-label">{label}</div><div className="stat-note">{note}</div></div>; }
function QualityRow({ label, value, percent, color }) { return <div className="quality-row"><div><span>{label}</span><b>{value}</b></div><div className="progress-track"><i className={color} style={{ width: percent }} /></div></div>; }
function DatasetRow({ item, isActive, onSelect, onRename, onDelete }) { return <div className={`dataset-row ${isActive ? 'selected' : ''}`} onClick={onSelect}><div className="dataset-name"><div className={`file-icon ${item.color}`}><FileSpreadsheet size={17} /></div><div><b>{item.name}</b><small>CSV file · saved report</small></div></div><span className="cell-muted">{item.rows}</span><span className="cell-muted">{item.columnsCount}</span><span className="cell-muted">{item.date}</span><span><i className="ready-dot" />Ready</span><div className="row-buttons"><button className="row-menu" title="Rename dataset" onClick={(event) => { event.stopPropagation(); onRename(); }}><FileText size={14} /></button><button className="row-menu" title="Delete dataset" onClick={(event) => { event.stopPropagation(); onDelete(); }}><Trash2 size={15} /></button></div></div>; }

export default App;
