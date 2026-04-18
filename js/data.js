/*
 * data.js — Data pipeline: ingest, indexing, filtering, aggregation, geometry
 */

import {MONTHS, WEEK_PX} from './constants.js';
import {dateKeyFromStr, autoThresholds} from './utils.js';
import {state} from './state.js';
import {parseTimestamp, toNormalizedISO} from './schema.js';

export function ingest(records, schema) {
    if (schema.timestampFormat && schema.timestampFormat !== 'iso') {
        normalizeTimestamps(records, schema);
    }

    // Defensive reset: explicitly clear geometry-derived state before rebuilding.
    // buildGeometry() below will repopulate these, but resetting here protects against
    // a reported (unreproducible) bug where re-dragging the same file over an already-
    // loaded dataset left scroll stuck at an arbitrary point. Belt-and-suspenders; deep
    // diagnosis deferred to v0.5.0 when the developer logger lands.
    state.years = [];
    state.allYears = [];
    state.activeYear = null;
    state.yearWeekRanges = {};
    state.monthPositions = [];
    state.selectedDate = null;

    state.raw = records;
    state.schema = schema;

    // Detect numeric columns from actual data (runs for both CSV and sample data)
    detectNumericColumns(records, schema);

    // Build default metric presets if none exist
    if (state.metricPresets.length === 0) {
        state.metricPresets = [{label: 'Activity', type: 'count', column: null}];
        state.activeMetricIndex = 0;
    }

    const oldFilters = state.filters;
    const oldModes = state.filterModes;
    const oldColors = state.filterHighlightColors;
    state.filters = {};
    state.filterModes = {};
    state.filterHighlightColors = {};
    schema.filterColumns.forEach(col => {
        state.filters[col] = oldFilters[col] instanceof Set ? oldFilters[col] : new Set();
        state.filterModes[col] = oldModes[col] || 'exclude';
        state.filterHighlightColors[col] = oldColors[col] || null;
    });

    buildIndexes();
    applyFilters();
}

function detectNumericColumns(records, schema) {
    const sampleRows = records.slice(0, 50);
    const nonTsCols = schema.filterColumns || [];
    const numericColumns = [];
    nonTsCols.forEach(col => {
        if (sampleRows.length === 0) return;
        const vals = sampleRows.map(r => r[col]).filter(v => v != null && v !== '');
        const numCount = vals.filter(v => !isNaN(parseFloat(v))).length;
        if (numCount > vals.length * 0.8 && vals.length > 0) {
            const hasNegative = vals.some(v => parseFloat(v) < 0);
            const header = schema.columns.find(c => c.key === col)?.header || col;
            numericColumns.push({key: col, header, hasNegative});
        }
    });
    schema.numericColumns = numericColumns;
}

function normalizeTimestamps(records, schema) {
    const tsKey = schema.timestampKey;
    const fmt = schema.timestampFormat;
    if (fmt === 'oracle-dmy') {
        console.warn(`Timestamp format is Oracle DD-MON-YY (date only). Time component cannot be determined; defaulting to 00:00:00.`);
    }
    let failures = 0;
    for (const r of records) {
        const raw = r[tsKey];
        if (!raw) continue;
        const date = parseTimestamp(raw, fmt);
        if (date) r[tsKey] = toNormalizedISO(date);
        else failures++;
    }
    if (failures > 0) console.warn(`Timestamp normalisation: ${failures} of ${records.length} values could not be parsed (format: ${fmt})`);
    schema.timestampFormat = 'iso';
}

export function buildIndexes() {
    const schema = state.schema;
    if (!schema) return;
    state.columnValues = {};
    const sets = {};
    schema.filterColumns.forEach(col => {
        sets[col] = new Set();
    });
    state.raw.forEach(r => {
        schema.filterColumns.forEach(col => {
            const v = r[col];
            if (v != null && v !== '') sets[col].add(v);
        });
    });
    schema.filterColumns.forEach(col => {
        state.columnValues[col] = Array.from(sets[col]).sort();
    });
}

export function applyFilters() {
    const schema = state.schema;
    if (!schema) return;

    // Apply only exclude-mode filters
    let data = state.raw;
    for (const col of schema.filterColumns) {
        if (state.filterModes[col] === 'highlight') continue;
        const selected = state.filters[col];
        if (selected && selected.size > 0) data = data.filter(r => selected.has(r[col]));
    }
    state.filtered = data;

    // Aggregate per day
    state.dayEntries = {};
    data.forEach(r => {
        const dk = dateKeyFromStr(r[schema.timestampKey]);
        if (!state.dayEntries[dk]) state.dayEntries[dk] = [];
        state.dayEntries[dk].push(r);
    });

    computeDayValues();
    computeFilterHighlights();

    // Derive year list: from raw (full range) when unfiltered, from populated years when filtered
    const allYearSet = new Set();
    state.raw.forEach(r => allYearSet.add(parseInt(r[schema.timestampKey].substring(0, 4))));
    state.allYears = Array.from(allYearSet).sort();

    const hasExcludeFilters = schema.filterColumns.some(col =>
        state.filterModes[col] !== 'highlight' && state.filters[col]?.size > 0
    );
    if (hasExcludeFilters) {
        // Only show years that have at least one record after filtering
        const filteredYearSet = new Set();
        for (const dk in state.dayValues) {
            if (state.dayValues[dk] !== 0) filteredYearSet.add(parseInt(dk.substring(0, 4)));
        }
        state.years = filteredYearSet.size > 0 ? Array.from(filteredYearSet).sort() : state.allYears;
    } else {
        state.years = state.allYears;
    }
    if (!state.activeYear || !state.years.includes(state.activeYear))
        state.activeYear = state.years[state.years.length - 1];
}

