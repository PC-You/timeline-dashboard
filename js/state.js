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
};

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
