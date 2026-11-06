import { useMemo, useState } from 'react';
import { Activity, ArrowDown, ArrowUpRight, BarChart3, Bell, Check, ChevronDown, CircleHelp, CloudUpload, Database, FileSpreadsheet, FileText, LayoutDashboard, MoreHorizontal, Plus, Search, Settings, ShieldCheck, Sparkles, Table2, Trash2, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const sampleRows = [
  { date: 'Jan', revenue: 28, orders: 18 }, { date: 'Feb', revenue: 36, orders: 23 },
  { date: 'Mar', revenue: 31, orders: 20 }, { date: 'Apr', revenue: 48, orders: 29 },
  { date: 'May', revenue: 42, orders: 27 }, { date: 'Jun', revenue: 59, orders: 35 },
  { date: 'Jul', revenue: 52, orders: 31 }, { date: 'Aug', revenue: 72, orders: 42 },
  { date: 'Sep', revenue: 65, orders: 37 }, { date: 'Oct', revenue: 83, orders: 48 },
  { date: 'Nov', revenue: 76, orders: 43 }, { date: 'Dec', revenue: 94, orders: 55 },
];
const initialDatasets = [
  { name: 'sales_data_2024.csv', rows: '2,450', columns: '8', date: 'Today, 10:42 AM', type: 'CSV', color: 'mint', selected: true },
  { name: 'customer_churn.csv', rows: '7,043', columns: '21', date: 'Yesterday', type: 'CSV', color: 'lavender' },
  { name: 'website_traffic.csv', rows: '1,280', columns: '6', date: 'Oct 28, 2024', type: 'CSV', color: 'peach' },
];

function App() {
  const [datasets, setDatasets] = useState(initialDatasets);
  const [active, setActive] = useState(initialDatasets[0]);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [uploading, setUploading] = useState(false);
  const visibleDatasets = useMemo(() => datasets.filter((item) => item.name.toLowerCase().includes(search.toLowerCase())), [datasets, search]);

  async function uploadFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) { setNotice('Please choose a CSV file.'); return; }
    setUploading(true);
    const form = new FormData();
    form.append('file', file);
    try {
      const response = await fetch('http://localhost:5000/api/datasets/analyze', { method: 'POST', body: form });
      if (!response.ok) throw new Error('API unavailable');
      const report = await response.json();
      const item = { name: file.name, rows: report.rowCount.toLocaleString(), columns: String(report.columnCount), date: 'Just now', type: 'CSV', color: 'mint', report };
      setDatasets((current) => [item, ...current.map((entry) => ({ ...entry, selected: false }))]);
      setActive(item);
      setNotice(`${file.name} analyzed successfully.`);
    } catch {
      setNotice('Could not reach the API. Start the server with npm run dev, then upload again.');
    } finally { setUploading(false); }
  }

  function deleteDataset(item) {
    const next = datasets.filter((dataset) => dataset.name !== item.name);
    setDatasets(next);
    if (active.name === item.name) setActive(next[0] || { name: 'No dataset selected', rows: '0', columns: '0' });
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Activity size={18} strokeWidth={2.8} /></div><span>data<span className="brand-light">lens</span></span><span className="brand-beta">BETA</span></div>
      <div className="workspace-switch"><div className="workspace-avatar">J</div><div className="workspace-copy"><b>Jawad's workspace</b><span>Free plan</span></div><ChevronDown size={15} /></div>
      <div className="nav-caption">WORKSPACE</div>
      <nav className="main-nav"><a className="nav-item active"><LayoutDashboard size={17} />Overview</a><a className="nav-item"><Database size={17} />My datasets<span className="nav-count">{datasets.length}</span></a><a className="nav-item"><FileText size={17} />Reports</a></nav>
      <div className="side-divider" /><div className="nav-caption">PREFERENCES</div>
      <nav className="main-nav"><a className="nav-item"><Settings size={17} />Settings</a><a className="nav-item"><CircleHelp size={17} />Help center</a></nav>
      <div className="sidebar-bottom"><div className="upgrade-card"><div className="upgrade-icon"><Sparkles size={15} /></div><b>Make more of your data</b><p>Upgrade your plan for unlimited datasets and more.</p><button className="upgrade-button">Explore plans <ArrowUpRight size={14} /></button></div><div className="profile"><div className="profile-avatar">JK</div><div className="profile-copy"><b>Jawad Khan</b><span>jawad@example.com</span></div><MoreHorizontal size={18} /></div></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <b>Overview</b></div><div className="top-actions"><div className="status-pill"><span /> All systems operational</div><button className="icon-button"><Bell size={18} /><i /></button><div className="top-avatar">JK</div></div></header>
      <div className="content">
        <section className="welcome-row"><div><div className="eyebrow">THURSDAY, NOVEMBER 6, 2026</div><h1>Good morning, Jawad <span className="wave">✳</span></h1><p className="subheading">Here's what's happening with your data today.</p></div><label className={`primary-button ${uploading ? 'is-loading' : ''}`}><Plus size={17} />{uploading ? 'Analyzing…' : 'Upload dataset'}<input type="file" accept=".csv,text/csv" onChange={uploadFile} /></label></section>
        {notice && <div className="notice"><Check size={15} />{notice}<button onClick={() => setNotice('')}><X size={15} /></button></div>}
        <section className="stats-grid">
          <StatCard label="Total datasets" value={String(datasets.length).padStart(2, '0')} note="Across your workspace" icon={<Database size={17} />} tone="violet" trend="+2 this month" />
          <StatCard label="Rows analyzed" value="10.8k" note="Across all datasets" icon={<Table2 size={17} />} tone="blue" trend="+18.4%" />
          <StatCard label="Reports generated" value="12" note="Ready to revisit" icon={<FileText size={17} />} tone="orange" trend="+4 this month" />
          <StatCard label="Data quality" value="94.2%" note="Average completeness" icon={<ShieldCheck size={17} />} tone="green" trend="+2.1%" />
        </section>
        <section className="middle-grid">
          <div className="panel chart-panel"><div className="panel-heading"><div><div className="panel-title">Dataset activity</div><div className="panel-description">Rows analyzed over the last 12 months</div></div><button className="select-button">This year <ChevronDown size={14} /></button></div><div className="chart-legend"><span><i className="legend-dot revenue-dot" />Rows analyzed</span><span><i className="legend-dot orders-dot" />Datasets</span></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={sampleRows} margin={{ top: 8, right: 2, left: -16, bottom: 0 }} barGap={5}><CartesianGrid vertical={false} stroke="#edf0f4" /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#9ba3b1', fontSize: 11 }} dy={9} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#a5acb7', fontSize: 10 }} ticks={[0, 25, 50, 75, 100]} /><Tooltip cursor={{ fill: '#f7f8fb' }} contentStyle={{ border: '1px solid #eceef2', borderRadius: 10, fontSize: 12 }} /><Bar dataKey="revenue" fill="#6558e8" radius={[4, 4, 0, 0]} maxBarSize={16} /><Bar dataKey="orders" fill="#c9c3fb" radius={[4, 4, 0, 0]} maxBarSize={16} /></BarChart></ResponsiveContainer></div></div>
          <div className="panel quality-panel"><div className="panel-heading"><div><div className="panel-title">Data quality overview</div><div className="panel-description">Average across your datasets</div></div><button className="dots-button"><MoreHorizontal size={18} /></button></div><div className="quality-score"><div className="score-ring"><div><strong>94</strong><small>/ 100</small></div></div><div className="score-copy"><b>Looking good!</b><span>Your data is in great shape</span><div className="score-change"><ArrowUpRight size={13} /> 2.1% this month</div></div></div><div className="quality-list"><QualityRow label="Completeness" value="96.8%" percent="96.8%" color="purple" /><QualityRow label="Uniqueness" value="91.4%" percent="91.4%" color="blue" /><QualityRow label="Consistency" value="94.5%" percent="94.5%" color="orange" /></div><div className="quality-footer"><span><Check size={14} /> No critical issues found</span><ArrowUpRight size={15} /></div></div>
        </section>
        <section className="panel datasets-panel"><div className="datasets-heading"><div><div className="panel-title">Your datasets <span className="table-count">{datasets.length}</span></div><div className="panel-description">Manage and explore your uploaded files</div></div><div className="table-actions"><div className="search-box"><Search size={15} /><input placeholder="Search datasets..." value={search} onChange={(event) => setSearch(event.target.value)} /></div><button className="filter-button">Last 30 days <ChevronDown size={14} /></button></div></div><div className="dataset-table"><div className="table-header"><span>NAME</span><span>ROWS</span><span>COLUMNS</span><span>LAST ANALYZED</span><span>STATUS</span><span /></div>{visibleDatasets.length ? visibleDatasets.map((item) => <DatasetRow key={item.name} item={item} isActive={active.name === item.name} onSelect={() => setActive(item)} onDelete={() => deleteDataset(item)} />) : <div className="empty-search">No datasets match “{search}”</div>}</div><div className="table-footer"><span>Showing <b>{visibleDatasets.length}</b> of <b>{datasets.length}</b> datasets</span><button>View all datasets <ArrowUpRight size={14} /></button></div></section>
        <footer className="page-footer"><span>© 2024 DataLens, Inc.</span><span><a>Privacy</a><a>Terms</a><a>Status <i className="footer-status" /></a></span><span>Made for curious minds <span className="heart">♥</span></span></footer>
      </div>
    </main>
  </div>;
}

