/*
 * heatmap.js — Heatmap rendering, tooltips, cell interactions, data source indicator
 */

import {
    state,
    config,
    app,
    keysHeld,
    dateKey,
    getLevel,
    MAX_LOG_ROWS,
    monthKeyFromDate,
    clearAllSelections,
    settings
} from './state.js';
import {getEffectiveThresholds} from './data.js';
import {hasDayNote, refreshNoteIndicators} from './notes.js';
import {
    refreshAllHighlights,
    clearDaySelection,
    toggleRowHighlight,
    toggleColHighlight,
    toggleDayHighlight,
    toggleMonthHighlight,
    selectYear,
    selectWeek
} from './highlights.js';
import {pushSelectionSnapshot} from './state.js';

// ===== Tooltip =====

const tooltip = document.getElementById('tooltip');

function showTooltip(e) {
    const cell = e.target;
    if (!cell.dataset.date) return;
    const dk = cell.dataset.date;
    const d = new Date(dk + 'T00:00:00');
    const opts = {month: 'short', day: 'numeric', year: 'numeric'};
    if (config.showDayOfWeek) opts.weekday = 'long';
    const n = cell.dataset.count;
    const preset = state.metricPresets?.[state.activeMetricIndex];
    let label;
    if (!preset || preset.type === 'count') {
        label = n === '1' ? 'record' : 'records';
    } else {
        label = preset.label;
    }
    let text = `${n} ${label} \u00b7 ${d.toLocaleDateString('en-US', opts)}`;
    if (hasDayNote(dk)) {
        const note = state.notes[dk].dayNote;
        const truncated = note.length > 80 ? note.substring(0, 80) + '\u2026' : note;
        text += `\n\ud83d\udcdd ${truncated}`;
    }
    tooltip.textContent = text;
    tooltip.classList.add('visible');
    const rect = cell.getBoundingClientRect();
    requestAnimationFrame(() => {
        tooltip.style.left = (rect.left + rect.width / 2 - tooltip.offsetWidth / 2) + 'px';
        tooltip.style.top = (rect.top - tooltip.offsetHeight - 6) + 'px';
    });
}

function hideTooltip() {
    tooltip.classList.remove('visible');
}

// ===== Data source indicator =====

function updateDataSourceIndicator() {
    const el = document.getElementById('dataSourceIndicator');
    const resetBtn = document.getElementById('sampleResetBtn');
    if (!el) return;
    const ds = state.dataSource;
    if (!ds) {
        el.textContent = '';
        if (resetBtn) resetBtn.style.display = 'none';
        return;
    }
    el.textContent = `${ds.name} \u00b7 ${ds.recordCount.toLocaleString()} records`;
    if (resetBtn) resetBtn.style.display = ds.type === 'sample' ? '' : 'none';
}

// ===== Rendering =====

