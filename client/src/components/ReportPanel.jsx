import { ArrowUpRight, Check, Download } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function ReportPanel({ dataset }) {
  const report = dataset.report;
  const columns = report.columns || [];
  const preview = report.preview || [];
  const numericColumns = columns.filter((column) => column.type === "numeric");
  const categoricalColumns = columns.filter(
    (column) => column.type === "categorical",
  );
  const missingData = columns
    .map((column) => ({
      name: column.name,
      missing: Math.max(
        0,
        (column.missingCount || 0) - (column.invalidCount || 0),
      ),
    }))
    .filter((column) => column.missing > 0);
  return (
    <section id="analysis-report" className="panel report-panel">
      <div className="datasets-heading">
        <div>
          <div className="panel-title">Analysis report</div>
          <div className="panel-description">
            {dataset.name} · {Number(dataset.rowCount || 0).toLocaleString()}{" "}
            rows · {dataset.columnCount} columns · {report.duplicateCount || 0}{" "}
            duplicate rows
          </div>
        </div>
        <span className="report-badge">
          <Check size={13} /> Saved report
        </span>
        <button
          className="export-button"
          onClick={() => downloadReportJson(dataset)}
        >
          <Download size={13} /> JSON
        </button>
        <button
          className="export-button"
          onClick={() => downloadColumnSummary(dataset)}
        >
          <Download size={13} /> CSV summary
        </button>
      </div>
      <ReportQualityCards report={report} />
      <div className="report-columns">
        {columns.map((column) => (
          <div className="report-column" key={column.name}>
            <div className="report-column-heading">
              <b>{column.name}</b>
              <span>{column.type}</span>
            </div>
            <div className="report-column-meta">
              {column.missingCount} missing
              {column.invalidCount ? ` · ${column.invalidCount} invalid` : ""} ·{" "}
              {column.type === "numeric"
                ? `mean ${column.mean}, median ${column.median}`
                : `${column.uniqueCount} unique values`}
            </div>
            {column.type === "numeric" && (
              <div className="report-column-range">
                Range {column.min} – {column.max}{" "}
                <span>SD {column.standardDeviation}</span>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="visualization-grid">
        {numericColumns.map((column) => (
          <NumericHistogram key={column.name} column={column} />
        ))}
        {categoricalColumns.slice(0, 3).map((column) => (
          <CategoryChart key={column.name} column={column} />
        ))}
        {missingData.length > 0 && <MissingChart data={missingData} />}
        {numericColumns.length > 1 && <CorrelationHeatmap report={report} />}
      </div>
      {preview.length > 0 && (
        <div className="preview-wrap">
          <div className="preview-title">First rows</div>
          <div className="preview-table-wrap">
            <table className="preview-table">
              <thead>
                <tr>
                  {Object.keys(preview[0]).map((name) => (
                    <th scope="col" key={name}>
                      {name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, index) => (
                  <tr key={index}>
                    {Object.values(row).map((value, cellIndex) => (
                      <td key={cellIndex}>
                        {value === "" ? (
                          <span className="missing-value">Missing</span>
                        ) : (
                          String(value)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

export function StatCard({ label, value, note, icon, tone, trend }) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <div className={`stat-icon ${tone}`}>{icon}</div>
        <span className="stat-trend">
          <ArrowUpRight size={13} />
          {trend}
        </span>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-note">{note}</div>
    </div>
  );
}
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
function ReportQualityCards({ report }) {
  const columns = report.columns || [];
  const rowCount = Number(report.rowCount || 0);
  const totalCells = columns.reduce(
    (sum, column) => sum + Number(column.totalCount || rowCount),
    0,
  );
  const blanks = columns.reduce(
    (sum, column) =>
      sum +
      Math.max(
        0,
        Number(column.missingCount || 0) - Number(column.invalidCount || 0),
      ),
    0,
  );
  const invalid = columns.reduce(
    (sum, column) => sum + Number(column.invalidCount || 0),
    0,
  );
  const completeness = totalCells
    ? Math.round((1 - blanks / totalCells) * 100)
    : 100;
  const duplicates = Number(report.duplicateCount || 0);
  const warnings = [];
  if (blanks) warnings.push(`${blanks.toLocaleString()} blank cells`);
  if (invalid)
    warnings.push(`${invalid.toLocaleString()} invalid numeric values`);
  if (duplicates)
    warnings.push(`${duplicates.toLocaleString()} duplicate rows`);
  return (
    <>
      <div className="report-quality-grid">
        <ReportMetric
          label="Completeness"
          value={`${completeness}%`}
          detail={`${blanks.toLocaleString()} blank cells`}
          tone={completeness < 90 ? "attention" : "good"}
        />
        <ReportMetric
          label="Duplicate rows"
          value={duplicates.toLocaleString()}
          detail={duplicates ? "Repeated records found" : "No repeated rows"}
          tone={duplicates ? "attention" : "good"}
        />
        <ReportMetric
          label="Invalid numeric values"
          value={invalid.toLocaleString()}
          detail={invalid ? "Excluded from numeric stats" : "No parsing issues"}
          tone={invalid ? "attention" : "good"}
        />
      </div>
      <div
        className={`quality-notice ${warnings.length ? "has-warnings" : ""}`}
      >
        <span className="quality-notice-icon">
          {warnings.length ? "!" : "✓"}
        </span>
        <div>
          <b>
            {warnings.length
              ? "Review these data quality findings"
              : "No data quality issues found"}
          </b>
          <span>
            {warnings.length
              ? warnings.join(" · ")
              : "No blank cells, invalid numeric values, or duplicate rows were detected."}
          </span>
        </div>
      </div>
    </>
  );
}
function ReportMetric({ label, value, detail, tone }) {
  return (
    <div className={`report-metric ${tone}`}>
      <span>{label}</span>
      <b>{value}</b>
      <small>{detail}</small>
    </div>
  );
}
function downloadReportJson(dataset) {
  const reportFile = {
    exportedAt: new Date().toISOString(),
    dataset: {
      name: dataset.name,
      rows: dataset.rowCount,
      columns: dataset.columnCount,
    },
    report: dataset.report,
  };
  downloadFile(
    `${fileBaseName(dataset.name)}-report.json`,
    JSON.stringify(reportFile, null, 2),
    "application/json",
  );
}
function downloadColumnSummary(dataset) {
  const headings = [
    "column",
    "type",
    "missing",
    "invalid",
    "unique_values",
    "mean",
    "median",
    "standard_deviation",
    "min",
    "max",
  ];
  const rows = (dataset.report.columns || []).map((column) => [
    column.name,
    column.type,
    column.missingCount || 0,
    column.invalidCount || 0,
    column.uniqueCount ?? "",
    column.mean ?? "",
    column.median ?? "",
    column.standardDeviation ?? "",
    column.min ?? "",
    column.max ?? "",
  ]);
  const csv = [headings, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
  downloadFile(
    `${fileBaseName(dataset.name)}-column-summary.csv`,
    `\uFEFF${csv}`,
    "text/csv;charset=utf-8",
  );
}
function csvCell(value) {
  const text = String(value ?? "");
  const safeText =
    typeof value === "string" && /^[\u0000-\u0020]*[=+@-]/.test(text)
      ? `'${text}`
      : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}
function fileBaseName(name) {
  return (
    name
      .replace(/\.csv$/i, "")
      .replace(/[^a-z0-9-_]+/gi, "-")
      .replace(/^-|-$/g, "") || "dataset"
  );
}
function downloadFile(fileName, contents, type) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function NumericHistogram({ column }) {
  const bins = column.histogram || [];
  return (
    <div
      className="visual-card"
      role="group"
      aria-label={`Histogram for ${column.name}`}
    >
      <div className="visual-heading">
        <b>{column.name}</b>
        <span>{column.totalCount?.toLocaleString()} rows</span>
      </div>
      {bins.length ? (
        <ResponsiveContainer width="100%" height={155}>
          <BarChart
            data={bins}
            margin={{ top: 8, right: 4, left: -22, bottom: 0 }}
          >
            <CartesianGrid vertical={false} stroke="#edf0f4" />
            <XAxis
              dataKey="range"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#9298a4", fontSize: 8 }}
            />
            <YAxis
              allowDecimals={false}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#a5acb7", fontSize: 8 }}
            />
            <Tooltip
              contentStyle={{
                border: "1px solid #eceef2",
                borderRadius: 8,
                fontSize: 10,
              }}
            />
            <Bar dataKey="count" fill="#695ce8" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="visual-empty">
          No numeric values available to chart.
        </div>
      )}
      {bins.length > 0 && (
        <ChartDataTable
          label={`Histogram data for ${column.name}`}
          headers={["Value range", "Rows"]}
          rows={bins.map((bin) => [bin.range, bin.count])}
        />
      )}
    </div>
  );
}

function CategoryChart({ column }) {
  const categories = column.topCategories || [];
  const data = categories.map(({ name, count }) => ({
    name: name.length > 13 ? `${name.slice(0, 12)}…` : name,
    count,
  }));
  return (
    <div
      className="visual-card"
      role="group"
      aria-label={`Category counts for ${column.name}`}
    >
      <div className="visual-heading">
        <b>{column.name}</b>
        <span>Top of {column.totalCount?.toLocaleString()} rows</span>
      </div>
      {data.length ? (
        <ResponsiveContainer width="100%" height={155}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 2, right: 8, left: 4, bottom: 0 }}
          >
            <CartesianGrid horizontal={false} stroke="#edf0f4" />
            <XAxis
              type="number"
              allowDecimals={false}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#a5acb7", fontSize: 8 }}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={70}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#9298a4", fontSize: 8 }}
            />
            <Tooltip
              contentStyle={{
                border: "1px solid #eceef2",
                borderRadius: 8,
                fontSize: 10,
              }}
            />
            <Bar dataKey="count" fill="#7bbca2" radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="visual-empty">
          No category values available to chart.
        </div>
      )}
      {categories.length > 0 && (
        <ChartDataTable
          label={`Category counts for ${column.name}`}
          headers={["Category", "Rows"]}
          rows={categories.map(({ name, count }) => [name, count])}
        />
      )}
    </div>
  );
}

function MissingChart({ data }) {
  const chartData = data.map(({ name, missing }) => ({
    name: shortName(name),
    missing,
  }));
  return (
    <div
      className="visual-card"
      role="group"
      aria-label="Missing values by column"
    >
      <div className="visual-heading">
        <b>Missing values</b>
        <span>Blank rows per column</span>
      </div>
      <ResponsiveContainer width="100%" height={155}>
        <BarChart
          data={chartData}
          margin={{ top: 8, right: 4, left: -22, bottom: 0 }}
        >
          <CartesianGrid vertical={false} stroke="#edf0f4" />
          <XAxis
            dataKey="name"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#9298a4", fontSize: 8 }}
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#a5acb7", fontSize: 8 }}
          />
          <Tooltip
            contentStyle={{
              border: "1px solid #eceef2",
              borderRadius: 8,
              fontSize: 10,
            }}
          />
          <Bar dataKey="missing" fill="#e6a365" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <ChartDataTable
        label="Missing cells by column"
        headers={["Column", "Blank cells"]}
        rows={data.map(({ name, missing }) => [name, missing])}
      />
    </div>
  );
}

function ChartDataTable({ label, headers, rows }) {
  return (
    <details className="chart-data-details">
      <summary>View data for {label}</summary>
      <div className="chart-data-table-wrap">
        <table className="chart-data-table">
          <caption>{label}</caption>
          <thead>
            <tr>
              {headers.map((header) => (
                <th scope="col" key={header}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((value, cellIndex) =>
                  cellIndex === 0 ? (
                    <th scope="row" key={cellIndex}>
                      {value}
                    </th>
                  ) : (
                    <td key={cellIndex}>{value}</td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function CorrelationHeatmap({ report }) {
  const values = report.correlationNames || [];
  const matrix = report.correlationMatrix || [];
  return (
    <div className="visual-card" role="group" aria-label="Correlation heatmap">
      <div className="visual-heading">
        <b>Correlation heatmap</b>
        <span>All dataset rows</span>
      </div>
      <div className="heatmap-wrap">
        <table className="heatmap">
          <thead>
            <tr>
              <th scope="col">Column</th>
              {values.map((name) => (
                <th scope="col" key={name} title={name}>
                  <span>{shortName(name)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {values.map((rowName, rowIndex) => (
              <tr key={rowName}>
                <th scope="row" title={rowName}>
                  {shortName(rowName)}
                </th>
                {values.map((columnName, columnIndex) => {
                  const correlation = matrix[rowIndex]?.[columnIndex];
                  const strength = Number.isFinite(correlation)
                    ? Math.abs(correlation)
                    : 0;
                  const background =
                    correlation >= 0
                      ? `rgba(104, 91, 225, ${0.08 + strength * 0.75})`
                      : `rgba(224, 137, 108, ${0.08 + strength * 0.75})`;
                  return (
                    <td
                      key={columnName}
                      style={{ background }}
                      title={`${rowName} / ${columnName}: ${Number.isFinite(correlation) ? correlation.toFixed(2) : "not available"}`}
                    >
                      {Number.isFinite(correlation)
                        ? correlation.toFixed(2)
                        : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function shortName(name) {
  return name.length > 8 ? `${name.slice(0, 7)}…` : name;
}
function roundNumber(number) {
  return Math.round(number * 100) / 100;
}
export default ReportPanel;
