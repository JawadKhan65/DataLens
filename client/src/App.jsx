import { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowUpRight, Bell, Check, ChevronDown, CircleHelp, Database, Download, Eye, EyeOff, FileSpreadsheet, FileText, LayoutDashboard, MoreHorizontal, Plus, Search, Settings, ShieldCheck, Sparkles, Table2, Trash2, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

function App() {
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem('datalens-session') || 'null'); } catch { return null; }
  });
  const [authMode, setAuthMode] = useState('login');
  const [activeView, setActiveView] = useState('overview');
  const [datasets, setDatasets] = useState([]);
  const [totalDatasets, setTotalDatasets] = useState(0);
  const [matchingDatasets, setMatchingDatasets] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [datasetPage, setDatasetPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [active, setActive] = useState(null);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [notice, setNotice] = useState('');
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [openingReport, setOpeningReport] = useState(false);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [savingAction, setSavingAction] = useState(false);
  const visibleDatasets = datasets;
  const activityRows = useMemo(() => makeActivityRows(datasets), [datasets]);

  function saveSession(nextSession) {
    localStorage.setItem('datalens-session', JSON.stringify(nextSession));
    setDatasets([]);
    setActive(null);
    setTotalDatasets(0);
    setTotalRows(0);
    setSession(nextSession);
    setNotice('');
  }

  function signOut() {
    localStorage.removeItem('datalens-session');
    setSession(null);
    setDatasets([]);
    setActive(null);
    setTotalDatasets(0);
    setTotalRows(0);
  }

  function navigateTo(view) {
    setActiveView(view);
    setSearch('');
    setDateFilter('all');
    setDatasetPage(1);
  }

  async function apiRequest(path, options = {}) {
    const headers = { ...options.headers };
    if (session?.token) headers.Authorization = `Bearer ${session.token}`;
    const response = await fetch(`${API_URL}${path}`, { ...options, headers });
    if (response.status === 401) { signOut(); throw new Error('SESSION_EXPIRED'); }
    return response;
  }

  useEffect(() => {
    if (!session?.token) return;
    const controller = new AbortController();
    setLoadingDatasets(true);
    const params = new URLSearchParams({ page: String(datasetPage), limit: '8', search, days: dateFilter });
    apiRequest(`/datasets?${params}`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error('API unavailable'); return response.json(); })
      .then((result) => {
        const formatted = result.items.map(formatDataset);
        setDatasets(formatted);
        setTotalDatasets(result.totalDatasets);
        setMatchingDatasets(result.total);
        setTotalRows(result.totalRows);
        setPageCount(result.pageCount);
        setActive((current) => formatted.find((item) => item.id === current?.id) || formatted[0] || null);
      })
      .catch((error) => { if (error.name !== 'AbortError') setNotice(error.message === 'SESSION_EXPIRED' ? 'Your session expired. Sign in again to continue.' : 'Could not load saved datasets. Check that the API and MongoDB are running.'); })
      .finally(() => { if (!controller.signal.aborted) setLoadingDatasets(false); });
    return () => controller.abort();
  }, [session?.token, datasetPage, search, dateFilter]);

  async function uploadFile(event) {
    const file = event?.target ? event.target.files?.[0] : event;
    if (event?.target) event.target.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) { setNotice('Please choose a CSV file.'); return; }
    if (file.size > 10 * 1024 * 1024) { setNotice('This CSV is larger than the 10 MB upload limit.'); return; }
    setUploading(true);
    const form = new FormData();
    form.append('file', file);
    try {
      const response = await apiRequest('/datasets/analyze', { method: 'POST', body: form });
      const report = await response.json();
      if (!response.ok) throw new Error(report.message || 'Upload failed.');
      if (!report.id) {
        setNotice('CSV analyzed, but not saved. Start MongoDB and set MONGODB_URI to save reports.');
        setUploading(false);
        return;
      }
      const item = formatDataset(report);
      setDatasets((current) => [item, ...current].slice(0, 8));
      setTotalDatasets((current) => current + 1);
      setTotalRows((current) => current + Number(item.rowCount || 0));
      setPageCount((current) => Math.max(current, Math.ceil((totalDatasets + 1) / 8)));
      setSearch('');
      setDateFilter('all');
      setDatasetPage(1);
      setActive(item);
      setNotice(`${file.name} analyzed successfully.`);
    } catch (error) {
      setNotice(error.message === 'SESSION_EXPIRED' ? 'Your session expired. Sign in again to continue.' : error.message === 'Failed to fetch' ? 'Could not reach the API. Start the server with npm run dev, then upload again.' : error.message);
    } finally { setUploading(false); }
  }

  function uploadSampleDataset() {
    const sampleCsv = [
      'product,category,units,unit_price,region',
      'Notebook,Stationery,18,4.5,North',
      'Desk Lamp,Home,7,22.99,South',
      'Water Bottle,Outdoors,12,15.5,East',
      'Pen Set,Stationery,25,6.25,West',
      'Canvas Tote,Accessories,9,12.0,North',
      'Notebook,Stationery,14,4.5,East',
      'Desk Lamp,Home,,22.99,West',
      'Water Bottle,Outdoors,8,,South',
      'Plant Pot,Home,11,9.75,North',
      'Pen Set,Stationery,20,6.25,South',
    ].join('\n');
    uploadFile(new File([sampleCsv], 'sample-store-sales.csv', { type: 'text/csv' }));
  }
  async function deleteDataset(item) {
    if (!item.id) return;
    setSavingAction(true);
    try {
      const response = await apiRequest(`/datasets/${item.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Delete failed');
      const next = datasets.filter((dataset) => dataset.id !== item.id);
      setDatasets(next);
      setTotalDatasets((current) => Math.max(0, current - 1));
      setTotalRows((current) => Math.max(0, current - Number(item.rowCount || 0)));
      setPageCount(Math.max(1, Math.ceil((totalDatasets - 1) / 8)));
      if (next.length === 0 && datasetPage > 1) setDatasetPage((current) => current - 1);
      if (active?.id === item.id) setActive(next[0] || null);
      setNotice(`${item.name} deleted.`);
      setDeleteTarget(null);
    } catch (error) { setNotice(error.message === 'SESSION_EXPIRED' ? 'Your session expired. Sign in again to continue.' : 'Could not delete this dataset.'); }
    finally { setSavingAction(false); }
  }

  async function selectDataset(item) {
    setActive(item);
    if (item.report?.preview?.length || !item.id) {
      document.getElementById('analysis-report')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    setOpeningReport(true);
    try {
      const response = await apiRequest(`/datasets/${item.id}`);
      if (!response.ok) throw new Error('Could not open report');
      const detail = formatDataset(await response.json());
      setDatasets((current) => current.map((dataset) => dataset.id === item.id ? detail : dataset));
      setActive(detail);
      setTimeout(() => document.getElementById('analysis-report')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (error) { setNotice(error.message === 'SESSION_EXPIRED' ? 'Your session expired. Sign in again to continue.' : 'Could not open this report. Try again.'); }
    finally { setOpeningReport(false); }
  }

  async function renameDataset(item) {
    const name = renameValue;
    if (!name || !name.trim() || name.trim() === item.name) return;
    setSavingAction(true);
    try {
      const response = await apiRequest(`/datasets/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }),
      });
      if (!response.ok) throw new Error('Rename failed');
      const updated = formatDataset(await response.json());
      setDatasets((current) => current.map((dataset) => dataset.id === item.id ? updated : dataset));
      if (active?.id === item.id) setActive(updated);
      setNotice('Dataset renamed.');
      setRenameTarget(null);
    } catch (error) { setNotice(error.message === 'SESSION_EXPIRED' ? 'Your session expired. Sign in again to continue.' : 'Could not rename this dataset.'); }
    finally { setSavingAction(false); }
  }

  if (!session?.token) return <AuthScreen mode={authMode} setMode={setAuthMode} onSuccess={saveSession} notice={notice} />;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Activity size={18} strokeWidth={2.8} /></div><span>data<span className="brand-light">lens</span></span><span className="brand-beta">BETA</span></div>
      <div className="workspace-switch"><div className="workspace-avatar">{session.user.name.slice(0, 1).toUpperCase()}</div><div className="workspace-copy"><b>{session.user.name}'s workspace</b><span>Free plan</span></div><ChevronDown size={15} /></div>
      <div className="nav-caption">WORKSPACE</div>
      <nav className="main-nav"><button className={`nav-item ${activeView === 'overview' ? 'active' : ''}`} onClick={() => navigateTo('overview')}><LayoutDashboard size={17} />Overview</button><button className={`nav-item ${activeView === 'datasets' ? 'active' : ''}`} onClick={() => navigateTo('datasets')}><Database size={17} />My datasets<span className="nav-count">{totalDatasets}</span></button><button className={`nav-item ${activeView === 'reports' ? 'active' : ''}`} onClick={() => navigateTo('reports')}><FileText size={17} />Reports</button></nav>
      <div className="side-divider" /><div className="nav-caption">PREFERENCES</div>
      <nav className="main-nav"><a className="nav-item"><Settings size={17} />Settings</a><a className="nav-item"><CircleHelp size={17} />Help center</a></nav>
      <div className="sidebar-bottom"><div className="upgrade-card"><div className="upgrade-icon"><Sparkles size={15} /></div><b>Make more of your data</b><p>Upgrade your plan for unlimited datasets and more.</p><button className="upgrade-button">Explore plans <ArrowUpRight size={14} /></button></div><button className="profile profile-button" onClick={signOut}><div className="profile-avatar">{session.user.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</div><div className="profile-copy"><b>{session.user.name}</b><span>{session.user.email}</span></div><span className="signout-label">Sign out</span></button></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <b>{activeView === 'overview' ? 'Overview' : activeView === 'datasets' ? 'My datasets' : 'Reports'}</b></div><div className="top-actions"><div className="status-pill"><span /> All systems operational</div><button className="icon-button"><Bell size={18} /><i /></button><div className="top-avatar">{session.user.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</div></div></header>
      <div className="content">
        <section className="welcome-row"><div><div className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase()}</div><h1>{activeView === 'overview' ? `Good morning, ${session.user.name.split(' ')[0]}` : activeView === 'datasets' ? 'Your datasets' : 'Saved reports'} <span className="wave">✳</span></h1><p className="subheading">{activeView === 'overview' ? "Here's what's happening with your data today." : activeView === 'datasets' ? 'Browse, search, and manage your uploaded files.' : 'Open an analysis report or download a copy.'}</p></div><label className={`primary-button ${uploading ? 'is-loading' : ''}`}><Plus size={17} />{uploading ? 'Analyzing…' : 'Upload dataset'}<input type="file" accept=".csv,text/csv" onChange={uploadFile} /></label></section>
        {notice && <div className="notice"><Check size={15} />{notice}<button onClick={() => setNotice('')}><X size={15} /></button></div>}
        {activeView === 'overview' && <>
        <section className="stats-grid">
          <StatCard label="Total datasets" value={String(totalDatasets).padStart(2, '0')} note="Saved in your workspace" icon={<Database size={17} />} tone="violet" trend="Saved reports" />
          <StatCard label="Rows analyzed" value={totalRows.toLocaleString()} note="Across saved datasets" icon={<Table2 size={17} />} tone="blue" trend="All time" />
          <StatCard label="Reports generated" value={String(totalDatasets)} note="Ready to revisit" icon={<FileText size={17} />} tone="orange" trend="Saved reports" />
          <StatCard label="Data quality" value={datasets.length ? `${Math.round(datasets.reduce((sum, item) => sum + (item.report?.columns?.length ? item.report.columns.reduce((colSum, col) => colSum + (1 - col.missingCount / Math.max(item.rowCount, 1)), 0) / item.report.columns.length : 1), 0) / datasets.length * 100)}%` : '—'} note="Average completeness" icon={<ShieldCheck size={17} />} tone="green" trend="From reports" />
        </section>
        </>}
        {activeView === 'overview' && <section className="middle-grid">
          <div className="panel chart-panel"><div className="panel-heading"><div><div className="panel-title">Dataset activity</div><div className="panel-description">Rows in your latest saved datasets</div></div><div className="activity-total">{datasets.length} saved</div></div><div className="chart-legend"><span><i className="legend-dot revenue-dot" />Rows per dataset</span></div>{activityRows.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={activityRows} margin={{ top: 8, right: 2, left: -16, bottom: 0 }}><CartesianGrid vertical={false} stroke="#edf0f4" /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9ba3b1', fontSize: 9 }} dy={9} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#a5acb7', fontSize: 10 }} /><Tooltip cursor={{ fill: '#f7f8fb' }} contentStyle={{ border: '1px solid #eceef2', borderRadius: 10, fontSize: 12 }} /><Bar dataKey="rows" fill="#6558e8" radius={[4, 4, 0, 0]} maxBarSize={28} /></BarChart></ResponsiveContainer></div> : <div className="chart-empty">Upload a CSV to see activity here.</div>}</div>
          <QualityOverview datasets={datasets} />
        </section>}
        {activeView !== 'reports' && <section className="panel datasets-panel"><div className="datasets-heading"><div><div className="panel-title">Your datasets <span className="table-count">{matchingDatasets}</span></div><div className="panel-description">Manage and explore your uploaded files</div></div><div className="table-actions"><div className="search-box"><Search size={15} /><input placeholder="Search datasets..." value={search} onChange={(event) => { setSearch(event.target.value); setDatasetPage(1); }} /></div><select className="filter-button" value={dateFilter} onChange={(event) => { setDateFilter(event.target.value); setDatasetPage(1); }} aria-label="Filter datasets by date"><option value="all">All time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select></div></div><div className="dataset-table"><div className="table-header"><span>NAME</span><span>ROWS</span><span>COLUMNS</span><span>LAST ANALYZED</span><span>STATUS</span><span /></div>{loadingDatasets ? <div className="table-state"><span className="loading-spinner" /> Loading your datasets…</div> : visibleDatasets.length ? visibleDatasets.map((item) => <DatasetRow key={item.id || item.name} item={item} isActive={active?.id === item.id} onSelect={() => selectDataset(item)} onRename={() => { setRenameTarget(item); setRenameValue(item.name); }} onDelete={() => setDeleteTarget(item)} />) : <div className="empty-search">{search || dateFilter !== 'all' ? 'No datasets match these filters.' : totalDatasets === 0 ? <div className="empty-state"><div className="empty-state-icon"><FileSpreadsheet size={19} /></div><b>Start with a sample dataset</b><span>See summaries, data quality checks, and charts with a small example CSV.</span><button className="sample-button" onClick={uploadSampleDataset} disabled={uploading}><FileSpreadsheet size={14} />{uploading ? 'Analyzing sample…' : 'Analyze sample data'}</button></div> : 'No datasets on this page.'}</div>}</div><div className="table-footer"><span>Showing {matchingDatasets ? (datasetPage - 1) * 8 + 1 : 0}–{Math.min(datasetPage * 8, matchingDatasets)} of {matchingDatasets} matching datasets</span><div className="pagination-controls"><button disabled={datasetPage <= 1 || loadingDatasets} onClick={() => setDatasetPage((page) => page - 1)}>Previous</button><span>{datasetPage} / {pageCount}</span><button disabled={datasetPage >= pageCount || loadingDatasets} onClick={() => setDatasetPage((page) => page + 1)}>Next</button></div><button onClick={() => document.querySelector('input[type="file"]')?.click()}>Upload a dataset <ArrowUpRight size={14} /></button></div></section>}
        {activeView === 'reports' && <ReportsList datasets={visibleDatasets} loading={loadingDatasets} page={datasetPage} pageCount={pageCount} onPage={setDatasetPage} onOpen={selectDataset} />}

        {openingReport && <div className="report-loading">Loading saved report…</div>}
        {active?.report && <ReportPanel dataset={active} />}
        {renameTarget && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingAction) setRenameTarget(null); }}><section className="action-modal" role="dialog" aria-modal="true" aria-labelledby="rename-title"><button className="modal-close" aria-label="Close" onClick={() => setRenameTarget(null)}><X size={17} /></button><div className="modal-icon rename-icon"><FileText size={17} /></div><h2 id="rename-title">Rename dataset</h2><p>Choose a clear name for this saved dataset.</p><label className="modal-label">Dataset name<input autoFocus maxLength={100} value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') renameDataset(renameTarget); }} /></label><div className="modal-actions"><button className="secondary-action" onClick={() => setRenameTarget(null)} disabled={savingAction}>Cancel</button><button className="confirm-action" onClick={() => renameDataset(renameTarget)} disabled={savingAction || !renameValue.trim()}>{savingAction ? 'Saving…' : 'Save name'}</button></div></section></div>}
        {deleteTarget && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingAction) setDeleteTarget(null); }}><section className="action-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-title"><button className="modal-close" aria-label="Close" onClick={() => setDeleteTarget(null)}><X size={17} /></button><div className="modal-icon delete-icon"><Trash2 size={17} /></div><h2 id="delete-title">Delete this dataset?</h2><p><b>{deleteTarget.name}</b> and its saved analysis report will be permanently removed.</p><div className="modal-actions"><button className="secondary-action" onClick={() => setDeleteTarget(null)} disabled={savingAction}>Cancel</button><button className="danger-action" onClick={() => deleteDataset(deleteTarget)} disabled={savingAction}>{savingAction ? 'Deleting…' : 'Delete dataset'}</button></div></section></div>}
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