function StatCard({ label, value, note, icon, tone, trend }) { return <div className="stat-card"><div className="stat-top"><div className={`stat-icon ${tone}`}>{icon}</div><span className="stat-trend"><ArrowUpRight size={13} />{trend}</span></div><div className="stat-value">{value}</div><div className="stat-label">{label}</div><div className="stat-note">{note}</div></div>; }
function QualityRow({ label, value, percent, color }) { return <div className="quality-row"><div><span>{label}</span><b>{value}</b></div><div className="progress-track"><i className={color} style={{ width: percent }} /></div></div>; }
function DatasetRow({ item, isActive, onSelect, onDelete }) { return <div className={`dataset-row ${isActive ? 'selected' : ''}`} onClick={onSelect}><div className="dataset-name"><div className={`file-icon ${item.color}`}><FileSpreadsheet size={17} /></div><div><b>{item.name}</b><small>CSV file · 2.4 MB</small></div></div><span className="cell-muted">{item.rows}</span><span className="cell-muted">{item.columns}</span><span className="cell-muted">{item.date}</span><span><i className="ready-dot" />Ready</span><button className="row-menu" title="Delete dataset" onClick={(event) => { event.stopPropagation(); onDelete(); }}><Trash2 size={15} /></button></div>; }

export default App;
