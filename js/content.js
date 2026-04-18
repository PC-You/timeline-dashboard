/*
 * content.js — Main content area rendering (stats, log table, summary)
 */

import {MAX_LOG_ROWS} from './constants.js';
import {dateKey, escapeHtml} from './utils.js';
import {state, app, clearAllSelections, hasAnySelections, hasAnyHighlightFilters, settings} from './state.js';
import {hasDayNote, getRowNote, openNoteModal} from './notes.js';
import {getHighlightSummary, getSelectedDays, refreshAllHighlights} from './highlights.js';
import {generateSampleData, generateFinancialData, generateTicketingData} from './csv.js';
import {ingest, aggregateEntries} from './data.js';

function metricBadge(entries) {
    const preset = state.metricPresets?.[state.activeMetricIndex];
    if (!preset || preset.type === 'count' || !entries || entries.length === 0) return '';
    const value = aggregateEntries(entries, {type: preset.type, column: preset.column});
    return ` <span class="metric-badge">\u00b7 ${escapeHtml(preset.label)}: ${formatSummaryValue(value)}</span>`;
}

function buildSortableHeaders(schema) {
    const tsKey = schema.timestampKey;
    const activeCol = state.sortColumn || tsKey;
    return '<th style="width:28px"></th>' + schema.logColumns.map(col => {
        const key = col.keys ? col.keys[0] : col.key;
        const isActive = key === activeCol;
        const arrow = isActive ? (state.sortDirection === 'asc' ? ' \u25B4' : ' \u25BE') : '';
        return `<th class="sortable-th${isActive ? ' sort-active' : ''}" data-sort-key="${key}">${escapeHtml(col.label)}${arrow}</th>`;
    }).join('');
}

function sortEntries(entries, schema) {
    const tsKey = schema.timestampKey;
    const col = state.sortColumn || tsKey;
    const dir = state.sortDirection === 'desc' ? -1 : 1;
    return entries.slice().sort((a, b) => {
        const va = a[col] ?? '';
        const vb = b[col] ?? '';
        const na = parseFloat(va), nb = parseFloat(vb);
        if (!isNaN(na) && !isNaN(nb)) return (na - nb) * dir;
        return String(va).localeCompare(String(vb)) * dir;
    });
}

function wireSortHeaders(container) {
    container.querySelectorAll('.sortable-th').forEach(th => {
        th.style.cursor = 'pointer';
        th.addEventListener('click', () => {
            const key = th.dataset.sortKey;
            if (state.sortColumn === key || (!state.sortColumn && key === state.schema?.timestampKey)) {
                state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                state.sortColumn = key;
                state.sortDirection = 'asc';
            }
            app.renderContent();
        });
    });
}

