# Timeline Dashboard — Statement of Work

**Author:** Jordan Roberts  
**Last Updated:** 2026-04-11  
**Current Version:** v0.5.0

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
- ~~Signed metrics, column sort, sample data~~ (v0.4.3) — Volume/net distinction, negative palette ramps, click-to-sort
  column headers, Financial + IT Ticketing datasets, three-card chooser.
- ~~Bug fixes and polish~~ (v0.4.4) — Drag & drop reliability, button visibility, empty state copy, smooth
  sidebar/heatmap scrolling, GitHub Issues fallback, auto-detect date column setting.
- ~~Date picker, settings polish, module split~~ (v0.4.5) — Date column picker modal on CSV load with format detection
  and per-column confidence scoring; conditional month color picker; sample reset preserves theme; source split into
  constants/utils/state/state-io/keyboard/help-modal/settings-modal/date-picker-modal modules; hand-rolled zero-dependency
  test harness with 74 passing tests covering pure-logic surfaces.

*v0.4.6 — Favicon, theme-aware indicators, scroll-state hardening:*

- **Favicon** — Ship the rounded-rhombus heatmap-cell-with-dogear design already integrated at end of v0.4.5 session.
  External `favicon.svg` reference for GitHub Pages; data URI fallback for the bundled single-file distribution.
- **Theme-aware note indicators** — Add an `indicator` field to each of the 12 palette objects in `themes.js`, hand-picked
  for readability against each palette's accent. Both record-level and day-level note indicators consume this field.
  Blue and Teal palettes currently render indicators that are nearly invisible; this fixes that concretely and lays
  infrastructure that the future custom theme system will extend (per-theme indicator overrides via UI).
- **Scroll-state reset on re-ingest** — Explicit defensive reset of geometry state (`state.years`, `state.yearWeekRanges`,
  `state.monthPositions`, scroll position) at the start of every `ingest()` call, even though current code should handle
  this. A user reported an unreproducible bug where scrolling stopped at an arbitrary point after re-dragging the same
  file over an already-loaded dataset. Deep diagnosis deferred to v0.5.0 (developer mode + logger will let us log
  geometry state on each load and catch it if it recurs).

*~~v0.5.0 — Heterogeneous data model, column config, developer mode~~* (shipped 2026-04-19):

- **Heterogeneous records model** — Rebuild the ingest pipeline around "records are documents" rather than "rows conforming to a schema." Each record can have any subset of keys; columns are discovered at ingest, not pre-declared. Filtering, highlighting, and aggregation already handle nulls gracefully and need only minor adjustments. Sets the stage naturally for JSON and streaming sources in v0.5+.
  - Ingest scans the full record set to build the column union and compute cardinality/numeric detection (removing the 50-row sampling heuristic).
  - "Top X" stat cards and filter facet dropdowns display coverage ("active in N of M records").
  - Records without a timestamp are dropped silently; count surfaced in the data source indicator ("N records · K excluded") and detail logged to the developer console.
  - The CSV flow becomes a trivial subset of the heterogeneous model. Existing sample data schemas still declare columns explicitly for convenience.

- **`displayOrder` on schema columns** — Every column gets an integer index during schema detection, owned by the schema rather than inferred from parse order. For CSV this is header position; for JSON it's first-seen key order; future sources pick their own heuristic. All column iteration in the render pipeline sorts by `displayOrder` rather than relying on array position. User overrides persist in state export, keyed by `{dataSource.name, columnKey}` — reloading the same CSV restores saved config; loading a different file starts fresh. (Drag-to-reorder in the column config UI is deferred; infrastructure lays the rails.)

- **Column config UI** — New Settings → Columns tab with three independent boolean flags per column:
  - **Visible** — appears in the log table
  - **Filterable** — appears as a filter facet
  - **Reportable** — included in metric aggregation and selection summary breakdowns

  Auto-detected defaults based on type and cardinality (numeric → visible+reportable; low-cardinality text → all three; high-cardinality text → visible only; the timestamp column is always visible+reportable and locked). Each row shows column name, type hint, and cardinality coverage ("text · 147 unique · in 94% of records"). Changes take effect immediately with a short debounce. Flipping filterable off clears active filters on that column (toast notification). Flipping reportable off disables (but does not delete) metric presets referencing that column.

