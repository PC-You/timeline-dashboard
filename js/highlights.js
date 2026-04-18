/*
 * highlights.js — Selection highlighting: row, column, day, month, week, filter
 */

import {MONTHS, DOW_NAMES, MAX_LOG_ROWS} from './constants.js';
import {dateKey, monthKeyFromDate} from './utils.js';
import {state, app, hasAnySelections, clearAllSelections, hasAnyHighlightFilters, pushSelectionSnapshot} from './state.js';

export function clearDaySelection() {
    state.selectedDate = null;
    document.querySelectorAll('.heatmap-cell.selected').forEach(c => c.classList.remove('selected'));
}

export function toggleRowHighlight(dow, skipSnapshot) {
    if (!skipSnapshot) pushSelectionSnapshot();
    if (state.highlightedRows.has(dow)) state.highlightedRows.delete(dow);
    else state.highlightedRows.add(dow);
    refreshAllHighlights();
    app.renderContent();
}

export function toggleColHighlight(weekIdx, skipSnapshot) {
    if (!skipSnapshot) pushSelectionSnapshot();
    if (state.highlightedCols.has(weekIdx)) state.highlightedCols.delete(weekIdx);
    else state.highlightedCols.add(weekIdx);
    refreshAllHighlights();
    app.renderContent();
}

export function toggleDayHighlight(dk, skipSnapshot) {
    if (!skipSnapshot) pushSelectionSnapshot();

    if (state.highlightedDays.has(dk)) {
        state.highlightedDays.delete(dk);
    } else if (isDayHighlightedByOtherMeans(dk)) {
        materializeSelectionToDays();
        state.highlightedDays.delete(dk);
    } else {
        state.highlightedDays.add(dk);
    }

    state.selectedDate = dk;
    state.logVisibleCount = MAX_LOG_ROWS;
    document.querySelectorAll('.heatmap-cell.selected').forEach(c => c.classList.remove('selected'));
    const cell = document.querySelector(`.heatmap-cell[data-date="${dk}"]`);
    if (cell) cell.classList.add('selected');
    refreshAllHighlights();
    app.renderContent();
}

export function toggleMonthHighlight(monthKey, skipSnapshot) {
    if (!skipSnapshot) pushSelectionSnapshot();
    if (state.highlightedMonths.has(monthKey)) state.highlightedMonths.delete(monthKey);
    else state.highlightedMonths.add(monthKey);
    refreshAllHighlights();
    app.renderContent();
}

export function selectYear(yearStr, skipSnapshot) {
    if (!skipSnapshot) pushSelectionSnapshot();
    for (let m = 1; m <= 12; m++) {
        state.highlightedMonths.add(`${yearStr}-${String(m).padStart(2, '0')}`);
    }
    refreshAllHighlights();
    app.renderContent();
}

export function selectAll() {
    pushSelectionSnapshot();
    state.years.forEach(y => {
        for (let m = 1; m <= 12; m++) {
            state.highlightedMonths.add(`${y}-${String(m).padStart(2, '0')}`);
        }
    });
    refreshAllHighlights();
    app.renderContent();
}

export function selectWeek(startDk, skipSnapshot) {
    if (!skipSnapshot) pushSelectionSnapshot();
    const start = new Date(startDk + 'T00:00:00');
    for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        state.highlightedDays.add(dateKey(d));
    }
    refreshAllHighlights();
    app.renderContent();
}

export function promoteSelectionToMulti() {
    if (!state.selectedDate) return;
    if (state.highlightedDays.has(state.selectedDate)) return;
    pushSelectionSnapshot();
    state.highlightedDays.add(state.selectedDate);
    document.querySelectorAll('.heatmap-cell.selected').forEach(c => c.classList.remove('selected'));
    refreshAllHighlights();
    app.renderContent();
}