export function renderContent() {
    const area = document.getElementById('contentArea');
    if (state.raw.length === 0) {
        area.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
        <h2>No data loaded</h2>
        <p>Load a CSV file <kbd>Menu → Load CSV</kbd> or drag and drop a file onto the page.</p>
        <p class="empty-state-sample-hint">Or <strong>pick a sample dataset below</strong> to populate the dashboard with generated data and explore the features.</p>
        <div class="sample-chooser">
          <button class="sample-card" data-sample="database">
            <div class="sample-card-title">Database Audit</div>
            <svg class="sample-card-icon" viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4.03 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/></svg>
            <div class="sample-card-desc">
              CRUD operations on a multi-table database tracked by contributor.
              <div class="sample-card-fields">Contributor, Table, Field, Action, PKey</div>
            </div>
          </button>
          <button class="sample-card" data-sample="financial">
            <div class="sample-card-title">Financial</div>
            <svg class="sample-card-icon" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            <div class="sample-card-desc">
              Personal transaction history with income and expenses across multiple accounts.
              <div class="sample-card-fields">Description, Category, Amount, Balance, Account</div>
            </div>
          </button>
          <button class="sample-card" data-sample="ticketing">
            <div class="sample-card-title">IT Ticketing</div>
            <svg class="sample-card-icon" viewBox="0 0 24 24"><path d="M15 5v2m0 4v2m0 4v2"/><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18"/></svg>
            <div class="sample-card-desc">
              Support ticket lifecycle tracking with response times and resolution metrics.
              <div class="sample-card-fields">Ticket #, Subject, Requestor, Technician, Status, Priority, Response, Resolution</div>
            </div>
          </button>
        </div>
      </div>`;
        area.querySelectorAll('.sample-card').forEach(card => {
            card.addEventListener('click', () => {
                const type = card.dataset.sample;
                let result;
                if (type === 'financial') result = generateFinancialData();
                else if (type === 'ticketing') result = generateTicketingData();
                else result = generateSampleData();
                ingest(result.records, result.schema);
                const labels = {database: 'Database Audit', financial: 'Financial', ticketing: 'IT Ticketing'};
                state.dataSource = {
                    name: `Sample Data \u2014 ${labels[type]}`,
                    type: 'sample',
                    recordCount: result.records.length
                };
                app.fullRender();
            });
        });
        return;
    }

    const schema = state.schema;
    const metric = schema.heatmapMetric;
    const preset = state.metricPresets[state.activeMetricIndex];
    const year = state.activeYear, prefix = String(year);

    // Always count records for the active year
    const yearRecords = state.filtered.filter(r => r[schema.timestampKey].startsWith(prefix));
    let activeDays = 0, totalDays = 0;
    for (let d = new Date(year, 0, 1); d <= new Date(year, 11, 31); d.setDate(d.getDate() + 1)) {
        const dk = dateKey(d);
        totalDays++;
        if ((state.dayValues[dk] || 0) !== 0) activeDays++;
    }

    // Compute metric-specific aggregate for the year
    let metricCard = '';
    if (preset && preset.type !== 'count') {
        let metricValue;
        const col = preset.column;
        if (preset.type === 'count_distinct') {
            const unique = new Set();
            yearRecords.forEach(r => {
                const v = r[col];
                if (v != null && v !== '') unique.add(v);
            });
            metricValue = unique.size;
        } else if (preset.type === 'avg') {
            const nums = yearRecords.map(r => parseFloat(r[col])).filter(n => !isNaN(n));
            metricValue = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
        } else if (preset.type === 'sum') {
            const nums = yearRecords.map(r => parseFloat(r[col])).filter(n => !isNaN(n));
            metricValue = nums.reduce((a, b) => a + b, 0);
        } else if (preset.type === 'min') {
            const nums = yearRecords.map(r => parseFloat(r[col])).filter(n => !isNaN(n));
            metricValue = nums.length > 0 ? Math.min(...nums) : 0;
        } else if (preset.type === 'max') {
            const nums = yearRecords.map(r => parseFloat(r[col])).filter(n => !isNaN(n));
            metricValue = nums.length > 0 ? Math.max(...nums) : 0;
        }
        metricCard = `<div class="stat-card"><div class="label">${escapeHtml(preset.label)} This Year</div><div class="value">${formatSummaryValue(metricValue)}</div></div>`;
    }

    let topPrimaryCard = '';
    if (schema.primaryColumn) {
        const counts = {};
        state.filtered.forEach(r => {
            if (r[schema.timestampKey].startsWith(prefix)) {
                const v = r[schema.primaryColumn];
                if (v) counts[v] = (counts[v] || 0) + 1;
            }
        });
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        const colLabel = schema.columns.find(c => c.key === schema.primaryColumn)?.header || schema.primaryColumn;
        topPrimaryCard = `
      <div class="stat-card">
        <div class="label">Top ${colLabel}</div>
        <div class="value" style="font-size:1.1rem">${top ? top[0] : '\u2014'}</div>
        <div class="delta">${top ? top[1].toLocaleString() + ' ' + (metric.labelPlural || 'records') : ''}</div>
      </div>`;
    }

    const selSummary = getHighlightSummary();
    let summaryHTML = '';
    if (selSummary) {
        let breakdownHTML = '';
        if (selSummary.breakdown) {
            breakdownHTML = Object.entries(selSummary.breakdown).sort((a, b) => b[1] - a[1]).map(([val, count]) => {
                const badge = schema.badgeColumn === selSummary.breakdownColumn && schema.badgeColors[val];
                const style = badge ? `color:${badge.fg}` : '';
                return `<div class="row-summary-stat"><div class="rs-label">${escapeHtml(val)}</div><div class="rs-value" style="${style}">${count.toLocaleString()}</div></div>`;
            }).join('');
        }
        const selDays = getSelectedDays();
        const selAllEntries = [];
        selDays.forEach(dk => {
            const e = state.dayEntries[dk];
            if (e) selAllEntries.push(...e);
        });
        const selRecordCount = selAllEntries.length;

        let selMetricStat = '';
        const selPreset = state.metricPresets?.[state.activeMetricIndex];
        if (selPreset && selPreset.type !== 'count' && selAllEntries.length > 0) {
            const selMetricVal = aggregateEntries(selAllEntries, {type: selPreset.type, column: selPreset.column});
            selMetricStat = `<div class="row-summary-stat"><div class="rs-label">${escapeHtml(selPreset.label)}</div><div class="rs-value">${formatSummaryValue(selMetricVal)}</div></div>`;
        }
        summaryHTML = `
      <div class="row-summary">
        <div class="row-summary-header">
          <h3>Selection Summary \u2014 ${selSummary.label}</h3>
          <button class="row-summary-clear" id="clearSelections">Clear selection</button>
        </div>
        <div class="row-summary-grid">
          <div class="row-summary-stat"><div class="rs-label">Total Records</div><div class="rs-value">${selRecordCount.toLocaleString()}</div></div>
          ${selMetricStat}
          <div class="row-summary-stat"><div class="rs-label">Active / Total Days</div><div class="rs-value">${selSummary.activeDays} / ${selSummary.totalDays}</div><div class="rs-detail">${selSummary.totalDays > 0 ? Math.round(selSummary.activeDays / selSummary.totalDays * 100) : 0}% active</div></div>
          ${selSummary.topPrimary ? `<div class="row-summary-stat"><div class="rs-label">Top ${selSummary.primaryLabel}</div><div class="rs-value" style="font-size:0.95rem">${selSummary.topPrimary[0]}</div><div class="rs-detail">${selSummary.topPrimary[1].toLocaleString()} ${selSummary.metricLabel}</div></div>` : ''}
          ${selSummary.topSecondary ? `<div class="row-summary-stat"><div class="rs-label">Top ${selSummary.secondaryLabel}</div><div class="rs-value" style="font-size:0.95rem">${selSummary.topSecondary[0]}</div><div class="rs-detail">${selSummary.topSecondary[1].toLocaleString()} ${selSummary.metricLabel}</div></div>` : ''}
          ${breakdownHTML}
        </div>
      </div>`;
    }

    const hasActiveFilters = schema.filterColumns.some(col => state.filters[col]?.size > 0);
    const activeFilterDesc = hasActiveFilters ? ' (filtered)' : '';
    const metricTotalLabel = metric.labelPlural || 'records';

    // Build log HTML
    let logHTML;
    if (hasAnySelections()) {
        logHTML = buildMultiSelectView(schema, metric);
    } else if (state.selectedDate) {
        logHTML = buildSingleDayLog(state.selectedDate, schema, metric, metricTotalLabel);
    } else {
        logHTML = `
      <div class="day-log">
        <div class="day-log-header"><h3>Select a day</h3></div>
        <div class="day-log-placeholder">Click any cell in the heatmap to see the detail log.</div>
      </div>`;
    }

    area.innerHTML = `
    <div class="content-header">
      <h1>${year} Overview</h1>
      <p>${state.filtered.length.toLocaleString()} total records across ${state.years.length} years${activeFilterDesc}</p>
    </div>
    ${summaryHTML}
    <div class="stats-row">
      <div class="stat-card"><div class="label">Records This Year</div><div class="value">${yearRecords.length.toLocaleString()}</div></div>
      ${metricCard}
      <div class="stat-card"><div class="label">Active Days</div><div class="value">${activeDays}</div><div class="delta">${totalDays > 0 ? Math.round(activeDays / totalDays * 100) : 0}% of days</div></div>
      ${topPrimaryCard}
    </div>
    ${logHTML}`;

    wireEvents(area);
}

// ===== Multi-select two-tier view =====

function buildMultiSelectView(schema, metric) {
    const allDays = getSelectedDays();
    if (allDays.length === 0) return '';

    // Auto-focus if under threshold
    if (allDays.length <= settings.autoFocusThreshold) {
        allDays.forEach(dk => state.focusedDays.add(dk));
    }

    // Clean focusedDays: remove any that are no longer selected
    for (const dk of state.focusedDays) {
        if (!allDays.includes(dk)) state.focusedDays.delete(dk);
    }

    const focused = allDays.filter(dk => state.focusedDays.has(dk));
    const collapsed = allDays.filter(dk => !state.focusedDays.has(dk));

    // Build focused section
    let focusedHTML = '';
    if (focused.length > 0) {
        focusedHTML = focused.map(dk => buildFocusedDayLog(dk, schema, metric)).join('');
    }

    // Build collapsed list
    let collapsedHTML = '';
    if (collapsed.length > 0) {
        const rows = collapsed.map(dk => buildCollapsedRow(dk, schema)).join('');
        collapsedHTML = `
      <div class="day-log collapsed-list">
        <div class="day-log-header">
          <h3>${collapsed.length} more day${collapsed.length !== 1 ? 's' : ''}</h3>
        </div>
        <div class="collapsed-rows">${rows}</div>
      </div>`;
    }

    return focusedHTML + collapsedHTML;
}

function buildFocusedDayLog(dk, schema, metric) {
    const entries = state.dayEntries[dk] || [];
    const sorted = sortEntries(entries, schema);
    const display = sorted.slice(0, MAX_LOG_ROWS);
    const d = new Date(dk + 'T00:00:00');
    const formatted = d.toLocaleDateString('en-US', {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'});
    const dayHasNote = hasDayNote(dk);

    const thHTML = buildSortableHeaders(schema);
    const rowsHTML = buildRowsHTML(display, dk, 0, schema);

    return `
    <div class="day-log focused-day" data-focused-day="${dk}">
      <div class="day-log-header">
        <h3>${formatted}</h3>
        <div class="day-log-header-actions">
          <button class="note-btn ${dayHasNote ? 'has-note' : ''}" data-note-action="day" data-note-date="${dk}" title="${dayHasNote ? 'Edit day note' : 'Add day note'}">
            <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            ${dayHasNote ? 'Edit Note' : 'Add Note'}
          </button>
          <span class="count">${entries.length} ${entries.length !== 1 ? (metric.labelPlural || 'records') : (metric.label || 'record')}${metricBadge(entries)}</span>
          <button class="demote-btn" data-demote-day="${dk}" title="Remove from focused view">
            <svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </div>
      </div>
      ${renderDayNote(dk)}
      ${entries.length === 0
        ? `<div class="day-log-placeholder">No records for this day with current filters.</div>`
        : `<div class="log-table-scroll">
            <div class="log-scroll-arrow log-scroll-arrow-left"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg></div>
            <div class="log-table-scroll-inner">
              <table class="log-table"><thead><tr>${thHTML}</tr></thead><tbody>${rowsHTML}</tbody></table>
            </div>
            <div class="log-scroll-arrow log-scroll-arrow-right"><svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></div>
          </div>`
    }
    </div>`;
}

function buildCollapsedRow(dk, schema) {
    const entries = state.dayEntries[dk] || [];
    const count = entries.length;
    const d = new Date(dk + 'T00:00:00');
    const label = d.toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'});

    // Build highlight breakdown for tooltip
    const breakdownParts = getHighlightBreakdown(dk, entries, schema);
    const tooltipText = breakdownParts.length > 0
        ? breakdownParts.map(p => `${p.label}: ${p.count}`).join('\n')
        : '';

    return `
    <div class="collapsed-row" data-collapsed-day="${dk}">
      <button class="collapsed-expand" data-expand-day="${dk}" title="Peek at records">
        <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <span class="collapsed-date">${label}</span>
      <span class="collapsed-dots"></span>
      <span class="collapsed-count" ${tooltipText ? `title="${escapeHtml(tooltipText)}"` : ''}>${count}</span>
      <button class="promote-btn" data-promote-day="${dk}" title="Add to focused view">
        <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
      <div class="collapsed-peek" style="display:none" data-peek-day="${dk}"></div>
    </div>`;
}

function getHighlightBreakdown(dk, entries, schema) {
    const parts = [];
    if (!hasAnyHighlightFilters()) return parts;
    schema.filterColumns.forEach(col => {
        if (state.filterModes[col] !== 'highlight' || !state.filters[col]?.size) return;
        const color = state.filterHighlightColors[col] || 'rgba(255,180,30,0.75)';
        const colDef = schema.columns.find(c => c.key === col);
        const label = colDef ? colDef.header : col;
        const matchCount = entries.filter(r => state.filters[col].has(r[col])).length;
        if (matchCount > 0) parts.push({label, count: matchCount, color});
    });
    return parts;
}

// ===== Single day log =====

function buildSingleDayLog(dk, schema, metric, metricTotalLabel) {
    const entries = state.dayEntries[dk] || [];
    const sorted = sortEntries(entries, schema);
    const display = sorted.slice(0, state.logVisibleCount);
    const remaining = sorted.length - state.logVisibleCount;
    const d = new Date(dk + 'T00:00:00');
    const formatted = d.toLocaleDateString('en-US', {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'});
    const dayHasNote = hasDayNote(dk);

    const thHTML = buildSortableHeaders(schema);
    const rowsHTML = buildRowsHTML(display, dk, 0, schema);

    return `
    <div class="day-log">
      <div class="day-log-header">
        <h3>${formatted}</h3>
        <div class="day-log-header-actions">
          <button class="note-btn ${dayHasNote ? 'has-note' : ''}" data-note-action="day" data-note-date="${dk}" title="${dayHasNote ? 'Edit day note' : 'Add day note'}">
            <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            ${dayHasNote ? 'Edit Note' : 'Add Note'}
          </button>
          <span class="count">${entries.length} ${entries.length !== 1 ? (metric.labelPlural || 'records') : (metric.label || 'record')}${metricBadge(entries)}</span>
        </div>
      </div>
      ${renderDayNote(dk)}
      ${entries.length === 0
        ? `<div class="day-log-placeholder">No ${metricTotalLabel} recorded for this day with current filters.</div>`
        : `<div class="log-table-scroll">
            <div class="log-scroll-arrow log-scroll-arrow-left" id="logScrollLeft"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg></div>
            <div class="log-table-scroll-inner" id="logScrollInner">
              <table class="log-table"><thead><tr>${thHTML}</tr></thead><tbody>${rowsHTML}</tbody></table>
            </div>
            <div class="log-scroll-arrow log-scroll-arrow-right" id="logScrollRight"><svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></div>
          </div>
          ${remaining > 0 ? `<div class="log-overflow"><button class="load-more-btn" id="loadMoreBtn">Load more (${remaining} remaining)</button></div>` : ''}`
    }
    </div>`;
}

// ===== Shared row builders =====

function buildRowsHTML(records, dk, startIdx, schema) {
    return records.map((r, i) => {
        const idx = startIdx + i;
        const rn = getRowNote(dk, idx);
        const noteBtn = `<td style="padding:4px 4px 4px 12px;"><button class="row-note-btn ${rn ? 'has-note' : ''}" data-row-idx="${idx}" data-row-date="${dk}" title="${rn ? 'Edit row note' : 'Add row note'}"><svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button></td>`;
        const cells = schema.logColumns.map(col => renderCell(r, col, schema)).join('');
        const noteRow = rn ? renderRowNoteRow(rn, schema.logColumns.length) : '';
        return `<tr>${noteBtn}${cells}</tr>${noteRow}`;
    }).join('');
}

function renderRowNoteRow(noteText, colCount) {
    const fullSpan = colCount + 1;
    const isMultiline = noteText.includes('\n') || noteText.length > 120;
    const firstLine = noteText.split('\n')[0];
    const truncated = firstLine.length > 120 ? firstLine.substring(0, 120) + '\u2026' : firstLine;
    if (!isMultiline) {
        return `<tr class="row-note-tr"><td colspan="${fullSpan}" class="row-note-cell"><div class="row-note-pin">\ud83d\udcdd ${escapeHtml(noteText)}</div></td></tr>`;
    }
    return `<tr class="row-note-tr"><td colspan="${fullSpan}" class="row-note-cell"><div class="row-note-pin">
    <span class="row-note-text" title="${escapeHtml(noteText)}">\ud83d\udcdd ${escapeHtml(truncated)}</span>
    <span class="row-note-toggle" data-full="${escapeHtml(noteText)}"> Show more \u2304</span>
  </div></td></tr>`;
}

function renderDayNote(dk) {
    if (!hasDayNote(dk)) return '';
    const noteText = state.notes[dk].dayNote;
    const firstLine = noteText.split('\n')[0];
    const truncated = firstLine.length > 100 ? firstLine.substring(0, 100) + '\u2026' : firstLine;
    const isLong = noteText.includes('\n') || noteText.length > 100;
    return `<div class="day-note-sticky">\ud83d\udcdd <span class="day-note-text">${escapeHtml(isLong ? truncated : noteText)}</span>${isLong ? `<span class="day-note-expand" data-full="${escapeHtml(noteText)}"> Show more \u2304</span>` : ''}</div>`;
}

// ===== Event wiring =====

function wireEvents(area) {
    // Sort headers
    wireSortHeaders(area);
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (loadMoreBtn) loadMoreBtn.addEventListener('click', () => {
        state.logVisibleCount += MAX_LOG_ROWS;
        renderContent();
    });
    // Day note buttons
    area.querySelectorAll('[data-note-action="day"]').forEach(btn => {
        btn.addEventListener('click', () => openNoteModal('day', btn.dataset.noteDate));
    });
    // Row note buttons
    area.querySelectorAll('.row-note-btn').forEach(btn => {
        const dk = btn.dataset.rowDate || state.selectedDate;
        btn.addEventListener('click', () => openNoteModal('row', dk, parseInt(btn.dataset.rowIdx)));
    });
    // Clear selections
    const clearBtn = document.getElementById('clearSelections');
    if (clearBtn) clearBtn.addEventListener('click', () => {
        clearAllSelections();
        state.focusedDays.clear();
        refreshAllHighlights();
        renderContent();
    });
    // Row note show more toggles
    area.querySelectorAll('.row-note-toggle').forEach(toggle => {
        toggle.addEventListener('click', () => {
            const parent = toggle.closest('.row-note-cell');
            const textSpan = parent.querySelector('.row-note-text');
            const fullText = toggle.dataset.full;
            if (toggle.classList.contains('expanded')) {
                textSpan.textContent = '\ud83d\udcdd ' + (fullText.split('\n')[0].substring(0, 120) + (fullText.length > 120 ? '\u2026' : ''));
                toggle.textContent = ' Show more \u2304';
                toggle.classList.remove('expanded');
            } else {
                textSpan.textContent = '\ud83d\udcdd ' + fullText;
                textSpan.style.whiteSpace = 'pre-wrap';
                toggle.textContent = ' Show less \u2303';
                toggle.classList.add('expanded');
            }
        });
    });
    // Day note show more toggle
    area.querySelectorAll('.day-note-expand').forEach(toggle => {
        toggle.addEventListener('click', () => {
            const parent = toggle.closest('.day-note-sticky') || toggle.closest('.day-note-inline');
            if (!parent) return;
            const textSpan = parent.querySelector('.day-note-text');
            if (!textSpan) return;
            const fullText = toggle.dataset.full;
            if (toggle.classList.contains('expanded')) {
                const firstLine = fullText.split('\n')[0];
                textSpan.textContent = firstLine.length > 100 ? firstLine.substring(0, 100) + '\u2026' : firstLine;
                parent.classList.remove('expanded');
                toggle.textContent = ' Show more \u2304';
                toggle.classList.remove('expanded');
            } else {
                textSpan.textContent = fullText;
                parent.classList.add('expanded');
                toggle.textContent = ' Show less \u2303';
                toggle.classList.add('expanded');
            }
        });
    });

    // Promote buttons (collapsed → focused)
    area.querySelectorAll('.promote-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            state.focusedDays.add(btn.dataset.promoteDay);
            renderContent();
        });
    });

    // Demote buttons (focused → collapsed)
    area.querySelectorAll('.demote-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            state.focusedDays.delete(btn.dataset.demoteDay);
            renderContent();
        });
    });

    // Peek expand/collapse (in-place)
    area.querySelectorAll('.collapsed-expand').forEach(btn => {
        btn.addEventListener('click', () => {
            const dk = btn.dataset.expandDay;
            const row = btn.closest('.collapsed-row');
            const peek = row.querySelector('.collapsed-peek');
            if (peek.style.display !== 'none') {
                peek.style.display = 'none';
                peek.innerHTML = '';
                btn.classList.remove('expanded');
                return;
            }
            // Build peek content
            const schema = state.schema;
            const entries = state.dayEntries[dk] || [];
            const sorted = sortEntries(entries, schema);
            const display = sorted.slice(0, MAX_LOG_ROWS);
            const thHTML = buildSortableHeaders(schema);
            const rowsHTML = buildRowsHTML(display, dk, 0, schema);
            peek.innerHTML = `
        <div class="log-table-scroll">
          <div class="log-table-scroll-inner">
            <table class="log-table"><thead><tr>${thHTML}</tr></thead><tbody>${rowsHTML}</tbody></table>
          </div>
        </div>`;
            peek.style.display = '';
            btn.classList.add('expanded');
            // Wire row note buttons in peek
            peek.querySelectorAll('.row-note-btn').forEach(noteBtn => {
                noteBtn.addEventListener('click', () => openNoteModal('row', dk, parseInt(noteBtn.dataset.rowIdx)));
            });
            wireSortHeaders(peek);
        });
    });

    initLogTableScroll();
}

// ===== Log table horizontal scroll =====

function initLogTableScroll() {
    // Handle all scroll wrappers (multiple in multi-select)
    document.querySelectorAll('.log-table-scroll').forEach(wrapper => {
        const inner = wrapper.querySelector('.log-table-scroll-inner');
        const left = wrapper.querySelector('.log-scroll-arrow-left');
        const right = wrapper.querySelector('.log-scroll-arrow-right');
        if (!inner || !left || !right) return;

        function updateArrows() {
            const hasOverflow = inner.scrollWidth > inner.clientWidth + 2;
            const atLeft = inner.scrollLeft <= 2;
            const atRight = inner.scrollLeft >= inner.scrollWidth - inner.clientWidth - 2;
            left.classList.toggle('visible', hasOverflow && !atLeft);
            right.classList.toggle('visible', hasOverflow && !atRight);
        }

        function getColumnStep() {
            const ths = inner.querySelectorAll('.log-table th');
            if (ths.length > 1) return ths[1].offsetWidth;
            return 200;
        }

        left.addEventListener('click', () => inner.scrollBy({left: -getColumnStep(), behavior: 'smooth'}));
        right.addEventListener('click', () => inner.scrollBy({left: getColumnStep(), behavior: 'smooth'}));
        inner.addEventListener('scroll', updateArrows, {passive: true});
        requestAnimationFrame(updateArrows);
    });
}

// ===== Cell renderers =====

function renderCell(record, colDef, schema) {
    const display = colDef.display || 'text';
    const anyHighlightsActive = hasAnyHighlightFilters();

    if (colDef.keys && anyHighlightsActive) {
        const sep = colDef.separator || '.';
        const parts = colDef.keys.map(k => {
            const val = record[k] || '';
            const color = getHighlightColorForKey(record, k);
            const style = color ? `color:${color}` : 'color:var(--text-primary)';
            return `<span style="${style}">${escapeHtml(val)}</span>`;
        }).filter((_, i) => (record[colDef.keys[i]] || '') !== '');
        const sepSpan = `<span style="color:var(--text-primary)">${escapeHtml(sep)}</span>`;
        const inner = parts.join(sepSpan);
        if (display === 'accent') return `<td class="target" style="color:var(--text-primary)">${inner}</td>`;
        return `<td style="color:var(--text-primary)">${inner}</td>`;
    }

    let value;
    if (colDef.keys) {
        value = colDef.keys.map(k => record[k] || '').filter(Boolean).join(colDef.separator || '.');
    } else {
        value = record[colDef.key] || '';
    }
    const hlColor = getHighlightColorForCell(record, colDef);
    const colorStyle = hlColor ? ` style="color:${hlColor}"` : '';
    switch (display) {
        case 'time': {
            const timeStr = value.length >= 19 ? value.substring(11, 19) : value;
            return `<td class="time"${colorStyle}>${escapeHtml(timeStr)}</td>`;
        }
        case 'primary':
            return `<td class="contributor-cell"${colorStyle}>${escapeHtml(value)}</td>`;
        case 'mono':
            return `<td class="pkey-cell"${colorStyle}>${escapeHtml(value || '\u2014')}</td>`;
        case 'accent':
            return `<td class="target"${colorStyle}>${escapeHtml(value)}</td>`;
        case 'badge': {
            if (hlColor) return `<td><span class="action-badge" style="background:${hlColor.replace(/[\d.]+\)$/, '0.15)')};color:${hlColor}">${escapeHtml(value)}</span></td>`;
            const colors = schema.badgeColors?.[value];
            if (colors) return `<td><span class="action-badge" style="background:${colors.bg};color:${colors.fg}">${escapeHtml(value)}</span></td>`;
            return `<td><span class="action-badge">${escapeHtml(value)}</span></td>`;
        }
        case 'truncate':
            return `<td class="truncate-cell" title="${escapeHtml(value)}"${colorStyle}>${escapeHtml(value)}</td>`;
        default:
            return `<td${colorStyle}>${escapeHtml(value)}</td>`;
    }
}

function getHighlightColorForKey(record, key) {
    if (state.filterModes[key] === 'highlight' && state.filters[key]?.size > 0) {
        const val = record[key];
        if (val && state.filters[key].has(val)) return state.filterHighlightColors[key] || 'rgba(255, 180, 30, 0.75)';
    }
    return null;
}

function getHighlightColorForCell(record, colDef) {
    const keys = colDef.keys || (colDef.key ? [colDef.key] : []);
    for (const key of keys) {
        const c = getHighlightColorForKey(record, key);
        if (c) return c;
    }
    return null;
}

function formatSummaryValue(value) {
    if (Number.isInteger(value)) return value.toLocaleString();
    return value.toLocaleString(undefined, {maximumFractionDigits: 1});
}
