import { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowUpRight, Bell, Check, ChevronDown, CircleHelp, Database, FileSpreadsheet, FileText, LayoutDashboard, MoreHorizontal, Plus, Search, Settings, ShieldCheck, Sparkles, Table2, Trash2, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const API_URL = 'http://localhost:5000/api';

function App() {
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem('datalens-session') || 'null'); } catch { return null; }
  });
  const [authMode, setAuthMode] = useState('login');
  const [datasets, setDatasets] = useState([]);
  const [active, setActive] = useState(null);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [notice, setNotice] = useState('');
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [openingReport, setOpeningReport] = useState(false);
  const visibleDatasets = useMemo(() => datasets.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
    const days = dateFilter === '7' ? 7 : dateFilter === '30' ? 30 : 0;
    const isRecent = !days || !item.createdAt || Date.now() - new Date(item.createdAt).getTime() <= days * 24 * 60 * 60 * 1000;
    return matchesSearch && isRecent;
  }), [datasets, search, dateFilter]);
  const totalRows = datasets.reduce((sum, item) => sum + Number(item.rowCount || 0), 0);
  const activityRows = useMemo(() => makeActivityRows(datasets), [datasets]);

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
    setLoadingDatasets(true);
    fetch(`${API_URL}/datasets`, { headers: { Authorization: `Bearer ${session.token}` } })
      .then((response) => { if (!response.ok) throw new Error('API unavailable'); return response.json(); })
      .then((items) => {
        const formatted = items.map(formatDataset);
        setDatasets(formatted);
        setActive(formatted[0] || null);
      })
      .catch(() => setNotice('Could not load saved datasets. Check that the API and MongoDB are running.'))
      .finally(() => setLoadingDatasets(false));
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
    if (!window.confirm(`Delete “${item.name}” and its saved report?`)) return;
    try {
      const response = await fetch(`${API_URL}/datasets/${item.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${session.token}` } });
      if (!response.ok) throw new Error('Delete failed');
      const next = datasets.filter((dataset) => dataset.id !== item.id);
      setDatasets(next);
      if (active?.id === item.id) setActive(next[0] || null);
      setNotice(`${item.name} deleted.`);
    } catch { setNotice('Could not delete this dataset.'); }
  }

  async function selectDataset(item) {
    setActive(item);
    if (item.report?.preview?.length || !item.id) {
      document.getElementById('analysis-report')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    setOpeningReport(true);
    try {
      const response = await fetch(`${API_URL}/datasets/${item.id}`, { headers: { Authorization: `Bearer ${session.token}` } });
      if (!response.ok) throw new Error('Could not open report');
      const detail = formatDataset(await response.json());
      setDatasets((current) => current.map((dataset) => dataset.id === item.id ? detail : dataset));
      setActive(detail);
      setTimeout(() => document.getElementById('analysis-report')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch { setNotice('Could not open this report. Try again.'); }
    finally { setOpeningReport(false); }
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
          <div className="panel chart-panel"><div className="panel-heading"><div><div className="panel-title">Dataset activity</div><div className="panel-description">Rows in your latest saved datasets</div></div><div className="activity-total">{datasets.length} saved</div></div><div className="chart-legend"><span><i className="legend-dot revenue-dot" />Rows per dataset</span></div>{activityRows.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={activityRows} margin={{ top: 8, right: 2, left: -16, bottom: 0 }}><CartesianGrid vertical={false} stroke="#edf0f4" /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9ba3b1', fontSize: 9 }} dy={9} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#a5acb7', fontSize: 10 }} /><Tooltip cursor={{ fill: '#f7f8fb' }} contentStyle={{ border: '1px solid #eceef2', borderRadius: 10, fontSize: 12 }} /><Bar dataKey="rows" fill="#6558e8" radius={[4, 4, 0, 0]} maxBarSize={28} /></BarChart></ResponsiveContainer></div> : <div className="chart-empty">Upload a CSV to see activity here.</div>}</div>
          <QualityOverview datasets={datasets} />
        </section>
        <section className="panel datasets-panel"><div className="datasets-heading"><div><div className="panel-title">Your datasets <span className="table-count">{datasets.length}</span></div><div className="panel-description">Manage and explore your uploaded files</div></div><div className="table-actions"><div className="search-box"><Search size={15} /><input placeholder="Search datasets..." value={search} onChange={(event) => setSearch(event.target.value)} /></div><select className="filter-button" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} aria-label="Filter datasets by date"><option value="all">All time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select></div></div><div className="dataset-table"><div className="table-header"><span>NAME</span><span>ROWS</span><span>COLUMNS</span><span>LAST ANALYZED</span><span>STATUS</span><span /></div>{loadingDatasets ? <div className="table-state"><span className="loading-spinner" /> Loading your datasets…</div> : visibleDatasets.length ? visibleDatasets.map((item) => <DatasetRow key={item.id || item.name} item={item} isActive={active?.id === item.id} onSelect={() => selectDataset(item)} onRename={() => renameDataset(item)} onDelete={() => deleteDataset(item)} />) : <div className="empty-search">{search || dateFilter !== 'all' ? 'No datasets match these filters.' : 'No datasets yet. Upload a CSV to get started.'}</div>}</div><div className="table-footer"><span>Showing <b>{visibleDatasets.length}</b> of <b>{datasets.length}</b> datasets</span><button onClick={() => document.querySelector('input[type="file"]')?.click()}>Upload a dataset <ArrowUpRight size={14} /></button></div></section>
        {openingReport && <div className="report-loading">Loading saved report…</div>}
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
    createdAt: item.createdAt,
    type: 'CSV',
    color,
    report: item.report || (item.preview ? item : null),
  };
}