export function demoteSelectionFromMulti(promotedDate) {
    if (!promotedDate) return;
    if (state.highlightedDays.size !== 1 || !state.highlightedDays.has(promotedDate)) return;
    state.highlightedDays.delete(promotedDate);
    if (state.selectionHistory.length > 0) state.selectionHistory.pop();
    state.selectedDate = promotedDate;
    refreshAllHighlights();
    const cell = document.querySelector(`.heatmap-cell[data-date="${promotedDate}"]`);
    if (cell) cell.classList.add('selected');
    app.renderContent();
}

function isDayHighlightedByOtherMeans(dk) {
    const cell = document.querySelector(`.heatmap-cell[data-date="${dk}"]`);
    if (!cell) return false;
    const dow = parseInt(cell.dataset.dow);
    const wk = parseInt(cell.dataset.weekIdx);
    const mk = monthKeyFromDate(dk);
    return state.highlightedRows.has(dow) || state.highlightedCols.has(wk) || state.highlightedMonths.has(mk);
}

function materializeSelectionToDays() {
    document.querySelectorAll('.heatmap-cell:not(.empty)').forEach(cell => {
        const dow = parseInt(cell.dataset.dow);
        const wk = parseInt(cell.dataset.weekIdx);
        const dk = cell.dataset.date;
        if (!dk) return;
        const mk = monthKeyFromDate(dk);
        if (state.highlightedRows.has(dow) || state.highlightedCols.has(wk) || state.highlightedMonths.has(mk)) {
            state.highlightedDays.add(dk);
        }
    });
    state.highlightedRows.clear();
    state.highlightedCols.clear();
    state.highlightedMonths.clear();
}

export function refreshAllHighlights() {
    document.querySelectorAll('.heatmap-cell').forEach(cell => {
        const dow = parseInt(cell.dataset.dow);
        const wk = parseInt(cell.dataset.weekIdx);
        const dk = cell.dataset.date;
        const mk = dk ? monthKeyFromDate(dk) : null;

        cell.classList.toggle('row-highlighted', state.highlightedRows.has(dow));
        cell.classList.toggle('col-highlighted', state.highlightedCols.has(wk));
        cell.classList.toggle('day-highlighted', dk ? state.highlightedDays.has(dk) : false);
        cell.classList.toggle('month-highlighted', mk ? state.highlightedMonths.has(mk) : false);

        const filterColors = dk ? state.filterHighlightDays.get(dk) : null;
        if (filterColors && filterColors.length > 0) {
            cell.classList.add('filter-highlighted');
            const colorCounts = {};
            filterColors.forEach(c => {
                colorCounts[c] = (colorCounts[c] || 0) + 1;
            });
            const gradients = Object.entries(colorCounts).map(([color, count]) => {
                const boosted = count > 1 ? boostAlpha(color, count) : color;
                return `radial-gradient(circle at center, transparent 25%, ${boosted} 100%)`;
            }).join(', ');
            cell.style.setProperty('--filter-hl-bg', gradients);
        } else {
            cell.classList.remove('filter-highlighted');
            cell.style.removeProperty('--filter-hl-bg');
        }
    });

    const container = document.getElementById('heatmapTrack')?.closest('.heatmap-container');
    if (container) container.classList.toggle('has-filter-highlights', hasAnyHighlightFilters());

    document.querySelectorAll('#dayLabels span').forEach(span => {
        const dow = parseInt(span.dataset.dow);
        span.classList.toggle('row-active', state.highlightedRows.has(dow));
    });
}

function isCellHighlighted(dk, dow, wk) {
    if (state.highlightedRows.has(dow)) return true;
    if (state.highlightedCols.has(wk)) return true;
    if (state.highlightedDays.has(dk)) return true;
    const mk = monthKeyFromDate(dk);
    if (state.highlightedMonths.has(mk)) return true;
    return false;
}

/**
 * Collect all selected date keys from every selection type.
 */
export function getSelectedDays() {
    const days = new Set();
    document.querySelectorAll('.heatmap-cell:not(.empty)').forEach(cell => {
        const dow = parseInt(cell.dataset.dow);
        const wk = parseInt(cell.dataset.weekIdx);
        const dk = cell.dataset.date;
        if (dk && isCellHighlighted(dk, dow, wk)) days.add(dk);
    });
    state.highlightedDays.forEach(dk => days.add(dk));
    return Array.from(days).sort();
}