function AuthScreen({ mode, setMode, onSuccess, notice }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const isRegister = mode === 'register';

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (isRegister && form.name.trim().length > 60) { setError('Name must be 60 characters or fewer.'); return; }
    if (isRegister && new TextEncoder().encode(form.password).length > 72) { setError('Password must use 72 bytes or fewer.'); return; }
    if (isRegister && form.password !== form.confirmPassword) { setError('Passwords do not match.'); return; }
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

  return <main className="auth-page">
    <div className="auth-card">
      <div className="brand auth-brand"><div className="brand-mark"><Activity size={18} strokeWidth={2.8} /></div><span>data<span className="brand-light">lens</span></span><span className="brand-beta">BETA</span></div>
      <div className="auth-intro">
        <div className="eyebrow">YOUR DATA, MADE CLEAR</div>
        <h1>{isRegister ? 'Create your account' : 'Welcome back'}</h1>
        <p>{isRegister ? 'Start exploring your datasets in a few clicks.' : 'Sign in to continue to your workspace.'}</p>
      </div>
      {notice && <div className="auth-error session-notice">{notice}</div>}
      <form className="auth-form" onSubmit={submit}>
        {isRegister && <label>Your name<input autoComplete="name" maxLength={60} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Jawad Khan" required /></label>}
        <label>Email address<input type="email" autoComplete="email" maxLength={254} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="you@example.com" required /></label>
        <label>Password
          <span className="password-control"><input type={showPassword ? 'text' : 'password'} autoComplete={isRegister ? 'new-password' : 'current-password'} minLength={isRegister ? 8 : undefined} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder={isRegister ? 'At least 8 characters' : 'Enter your password'} required /><button type="button" className="password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button></span>
          {isRegister && <small className={`password-hint ${form.password.length >= 8 && new TextEncoder().encode(form.password).length <= 72 ? 'valid' : ''}`}>{form.password.length < 8 ? 'Use at least 8 characters.' : new TextEncoder().encode(form.password).length > 72 ? 'Password is too long for secure hashing.' : 'Password length looks good.'}</small>}
        </label>
        {isRegister && <label>Confirm password<input type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} placeholder="Enter your password again" required /></label>}
        {error && <div className="auth-error">{error}</div>}
        <button className="auth-submit" disabled={loading}>{loading ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}<ArrowUpRight size={15} /></button>
      </form>
      <div className="auth-switch">{isRegister ? 'Already have an account?' : 'New to DataLens?'} <button onClick={() => { setError(''); setForm({ name: '', email: form.email, password: '', confirmPassword: '' }); setMode(isRegister ? 'login' : 'register'); }}>{isRegister ? 'Sign in' : 'Create an account'}</button></div>
      <div className="auth-note"><ShieldCheck size={14} /> Your datasets are private to your account</div>
    </div>
  </main>;
}

