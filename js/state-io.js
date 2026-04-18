/*
 * state-io.js — State export/import and toolbar menu for save/load.
 */

import {state, settings, app} from './state.js';
import {applyFilters} from './data.js';
import {applyPalette} from './themes.js';

export function closeToolbarMenu() {
    document.getElementById('toolbarDropdown')?.classList.remove('open');
}

export function initStateIO() {
    document.getElementById('exportStateBtn').addEventListener('click', () => {
        exportState();
        closeToolbarMenu();
    });
    document.getElementById('loadStateInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                importState(JSON.parse(ev.target.result));
            } catch (err) {
                console.error('Failed to load state:', err);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
        closeToolbarMenu();
    });
    document.getElementById('csvInput').addEventListener('change', () => closeToolbarMenu());

    // Toolbar menu toggle
    const menuBtn = document.getElementById('toolbarMenuBtn');
    const dropdown = document.getElementById('toolbarDropdown');
    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('open');
    });
    document.addEventListener('click', () => dropdown.classList.remove('open'));
    dropdown.addEventListener('click', (e) => e.stopPropagation());
}

export function exportState() {
    const payload = {
        version: '0.4.5',
        notes: state.notes,
        filters: {},
        filterModes: state.filterModes,
        filterHighlightColors: state.filterHighlightColors,
        visibleFilterColumns: state.schema?.visibleFilterColumns || [],
        activePalette: state.activePalette,
        focusedDays: Array.from(state.focusedDays),
        metricPresets: state.metricPresets,
        activeMetricIndex: state.activeMetricIndex,
        settings: {
            hiddenDays: Array.from(settings.hiddenDays),
            monthPadding: settings.monthPadding,
            monthIndicatorColor: settings.monthIndicatorColor,
            autoFocusThreshold: settings.autoFocusThreshold,
            autoDetectDateColumn: settings.autoDetectDateColumn,
        },
    };
    // Convert filter Sets to arrays for JSON
    if (state.schema) {
        state.schema.filterColumns.forEach(col => {
            if (state.filters[col]?.size > 0) {
                payload.filters[col] = Array.from(state.filters[col]);
            }
        });
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dsName = state.dataSource?.name?.replace(/\.[^.]+$/, '') || 'dashboard';
    a.download = `${dsName}-state.json`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function importState(payload) {
    if (!payload) return;
    // Restore notes
    if (payload.notes) state.notes = payload.notes;
    // Restore filters (arrays back to Sets)
    if (payload.filters && state.schema) {
        state.schema.filterColumns.forEach(col => {
            if (payload.filters[col]) state.filters[col] = new Set(payload.filters[col]);
        });
    }
    // Restore filter modes and colors
    if (payload.filterModes) Object.assign(state.filterModes, payload.filterModes);
    if (payload.filterHighlightColors) Object.assign(state.filterHighlightColors, payload.filterHighlightColors);
    // Restore visible filter columns
    if (payload.visibleFilterColumns && state.schema) {
        state.schema.visibleFilterColumns = payload.visibleFilterColumns;
    }
    // Restore palette
    if (payload.activePalette != null) applyPalette(payload.activePalette);
    // Restore focused days
    if (payload.focusedDays) state.focusedDays = new Set(payload.focusedDays);
    // Restore metric presets
    if (payload.metricPresets) {
        state.metricPresets = payload.metricPresets;
        state.activeMetricIndex = payload.activeMetricIndex ?? 0;
    }
    // Restore display settings
    if (payload.settings) {
        if (payload.settings.hiddenDays) settings.hiddenDays = new Set(payload.settings.hiddenDays);
        if (payload.settings.monthPadding != null) settings.monthPadding = payload.settings.monthPadding;
        if (payload.settings.monthIndicatorColor) {
            settings.monthIndicatorColor = payload.settings.monthIndicatorColor;
            if (app.applyMonthIndicatorColor) app.applyMonthIndicatorColor(settings.monthIndicatorColor);
        }
        if (payload.settings.autoFocusThreshold != null) settings.autoFocusThreshold = payload.settings.autoFocusThreshold;
        if (payload.settings.autoDetectDateColumn != null) settings.autoDetectDateColumn = payload.settings.autoDetectDateColumn;
        // Sync UI controls
        document.querySelectorAll('#settingsDowGrid input[type="checkbox"]').forEach(cb => {
            cb.checked = !settings.hiddenDays.has(parseInt(cb.dataset.dow));
        });
        const mpCb = document.getElementById('settingsMonthPadding');
        if (mpCb) mpCb.checked = settings.monthPadding;
        const mcIn = document.getElementById('settingsMonthColor');
        if (mcIn) mcIn.value = settings.monthIndicatorColor;
        const afIn = document.getElementById('settingsAutoFocus');
        if (afIn) afIn.value = settings.autoFocusThreshold;
        const adCb = document.getElementById('settingsAutoDetectDate');
        if (adCb) adCb.checked = settings.autoDetectDateColumn;
    }
    // Re-run pipeline and render
    if (state.schema) applyFilters();
    if (app.fullRender) app.fullRender();
}
