import { ArrowUpRight, Check, FileSpreadsheet, FileText, Trash2 } from "lucide-react";

function QualityRow({ label, value, percent, color }) {
  return (
    <div className="quality-row">
      <div>
        <span>{label}</span>
        <b>{value}</b>
      </div>
      <div className="progress-track">
        <i className={color} style={{ width: percent }} />
      </div>
    </div>
  );
}

export function QualityOverview({ datasets }) {
  const columns = datasets.flatMap((dataset) => dataset.report?.columns || []);
  const totalCells = columns.reduce(
    (sum, column) => sum + Number(column.totalCount || 0),
    0,
  );
  const missingCells = columns.reduce(
    (sum, column) => sum + Number(column.missingCount || 0),
    0,
  );
  const completeness = totalCells
    ? Math.round((1 - missingCells / totalCells) * 100)
    : 0;
  const duplicateRows = datasets.reduce(
    (sum, dataset) => sum + Number(dataset.duplicateCount || 0),
    0,
  );
  const uniqueness = datasets.length
    ? Math.round(
      (1 -
        duplicateRows /
        Math.max(
          datasets.reduce(
            (sum, dataset) => sum + Number(dataset.rowCount || 0),
            0,
          ),
          1,
        )) *
      100,
    )
    : 0;
  const quality = Math.round(
    (completeness + uniqueness) / (datasets.length ? 2 : 1),
  );
  return (
    <div className="panel quality-panel">
      <div className="panel-heading">
        <div>
          <div className="panel-title">Data quality overview</div>
          <div className="panel-description">Calculated from saved reports</div>
        </div>
        <div className="activity-total">{datasets.length} datasets</div>
      </div>
      <div className="quality-score">
        <div
          className="score-ring"
          style={{
            background: `conic-gradient(#6759e9 0 ${quality}%,#eeedf8 ${quality}% 100%)`,
          }}
        >
          <div>
            <strong>{datasets.length ? quality : "—"}</strong>
            <small>/ 100</small>
          </div>
        </div>
        <div className="score-copy">
          <b>
            {datasets.length
              ? quality > 85
                ? "Looking good!"
                : "Room to improve"
              : "No reports yet"}
          </b>
          <span>
            {datasets.length
              ? "Based on completeness and duplicates"
              : "Upload a CSV to get started"}
          </span>
        </div>
      </div>
      <div className="quality-list">
        <QualityRow
          label="Completeness"
          value={`${completeness}%`}
          percent={`${completeness}%`}
          color="purple"
        />
        <QualityRow
          label="Uniqueness"
          value={`${uniqueness}%`}
          percent={`${uniqueness}%`}
          color="blue"
        />
        <QualityRow
          label="Reports saved"
          value={String(datasets.length)}
          percent={`${Math.min(datasets.length * 12, 100)}%`}
          color="orange"
        />
      </div>
      <div className="quality-footer">
        <span>
          <Check size={14} /> Based on your actual data
        </span>
      </div>
    </div>
  );
}

export function ReportsList({
  datasets,
  loading,
  error,
  onRetry,
  page,
  pageCount,
  onPage,
  onOpen,
}) {
  return (
    <section className="panel reports-list">
      <div className="datasets-heading">
        <div>
          <div className="panel-title">Saved analysis reports</div>
          <div className="panel-description">
            Open an analysis to view its charts, summary, and row preview.
          </div>
        </div>
      </div>
      {loading ? (
        <div className="table-state" role="status" aria-live="polite">
          <span className="loading-spinner" /> Loading reports…
        </div>
      ) : error ? (
        <LoadError label="reports" onRetry={onRetry} />
      ) : datasets.length ? (
        <div className="reports-cards">
          {datasets.map((dataset) => (
            <article className="saved-report-card" key={dataset.id}>
              <div className={`file-icon ${dataset.color}`}>
                <FileSpreadsheet size={17} />
              </div>
              <div className="saved-report-copy">
                <b>{dataset.name}</b>
                <span>
                  {dataset.rows} rows · {dataset.columnsCount} columns ·{" "}
                  {dataset.date}
                </span>
              </div>
              <button
                className="open-report-button"
                onClick={() => onOpen(dataset)}
              >
                Open report <ArrowUpRight size={14} />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-search" role="status">
          No saved reports yet. Upload and analyze a CSV to get started.
        </div>
      )}
      <div className="reports-footer">
        <span>
          {datasets.length} report{datasets.length === 1 ? "" : "s"} on this
          page
        </span>
        <div className="pagination-controls">
          <button
            disabled={page <= 1 || loading || error}
            onClick={() => onPage(page - 1)}
          >
            Previous
          </button>
          <span>
            {page} / {pageCount}
          </span>
          <button
            disabled={page >= pageCount || loading || error}
            onClick={() => onPage(page + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
export function LoadError({ label, onRetry }) {
  return (
    <div className="load-error" role="alert">
      <b>Could not load {label}.</b>
      <span>Check that the API and database are running, then try again.</span>
      <button className="retry-button" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
export function DatasetRow({ item, isActive, onSelect, onRename, onDelete }) {
  return (
    <div
      className={`dataset-row ${isActive ? "selected" : ""}`}
      tabIndex={0}
      role="button"
      aria-label={`${item.name}, ${item.rows} rows, open report`}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (
          event.target === event.currentTarget &&
          (event.key === "Enter" || event.key === " ")
        ) {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="dataset-name">
        <div className={`file-icon ${item.color}`}>
          <FileSpreadsheet size={17} />
        </div>
        <div>
          <b>{item.name}</b>
          <small>CSV file · saved report</small>
        </div>
      </div>
      <span className="cell-muted">{item.rows}</span>
      <span className="cell-muted">{item.columnsCount}</span>
      <span className="cell-muted">{item.date}</span>
      <span>
        <i className="ready-dot" />
        Ready
      </span>
      <div className="row-buttons">
        <button
          className="row-menu open-row-action"
          title="Open report"
          aria-label={`Open report for ${item.name}`}
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
        >
          <ArrowUpRight size={14} />
        </button>
        <button
          className="row-menu"
          title="Rename dataset"
          aria-label={`Rename ${item.name}`}
          onClick={(event) => {
            event.stopPropagation();
            onRename();
          }}
        >
          <FileText size={14} />
        </button>
        <button
          className="row-menu"
          title="Delete dataset"
          aria-label={`Delete ${item.name}`}
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}