function ReportPanel({ dataset }) {
  const report = dataset.report;
  const columns = report.columns || [];
  const preview = report.preview || [];
  const numericColumns = columns.filter((column) => column.type === 'numeric');
  const categoricalColumns = columns.filter((column) => column.type === 'categorical');
  const missingData = columns.map((column) => ({ name: shortName(column.name), missing: Math.max(0, (column.missingCount || 0) - (column.invalidCount || 0)) })).filter((column) => column.missing > 0);
  return <section id="analysis-report" className="panel report-panel"><div className="datasets-heading"><div><div className="panel-title">Analysis report</div><div className="panel-description">{dataset.name} · {Number(dataset.rowCount || 0).toLocaleString()} rows · {dataset.columnCount} columns · {report.duplicateCount || 0} duplicate rows</div></div><span className="report-badge"><Check size={13} /> Saved report</span><button className="export-button" onClick={() => downloadReportJson(dataset)}><Download size={13} /> JSON</button><button className="export-button" onClick={() => downloadColumnSummary(dataset)}><Download size={13} /> CSV summary</button></div><ReportQualityCards report={report} /><div className="report-columns">{columns.map((column) => <div className="report-column" key={column.name}><div className="report-column-heading"><b>{column.name}</b><span>{column.type}</span></div><div className="report-column-meta">{column.missingCount} missing{column.invalidCount ? ` · ${column.invalidCount} invalid` : ''} · {column.type === 'numeric' ? `mean ${column.mean}, median ${column.median}` : `${column.uniqueCount} unique values`}</div>{column.type === 'numeric' && <div className="report-column-range">Range {column.min} – {column.max} <span>SD {column.standardDeviation}</span></div>}</div>)}</div><div className="visualization-grid">{numericColumns.map((column) => <NumericHistogram key={column.name} column={column} />)}{categoricalColumns.slice(0, 3).map((column) => <CategoryChart key={column.name} column={column} />)}{missingData.length > 0 && <MissingChart data={missingData} />}{numericColumns.length > 1 && <CorrelationHeatmap report={report} />}</div>{preview.length > 0 && <div className="preview-wrap"><div className="preview-title">First rows</div><div className="preview-table-wrap"><table className="preview-table"><thead><tr>{Object.keys(preview[0]).map((name) => <th key={name}>{name}</th>)}</tr></thead><tbody>{preview.map((row, index) => <tr key={index}>{Object.values(row).map((value, cellIndex) => <td key={cellIndex}>{value === '' ? <span className="missing-value">Missing</span> : String(value)}</td>)}</tr>)}</tbody></table></div></div>}</section>;
}

