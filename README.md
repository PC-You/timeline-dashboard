# Timeline Dashboard v0.4.3

A tool for viewing large amounts of time series data with a scrollable heatmap, faceted filters, and an annotation
system. Works with any CSV that has a timestamp column.

© 2026 Jordan Roberts

## Quick Start

### Development (modular)

Serve the project root with any static server:

```bash
python -m http.server 8080
npx serve .
# or VS Code Live Server
```

Then open `http://localhost:8080`. ES modules require HTTP — `file://` will not work.

### Distribution (single file)

```bash
./build.sh                          # outputs dist/timeline-dashboard.html
./build.sh my-custom-name.html      # custom output path
```

## Project Structure

```
timeline-dashboard/
├── index.html          HTML shell
├── css/
│   └── dashboard.css   All styles
├── js/
│   ├── state.js        Shared state, constants, utilities, app registry
│   ├── schema.js       Schema detection and definition
│   ├── csv.js          Pure CSV/TSV parser + sample data generator
│   ├── data.js         Ingest entry point, indexing, filtering, aggregation
│   ├── filters.js      Schema-driven faceted multi-select filters
│   ├── notes.js        Day and row notes with heatmap indicators
│   ├── highlights.js   Row/column/day highlighting with generic summary
│   ├── heatmap.js      Heatmap rendering, tooltips, cell interactions
│   ├── sidebar.js      Year navigation sidebar + heatmap sync
│   ├── content.js      Schema-driven content pane (stats, log, summary)
│   └── main.js         Entry point: boot, wiring, event delegation
├── build.sh            Single-file build script
└── dist/               Built output
```

## Architecture

### Data Flow

```
Source (CSV, API, WebSocket, etc.)
  │
  ├── produces: { records[], headers[]? }
  │
  ▼
schema.js ── detectSchema(headers) or predefined schema
  │
  ▼
data.js ── ingest(records, schema)
  │
  ├── state.raw, state.schema, state.filters
  ├── buildIndexes()    → state.columnValues
  ├── applyFilters()    → state.filtered, state.dayValues, state.dayEntries
  │
  ▼
Render pipeline (all schema-driven)
  ├── filters.js   → reads schema.filterColumns
  ├── content.js   → reads schema.logColumns, schema.primaryColumn, etc.
  ├── heatmap.js   → reads schema.heatmapMetric
  └── highlights.js → reads schema.breakdownColumn, primaryColumn, etc.
```

### Adding a New Data Source

To connect a new source (REST API, WebSocket, etc.):

1. Create a new module (e.g. `js/api.js`)
2. Fetch/receive records as an array of plain objects
3. Define or detect a schema
4. Call `ingest(records, schema)` then `app.fullRender()`

The rest of the pipeline handles everything automatically.

### Schema Object

The schema tells the pipeline how to interpret generic records:

```js
{
    columns: [                           // All column definitions
        {key: 'timestamp', header: 'Timestamp', type: 'datetime'},
        {key: 'user', header: 'User', type: 'text'},
        ...
    ],
        timestampKey
:
    'timestamp',           // Which column is the time axis
        filterColumns
:
    ['user', 'status'],   // Faceted filter columns
        logColumns
:
    [                        // Day log table columns
        {key: 'timestamp', label: 'Time', display: 'time'},
        {key: 'user', label: 'User', display: 'primary'},
        {key: 'status', label: 'Status', display: 'badge'},
    ],
        heatmapMetric
:
    {                     // What the heatmap visualises
        type: 'count',                     // 'count' | 'sum' | 'avg' | 'min' | 'max'
            column
    :
        null,                      // column to aggregate (null for count)
            label
    :
        'event',                    // singular
            labelPlural
    :
        'events',            // plural
            thresholds
    :
        [3, 8, 18],           // heatmap level boundaries (null = auto)
    }
,
    badgeColumn: 'status',              // Column rendered as colored badges
        badgeColors
:
    { ...
    }
,               // Value → { bg, fg } color map
    primaryColumn: 'user',              // "Top X" in stat cards and summary
        secondaryColumn
:
    'category',        // Second "Top X" in summary
        breakdownColumn
:
    'status',          // Per-value counts in summary
}
```