function makeActivityRows(datasets) {
  return [...datasets].slice(0, 8).reverse().map((item) => ({
    name: item.name.length > 12 ? `${item.name.slice(0, 10)}…` : item.name,
    rows: Number(item.rowCount || 0),
  }));
}

function QualityOverview({ datasets }) {
  const columns = datasets.flatMap((dataset) => dataset.report?.columns || []);
  const totalCells = columns.reduce((sum, column) => sum + Number(column.totalCount || 0), 0);
  const missingCells = columns.reduce((sum, column) => sum + Number(column.missingCount || 0), 0);
  const completeness = totalCells ? Math.round((1 - missingCells / totalCells) * 100) : 0;
  const duplicateRows = datasets.reduce((sum, dataset) => sum + Number(dataset.duplicateCount || 0), 0);
  const uniqueness = datasets.length ? Math.round((1 - duplicateRows / Math.max(datasets.reduce((sum, dataset) => sum + Number(dataset.rowCount || 0), 0), 1)) * 100) : 0;
  const quality = Math.round((completeness + uniqueness) / (datasets.length ? 2 : 1));
  return <div className="panel quality-panel"><div className="panel-heading"><div><div className="panel-title">Data quality overview</div><div className="panel-description">Calculated from saved reports</div></div><div className="activity-total">{datasets.length} datasets</div></div><div className="quality-score"><div className="score-ring" style={{ background: `conic-gradient(#6759e9 0 ${quality}%,#eeedf8 ${quality}% 100%)` }}><div><strong>{datasets.length ? quality : '—'}</strong><small>/ 100</small></div></div><div className="score-copy"><b>{datasets.length ? quality > 85 ? 'Looking good!' : 'Room to improve' : 'No reports yet'}</b><span>{datasets.length ? 'Based on completeness and duplicates' : 'Upload a CSV to get started'}</span></div></div><div className="quality-list"><QualityRow label="Completeness" value={`${completeness}%`} percent={`${completeness}%`} color="purple" /><QualityRow label="Uniqueness" value={`${uniqueness}%`} percent={`${uniqueness}%`} color="blue" /><QualityRow label="Reports saved" value={String(datasets.length)} percent={`${Math.min(datasets.length * 12, 100)}%`} color="orange" /></div><div className="quality-footer"><span><Check size={14} /> Based on your actual data</span></div></div>;
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
  const numericColumns = columns.filter((column) => column.type === 'numeric');
  const categoricalColumns = columns.filter((column) => column.type === 'categorical');
  const missingData = columns.map((column) => ({ name: shortName(column.name), missing: column.missingCount || 0 })).filter((column) => column.missing > 0);
  return <section id="analysis-report" className="panel report-panel"><div className="datasets-heading"><div><div className="panel-title">Analysis report</div><div className="panel-description">{dataset.name} · {Number(dataset.rowCount || 0).toLocaleString()} rows · {dataset.columnCount} columns · {report.duplicateCount || 0} duplicate rows</div></div><span className="report-badge"><Check size={13} /> Saved report</span></div><div className="report-columns">{columns.map((column) => <div className="report-column" key={column.name}><div className="report-column-heading"><b>{column.name}</b><span>{column.type}</span></div><div className="report-column-meta">{column.missingCount} missing · {column.type === 'numeric' ? `mean ${column.mean}, median ${column.median}` : `${column.uniqueCount} unique values`}</div>{column.type === 'numeric' && <div className="report-column-range">Range {column.min} – {column.max} <span>SD {column.standardDeviation}</span></div>}</div>)}</div><div className="visualization-grid">{numericColumns.map((column) => <NumericHistogram key={column.name} column={column} rows={preview} />)}{categoricalColumns.slice(0, 3).map((column) => <CategoryChart key={column.name} column={column} rows={preview} />)}{missingData.length > 0 && <MissingChart data={missingData} />}{numericColumns.length > 1 && <CorrelationHeatmap columns={numericColumns} rows={preview} />}</div>{preview.length > 0 && <div className="preview-wrap"><div className="preview-title">First rows</div><div className="preview-table-wrap"><table className="preview-table"><thead><tr>{Object.keys(preview[0]).map((name) => <th key={name}>{name}</th>)}</tr></thead><tbody>{preview.map((row, index) => <tr key={index}>{Object.values(row).map((value, cellIndex) => <td key={cellIndex}>{value === '' ? <span className="missing-value">Missing</span> : String(value)}</td>)}</tr>)}</tbody></table></div></div>}</section>;
}