- **Settings modal restructure** — Sidebar/tabbed layout: General, Columns, Appearance & Themes, Advanced. Reporting tab reserved for v0.6.0. Each section gets its own module: `settings-general.js`, `settings-columns.js`, `settings-appearance.js`, `settings-advanced.js`. `settings-modal.js` reduced to tab switching and orchestration, parallel to help modal's panel pattern.

- **Developer mode + Developer Console** — Settings → Advanced has a Developer Mode toggle. When on, a `</>` icon button appears in the heatmap footer alongside `?` and back. Clicking it opens the Developer Console modal — a dedicated diagnostic surface, not a settings sub-panel (console messages are metadata, not configuration).
  - `js/logger.js` — ring-buffer logger (500-entry cap) with `logger.log(level, category, message, meta)`. No-op when dev mode is off; mirrors to browser console when on.
  - Console UI shows timestamp, level badge (info/warn/error), category, message, and expandable meta JSON. Filter-by-level and filter-by-category dropdowns. Clear / Copy / Export controls.
  - Instrumentation at key pipeline points: ingest (records in, dropped, columns discovered), schema detection (timestamp pick, format, low-confidence warnings), CSV parse (errors, fallbacks, unusual delimiters), filter operations matching zero records, uncaught exceptions in async paths.

*v0.5.1 — Light mode + custom themes:*

- **Light mode** — Full light/dark theme support. Every CSS variable gets a light counterpart; all 12 palettes get
  light-mode tunings for accent contrast; text, borders, shadows, overlays, month indicators, and note indicators
  all recalibrate. Preference toggle in the Appearance & Themes tab (already restructured in v0.5.0), system
  `prefers-color-scheme` auto-detection, preference persisted in state export.
- **Custom themes** — User-defined palettes beyond the 12 presets. Full theme object covers accent, heatmap ramp,
  note indicators (`noteDay`/`noteRow` from v0.4.6), and month indicator color (moved from loose settings into
  the theme model in this release). Month indicator *enabled* remains a global display setting — theme owns the
  color, user owns whether it's shown. Save/load custom themes with state.
  - **Start-from-preset picker** — Theme creator opens with a "Start from…" dropdown listing all 12 presets plus
    any existing user themes. Selection pre-fills every field so the user can duplicate-and-tweak rather than
    build from scratch. Switching source mid-edit prompts to replace in-progress values rather than silently
    merging.
  - **Implementation note:** month indicator color joins `noteDay`/`noteRow` as a palette field on the 12 presets
    and gets set via CSS var by `applyPalette()`, same pattern. `settings.monthIndicatorColor` goes away —
    replaced by `settings.monthIndicatorEnabled` (boolean only). `applyMonthIndicatorColor()` removes entirely,
    since palette switching handles the color.
- **Conditional formatting (basic)** — Per-column, per-value color overrides editable in the Columns tab. "For
  the `status` column, map 'Open' → orange, 'Closed' → gray." Applied to the existing badge column rendering in
  the log table. Persisted with state. Not yet tied to named theme objects — that integration lands in v0.5.2
  alongside custom theme save/load.

*v0.5.2 — Datetime fidelity + multi-key sort + composite sort controls:*

- **Integer-canonical datetime representation** — Parse datetime columns directly to integer epochs (no `Date`
  roundtrip, no ISO string intermediate). Per-column precision detection at ingest using magnitude-range heuristic
  (~1e9 = seconds, ~1e12 = ms, ~1e15 = μs, ~1e18 = ns). Overridable per-column in Columns tab; global override in
  Advanced settings. `BigInt` used for μs/ns precision (safe past year 2255); `Number` for s/ms (safe effectively
  forever). Helper module (`epochCompare`, `epochDiff`, `epochFormat`) masks the Number/BigInt split from most
  callers. Display preserves source precision — no false-precision trailing zeros.
- **Multi-key sort infrastructure** — General `sortEntriesMultiKey(entries, [{key, dir}...])` replaces the current
  single-key sort. Datetime columns sort via `epochCompare`; other columns via existing numeric/string compare.
