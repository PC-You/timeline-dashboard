/*
 * data.js — Data pipeline: ingest, indexing, filtering, aggregation, geometry.
 *
 * v0.5.0 rebuild: records are treated as documents (heterogeneous). Records without
 * a timestamp are dropped and their count surfaced. Column union, cardinality, and
 * coverage are computed across the full record set, not a 50-row sample.
 */

import {MONTHS, WEEK_PX} from './constants.js';
import {dateKeyFromStr, autoThresholds} from './utils.js';
import {state} from './state.js';
import {parseTimestamp, toNormalizedISO} from './schema.js';
import {logger} from './logger.js';

export function ingest(records, schema) {
    const inputCount = records.length;

    if (schema.timestampFormat && schema.timestampFormat !== 'iso') {
        normalizeTimestamps(records, schema);
    }

    // Drop records without a timestamp. A record without a timestamp can't be placed
    // on the heatmap; the tool's entire premise requires time. Log what we dropped so
    // the user can investigate via the developer console if they notice a count mismatch.
    const tsKey = schema.timestampKey;
    const kept = [];
    let droppedNoTimestamp = 0;
    for (const r of records) {
        const v = r[tsKey];
        if (v == null || v === '') {
            droppedNoTimestamp++;
            continue;
        }
        kept.push(r);
    }
    if (droppedNoTimestamp > 0) {
        logger.warn('ingest', `Dropped ${droppedNoTimestamp} record(s) with no timestamp`, {
            column: tsKey,
            inputCount,
            keptCount: kept.length,
        });
    }
    records = kept;

    // Defensive reset: explicitly clear geometry-derived state before rebuilding.
    // Protects against a v0.4.x bug where re-dragging the same file over an
    // already-loaded dataset left scroll stuck at an arbitrary point.
    state.years = [];
    state.allYears = [];
    state.activeYear = null;
    state.yearWeekRanges = {};
    state.monthPositions = [];
    state.selectedDate = null;

    state.raw = records;
    state.schema = schema;
    state.ingestStats = {
        inputCount,
        keptCount: records.length,
        droppedNoTimestamp,
    };

    logger.info('ingest', `Ingested ${records.length} records`, {
        inputCount,
        droppedNoTimestamp,
        columns: schema.columns?.length ?? 0,
    });

    // Detect numeric columns and cardinality across all records (not a 50-row sample)
    detectNumericColumns(records, schema);
    computeColumnStats(records, schema);

    // Column config: auto-detected defaults, merged with any existing user overrides
    // for columns of the same name. This preserves config across re-ingest of the same
    // file and across column-order changes between file versions.
    const defaults = defaultColumnConfig(schema);
    const existing = state.columnConfig || {};
    const mergedConfig = {};
    Object.keys(defaults).forEach(col => {
        mergedConfig[col] = existing[col]
            ? {...defaults[col], ...existing[col]}
            : defaults[col];
    });
    state.columnConfig = mergedConfig;

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

export function detectNumericColumns(records, schema) {
    // v0.5.0: scan all records (was: first 50). Heterogeneous records may have
    // numeric columns that don't appear until later in the dataset.
    const nonTsCols = schema.filterColumns || [];
    const numericColumns = [];
    nonTsCols.forEach(col => {
        const vals = [];
        for (const r of records) {
            const v = r[col];
            if (v != null && v !== '') vals.push(v);
        }
        if (vals.length === 0) return;
        let numCount = 0;
        let hasNegative = false;
        for (const v of vals) {
            const n = parseFloat(v);
            if (!isNaN(n)) {
                numCount++;
                if (n < 0) hasNegative = true;
            }
        }
        if (numCount > vals.length * 0.8) {
            const header = schema.columns.find(c => c.key === col)?.header || col;
            numericColumns.push({key: col, header, hasNegative});
        }
    });
    schema.numericColumns = numericColumns;
    logger.info('schema', `Detected ${numericColumns.length} numeric column(s)`, {
        keys: numericColumns.map(c => c.key),
    });
}

/**
 * Compute per-column cardinality and coverage across the full record set.
 * Populates schema.columnStats = { [key]: { uniqueCount, coverage, covered } }
 * where coverage ∈ [0,1] is the fraction of records with this column present.
 *
 * Used by the v0.5.0 column-config UI to show "text · N unique · in X% of records"
 * and to help the user decide which columns to mark filterable/reportable.
 */
export function computeColumnStats(records, schema) {
    const stats = {};
    const total = records.length || 1;
    const cols = schema.columns || [];
    cols.forEach(c => {
        const unique = new Set();
        let covered = 0;
        for (const r of records) {
            const v = r[c.key];
            if (v != null && v !== '') {
                covered++;
                unique.add(v);
            }
        }
        stats[c.key] = {
            uniqueCount: unique.size,
            covered,
            coverage: covered / total,
        };
    });
    schema.columnStats = stats;
}

/**
 * Compute auto-detected default column config from schema + stats.
 * Returns { [columnKey]: {visible, filterable, reportable} }.
 *
 * Heuristic (v0.5.0):
 *   - Timestamp column: always {visible:true, filterable:false, reportable:true}, locked.
 *   - Numeric column:   {visible:true, filterable:false, reportable:true}.
 *   - Text with uniqueCount < 50:  all three true (good filter facet).
 *   - Text with uniqueCount >= 50: {visible:true, filterable:false, reportable:false}
 *     (too unique for useful filtering/aggregation).
 *   - Text with coverage < 0.05: all three false (barely-populated, hide by default).
 *
 * The user can override any of these via the Columns settings tab; overrides persist
 * in state export. This function produces defaults only — it does not apply user overrides.
 */
export function defaultColumnConfig(schema) {
    const config = {};
    const cols = schema.columns || [];
    const numericKeys = new Set((schema.numericColumns || []).map(c => c.key));
    const stats = schema.columnStats || {};
    cols.forEach(c => {
        const s = stats[c.key] || {uniqueCount: 0, coverage: 0};
        if (c.key === schema.timestampKey) {
            config[c.key] = {visible: true, filterable: false, reportable: true};
            return;
        }
        if (s.coverage < 0.05) {
            config[c.key] = {visible: false, filterable: false, reportable: false};
            return;
        }
        if (numericKeys.has(c.key)) {
            config[c.key] = {visible: true, filterable: false, reportable: true};
            return;
        }
        if (s.uniqueCount < 50) {
            config[c.key] = {visible: true, filterable: true, reportable: true};
            return;
        }
        config[c.key] = {visible: true, filterable: false, reportable: false};
    });
    return config;
}

function normalizeTimestamps(records, schema) {
    const tsKey = schema.timestampKey;
    const fmt = schema.timestampFormat;
    if (fmt === 'oracle-dmy') {
        logger.warn('schema', 'Oracle DD-MON-YY has no time component; defaulting to 00:00:00', {
            column: tsKey,
        });
    }
    let failures = 0;
    for (const r of records) {
        const raw = r[tsKey];
        if (!raw) continue;
        const date = parseTimestamp(raw, fmt);
        if (date) r[tsKey] = toNormalizedISO(date);
        else failures++;
    }
    if (failures > 0) {
        logger.warn('schema', `Timestamp normalisation failed for ${failures} of ${records.length} value(s)`, {
            format: fmt,
            column: tsKey,
        });
    }
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
        // Find first and last years with records after filtering. Only *edge* years
        // get pruned — empty years in the middle of the filtered range are kept so
        // the timeline stays continuous and arrow-key navigation works across them.
        // Prior behavior: also pruned middle empty years, which broke cross-year
        // navigation and visually misaligned adjacent non-empty years.
        const populatedYears = new Set();
        for (const dk in state.dayValues) {
            if (state.dayValues[dk] !== 0) populatedYears.add(parseInt(dk.substring(0, 4)));
        }
        if (populatedYears.size > 0) {
            const sorted = Array.from(populatedYears).sort();
            const firstYear = sorted[0];
            const lastYear = sorted[sorted.length - 1];
            // Take every allYear in [firstYear, lastYear] inclusive
            state.years = state.allYears.filter(y => y >= firstYear && y <= lastYear);
        } else {
            state.years = state.allYears;
        }
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
    logger.info('geometry', `Built geometry: ${state.years.length} year(s), ${weekIndex} total weeks`, {
        years: state.years,
        totalWeeks: weekIndex,
        yearRanges: state.yearWeekRanges,
        expectedPx: weekIndex * WEEK_PX,
    });
}
