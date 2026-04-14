/*
 * state.js — Shared state, constants, and utility functions
 */

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEK_PX = 16;
export const MAX_LOG_ROWS = 80;
export const AUTO_FOCUS_THRESHOLD = 7; // configurable in future settings
export const HORIZ_SCROLL_FACTOR = 0.3;

export const config = {showDayOfWeek: true};

// Display settings (configurable via settings modal)
export const settings = {
    hiddenDays: new Set(),      // dow indices (0=Sun, 6=Sat) to hide from heatmap
    monthPadding: false,        // show month boundary indicators
    monthIndicatorColor: '#ffffff', // month boundary indicator color
    autoFocusThreshold: 7,      // multi-select auto-focus limit
};

export const HIGHLIGHT_PRESETS = [
    {name: 'Amber', color: 'rgba(255, 180, 30, 0.75)'},
    {name: 'Cyan', color: 'rgba(0, 220, 255, 0.70)'},
    {name: 'Rose', color: 'rgba(255, 80, 80, 0.70)'},
    {name: 'Violet', color: 'rgba(180, 120, 255, 0.70)'},
    {name: 'Green', color: 'rgba(50, 230, 120, 0.70)'},
    {name: 'Blue', color: 'rgba(70, 150, 255, 0.70)'},
];

export const state = {
    raw: [],
    filtered: [],
    schema: null,
    dataSource: null,         // { name, type, recordCount }
    activePalette: 4,         // index into palettes array (green default)

    // Filters: { columnKey: Set of selected values }
    filters: {},
    // Filter modes: { columnKey: 'exclude' | 'highlight' }
    filterModes: {},
    // Filter highlight colors: { columnKey: color string }
    filterHighlightColors: {},
    // Column values: { columnKey: [sorted unique values] }
    columnValues: {},
    // Days matching highlight-mode filters: Map<dateKey, string[]> of colors
    filterHighlightDays: new Map(),

    dayValues: {},
    dayEntries: {},

    years: [],
    allYears: [],         // full year range from raw data (unaffected by filters)
    activeYear: null,
    selectedDate: null,
    logVisibleCount: MAX_LOG_ROWS,
    yearWeekRanges: {},
    monthPositions: [],
    notes: {},

    // Metric presets
    metricPresets: [],        // array of { label, type, column, signed }
    activeMetricIndex: 0,

    // Highlights
    highlightedRows: new Set(),
    highlightedCols: new Set(),
    highlightedDays: new Set(),
    highlightedMonths: new Set(),  // "YYYY-MM" strings

    // Multi-select focused days (promoted from collapsed list)
    focusedDays: new Set(),

    // Log table sort
    sortColumn: null,           // column key or null (default = timestamp)
    sortDirection: 'asc',       // 'asc' or 'desc'

    // Selection undo/redo
    selectionHistory: [],
    selectionFuture: [],
};

export const app = {};

// Global key tracker for M/Y key detection during clicks
export const keysHeld = new Set();

// ===== Utility functions =====

export function dateKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dateKeyFromStr(ts) {
    return ts.substring(0, 10);
}

export function monthKeyFromDate(dk) {
    return dk.substring(0, 7);
}

export function getLevel(value, thresholds) {
    if (!thresholds) thresholds = [3, 8, 18];
    if (value === 0) return 0;
    const abs = Math.abs(value);
    const sign = value < 0 ? -1 : 1;
    if (abs <= thresholds[0]) return sign * 1;
    if (abs <= thresholds[1]) return sign * 2;
    if (abs <= thresholds[2]) return sign * 3;
    return sign * 4;
}

export function autoThresholds(values) {
    const sorted = values.filter(v => v > 0).sort((a, b) => a - b);
    if (sorted.length === 0) return [1, 2, 3];
    const p = (pct) => sorted[Math.min(Math.floor(pct * sorted.length), sorted.length - 1)];
    return [p(0.25), p(0.50), p(0.75)];
}

export function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

export function hasAnySelections() {
    return state.highlightedRows.size > 0 || state.highlightedCols.size > 0 ||
        state.highlightedDays.size > 0 || state.highlightedMonths.size > 0;
}

export function clearAllSelections() {
    state.highlightedRows.clear();
    state.highlightedCols.clear();
    state.highlightedDays.clear();
    state.highlightedMonths.clear();
    state.focusedDays.clear();
}

export function hasAnyExcludeFilters() {
    if (!state.schema) return false;
    return state.schema.filterColumns.some(col =>
        state.filterModes[col] !== 'highlight' && state.filters[col]?.size > 0
    );
}

export function hasAnyHighlightFilters() {
    if (!state.schema) return false;
    return state.schema.filterColumns.some(col =>
        state.filterModes[col] === 'highlight' && state.filters[col]?.size > 0
    );
}

// ===== Selection undo/redo =====

export function pushSelectionSnapshot() {
    state.selectionHistory.push({
        rows: new Set(state.highlightedRows),
        cols: new Set(state.highlightedCols),
        days: new Set(state.highlightedDays),
        months: new Set(state.highlightedMonths),
    });
    state.selectionFuture = []; // clear redo stack on new action
    if (state.selectionHistory.length > 50) state.selectionHistory.shift(); // cap
}

export function undoSelection() {
    if (state.selectionHistory.length === 0) return false;
    state.selectionFuture.push({
        rows: new Set(state.highlightedRows),
        cols: new Set(state.highlightedCols),
        days: new Set(state.highlightedDays),
        months: new Set(state.highlightedMonths),
    });
    const snap = state.selectionHistory.pop();
    state.highlightedRows = snap.rows;
    state.highlightedCols = snap.cols;
    state.highlightedDays = snap.days;
    state.highlightedMonths = snap.months;
    return true;
}

export function redoSelection() {
    if (state.selectionFuture.length === 0) return false;
    state.selectionHistory.push({
        rows: new Set(state.highlightedRows),
        cols: new Set(state.highlightedCols),
        days: new Set(state.highlightedDays),
        months: new Set(state.highlightedMonths),
    });
    const snap = state.selectionFuture.pop();
    state.highlightedRows = snap.rows;
    state.highlightedCols = snap.cols;
    state.highlightedDays = snap.days;
    state.highlightedMonths = snap.months;
    return true;
}