function StatCard({ label, value, note, icon, tone, trend }) { return <div className="stat-card"><div className="stat-top"><div className={`stat-icon ${tone}`}>{icon}</div><span className="stat-trend"><ArrowUpRight size={13} />{trend}</span></div><div className="stat-value">{value}</div><div className="stat-label">{label}</div><div className="stat-note">{note}</div></div>; }
function QualityRow({ label, value, percent, color }) { return <div className="quality-row"><div><span>{label}</span><b>{value}</b></div><div className="progress-track"><i className={color} style={{ width: percent }} /></div></div>; }
function NumericHistogram({ column, rows }) {
  const values = rows.map((row) => Number(row[column.name])).filter(Number.isFinite);
  const bins = makeHistogram(values);
  return <div className="visual-card"><div className="visual-heading"><b>{column.name}</b><span>Numeric distribution</span></div>{bins.length ? <ResponsiveContainer width="100%" height={155}><BarChart data={bins} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}><CartesianGrid vertical={false} stroke="#edf0f4" /><XAxis dataKey="range" axisLine={false} tickLine={false} tick={{ fill: '#9298a4', fontSize: 8 }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#a5acb7', fontSize: 8 }} /><Tooltip contentStyle={{ border: '1px solid #eceef2', borderRadius: 8, fontSize: 10 }} /><Bar dataKey="count" fill="#695ce8" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer> : <div className="visual-empty">Preview does not contain numeric values for this column.</div>}</div>;
}

function CategoryChart({ column, rows }) {
  const counts = {};
  rows.forEach((row) => { const value = String(row[column.name] ?? '').trim(); if (value) counts[value] = (counts[value] || 0) + 1; });
  const data = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, count]) => ({ name: name.length > 13 ? `${name.slice(0, 12)}…` : name, count }));
  return <div className="visual-card"><div className="visual-heading"><b>{column.name}</b><span>Top categories</span></div>{data.length ? <ResponsiveContainer width="100%" height={155}><BarChart data={data} layout="vertical" margin={{ top: 2, right: 8, left: 4, bottom: 0 }}><CartesianGrid horizontal={false} stroke="#edf0f4" /><XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#a5acb7', fontSize: 8 }} /><YAxis type="category" dataKey="name" width={70} axisLine={false} tickLine={false} tick={{ fill: '#9298a4', fontSize: 8 }} /><Tooltip contentStyle={{ border: '1px solid #eceef2', borderRadius: 8, fontSize: 10 }} /><Bar dataKey="count" fill="#7bbca2" radius={[0, 3, 3, 0]} /></BarChart></ResponsiveContainer> : <div className="visual-empty">Preview does not contain category values for this column.</div>}</div>;
}