function StatCard({ label, value, note, icon, tone, trend }) { return <div className="stat-card"><div className="stat-top"><div className={`stat-icon ${tone}`}>{icon}</div><span className="stat-trend"><ArrowUpRight size={13} />{trend}</span></div><div className="stat-value">{value}</div><div className="stat-label">{label}</div><div className="stat-note">{note}</div></div>; }
function QualityRow({ label, value, percent, color }) { return <div className="quality-row"><div><span>{label}</span><b>{value}</b></div><div className="progress-track"><i className={color} style={{ width: percent }} /></div></div>; }
function ReportQualityCards({ report }) {
  const columns = report.columns || [];
  const rowCount = Number(report.rowCount || 0);
  const totalCells = columns.reduce((sum, column) => sum + Number(column.totalCount || rowCount), 0);
  const blanks = columns.reduce((sum, column) => sum + Math.max(0, Number(column.missingCount || 0) - Number(column.invalidCount || 0)), 0);
  const invalid = columns.reduce((sum, column) => sum + Number(column.invalidCount || 0), 0);
  const completeness = totalCells ? Math.round((1 - blanks / totalCells) * 100) : 100;
  const duplicates = Number(report.duplicateCount || 0);
  const warnings = [];
  if (blanks) warnings.push(`${blanks.toLocaleString()} blank cells`);
  if (invalid) warnings.push(`${invalid.toLocaleString()} invalid numeric values`);
  if (duplicates) warnings.push(`${duplicates.toLocaleString()} duplicate rows`);
  return <><div className="report-quality-grid"><ReportMetric label="Completeness" value={`${completeness}%`} detail={`${blanks.toLocaleString()} blank cells`} tone={completeness < 90 ? 'attention' : 'good'} /><ReportMetric label="Duplicate rows" value={duplicates.toLocaleString()} detail={duplicates ? 'Repeated records found' : 'No repeated rows'} tone={duplicates ? 'attention' : 'good'} /><ReportMetric label="Invalid numeric values" value={invalid.toLocaleString()} detail={invalid ? 'Excluded from numeric stats' : 'No parsing issues'} tone={invalid ? 'attention' : 'good'} /></div><div className={`quality-notice ${warnings.length ? 'has-warnings' : ''}`}><span className="quality-notice-icon">{warnings.length ? '!' : '✓'}</span><div><b>{warnings.length ? 'Review these data quality findings' : 'No data quality issues found'}</b><span>{warnings.length ? warnings.join(' · ') : 'No blank cells, invalid numeric values, or duplicate rows were detected.'}</span></div></div></>;
}
function ReportMetric({ label, value, detail, tone }) { return <div className={`report-metric ${tone}`}><span>{label}</span><b>{value}</b><small>{detail}</small></div>; }
function ReportsList({ datasets, loading, page, pageCount, onPage, onOpen }) {
  return <section className="panel reports-list"><div className="datasets-heading"><div><div className="panel-title">Saved analysis reports</div><div className="panel-description">Open an analysis to view its charts, summary, and row preview.</div></div></div>{loading ? <div className="table-state"><span className="loading-spinner" /> Loading reports…</div> : datasets.length ? <div className="reports-cards">{datasets.map((dataset) => <article className="saved-report-card" key={dataset.id}><div className={`file-icon ${dataset.color}`}><FileSpreadsheet size={17} /></div><div className="saved-report-copy"><b>{dataset.name}</b><span>{dataset.rows} rows · {dataset.columnsCount} columns · {dataset.date}</span></div><button className="open-report-button" onClick={() => onOpen(dataset)}>Open report <ArrowUpRight size={14} /></button></article>)}</div> : <div className="empty-search">No saved reports yet. Upload and analyze a CSV to get started.</div>}<div className="reports-footer"><span>{datasets.length} report{datasets.length === 1 ? '' : 's'} on this page</span><div className="pagination-controls"><button disabled={page <= 1 || loading} onClick={() => onPage(page - 1)}>Previous</button><span>{page} / {pageCount}</span><button disabled={page >= pageCount || loading} onClick={() => onPage(page + 1)}>Next</button></div></div></section>;
}
function downloadReportJson(dataset) {
  const reportFile = { exportedAt: new Date().toISOString(), dataset: { name: dataset.name, rows: dataset.rowCount, columns: dataset.columnCount }, report: dataset.report };
  downloadFile(`${fileBaseName(dataset.name)}-report.json`, JSON.stringify(reportFile, null, 2), 'application/json');
}
function downloadColumnSummary(dataset) {
  const headings = ['column', 'type', 'missing', 'invalid', 'unique_values', 'mean', 'median', 'standard_deviation', 'min', 'max'];
  const rows = (dataset.report.columns || []).map((column) => [column.name, column.type, column.missingCount || 0, column.invalidCount || 0, column.uniqueCount ?? '', column.mean ?? '', column.median ?? '', column.standardDeviation ?? '', column.min ?? '', column.max ?? '']);
  const csv = [headings, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  downloadFile(`${fileBaseName(dataset.name)}-column-summary.csv`, `\uFEFF${csv}`, 'text/csv;charset=utf-8');
}
function csvCell(value) { return `"${String(value ?? '').replaceAll('"', '""')}"`; }
function fileBaseName(name) { return name.replace(/\.csv$/i, '').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'dataset'; }
function downloadFile(fileName, contents, type) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function NumericHistogram({ column }) {
  const bins = column.histogram || [];
  return <div className="visual-card"><div className="visual-heading"><b>{column.name}</b><span>{column.totalCount?.toLocaleString()} rows</span></div>{bins.length ? <ResponsiveContainer width="100%" height={155}><BarChart data={bins} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}><CartesianGrid vertical={false} stroke="#edf0f4" /><XAxis dataKey="range" axisLine={false} tickLine={false} tick={{ fill: '#9298a4', fontSize: 8 }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#a5acb7', fontSize: 8 }} /><Tooltip contentStyle={{ border: '1px solid #eceef2', borderRadius: 8, fontSize: 10 }} /><Bar dataKey="count" fill="#695ce8" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer> : <div className="visual-empty">No numeric values available to chart.</div>}</div>;
}

function CategoryChart({ column }) {
  const data = (column.topCategories || []).map(({ name, count }) => ({ name: name.length > 13 ? `${name.slice(0, 12)}…` : name, count }));
  return <div className="visual-card"><div className="visual-heading"><b>{column.name}</b><span>Top of {column.totalCount?.toLocaleString()} rows</span></div>{data.length ? <ResponsiveContainer width="100%" height={155}><BarChart data={data} layout="vertical" margin={{ top: 2, right: 8, left: 4, bottom: 0 }}><CartesianGrid horizontal={false} stroke="#edf0f4" /><XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#a5acb7', fontSize: 8 }} /><YAxis type="category" dataKey="name" width={70} axisLine={false} tickLine={false} tick={{ fill: '#9298a4', fontSize: 8 }} /><Tooltip contentStyle={{ border: '1px solid #eceef2', borderRadius: 8, fontSize: 10 }} /><Bar dataKey="count" fill="#7bbca2" radius={[0, 3, 3, 0]} /></BarChart></ResponsiveContainer> : <div className="visual-empty">No category values available to chart.</div>}</div>;
}

function MissingChart({ data }) {
  return <div className="visual-card"><div className="visual-heading"><b>Missing values</b><span>Blank rows per column</span></div><ResponsiveContainer width="100%" height={155}><BarChart data={data} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}><CartesianGrid vertical={false} stroke="#edf0f4" /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9298a4', fontSize: 8 }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#a5acb7', fontSize: 8 }} /><Tooltip contentStyle={{ border: '1px solid #eceef2', borderRadius: 8, fontSize: 10 }} /><Bar dataKey="missing" fill="#e6a365" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div>;
}