Auto-detected schemas (from CSV headers) produce a functional default. The sample data generator provides a fully
configured schema demonstrating all options.

### Log Column Display Types

| Display   | Rendering                                   |
|-----------|---------------------------------------------|
| `time`    | Extracts HH:MM:SS from timestamp, monospace |
| `text`    | Plain text (default)                        |
| `primary` | Bold, light text                            |
| `mono`    | Monospace, muted                            |
| `accent`  | Monospace, accent color                     |
| `badge`   | Colored pill (uses badgeColors config)      |

Multi-key columns are supported via `keys` + `separator`:

```js
{
    keys: ['first_name', 'last_name'], label
:
    'Name', display
:
    'primary', separator
:
    ' '
}
```

## Keyboard Shortcuts (Heatmap)

| Action                        | Behavior                                                    |
|-------------------------------|-------------------------------------------------------------|
| Click                         | Select day, clear highlights                                |
| Ctrl+Click                    | Toggle individual day into summary                          |
| Shift+Click                   | Select entire row (day of week)                             |
| Ctrl+Shift+Click              | Add/remove row (multi-select)                               |
| Alt+Click                     | Select entire column (week)                                 |
| Ctrl+Alt+Click                | Add/remove column (multi-select)                            |
| M+Click                       | Select entire calendar month                                |
| Ctrl+M+Click                  | Add month to selection                                      |
| Y+Click                       | Select entire calendar year                                 |
| Ctrl+Y+Click                  | Add year to selection                                       |
| W+Click                       | Select 7 days starting from clicked cell                    |
| Ctrl+W+Click                  | Add week to selection                                       |
| Ctrl+A                        | Select all cells                                            |
| Esc                           | Clear all selections                                        |
| Hold Ctrl (with day selected) | Preview summary; demotes on release if nothing else clicked |
| Arrow Up/Down                 | Navigate ±1 day (single-select)                             |
| Arrow Left/Right              | Navigate ±1 week (single-select)                            |
| Ctrl+Z                        | Undo selection change                                       |
| Ctrl+Y                        | Redo selection change                                       |

## CSV Format

Any CSV with a timestamp column works. The parser auto-detects the timestamp by header name. Recognised timestamp
headers: `timestamp`, `ts`, `datetime`, `date`, `time`, `created_at`, `created`, `occurred`, `event_time`, `event_date`.

All other columns are automatically available as filters and log table columns.

## Architecture & Roadmap Notes

These notes supplement the user-facing SOW (`SOW.md`) with technical implementation details relevant to contributors.

### Streaming data sources (planned v0.7–0.9)

The `ingest(records, schema)` entry point was designed as the seam where chunked/streaming loading plugs in. Streaming
requires three downstream changes:

1. **Incremental heatmap rendering** — `renderHeatmap()` currently rebuilds the entire DOM. Streaming needs to patch
   cells in place as records arrive, not recreate the grid.
2. **Memory management** — A million-row dataset in `state.raw` as JS objects consumes ~500MB+ of browser RAM. Streaming
   implies windowed data retention (keep last N days in memory) or an indexed backing store (IndexedDB).
3. **Incremental aggregation** — `applyFilters()` currently recomputes day counts across the full dataset. Streaming
   needs additive updates to `state.dayValues` and `state.dayEntries` as records arrive.

Chunked CSV loading (mid-term) is the prerequisite: read large files without freezing the browser by feeding `ingest()`
in batches. Live WebSocket feeds would build on that foundation.

### Auto-focus threshold

`AUTO_FOCUS_THRESHOLD` in `state.js` controls how many selected days auto-expand into focused view (default: 7). This is
a constant now, intended to become a user-configurable setting in v0.4.0 when the settings panel is built.