function MissingChart({ data }) {
  return <div className="visual-card"><div className="visual-heading"><b>Missing values</b><span>Rows missing per column</span></div><ResponsiveContainer width="100%" height={155}><BarChart data={data} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}><CartesianGrid vertical={false} stroke="#edf0f4" /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9298a4', fontSize: 8 }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#a5acb7', fontSize: 8 }} /><Tooltip contentStyle={{ border: '1px solid #eceef2', borderRadius: 8, fontSize: 10 }} /><Bar dataKey="missing" fill="#e6a365" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div>;
}

function CorrelationHeatmap({ columns, rows }) {
  const values = columns.slice(0, 6);
  return <div className="visual-card"><div className="visual-heading"><b>Correlation heatmap</b><span>From the saved preview</span></div><div className="heatmap-wrap"><table className="heatmap"><thead><tr><th /><th>{values.map((column) => <span key={column.name} title={column.name}>{shortName(column.name)}</span>)}</th></tr></thead><tbody>{values.map((rowColumn) => <tr key={rowColumn.name}><th title={rowColumn.name}>{shortName(rowColumn.name)}</th>{values.map((column) => {
    const correlation = calculateCorrelation(rows, rowColumn.name, column.name);
    const strength = Math.abs(correlation);
    const background = correlation >= 0 ? `rgba(104, 91, 225, ${0.08 + strength * 0.75})` : `rgba(224, 137, 108, ${0.08 + strength * 0.75})`;
    return <td key={column.name} style={{ background }} title={`${rowColumn.name} / ${column.name}: ${correlation.toFixed(2)}`}>{Number.isFinite(correlation) ? correlation.toFixed(2) : '—'}</td>;
  })}</tr>)}</tbody></table></div></div>;
}

function makeHistogram(values) {
  if (!values.length) return [];
  const low = Math.min(...values);
  const high = Math.max(...values);
  if (low === high) return [{ range: String(low), count: values.length }];
  const binCount = Math.min(8, Math.max(4, Math.ceil(Math.sqrt(values.length))));
  const size = (high - low) / binCount;
  const bins = Array.from({ length: binCount }, (_, index) => ({
    range: `${roundNumber(low + index * size)}–${roundNumber(index === binCount - 1 ? high : low + (index + 1) * size)}`,
    count: 0,
  }));
  values.forEach((value) => { const index = Math.min(binCount - 1, Math.floor((value - low) / size)); bins[index].count += 1; });
  return bins;
}

function calculateCorrelation(rows, firstName, secondName) {
  const pairs = rows.map((row) => [Number(row[firstName]), Number(row[secondName])]).filter(([first, second]) => Number.isFinite(first) && Number.isFinite(second));
  if (pairs.length < 2) return NaN;
  const firstMean = pairs.reduce((sum, pair) => sum + pair[0], 0) / pairs.length;
  const secondMean = pairs.reduce((sum, pair) => sum + pair[1], 0) / pairs.length;
  const numerator = pairs.reduce((sum, pair) => sum + (pair[0] - firstMean) * (pair[1] - secondMean), 0);
  const firstSpread = Math.sqrt(pairs.reduce((sum, pair) => sum + (pair[0] - firstMean) ** 2, 0));
  const secondSpread = Math.sqrt(pairs.reduce((sum, pair) => sum + (pair[1] - secondMean) ** 2, 0));
  return firstSpread && secondSpread ? numerator / (firstSpread * secondSpread) : NaN;
}

function shortName(name) { return name.length > 8 ? `${name.slice(0, 7)}…` : name; }
function roundNumber(number) { return Math.round(number * 100) / 100; }
function DatasetRow({ item, isActive, onSelect, onRename, onDelete }) { return <div className={`dataset-row ${isActive ? 'selected' : ''}`} onClick={onSelect}><div className="dataset-name"><div className={`file-icon ${item.color}`}><FileSpreadsheet size={17} /></div><div><b>{item.name}</b><small>CSV file · saved report</small></div></div><span className="cell-muted">{item.rows}</span><span className="cell-muted">{item.columnsCount}</span><span className="cell-muted">{item.date}</span><span><i className="ready-dot" />Ready</span><div className="row-buttons"><button className="row-menu" title="Rename dataset" onClick={(event) => { event.stopPropagation(); onRename(); }}><FileText size={14} /></button><button className="row-menu" title="Delete dataset" onClick={(event) => { event.stopPropagation(); onDelete(); }}><Trash2 size={15} /></button></div></div>; }

export default App;