function CorrelationHeatmap({ report }) {
  const values = report.correlationNames || [];
  const matrix = report.correlationMatrix || [];
  return <div className="visual-card"><div className="visual-heading"><b>Correlation heatmap</b><span>All dataset rows</span></div><div className="heatmap-wrap"><table className="heatmap"><thead><tr><th /><th>{values.map((name) => <span key={name} title={name}>{shortName(name)}</span>)}</th></tr></thead><tbody>{values.map((rowName, rowIndex) => <tr key={rowName}><th title={rowName}>{shortName(rowName)}</th>{values.map((columnName, columnIndex) => {
    const correlation = matrix[rowIndex]?.[columnIndex];
    const strength = Number.isFinite(correlation) ? Math.abs(correlation) : 0;
    const background = correlation >= 0 ? `rgba(104, 91, 225, ${0.08 + strength * 0.75})` : `rgba(224, 137, 108, ${0.08 + strength * 0.75})`;
    return <td key={columnName} style={{ background }} title={`${rowName} / ${columnName}: ${Number.isFinite(correlation) ? correlation.toFixed(2) : 'not available'}`}>{Number.isFinite(correlation) ? correlation.toFixed(2) : '—'}</td>;
  })}</tr>)}</tbody></table></div></div>;
}

function shortName(name) { return name.length > 8 ? `${name.slice(0, 7)}…` : name; }
function roundNumber(number) { return Math.round(number * 100) / 100; }
function DatasetRow({ item, isActive, onSelect, onRename, onDelete }) { return <div className={`dataset-row ${isActive ? 'selected' : ''}`} onClick={onSelect}><div className="dataset-name"><div className={`file-icon ${item.color}`}><FileSpreadsheet size={17} /></div><div><b>{item.name}</b><small>CSV file · saved report</small></div></div><span className="cell-muted">{item.rows}</span><span className="cell-muted">{item.columnsCount}</span><span className="cell-muted">{item.date}</span><span><i className="ready-dot" />Ready</span><div className="row-buttons"><button className="row-menu open-row-action" title="Open report" aria-label={`Open report for ${item.name}`} onClick={(event) => { event.stopPropagation(); onSelect(); }}><ArrowUpRight size={14} /></button><button className="row-menu" title="Rename dataset" aria-label={`Rename ${item.name}`} onClick={(event) => { event.stopPropagation(); onRename(); }}><FileText size={14} /></button><button className="row-menu" title="Delete dataset" aria-label={`Delete ${item.name}`} onClick={(event) => { event.stopPropagation(); onDelete(); }}><Trash2 size={15} /></button></div></div>; }

export default App;
