# Timeline Dashboard — Statement of Work

**Author:** Jordan Roberts  
**Last Updated:** 2026-04-11  
**Current Version:** v0.4.3

---

## What is this tool?

Timeline Dashboard is a **read-only investigation and annotation tool** for large time series datasets. It lets users
visually navigate years of timestamped records through a scrollable heatmap, drill into specific days, and annotate
their findings — without ever modifying the source data.

### Core capabilities

- **Visual navigation** — A GitHub-style heatmap spanning multiple years, scrollable via a year sidebar. Users can see
  density patterns at a glance and click into any day for detail.

- **Schema-driven rendering** — Any CSV with a timestamp column works. The tool auto-detects the timestamp format and
  column structure, then renders filters, log tables, and stats based on the detected (or user-configured) schema.

- **Faceted filtering** — Multi-select filters on any column. Filters can operate in exclude mode (narrow the dataset)
  or highlight mode (visually emphasize matching records on the heatmap while keeping everything visible).

- **Multi-select analysis** — Click, Ctrl+click, Shift+click (row), Alt+click (column), M+click (month), Y+click (year),
  and Ctrl+A to select arbitrary sets of days. The selection summary panel shows aggregate stats, breakdowns, and top
  values across the selection.

- **Annotation** — Day-level and row-level notes. Notes are text-only and exist as a layer on top of the data. They are
  saved/loaded via state files, not written back to the source.

- **Highlighting** — Filters can be toggled to highlight mode with per-filter color selection. Highlighted cells show a
  radial gradient overlay on the (grayscaled) heatmap. Highlighted values are colored in the log table, including
  per-part coloring on composite columns.

- **Theming** — 12-palette theme picker that adjusts heatmap colors and all accent elements globally.

- **State persistence** — Export/import of notes, filters, modes, highlight colors, visible columns, and palette as a
  JSON file. Independent of the data file.

- **Single-file distribution** — The entire tool builds to one self-contained HTML file for easy sharing via Teams,
  email, or any file transfer. No server required for basic use.

---

## What isn't this tool?

### Not a data editor

Timeline Dashboard does not create, modify, delete, or write back to source data. The only user-generated content is
notes (day-level and row-level), which live in the state layer, never in the data. If a user needs to fix a record, they
do it at the source and reload.

### Not an ETL pipeline

The tool consumes data — it does not transform, clean, join, or export it. CSV parsing and timestamp normalization
happen at load time to make the data viewable, but the original records are not altered for downstream use.

### Not a real-time monitoring dashboard

There is no live polling, WebSocket connection, or auto-refresh. Data is loaded once per session. Real-time use cases (
alerting, streaming ingestion) are out of scope. The architecture supports adding a WebSocket source in the future, but
the tool's design assumes batch analysis of historical data.

### Not a reporting tool (yet)

The tool does not currently generate exportable reports, charts, or visualizations beyond what's shown on screen. This
is a planned capability (see below), not a current one.

### Not a collaboration platform (yet)

State files can be shared manually, but there is no server, no user accounts, no concurrent editing, no conflict
resolution. Collaboration is planned as a backend feature.

---

## What will this tool be?

### Near-term (v0.4.x)

*Completed:*

- ~~Settings modal~~ (v0.4.0) — Gear icon, modal with theme/palette. Three-tab help modal. Feedback/bug report.
- ~~Display settings~~ (v0.4.1) — Hide days of week, month boundary indicators with jagged line + glow + color picker,
  auto-focus threshold, W+click always additive.
- ~~Metric tabs~~ (v0.4.2) — Configurable presets (count, count distinct, sum, avg, min, max), numeric column detection,
  metric-aware stats and badges, auto-thresholds per metric.

*v0.4.3 — Signed metrics, column sort, sample data expansion:*

- **Signed metric support** — Columns with negative values (e.g. financial transactions) get two metric modes:
    - *Volume* — Absolute sum of all values. Answers "how active was this day?"
    - *Net* — Diverging color scale: positive intensifies in one hue direction, negative in the other, zero is neutral.
      Each palette gains a negative ramp (nhm1–nhm4). Answers "did I gain or lose?"
- **Column sort in day log** — Click column header to sort. Default sort by time. Toggle ascending/descending. Visual
  indicator on active sort column.
- **Financial sample data** — Transaction records with signed amounts (income/expenses), categories, descriptions,
  accounts. Exercises the diverging scale.
- **Ticketing sample data** — Support tickets with ticket IDs, assignees, priorities, statuses, categories, response
  times. Exercises count distinct and avg metrics.
- **Sample data chooser** — Three-card selection screen on empty state (Database, Financial, Ticketing) with icons,
  descriptions, and field lists. Replaces the single "Generate Sample Data" button.

*Future v0.4.x:*

- **Full theme system** — Light mode, custom color schemes beyond the 12-palette picker. Settings panel with persistent
  preferences.

### Mid-term (v0.5.x–v0.7.x)

- **Drill-down reports** — From any selection or filter state, generate a summary report: date range, applied filters,
  aggregate stats, breakdown charts, top-N tables. Exportable as PDF or HTML.

- **Inline visualizations** — Small charts embedded in the content pane: time-of-day distribution, day-of-week patterns,
  trend lines across the selected range. Driven by the same schema and filter state.

- **Comparison mode** — Side-by-side or overlay comparison of two filter states, two time ranges, or two datasets. "Show
  me alice.chen vs bob.martinez" or "Q1 vs Q2."

- **Chunked file loading** — Read large CSVs (1GB+) in chunks without freezing the browser. Incremental ingestion
  through the existing `ingest()` entry point. First step toward streaming.

### Pre-release (v0.7.x–v0.9.x)

- **Streaming data sources** — WebSocket and REST API connections for live data feeds. Requires three architectural
  changes:
    1. *Incremental heatmap rendering* — Patch cells in place as records arrive instead of full DOM rebuild.
    2. *Memory management* — Windowed data retention (keep last N days in memory) or indexed backing store (IndexedDB)
       for datasets that exceed browser RAM.
    3. *Incremental aggregation* — Update day counts and filter indexes as records arrive, not recompute from scratch.

  The `ingest(records, schema)` entry point was designed as the seam where chunked/streaming loading plugs in. The work
  is downstream of it.

- **Backend and collaboration** — Server-side state persistence (notes, filters, schema overrides). User accounts.
  Shareable dashboard URLs. Eventually, concurrent annotation with conflict resolution.

### Long-term (v1.0+)

- **Plugin/extension system** — Custom columns, custom heatmap metrics, custom report templates. Third-party
  integrations (Jira, Slack, PagerDuty) for correlating timeline data with external events.

- **Embeddable widget** — A lightweight version of the heatmap + filter bar that can be embedded in other web
  applications via iframe or web component.

- **Public hosting** — GitHub Pages or similar for the base tool. Optional paid tier for the collaboration backend.

---

## Guiding principles

1. **Read-only by design.** The tool observes data. It does not change it. Notes are the sole exception, and they live
   in a separate layer.

2. **Single-file first.** Every feature must work in the single-file HTML distribution through prototyping. From v1.0,
   the tool is expected to live on a server, but the single-file build remains available as a lightweight offline
   fallback.

3. **Schema-driven, not hardcoded.** Rendering, filtering, stats, and highlighting all derive from the schema. Adding a
   new data source should require zero UI code changes.

4. **Progressive disclosure.** The tool should be useful with zero configuration (load a CSV, see a heatmap). Advanced
   features (highlight mode, multi-select, notes, themes) are discoverable but never required.

5. **Performance over polish.** A fast, responsive tool with rough edges beats a beautiful tool that lags on real data.
