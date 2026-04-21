/*
 * state.js — Application state, user settings, and stateful selection helpers.
 * Pure utilities are in utils.js. Constants are in constants.js.
 */

import { MAX_LOG_ROWS } from './constants.js';

export const config = {showDayOfWeek: true};

// Display settings (configurable via settings modal)
export const settings = {
    hiddenDays: new Set(),      // dow indices (0=Sun, 6=Sat) to hide from heatmap
    monthPadding: false,        // show month boundary indicators
    monthIndicatorColor: '#ffffff', // month boundary indicator color
    autoFocusThreshold: 7,      // multi-select auto-focus limit
    autoDetectDateColumn: true, // auto-pick timestamp column on CSV load
    developerMode: false,       // when true, logger records + Developer Console is accessible
};

export const state = {
    raw: [],
    filtered: [],
    schema: null,
    dataSource: null,         // { name, type, recordCount }
    ingestStats: null,        // { inputCount, keptCount, droppedNoTimestamp } — populated by ingest()
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

    // Column config (v0.5.0): per-column user preferences.
    // Shape: { [columnKey]: {visible, filterable, reportable} }
    // Populated at ingest with auto-detected defaults; user overrides persist in
    // state export. Keyed by column name (not position) so it survives CSV updates
    // where the same columns appear in different order.
    columnConfig: {},

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

// ===== Selection queries =====

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

// ===== Column config helpers (v0.5.0) =====

/**
 * Returns the effective list of filter columns — those marked filterable in state.columnConfig.
 * Falls back to schema.filterColumns when columnConfig is absent (e.g. before ingest).
 * Preserves the schema's declared order.
 */
export function effectiveFilterColumns() {
    if (!state.schema) return [];
    const cfg = state.columnConfig || {};
    return state.schema.filterColumns.filter(col => cfg[col] ? cfg[col].filterable : true);
}

/**
 * Returns effective log columns — those marked visible in state.columnConfig.
 * The timestamp column is always visible (config is ignored for it).
 */
export function effectiveLogColumns() {
    if (!state.schema) return [];
    const cfg = state.columnConfig || {};
    return state.schema.logColumns.filter(col => {
        // Multi-key columns (e.g. {keys: ['table', 'field']}) stay visible unless all parts are hidden
        const keys = col.keys || (col.key ? [col.key] : []);
        if (keys.length === 0) return true;
        if (keys.includes(state.schema.timestampKey)) return true;
        return keys.some(k => !cfg[k] || cfg[k].visible);
    });
}

/**
 * Returns effective reportable columns — those marked reportable in state.columnConfig.
 * Used to gate metric preset availability.
 */
export function effectiveReportableColumns() {
    if (!state.schema) return [];
    const cfg = state.columnConfig || {};
    return (state.schema.columns || [])
        .filter(c => cfg[c.key] ? cfg[c.key].reportable : true)
        .map(c => c.key);
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