### Selection model

Selections are stored as four Sets: `highlightedRows` (day-of-week indices), `highlightedCols` (week indices),
`highlightedDays` (date keys), `highlightedMonths` (YYYY-MM strings). `getSelectedDays()` in `highlights.js` resolves
these into a flat list of date keys by scanning heatmap cells.

`focusedDays` is a separate Set that tracks which days are promoted to focused view. It is a **view state**, not a
selection state — it is not included in undo/redo snapshots but is persisted in state export.

### Version management

`VERSION` file at project root is the single source of truth. Run `./bump.sh 0.4.0` to update all locations:
`index.html` title, `README.md` heading, `js/main.js` export version, and `SOW.md` current version.

## Changelog

### v0.4.3 (2026-04-13)

- **Signed metric support**: volume/net mode toggle on tabs targeting signed columns; volume shows absolute magnitudes,
  net shows diverging positive/negative scale
- **Negative palette ramps**: hand-picked complementary nhm1–nhm4 colors for all 12 themes; dynamic legend switches
  between standard and diverging layout
- **Column sort**: click any header to sort ascending/descending; persists across day switches; visual indicator (▴/▾)
  on active column; works in single-day, focused-day, and peek views
- **Financial sample data**: transaction records with signed amounts (income/expenses), categories, descriptions,
  running balances, multiple accounts
- **IT Ticketing sample data**: ticket lifecycle events with requestors, technicians, subjects, priorities, statuses,
  response times, resolution times
- **Sample data chooser**: three-card selection screen on empty state (Database Audit, Financial, IT Ticketing) with SVG
  icons, descriptions, and field lists
- **Truncate display**: long text fields (e.g. ticket subjects) truncated with ellipsis and title-on-hover in log tables

### v0.4.2 (2026-04-13)

- **Metric tabs**: tab bar above heatmap with switchable metric presets; click active tab to edit, click `+` to add new
- **Configurable presets**: count, count distinct, sum, avg, min, max; column dropdown filters by aggregation type (
  numeric-only for math ops, all columns for count distinct)
- **Numeric column detection**: moved to `ingest()` so both CSV and sample data get detection
- **Metric popover**: fixed positioning with viewport flip, stopPropagation fixes; label, type, column, delete
- **Metric-aware stats**: "Records This Year" always shows raw count; separate metric card for non-count metrics;
  selection summary computes record count independently from metric values