- **Composite column sort controls** — Each composite column in the Columns tab gets an ordered sort-key list
  (drag-to-reorder, per-level direction toggle). Defaults to the composite's key declaration order. User can
  remove keys from the sort order to make them non-tiebreakers.
- **Composite column filter mode** — Per-composite control: *Combined* (one facet, composite values) vs
  *Constituent* (separate facets per underlying key, current implicit behavior).
- **Conditional formatting → named themes** — Save per-column color maps as part of a named custom theme. Theme
  import/export. Preset color palettes for conditional formatting (sequential, diverging, categorical).

*Future v0.4.x / v0.5.x:*

- **Column config polish** — Drag-to-reorder in the Columns tab, select-all toggles in column headers, right-click column header context menu in the log table.
- **User-defined composite columns** — v0.6.x. "+ Composite column" button in the Columns tab opens an editor
  (label + separator + ordered picker of constituent columns). User-defined composites get the same three flags
  and the sort/filter controls from v0.5.2. Design pass needed on what happens when a constituent column is
  deleted from the source data, and whether filtering on a user-defined composite produces a first-class
  "composite filter" or operates on the underlying fields.

### Mid-term (v0.6.x–v0.8.x)

- **Drill-down reports** — From any selection or filter state, generate a summary report: date range, applied filters,
  aggregate stats, breakdown charts, top-N tables. Exportable as PDF or HTML. Surfaces a **Reporting** tab in the
  settings modal (reserved and hidden since v0.5.0) for report templates and defaults.

- **View-aware aggregation** — Stat cards, metric values, filter counts, selection summaries, and report outputs
  scope by two independent toggles: *scope by viewport* (only records in the currently-visible heatmap range) and
  *scope by selection* (only records within the current multi-select). Both default off, matching today's "all data"
  behavior. As part of this work, existing stat cards unify under a single scope model so aggregations are consistent.
  Natural home is alongside drill-down reports — they share the aggregation primitives. Design questions to resolve
  closer to implementation:
    - When "scope by selection" is on and the user has mixed selection types (days + rows + months), is the effective
      selection the union, intersection, or something the user chooses? Today's multi-select appears to union; making
      it explicit in the report scope may need its own UX.
    - Should the scope toggles live in the report tab only, or also affect the main dashboard's stat cards? If the
      latter, it's a visible behavior change to existing UI that needs thought.
    - What's the right default? "Off" (current behavior, safe) vs "viewport on when scrolled away from full range"
      (more useful out of the box, but surprising).
    - How does scope interact with exported reports — should the export capture the scope as data, or as a snapshot?
    - Auditing which existing aggregations are already selection-aware vs dataset-wide is prerequisite work; the
      inconsistency is hidden today and surfacing it cleanly matters.

- **Inline visualizations** — Small charts embedded in the content pane: time-of-day distribution, day-of-week patterns,
  trend lines across the selected range. Driven by the same schema and filter state.

- **Comparison mode** — Side-by-side or overlay comparison of two filter states, two time ranges, or two datasets. "Show
  me alice.chen vs bob.martinez" or "Q1 vs Q2."

- **Chunked file loading** — Read large CSVs (1GB+) in chunks without freezing the browser. Incremental ingestion
  through the existing `ingest()` entry point. First step toward streaming.

### Pre-release (v0.8.x+)

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

- **Mobile UI** — Touch-first layout with responsive breakpoints. Challenges: heatmap cell size vs. fingertip target
  size (currently 13px cells need to roughly triple), modifier-key selections need touch equivalents (long-press menus,
  dedicated toolbar toggles), the year sidebar and filter bar need different layouts on small screens. Likely a
  dedicated mobile layout rather than a fluid-responsive one given the complexity of the desktop UI.

### 1.0 definition

1.0 ships when the original vision is complete — when nothing from the founding SOW is still in a future-work bucket.
Concretely: heterogeneous data, column config, drill-down reports, inline visualizations, comparison mode, streaming
sources with windowed memory, server-backed collaboration, and mobile UI are all shipped and stable. No target date
and no version-number ramp — 1.0 arrives when it arrives.

### Post-1.0

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
