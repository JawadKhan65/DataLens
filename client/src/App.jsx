import { useEffect, useMemo, useState } from "react";
import { API_URL } from "./config.js";
import AuthScreen from "./components/AuthScreen.jsx";
import ReportPanel, { StatCard } from "./components/ReportPanel.jsx";
import {
  DatasetRow,
  LoadError,
  QualityOverview,
  ReportsList,
} from "./components/DashboardComponents.jsx";
import {
  Activity,
  ArrowUpRight,
  Bell,
  Check,
  ChevronDown,
  CircleHelp,
  Database,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function App() {
  const [session, setSession] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("datalens-session") || "null");
    } catch {
      return null;
    }
  });
  const [authMode, setAuthMode] = useState("login");
  const [activeView, setActiveView] = useState("overview");
  const [datasets, setDatasets] = useState([]);
  const [totalDatasets, setTotalDatasets] = useState(0);
  const [matchingDatasets, setMatchingDatasets] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [datasetPage, setDatasetPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [active, setActive] = useState(null);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [notice, setNoticeText] = useState("");
  const [noticeError, setNoticeError] = useState(false);
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [datasetError, setDatasetError] = useState(false);
  const [datasetReload, setDatasetReload] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadingFileName, setUploadingFileName] = useState("");
  const [serviceStatus, setServiceStatus] = useState("checking");
  const [openingReport, setOpeningReport] = useState(false);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [savingAction, setSavingAction] = useState(false);
  const visibleDatasets = datasets;
  const activityRows = useMemo(() => makeActivityRows(datasets), [datasets]);

  function setNotice(message, isError = false) {
    setNoticeText(message);
    setNoticeError(isError);
  }
  useEffect(() => {
    let active = true;
    const checkHealth = async () => {
      try {
        const response = await fetch(`${API_URL.replace(/\/$/, "")}/health`);
        const result = await response.json();
        if (active)
          setServiceStatus(
            response.ok && result.database === "connected" ? "ok" : "database",
          );
      } catch {
        if (active) setServiceStatus("offline");
      }
    };
    checkHealth();
    const interval = window.setInterval(checkHealth, 30000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  function saveSession(nextSession) {
    localStorage.setItem("datalens-session", JSON.stringify(nextSession));
    setDatasets([]);
    setActive(null);
    setTotalDatasets(0);
    setTotalRows(0);
    setSession(nextSession);
    setNotice("");
  }

  function signOut() {
    localStorage.removeItem("datalens-session");
    setSession(null);
    setDatasets([]);
    setActive(null);
    setTotalDatasets(0);
    setTotalRows(0);
  }

  function navigateTo(view) {
    setActiveView(view);
    setSearch("");
    setDateFilter("all");
    setDatasetPage(1);
  }

  async function apiRequest(path, options = {}) {
    const headers = { ...options.headers };
    if (session?.token) headers.Authorization = `Bearer ${session.token}`;
    const response = await fetch(`${API_URL}${path}`, { ...options, headers });
    if (response.status === 401) {
      signOut();
      throw new Error("SESSION_EXPIRED");
    }
    return response;
  }

  useEffect(() => {
    if (!session?.token) return;
    const controller = new AbortController();
    setLoadingDatasets(true);
    setDatasetError(false);
    const params = new URLSearchParams({
      page: String(datasetPage),
      limit: "8",
      search,
      days: dateFilter,
      sort: sortBy,
    });
    apiRequest(`/datasets?${params}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("API unavailable");
        return response.json();
      })
      .then((result) => {
        const formatted = result.items.map(formatDataset);
        setDatasets(formatted);
        setTotalDatasets(result.totalDatasets);
        setMatchingDatasets(result.total);
        setTotalRows(result.totalRows);
        setPageCount(result.pageCount);
        setActive(
          (current) =>
            formatted.find((item) => item.id === current?.id) ||
            formatted[0] ||
            null,
        );
        setDatasetError(false);
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setDatasetError(true);
          setNotice(
            error.message === "SESSION_EXPIRED"
              ? "Your session expired. Sign in again to continue."
              : "Could not load saved datasets. Check that the API and MongoDB are running.",
            true,
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingDatasets(false);
      });
    return () => controller.abort();
  }, [session?.token, datasetPage, search, dateFilter, sortBy, datasetReload]);

  function retryDatasetLoad() {
    setNotice("");
    setDatasetReload((current) => current + 1);
  }

  async function uploadFile(event) {
    if (uploading) return;
    const file = event?.target ? event.target.files?.[0] : event;
    if (event?.target) event.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setNotice("Please choose a CSV file.", true);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setNotice("This CSV is larger than the 10 MB upload limit.", true);
      return;
    }
    setUploading(true);
    setUploadingFileName(file.name);
    const form = new FormData();
    form.append("file", file);
    try {
      const response = await apiRequest("/datasets/analyze", {
        method: "POST",
        body: form,
      });
      const report = await response.json();
      if (!response.ok) throw new Error(report.message || "Upload failed.");
      if (!report.id) {
        setNotice(
          "CSV analyzed, but not saved. Start MongoDB and set MONGODB_URI to save reports.",
        );
        setUploading(false);
        return;
      }
      const item = formatDataset(report);
      setDatasets((current) => [item, ...current].slice(0, 8));
      setTotalDatasets((current) => current + 1);
      setMatchingDatasets((current) => current + 1);
      setTotalRows((current) => current + Number(item.rowCount || 0));
      setPageCount((current) =>
        Math.max(current, Math.ceil((totalDatasets + 1) / 8)),
      );
      setSearch("");
      setDateFilter("all");
      setDatasetPage(1);
      setActive(item);
      setNotice(`${file.name} analyzed successfully.`);
    } catch (error) {
      setNotice(
        error.message === "SESSION_EXPIRED"
          ? "Your session expired. Sign in again to continue."
          : error.message === "Failed to fetch"
            ? "Could not reach the API. Start the server with npm run dev, then upload again."
            : error.message,
        true,
      );
    } finally {
      setUploading(false);
      setUploadingFileName("");
    }
  }

  function uploadSampleDataset() {
    const sampleCsv = [
      "product,category,units,unit_price,region",
      "Notebook,Stationery,18,4.5,North",
      "Desk Lamp,Home,7,22.99,South",
      "Water Bottle,Outdoors,12,15.5,East",
      "Pen Set,Stationery,25,6.25,West",
      "Canvas Tote,Accessories,9,12.0,North",
      "Notebook,Stationery,14,4.5,East",
      "Desk Lamp,Home,,22.99,West",
      "Water Bottle,Outdoors,8,,South",
      "Plant Pot,Home,11,9.75,North",
      "Pen Set,Stationery,20,6.25,South",
    ].join("\n");
    uploadFile(
      new File([sampleCsv], "sample-store-sales.csv", { type: "text/csv" }),
    );
  }
  async function deleteDataset(item) {
    if (!item.id) return;
    setSavingAction(true);
    try {
      const response = await apiRequest(`/datasets/${item.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Delete failed");
      const next = datasets.filter((dataset) => dataset.id !== item.id);
      setDatasets(next);
      setTotalDatasets((current) => Math.max(0, current - 1));
      setTotalRows((current) =>
        Math.max(0, current - Number(item.rowCount || 0)),
      );
      const remainingMatches = Math.max(0, matchingDatasets - 1);
      setMatchingDatasets(remainingMatches);
      setPageCount(Math.max(1, Math.ceil(remainingMatches / 8)));
      if (next.length === 0 && datasetPage > 1)
        setDatasetPage((current) => current - 1);
      if (active?.id === item.id) setActive(next[0] || null);
      setNotice(`${item.name} deleted.`);
      setDeleteTarget(null);
    } catch (error) {
      setNotice(
        error.message === "SESSION_EXPIRED"
          ? "Your session expired. Sign in again to continue."
          : "Could not delete this dataset.",
        true,
      );
    } finally {
      setSavingAction(false);
    }
  }

  async function selectDataset(item) {
    setActive(item);
    if (item.report?.preview?.length || !item.id) {
      document
        .getElementById("analysis-report")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setOpeningReport(true);
    try {
      const response = await apiRequest(`/datasets/${item.id}`);
      if (!response.ok) throw new Error("Could not open report");
      const detail = formatDataset(await response.json());
      setDatasets((current) =>
        current.map((dataset) => (dataset.id === item.id ? detail : dataset)),
      );
      setActive(detail);
      setTimeout(
        () =>
          document
            .getElementById("analysis-report")
            ?.scrollIntoView({ behavior: "smooth", block: "start" }),
        50,
      );
    } catch (error) {
      setNotice(
        error.message === "SESSION_EXPIRED"
          ? "Your session expired. Sign in again to continue."
          : "Could not open this report. Try again.",
        true,
      );
    } finally {
      setOpeningReport(false);
    }
  }

  async function renameDataset(item) {
    const name = renameValue;
    if (!name || !name.trim() || name.trim() === item.name) return;
    setSavingAction(true);
    try {
      const response = await apiRequest(`/datasets/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!response.ok) throw new Error("Rename failed");
      const updated = formatDataset(await response.json());
      setDatasets((current) =>
        current.map((dataset) => (dataset.id === item.id ? updated : dataset)),
      );
      if (active?.id === item.id) setActive(updated);
      setNotice("Dataset renamed.");
      setRenameTarget(null);
    } catch (error) {
      setNotice(
        error.message === "SESSION_EXPIRED"
          ? "Your session expired. Sign in again to continue."
          : "Could not rename this dataset.",
        true,
      );
    } finally {
      setSavingAction(false);
    }
  }

  if (!session?.token)
    return (
      <AuthScreen
        mode={authMode}
        setMode={setAuthMode}
        onSuccess={saveSession}
        notice={notice}
      />
    );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Activity size={18} strokeWidth={2.8} />
          </div>
          <span>
            data<span className="brand-light">lens</span>
          </span>
          <span className="brand-beta">BETA</span>
        </div>
        <div className="workspace-switch">
          <div className="workspace-avatar">
            {session.user.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="workspace-copy">
            <b>{session.user.name}'s workspace</b>
            <span>Free plan</span>
          </div>
          <ChevronDown size={15} />
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav className="main-nav">
          <button
            className={`nav-item ${activeView === "overview" ? "active" : ""}`}
            onClick={() => navigateTo("overview")}
          >
            <LayoutDashboard size={17} />
            Overview
          </button>
          <button
            className={`nav-item ${activeView === "datasets" ? "active" : ""}`}
            onClick={() => navigateTo("datasets")}
          >
            <Database size={17} />
            My datasets<span className="nav-count">{totalDatasets}</span>
          </button>
          <button
            className={`nav-item ${activeView === "reports" ? "active" : ""}`}
            onClick={() => navigateTo("reports")}
          >
            <FileText size={17} />
            Reports
          </button>
        </nav>
        <div className="side-divider" />
        <div className="nav-caption">PREFERENCES</div>
        <nav className="main-nav">
          <a className="nav-item">
            <Settings size={17} />
            Settings
          </a>
          <a className="nav-item">
            <CircleHelp size={17} />
            Help center
          </a>
        </nav>
        <div className="sidebar-bottom">
          <div className="upgrade-card">
            <div className="upgrade-icon">
              <Sparkles size={15} />
            </div>
            <b>Make more of your data</b>
            <p>Upgrade your plan for unlimited datasets and more.</p>
            <button className="upgrade-button">
              Explore plans <ArrowUpRight size={14} />
            </button>
          </div>
          <button className="profile profile-button" onClick={signOut}>
            <div className="profile-avatar">
              {session.user.name
                .split(" ")
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div className="profile-copy">
              <b>{session.user.name}</b>
              <span>{session.user.email}</span>
            </div>
            <span className="signout-label">Sign out</span>
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span>{" "}
            <b>
              {activeView === "overview"
                ? "Overview"
                : activeView === "datasets"
                  ? "My datasets"
                  : "Reports"}
            </b>
          </div>
          <div className="top-actions">
            <div
              className={`status-pill ${serviceStatus === "database" || serviceStatus === "offline" ? "status-warning" : ""}`}
            >
              <span />
              {serviceStatus === "checking"
                ? "Checking systems…"
                : serviceStatus === "ok"
                  ? "All systems operational"
                  : serviceStatus === "database"
                    ? "Database unavailable"
                    : "API unavailable"}
            </div>
            <button className="icon-button">
              <Bell size={18} />
              <i />
            </button>
            <div className="top-avatar">
              {session.user.name
                .split(" ")
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
          </div>
        </header>
        <div className="content">
          <section className="welcome-row">
            <div>
              <div className="eyebrow">
                {new Date()
                  .toLocaleDateString(undefined, {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })
                  .toUpperCase()}
              </div>
              <h1>
                {activeView === "overview"
                  ? `Good morning, ${session.user.name.split(" ")[0]}`
                  : activeView === "datasets"
                    ? "Your datasets"
                    : "Saved reports"}{" "}
                <span className="wave">✳</span>
              </h1>
              <p className="subheading">
                {activeView === "overview"
                  ? "Here's what's happening with your data today."
                  : activeView === "datasets"
                    ? "Browse, search, and manage your uploaded files."
                    : "Open an analysis report or download a copy."}
              </p>
            </div>
            <label
              className={`primary-button ${uploading ? "is-loading" : ""}`}
            >
              <Plus size={17} />
              {uploading ? (
                <>Analyzing {uploadingFileName}…</>
              ) : (
                "Upload dataset"
              )}
              <input type="file" accept=".csv,text/csv" onChange={uploadFile} />
            </label>
          </section>
          {notice && (
            <div
              className={`notice ${noticeError ? "error" : ""}`}
              role={noticeError ? "alert" : "status"}
              aria-live={noticeError ? "assertive" : "polite"}
            >
              {noticeError ? <X size={15} /> : <Check size={15} />}
              {notice}
              <button
                aria-label="Dismiss message"
                onClick={() => setNotice("")}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {activeView === "overview" && (
            <>
              <section className="stats-grid">
                <StatCard
                  label="Total datasets"
                  value={String(totalDatasets).padStart(2, "0")}
                  note="Saved in your workspace"
                  icon={<Database size={17} />}
                  tone="violet"
                  trend="Saved reports"
                />
                <StatCard
                  label="Rows analyzed"
                  value={totalRows.toLocaleString()}
                  note="Across saved datasets"
                  icon={<Table2 size={17} />}
                  tone="blue"
                  trend="All time"
                />
                <StatCard
                  label="Reports generated"
                  value={String(totalDatasets)}
                  note="Ready to revisit"
                  icon={<FileText size={17} />}
                  tone="orange"
                  trend="Saved reports"
                />
                <StatCard
                  label="Data quality"
                  value={
                    datasets.length
                      ? `${Math.round((datasets.reduce((sum, item) => sum + (item.report?.columns?.length ? item.report.columns.reduce((colSum, col) => colSum + (1 - col.missingCount / Math.max(item.rowCount, 1)), 0) / item.report.columns.length : 1), 0) / datasets.length) * 100)}%`
                      : "—"
                  }
                  note="Average completeness"
                  icon={<ShieldCheck size={17} />}
                  tone="green"
                  trend="From reports"
                />
              </section>
            </>
          )}
          {activeView === "overview" && (
            <section className="middle-grid">
              <div className="panel chart-panel">
                <div className="panel-heading">
                  <div>
                    <div className="panel-title">Dataset activity</div>
                    <div className="panel-description">
                      Rows in your latest saved datasets
                    </div>
                  </div>
                  <div className="activity-total">{datasets.length} saved</div>
                </div>
                <div className="chart-legend">
                  <span>
                    <i className="legend-dot revenue-dot" />
                    Rows per dataset
                  </span>
                </div>
                {activityRows.length ? (
                  <div className="chart-wrap">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={activityRows}
                        margin={{ top: 8, right: 2, left: -16, bottom: 0 }}
                      >
                        <CartesianGrid vertical={false} stroke="#edf0f4" />
                        <XAxis
                          dataKey="name"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "#9ba3b1", fontSize: 9 }}
                          dy={9}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "#a5acb7", fontSize: 10 }}
                        />
                        <Tooltip
                          cursor={{ fill: "#f7f8fb" }}
                          contentStyle={{
                            border: "1px solid #eceef2",
                            borderRadius: 10,
                            fontSize: 12,
                          }}
                        />
                        <Bar
                          dataKey="rows"
                          fill="#6558e8"
                          radius={[4, 4, 0, 0]}
                          maxBarSize={28}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="chart-empty">
                    Upload a CSV to see activity here.
                  </div>
                )}
              </div>
              <QualityOverview datasets={datasets} />
            </section>
          )}
          {activeView !== "reports" && (
            <section className="panel datasets-panel">
              <div className="datasets-heading">
                <div>
                  <div className="panel-title">
                    Your datasets{" "}
                    <span className="table-count">{matchingDatasets}</span>
                  </div>
                  <div className="panel-description">
                    Manage and explore your uploaded files
                  </div>
                </div>
                <div className="table-actions">
                  <div className="search-box">
                    <Search size={15} />
                    <input
                      placeholder="Search datasets..."
                      value={search}
                      onChange={(event) => {
                        setSearch(event.target.value);
                        setDatasetPage(1);
                      }}
                    />
                  </div>
                  <select
                    className="filter-button"
                    value={sortBy}
                    onChange={(event) => {
                      setSortBy(event.target.value);
                      setDatasetPage(1);
                    }}
                    aria-label="Sort datasets"
                  >
                    <option value="newest">Newest</option>
                    <option value="oldest">Oldest</option>
                    <option value="nameAsc">Name A–Z</option>
                    <option value="nameDesc">Name Z–A</option>
                    <option value="rowsDesc">Most rows</option>
                  </select>
                  <select
                    className="filter-button"
                    value={dateFilter}
                    onChange={(event) => {
                      setDateFilter(event.target.value);
                      setDatasetPage(1);
                    }}
                    aria-label="Filter datasets by date"
                  >
                    <option value="all">All time</option>
                    <option value="7">Last 7 days</option>
                    <option value="30">Last 30 days</option>
                  </select>
                </div>
              </div>
              <div className="dataset-table">
                <div className="table-header">
                  <span>NAME</span>
                  <span>ROWS</span>
                  <span>COLUMNS</span>
                  <span>LAST ANALYZED</span>
                  <span>STATUS</span>
                  <span />
                </div>
                {loadingDatasets ? (
                  <div className="table-state" role="status" aria-live="polite">
                    <span className="loading-spinner" /> Loading your datasets…
                  </div>
                ) : datasetError ? (
                  <LoadError label="datasets" onRetry={retryDatasetLoad} />
                ) : visibleDatasets.length ? (
                  visibleDatasets.map((item) => (
                    <DatasetRow
                      key={item.id || item.name}
                      item={item}
                      isActive={active?.id === item.id}
                      onSelect={() => selectDataset(item)}
                      onRename={() => {
                        setRenameTarget(item);
                        setRenameValue(item.name);
                      }}
                      onDelete={() => setDeleteTarget(item)}
                    />
                  ))
                ) : (
                  <div className="empty-search">
                    {search || dateFilter !== "all" ? (
                      "No datasets match these filters."
                    ) : totalDatasets === 0 ? (
                      <div className="empty-state">
                        <div className="empty-state-icon">
                          <FileSpreadsheet size={19} />
                        </div>
                        <b>Start with a sample dataset</b>
                        <span>
                          See summaries, data quality checks, and charts with a
                          small example CSV.
                        </span>
                        <button
                          className="sample-button"
                          onClick={uploadSampleDataset}
                          disabled={uploading}
                        >
                          <FileSpreadsheet size={14} />
                          {uploading
                            ? "Analyzing sample…"
                            : "Analyze sample data"}
                        </button>
                      </div>
                    ) : (
                      "No datasets on this page."
                    )}
                  </div>
                )}
              </div>
              <div className="table-footer">
                <span>
                  Showing {matchingDatasets ? (datasetPage - 1) * 8 + 1 : 0}–
                  {Math.min(datasetPage * 8, matchingDatasets)} of{" "}
                  {matchingDatasets} matching datasets
                </span>
                <div className="pagination-controls">
                  <button
                    disabled={datasetPage <= 1 || loadingDatasets}
                    onClick={() => setDatasetPage((page) => page - 1)}
                  >
                    Previous
                  </button>
                  <span>
                    {datasetPage} / {pageCount}
                  </span>
                  <button
                    disabled={datasetPage >= pageCount || loadingDatasets}
                    onClick={() => setDatasetPage((page) => page + 1)}
                  >
                    Next
                  </button>
                </div>
                <button
                  onClick={() =>
                    document.querySelector('input[type="file"]')?.click()
                  }
                >
                  Upload a dataset <ArrowUpRight size={14} />
                </button>
              </div>
            </section>
          )}
          {activeView === "reports" && (
            <ReportsList
              datasets={visibleDatasets}
              loading={loadingDatasets}
              error={datasetError}
              onRetry={retryDatasetLoad}
              page={datasetPage}
              pageCount={pageCount}
              onPage={setDatasetPage}
              onOpen={selectDataset}
            />
          )}

          {openingReport && (
            <div className="report-loading" role="status" aria-live="polite">
              Loading saved report…
            </div>
          )}
          {active?.report && <ReportPanel dataset={active} />}
          {renameTarget && (
            <div
              className="modal-backdrop"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget && !savingAction)
                  setRenameTarget(null);
              }}
            >
              <section
                className="action-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="rename-title"
              >
                <button
                  className="modal-close"
                  aria-label="Close"
                  onClick={() => setRenameTarget(null)}
                >
                  <X size={17} />
                </button>
                <div className="modal-icon rename-icon">
                  <FileText size={17} />
                </div>
                <h2 id="rename-title">Rename dataset</h2>
                <p>Choose a clear name for this saved dataset.</p>
                <label className="modal-label">
                  Dataset name
                  <input
                    autoFocus
                    maxLength={100}
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") renameDataset(renameTarget);
                    }}
                  />
                </label>
                <div className="modal-actions">
                  <button
                    className="secondary-action"
                    onClick={() => setRenameTarget(null)}
                    disabled={savingAction}
                  >
                    Cancel
                  </button>
                  <button
                    className="confirm-action"
                    onClick={() => renameDataset(renameTarget)}
                    disabled={savingAction || !renameValue.trim()}
                  >
                    {savingAction ? "Saving…" : "Save name"}
                  </button>
                </div>
              </section>
            </div>
          )}
          {deleteTarget && (
            <div
              className="modal-backdrop"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget && !savingAction)
                  setDeleteTarget(null);
              }}
            >
              <section
                className="action-modal"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="delete-title"
              >
                <button
                  className="modal-close"
                  aria-label="Close"
                  onClick={() => setDeleteTarget(null)}
                >
                  <X size={17} />
                </button>
                <div className="modal-icon delete-icon">
                  <Trash2 size={17} />
                </div>
                <h2 id="delete-title">Delete this dataset?</h2>
                <p>
                  <b>{deleteTarget.name}</b> and its saved analysis report will
                  be permanently removed.
                </p>
                <div className="modal-actions">
                  <button
                    className="secondary-action"
                    onClick={() => setDeleteTarget(null)}
                    disabled={savingAction}
                  >
                    Cancel
                  </button>
                  <button
                    className="danger-action"
                    onClick={() => deleteDataset(deleteTarget)}
                    disabled={savingAction}
                  >
                    {savingAction ? "Deleting…" : "Delete dataset"}
                  </button>
                </div>
              </section>
            </div>
          )}
          <footer className="page-footer">
            <span>© 2024 DataLens, Inc.</span>
            <span>
              <a>Privacy</a>
              <a>Terms</a>
              <a>
                Status <i className="footer-status" />
              </a>
            </span>
            <span>
              Made for curious minds <span className="heart">♥</span>
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}

function formatDataset(item) {
  const color = ["mint", "lavender", "peach"][
    Math.abs((item.name || "").length) % 3
  ];
  return {
    ...item,
    id: item.id || String(item._id || ""),
    name: item.name || item.fileName || "Untitled dataset",
    rows: Number(item.rowCount || 0).toLocaleString(),
    columnsCount: String(item.columnCount || 0),
    date: item.createdAt
      ? new Date(item.createdAt).toLocaleDateString()
      : "Just now",
    createdAt: item.createdAt,
    type: "CSV",
    color,
    report: item.report || (item.preview ? item : null),
  };
}

function makeActivityRows(datasets) {
  return [...datasets]
    .slice(0, 8)
    .reverse()
    .map((item) => ({
      name: item.name.length > 12 ? `${item.name.slice(0, 10)}…` : item.name,
      rows: Number(item.rowCount || 0),
    }));
}

export default App;