- **Metric badges**: single-day and focused-day headers show active metric value in accent color (e.g. "13 records ·
  PKey (Avg): 4,021.3")
- **Auto-thresholds priority**: `_autoThresholds` now takes precedence over hardcoded thresholds, ensuring heatmap
  scales correctly per metric
- **State persistence**: metricPresets and activeMetricIndex saved in export/import

### v0.4.1 (2026-04-12)

- **Hide days of week**: toggle individual weekdays off in Settings; heatmap rows, day labels, and height adjust
  dynamically
- **Month boundary indicators**: per-cell jagged line following actual month edges with horizontal step connectors;
  configurable color picker with glow effect; toggle in Settings
- **Month label alignment**: labels position at first column with no previous-month days
- **Auto-focus threshold**: configurable in Settings (default: 7)
- **W+click always additive**: no longer requires Ctrl (avoids Ctrl+W browser conflict)
- **Settings persistence**: hiddenDays, monthPadding, monthIndicatorColor, autoFocusThreshold saved in state export
- **Post-build syntax check**: `node --check` added to verification workflow

### v0.4.0 (2026-04-11)

- **Settings modal**: gear icon in toolbar opens settings; theme/palette picker moved here from heatmap legend with
  labeled swatches in a 6-column grid
- **Three-tab help modal**: Feature Guide, Roadmap, and What's New tabs replace the two-panel layout; tab navigation
  with active state indicator
- **Send Feedback**: mailto link in help modal footer
- **Report a Bug**: downloads diagnostic state JSON (includes version, user agent, record count, filters, notes) and
  opens pre-filled mailto
- **Toolbar cleanup**: palette picker removed from toolbar; gear and ? icons use consistent styling; dead palette picker
  code removed from themes.js and CSS
- **Version bump script updated**: now tracks help footer version and bug report version strings

### v0.3.7 (2026-04-11)

- **Help modal**: comprehensive feature guide accessible via `?` button in toolbar; 7 sections covering all features
  with inline icon references matching the actual UI
- **About & Roadmap panel**: second view within the help modal showing what the tool is, isn't, and will be; user-facing
  version of the SOW
- **Palette picker in toolbar**: theme selector moved to top-right toolbar area, accessible before loading data
- **Inline icon references**: help text uses miniature SVG button replicas instead of emoji for chevron, plus, minus
  icons
- **Version bump script**: `bump.sh` updates all 5 version string locations from the `VERSION` file

### v0.3.6 (2026-04-11)

- **Two-tier multi-select**: selected days shown as collapsed single-line rows (date + record count) with focused day
  logs above; ≤7 days auto-focus, >7 start collapsed
- **Promote/demote**: ➕ button promotes a collapsed day to focused view with full log table; ➖ demotes back to collapsed
  list
- **Peek-in-place**: expand chevron on collapsed rows reveals records inline without promoting
- **Highlight breakdown tooltip**: hovering record count on collapsed rows shows per-filter match counts
- **Toolbar menu**: Load CSV, Save State, Load State consolidated into a single hamburger menu button
- **Year gap consistency**: spacer column inserted between years when Dec 31 is Saturday (no natural partial-week gap)
- **focusedDays in state export**: promoted days persisted across save/load for collaboration and session continuity

### v0.3.5 (2026-04-10)

- **Undo double-step fix**: selection changes from heatmap clicks now push a single snapshot before clearing +
  re-selecting, so Ctrl+Z undoes one perceived action
- **Clear button reactivity**: clear/dropdown button updates after every filter value change, not just on mode toggle
- **Row note indexing**: multi-select log uses per-day row indices instead of a global counter, fixing mismatched note
  display
- **Day note expand in multi-select**: "Show more" toggle works for inline day notes in concatenated log view
- **Clear dropdown direction**: opens downward instead of upward, preventing viewport clipping
- **Filter bar min-width**: filter groups have `flex-shrink: 0` to prevent collapsing below content width
- **CSV delimiter detection**: supports `sep=X` header (Excel convention) and auto-detects pipe and semicolon delimiters
- **Data validation**: timestamp column checked on load; user-facing error on parse failure with sample values
- **Multi-select log removed**: deprecated for redesign; selection summary panel and all hotkeys remain active

### v0.3.4 (2026-04-09)

- **W+click week selection**: select 7 consecutive days starting from clicked cell; Ctrl+W+click to add to existing
  selection
- **Arrow key navigation**: Up/Down move ±1 day, Left/Right move ±1 week in single-select mode
- **Year range auto-trimming**: when exclude filters are active, empty years are hidden from the heatmap and sidebar
- **Ctrl+Z / Ctrl+Y undo/redo**: undo and redo selection changes (up to 50 steps); selection-only, does not affect
  filters

### v0.3.3 (2026-04-09)

- **Multi-select concatenated log**: highlighted days' rows shown chronologically with day separator headers
- **Day notes in multi-select**: add/edit note button on each day separator; notes shown inline (not sticky)
- **Day picker**: "Load days" button opens a date/count table; click to scroll to that day's section
- **Row note truncation**: multi-line notes show first line with "Show more ⌄" toggle; hover for full tooltip
- **Sticky day notes**: day-level notes pin to top of content area when scrolling (single-day view only)
- **Left-pinned row notes**: row notes stay visible during horizontal scroll
- **Theme picker**: 12-palette selector (red, orange, amber, yellow, green, teal, blue, purple, pink, brown, slate, high
  contrast) near heatmap legend; theme follows accent color across all UI elements
- **Facet option cap**: dropdown limited to 100 values with "Show more" pagination; search for the rest
- **Conditional highlight toggle**: filter/highlight switch hidden until at least one value is selected
- Palette persisted in state export/import

### v0.3.2 (2026-04-09)

- **Highlight + filter coexistence**: grayscale activates whenever highlight mode is active, regardless of exclude
  filter state
- **Compounding highlights**: same-color highlight filters on overlapping days boost opacity with diminishing returns
- **Per-part coloring on composite columns**: multi-key columns (e.g. table.field) color each part independently based
  on its highlight filter, with non-highlighted parts in white
- **Toolbar layout**: Load CSV / Save State / Load State moved into document flow alongside filter bar, eliminating
  overlap
- **Heatmap legend syncs with grayscale**: legend matches the heatmap palette when highlights are active

### v0.3.1 (2026-04-09)

- **Filter/highlight toggle redesigned**: slide switch with funnel (filter) and highlighter (highlight) icons
- **Toggle moved inside dropdown**: filter mode switch now lives in facet dropdown footer alongside Select all / Clear
- **Color swatches external**: remain visible outside dropdown when highlight mode is active
- **State export/import**: save and load notes, filters, modes, and settings as JSON files
- **Toolbar consolidation**: Load CSV, Save State, and Load State buttons grouped in top-right toolbar

### v0.3.0 (2026-04-08)

- **Data source indicator**: file name and record count shown in heatmap footer
- **Drag-and-drop**: drop CSV/TSV files directly onto the dashboard to load
- **M+click / Y+click**: select entire calendar month or year
- **Ctrl+A**: select all cells; **Esc**: clear all selections
- **Ctrl-promote/demote**: press Ctrl with a day selected to preview summary; releases back to single-select if nothing
  else was clicked
- **Filter overflow**: column picker (`+ N more`) for datasets with many columns
- **Filter-as-highlight**: toggle per-filter between exclude and highlight mode (radial gradient overlay on heatmap
  cells)
- **Highlight color picker**: 6 color presets per filter column (amber, cyan, rose, violet, green, blue)
- **Highlight colors in log table**: values matching highlight filters render in the chosen color
- **Clear filters dropdown**: context-sensitive clear (exclude only, highlight only, or all)
- **Live record count**: always visible in filter bar
- **Keyboard hints**: moved to `?` hover tooltip to free heatmap footer space

### v0.2.1 (2026-04-08)

- **Log table horizontal scroll**: arrow navigation and smooth side-scroll for wide datasets
- **Sidebar wiggle fix**: horizontal scroll events blocked on year sidebar
- **Oracle DD-MON-YY format**: timestamp parser supports Oracle default NLS_DATE_FORMAT with date-only warning
- **Visibility-based year labels**: sidebar year brightness reflects heatmap viewport overlap percentage
- **Theme groundwork**: `themes.js` module with dark/light themes, heatmap palette presets, `applyTheme()` API
- **CSS restructure**: `:root` variables organized into themed sections for easy overriding

### v0.2.0 (2026-04-07)

- **Generic data model**: any CSV with a timestamp column works out of the box
- **Schema-driven pipeline**: log table, filters, stats, and summary all configured by schema
- **Configurable heatmap metric**: count (default), sum, avg, min, max over any numeric column
- **Auto-threshold**: heatmap levels auto-scale for non-count metrics via percentiles
- **Ingestion abstraction**: single `ingest(records, schema)` entry point for all data sources
- **schema.js module**: separates schema detection from parsing, ready for API/WS sources

### v0.1.0 (2026-04-07)

- Modular architecture: split monolith into ES modules + external CSS
- Build script for single-file distribution

### v0.0.6 (2026-04-07)

- Horizontal scroll with finer control
- Faceted multi-select filters
- Notes system (day-level + row-level)
- Row/column/day highlighting with selection summary
- Standardised modifier key behaviour