export function getHighlightSummary() {
    if (!hasAnySelections()) return null;
    const schema = state.schema;
    const metric = schema.heatmapMetric;
    const seen = new Set();
    let totalMetric = 0, activeDays = 0, totalDays = 0;
    const allEntries = [];

    const tally = (dk) => {
        if (!dk || seen.has(dk)) return;
        seen.add(dk);
        const value = state.dayValues[dk] || 0;
        totalDays++;
        totalMetric += value;
        if (value > 0) activeDays++;
        allEntries.push(...(state.dayEntries[dk] || []));
    };

    document.querySelectorAll('.heatmap-cell:not(.empty)').forEach(cell => {
        const dow = parseInt(cell.dataset.dow);
        const wk = parseInt(cell.dataset.weekIdx);
        const dk = cell.dataset.date;
        if (isCellHighlighted(dk, dow, wk)) tally(dk);
    });
    state.highlightedDays.forEach(dk => tally(dk));

    const topOf = (col) => {
        if (!col) return null;
        const counts = {};
        allEntries.forEach(r => {
            const v = r[col];
            if (v) counts[v] = (counts[v] || 0) + 1;
        });
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        return sorted[0] || null;
    };

    let breakdown = null;
    if (schema.breakdownColumn) {
        breakdown = {};
        allEntries.forEach(r => {
            const v = r[schema.breakdownColumn];
            if (v) breakdown[v] = (breakdown[v] || 0) + 1;
        });
    }

    const parts = [];
    if (state.highlightedRows.size > 0)
        parts.push(Array.from(state.highlightedRows).sort().map(d => DOW_NAMES[d]).join(', '));
    if (state.highlightedCols.size > 0)
        parts.push(`${state.highlightedCols.size} week${state.highlightedCols.size > 1 ? 's' : ''}`);
    if (state.highlightedMonths.size > 0) {
        const monthLabels = Array.from(state.highlightedMonths).sort().map(mk => {
            const [y, m] = mk.split('-');
            return `${MONTHS[parseInt(m) - 1]} ${y}`;
        });
        if (monthLabels.length <= 3) parts.push(monthLabels.join(', '));
        else parts.push(`${monthLabels.length} months`);
    }
    if (state.highlightedDays.size > 0)
        parts.push(`${state.highlightedDays.size} day${state.highlightedDays.size > 1 ? 's' : ''}`);

    return {
        label: parts.join(' + '),
        totalMetric,
        totalRecords: allEntries.length,
        metricLabel: metric.type === 'count' ? (metric.labelPlural || 'records') : `${metric.type} ${metric.column || ''}`.trim(),
        activeDays, totalDays,
        topPrimary: topOf(schema.primaryColumn),
        primaryLabel: schema.primaryColumn ? (schema.columns.find(c => c.key === schema.primaryColumn)?.header || schema.primaryColumn) : null,
        topSecondary: topOf(schema.secondaryColumn),
        secondaryLabel: schema.secondaryColumn ? (schema.columns.find(c => c.key === schema.secondaryColumn)?.header || schema.secondaryColumn) : null,
        breakdown, breakdownColumn: schema.breakdownColumn,
        breakdownLabel: schema.breakdownColumn ? (schema.columns.find(c => c.key === schema.breakdownColumn)?.header || schema.breakdownColumn) : null,
    };
}

function boostAlpha(rgbaStr, count) {
    const match = rgbaStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*([\d.]+)?\)/);
    if (!match) return rgbaStr;
    const r = match[1], g = match[2], b = match[3];
    const baseAlpha = parseFloat(match[4] || '1');
    let alpha = baseAlpha;
    for (let i = 1; i < count; i++) {
        alpha = alpha + (0.95 - alpha) * 0.5;
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
}