function computeDayValues() {
    const preset = state.metricPresets[state.activeMetricIndex] || state.metricPresets[0];
    const metric = preset ? {type: preset.type, column: preset.column} : state.schema.heatmapMetric;
    state.dayValues = {};
    for (const dk in state.dayEntries) {
        state.dayValues[dk] = aggregateEntries(state.dayEntries[dk], metric);
    }
    // Auto-compute thresholds
    const values = Object.values(state.dayValues);
    const hasNegatives = values.some(v => v < 0);
    if (hasNegatives) {
        // Symmetric thresholds for diverging scale
        const absValues = values.map(v => Math.abs(v)).filter(v => v > 0);
        state.schema.heatmapMetric._autoThresholds = autoThresholds(absValues);
    } else {
        state.schema.heatmapMetric._autoThresholds = autoThresholds(values);
    }
}

/**
 * Compute which days have records matching highlight-mode filters.
 */
function computeFilterHighlights() {
    state.filterHighlightDays.clear();
    const schema = state.schema;
    if (!schema) return;

    const highlightFilters = [];
    schema.filterColumns.forEach(col => {
        if (state.filterModes[col] === 'highlight' && state.filters[col]?.size > 0) {
            const color = state.filterHighlightColors[col] || 'rgba(255, 180, 30, 0.75)';
            highlightFilters.push({col, values: state.filters[col], color});
        }
    });
    if (highlightFilters.length === 0) return;

    state.filtered.forEach(r => {
        const matchingColors = [];
        highlightFilters.forEach(f => {
            if (f.values.has(r[f.col])) {
                matchingColors.push(f.color);
            }
        });
        if (matchingColors.length > 0) {
            const dk = dateKeyFromStr(r[schema.timestampKey]);
            const existing = state.filterHighlightDays.get(dk);
            if (existing) {
                matchingColors.forEach(c => existing.push(c));
            } else {
                state.filterHighlightDays.set(dk, [...matchingColors]);
            }
        }
    });
}

export function aggregateEntries(entries, metric) {
    if (!metric || metric.type === 'count') return entries.length;
    const col = metric.column;
    if (metric.type === 'count_distinct') {
        const unique = new Set();
        entries.forEach(r => {
            const v = r[col];
            if (v != null && v !== '') unique.add(v);
        });
        return unique.size;
    }
    if (metric.type === 'volume') {
        const nums = entries.map(r => parseFloat(r[col])).filter(n => !isNaN(n));
        return nums.reduce((a, b) => a + Math.abs(b), 0);
    }
    const nums = entries.map(r => parseFloat(r[col])).filter(n => !isNaN(n));
    if (nums.length === 0) return 0;
    switch (metric.type) {
        case 'sum':
            return nums.reduce((a, b) => a + b, 0);
        case 'avg':
            return nums.reduce((a, b) => a + b, 0) / nums.length;
        case 'min':
            return Math.min(...nums);
        case 'max':
            return Math.max(...nums);
        default:
            return entries.length;
    }
}

export function switchMetric(index) {
    if (index < 0 || index >= state.metricPresets.length) return;
    state.activeMetricIndex = index;
    computeDayValues();
}

export function getEffectiveThresholds() {
    const metric = state.schema?.heatmapMetric;
    if (!metric) return [3, 8, 18];
    return metric._autoThresholds || metric.thresholds || [3, 8, 18];
}

export function buildGeometry() {
    state.monthPositions = [];
    state.yearWeekRanges = {};
    let weekIndex = 0;
    state.years.forEach((year, yearIdx) => {
        const jan1 = new Date(year, 0, 1), dec31 = new Date(year, 11, 31);
        const startWeek = weekIndex;
        let lastMonth = -1;
        let pendingMonthLabel = null;
        for (let d = new Date(jan1); d <= dec31; d.setDate(d.getDate() + 1)) {
            const m = d.getMonth();
            const dow = d.getDay();
            if (m !== lastMonth) {
                // January always goes at first column of year (no Dec days possible)
                // Other months: if starts on Sunday, place now; otherwise defer to first full column
                if (m === 0 || dow === 0) {
                    state.monthPositions.push({
                        label: MONTHS[m],
                        x: weekIndex * WEEK_PX,
                        year,
                        month: m,
                        isJan: m === 0
                    });
                    pendingMonthLabel = null;
                } else {
                    pendingMonthLabel = {label: MONTHS[m], year, month: m, isJan: m === 0};
                }
                lastMonth = m;
            }
            if (dow === 0 && pendingMonthLabel) {
                state.monthPositions.push({...pendingMonthLabel, x: weekIndex * WEEK_PX});
                pendingMonthLabel = null;
            }
            if (dow === 6 || d.getTime() === dec31.getTime()) weekIndex++;
        }
        if (pendingMonthLabel) {
            state.monthPositions.push({...pendingMonthLabel, x: (weekIndex - 1) * WEEK_PX});
        }
        state.yearWeekRanges[year] = {start: startWeek, end: weekIndex};
        // Match the spacer column from renderHeatmap
        if (yearIdx < state.years.length - 1 && dec31.getDay() === 6) weekIndex++;
    });
}
