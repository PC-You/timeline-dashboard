/*
 * settings-columns.js — Settings → Columns tab.
 *
 * Shows one row per schema column with three checkboxes (visible / filterable /
 * reportable) and a metadata strip (type · unique count · coverage %). Changes
 * apply immediately with a short debounce; downstream renderers consult
 * state.columnConfig to respect the flags.
 *
 * The timestamp column is visually present but its checkboxes are disabled — the
 * timeline has nothing to render against without a timestamp, so visibility and
 * reportability are forced on and filterable is forced off.
 */

import {state, app} from './state.js';
import {escapeHtml} from './utils.js';
import {logger} from './logger.js';
import {toast} from './toast.js';

const RERENDER_DEBOUNCE_MS = 150;
let rerenderTimer = null;

function scheduleRerender() {
    clearTimeout(rerenderTimer);
    rerenderTimer = setTimeout(() => {
        if (app.fullRender) app.fullRender();
    }, RERENDER_DEBOUNCE_MS);
}

function columnTypeHint(colKey, schema) {
    if (colKey === schema.timestampKey) return 'timestamp';
    const numericKeys = new Set((schema.numericColumns || []).map(c => c.key));
    if (numericKeys.has(colKey)) return 'numeric';
    return 'text';
}

function formatCoverage(coverage) {
    const pct = Math.round(coverage * 100);
    return `in ${pct}% of records`;
}

function buildColumnRow(col, schema) {
    const key = col.key;
    const stats = (schema.columnStats || {})[key] || {uniqueCount: 0, coverage: 0};
    const cfg = state.columnConfig[key] || {visible: true, filterable: true, reportable: true};
    const isTimestamp = key === schema.timestampKey;
    const type = columnTypeHint(key, schema);

    const disabledAttr = isTimestamp ? 'disabled' : '';
    const metaParts = [
        type,
        `${stats.uniqueCount.toLocaleString()} unique`,
        formatCoverage(stats.coverage),
    ];
    if (isTimestamp) metaParts.push('locked');

    return `
    <div class="col-config-row${isTimestamp ? ' is-timestamp' : ''}" data-col-key="${escapeHtml(key)}">
      <div class="col-config-main">
        <div class="col-config-name">${escapeHtml(col.header)}</div>
        <div class="col-config-meta">${metaParts.map(escapeHtml).join(' \u00b7 ')}</div>
      </div>
      <div class="col-config-checks">
        <label class="col-config-check" title="Show in log table">
          <input type="checkbox" data-flag="visible" ${cfg.visible ? 'checked' : ''} ${isTimestamp ? 'disabled' : ''}>
          <span>Visible</span>
        </label>
        <label class="col-config-check" title="Offer as a filter facet">
          <input type="checkbox" data-flag="filterable" ${cfg.filterable ? 'checked' : ''} ${disabledAttr}>
          <span>Filterable</span>
        </label>
        <label class="col-config-check" title="Include in metrics and summaries">
          <input type="checkbox" data-flag="reportable" ${cfg.reportable ? 'checked' : ''} ${isTimestamp ? 'disabled' : ''}>
          <span>Reportable</span>
        </label>
      </div>
    </div>`;
}

/**
 * Handle filterable→off: clear any active filters on that column so stale
 * filter state doesn't silently affect the view after the facet disappears.
 * Returns the count of values that were active, for the toast message.
 */
function handleFilterableDisabled(colKey) {
    const schema = state.schema;
    const activeSet = state.filters[colKey];
    const count = activeSet instanceof Set ? activeSet.size : 0;
    if (count > 0) {
        state.filters[colKey] = new Set();
        const colLabel = schema.columns.find(c => c.key === colKey)?.header || colKey;
        toast(`Cleared ${count} active filter${count === 1 ? '' : 's'} on "${colLabel}"`, {level: 'info'});
        logger.info('filter', `Filterable disabled — cleared ${count} active filter value(s)`, {column: colKey});
    }
    // Also remove from visibleFilterColumns so it doesn't reappear if re-enabled later
    if (schema.visibleFilterColumns) {
        schema.visibleFilterColumns = schema.visibleFilterColumns.filter(c => c !== colKey);
    }
}

/**
 * Handle reportable→off: if the active metric preset targets this column, switch
 * back to the default "Activity" count metric so the heatmap doesn't break.
 * Other presets referring to this column are kept but will be silently excluded
 * from the popover's column picker until the flag is re-enabled.
 */
function handleReportableDisabled(colKey) {
    const active = state.metricPresets[state.activeMetricIndex];
    if (active && active.column === colKey) {
        state.activeMetricIndex = 0;
        toast(`Switched to Activity — the active metric referenced "${colKey}"`, {level: 'warn'});
        logger.info('metric', 'Active metric switched to default — its column became non-reportable', {column: colKey});
    }
}

function onFlagChange(colKey, flag, newValue) {
    if (!state.columnConfig[colKey]) {
        state.columnConfig[colKey] = {visible: true, filterable: true, reportable: true};
    }
    const prev = state.columnConfig[colKey][flag];
    state.columnConfig[colKey][flag] = newValue;
    logger.info('ui', `Column config change: ${colKey}.${flag} ${prev} \u2192 ${newValue}`);

    if (flag === 'filterable' && !newValue) handleFilterableDisabled(colKey);
    if (flag === 'reportable' && !newValue) handleReportableDisabled(colKey);

    scheduleRerender();
}

export function renderColumnsPanel() {
    const panel = document.getElementById('settingsColumnsPanel');
    if (!panel) return;
    if (!state.schema) {
        panel.innerHTML = '<em>Load data to configure columns.</em>';
        return;
    }
    const schema = state.schema;
    const ordered = [...(schema.columns || [])].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
    panel.innerHTML = ordered.map(col => buildColumnRow(col, schema)).join('');

    panel.querySelectorAll('.col-config-row').forEach(row => {
        const key = row.dataset.colKey;
        row.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => {
                onFlagChange(key, cb.dataset.flag, cb.checked);
            });
        });
    });
}