export function renderHeatmap() {
    const track = document.getElementById('heatmapTrack');
    const markers = document.getElementById('monthMarkers');
    const container = track.closest('.heatmap-container');
    track.innerHTML = '';
    markers.innerHTML = '';
    if (state.raw.length === 0) {
        container.style.display = 'none';
        return;
    }
    container.style.display = '';

    // Adjust heatmap height for hidden days
    const visibleRows = 7 - settings.hiddenDays.size;
    const cellSize = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell-size')) || 13;
    const cellGap = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell-gap')) || 3;
    const heatmapHeight = visibleRows * (cellSize + cellGap) + 60;
    container.style.setProperty('--heatmap-height', heatmapHeight + 'px');

    // Update day labels visibility
    document.querySelectorAll('#dayLabels span').forEach(span => {
        const dow = parseInt(span.dataset.dow);
        span.style.display = settings.hiddenDays.has(dow) ? 'none' : '';
    });

    const thresholds = getEffectiveThresholds();
    let weekIdx = 0;
    state.years.forEach((year, yearIdx) => {
        const jan1 = new Date(year, 0, 1), dec31 = new Date(year, 11, 31);
        let currentWeek = new Array(7).fill(null);
        for (let d = new Date(jan1); d <= dec31; d.setDate(d.getDate() + 1)) {
            const dow = d.getDay();
            currentWeek[dow] = {date: dateKey(d)};
            if (dow === 6 || d.getTime() === dec31.getTime()) {
                const col = document.createElement('div');
                col.className = 'heatmap-week';
                col.dataset.weekIdx = weekIdx;
                const colCells = [];
                for (let i = 0; i < 7; i++) {
                    const cell = document.createElement('div');
                    cell.className = 'heatmap-cell';
                    cell.dataset.dow = i;
                    cell.dataset.weekIdx = weekIdx;
                    if (settings.hiddenDays.has(i)) {
                        cell.classList.add('hidden-day');
                    }
                    if (currentWeek[i]) {
                        const dk = currentWeek[i].date;
                        const value = state.dayValues[dk] || 0;
                        cell.dataset.level = getLevel(value, thresholds);
                        cell.dataset.date = dk;
                        cell.dataset.count = formatMetricValue(value);
                        if (settings.monthPadding) {
                            const cellDate = new Date(dk + 'T00:00:00');
                            const prevDate = new Date(cellDate);
                            prevDate.setDate(prevDate.getDate() - 7);
                            if (prevDate.getMonth() !== cellDate.getMonth()) {
                                cell.classList.add('month-boundary');
                            }
                        }
                        const capturedDow = i;
                        const capturedWeek = weekIdx;
                        cell.addEventListener('click', (e) => handleCellClick(e, dk, capturedDow, capturedWeek));
                        cell.addEventListener('mouseenter', showTooltip);
                        cell.addEventListener('mouseleave', hideTooltip);
                    } else {
                        cell.classList.add('empty');
                        cell.dataset.level = '0';
                    }
                    col.appendChild(cell);
                    colCells.push(cell);
                }
                // Add horizontal connector at month boundary step
                if (settings.monthPadding) {
                    for (let i = 0; i < 7; i++) {
                        const hasBoundary = colCells[i].classList.contains('month-boundary');
                        const prevHasBoundary = i > 0 ? colCells[i - 1].classList.contains('month-boundary') : false;
                        if (hasBoundary && !prevHasBoundary) {
                            colCells[i].classList.add('month-boundary-top');
                        }
                    }
                }
                track.appendChild(col);
                currentWeek = new Array(7).fill(null);
                weekIdx++;
            }
        }
        // Force a gap column between years when Dec 31 is Saturday
        if (yearIdx < state.years.length - 1 && dec31.getDay() === 6) {
            const spacer = document.createElement('div');
            spacer.className = 'heatmap-week year-gap';
            for (let i = 0; i < 7; i++) {
                const cell = document.createElement('div');
                cell.className = 'heatmap-cell empty';
                cell.dataset.level = '0';
                cell.dataset.dow = i;
                cell.dataset.weekIdx = weekIdx;
                if (settings.hiddenDays.has(i)) cell.classList.add('hidden-day');
                spacer.appendChild(cell);
            }
            track.appendChild(spacer);
            weekIdx++;
        }
    });

    state.monthPositions.forEach(mp => {
        const el = document.createElement('div');
        el.className = 'month-marker' + (mp.isJan ? ' is-jan' : '');
        el.style.left = mp.x + 'px';
        el.textContent = mp.isJan ? `${mp.label} ${mp.year}` : mp.label;
        markers.appendChild(el);
    });

    refreshNoteIndicators();
    refreshAllHighlights();
    updateDataSourceIndicator();
}

function formatMetricValue(value) {
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(1);
}

function handleCellClick(e, dk, dow, weekIdx) {
    pushSelectionSnapshot();

    if (keysHeld.has('w') && !e.shiftKey && !e.altKey) {
        clearDaySelection();
        selectWeek(dk, true);
        return;
    }

    if (keysHeld.has('m') && !e.shiftKey && !e.altKey) {
        if (!e.ctrlKey && !e.metaKey) clearAllSelections();
        clearDaySelection();
        toggleMonthHighlight(monthKeyFromDate(dk), true);
        return;
    }

    if (keysHeld.has('y') && !e.shiftKey && !e.altKey) {
        if (!e.ctrlKey && !e.metaKey) clearAllSelections();
        clearDaySelection();
        selectYear(dk.substring(0, 4), true);
        return;
    }

    if (e.shiftKey && !e.altKey) {
        if (!e.ctrlKey && !e.metaKey) clearAllSelections();
        clearDaySelection();
        toggleRowHighlight(dow, true);
    } else if (e.altKey && !e.shiftKey) {
        if (!e.ctrlKey && !e.metaKey) clearAllSelections();
        clearDaySelection();
        toggleColHighlight(weekIdx, true);
    } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        toggleDayHighlight(dk, true);
    } else if (e.shiftKey && e.altKey) {
    } else {
        if (state.highlightedRows.size > 0 || state.highlightedCols.size > 0 ||
            state.highlightedDays.size > 0 || state.highlightedMonths.size > 0) {
            clearAllSelections();
            refreshAllHighlights();
        }
        selectDate(dk);
    }
}

export function selectDate(dateStr) {
    state.selectedDate = dateStr;
    state.logVisibleCount = MAX_LOG_ROWS;
    document.querySelectorAll('.heatmap-cell.selected').forEach(c => c.classList.remove('selected'));
    const cell = document.querySelector(`.heatmap-cell[data-date="${dateStr}"]`);
    if (cell) cell.classList.add('selected');
    app.renderContent();
}

export function updateHeatmapLevels() {
    const thresholds = getEffectiveThresholds();
    document.querySelectorAll('.heatmap-cell:not(.empty)').forEach(cell => {
        const dk = cell.dataset.date;
        const value = state.dayValues[dk] || 0;
        cell.dataset.level = getLevel(value, thresholds);
        cell.dataset.count = formatMetricValue(value);
    });
}

export {updateDataSourceIndicator};
