/*
 * settings-modal.js — Settings modal with tabbed layout.
 *
 * Tabs: General, Columns, Appearance & Themes, Advanced.
 *
 * Each tab's controls are initialized here in their own init function to keep
 * responsibilities clear. The Columns tab is the exception — when it grows
 * substantially in Phase 4 of v0.5.0, it will move to its own settings-columns.js
 * module. Until then, keeping everything in one file avoids premature fragmentation.
 */

import {state, settings, app} from './state.js';
import {applyPalette, palettes} from './themes.js';
import {logger} from './logger.js';
import {renderColumnsPanel} from './settings-columns.js';

/**
 * Update the --month-indicator and --month-indicator-glow CSS variables from a hex color.
 * Exported because state-io needs to call this on state import.
 */
export function applyMonthIndicatorColor(hex) {
    const root = document.documentElement;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    root.style.setProperty('--month-indicator', `rgba(${r},${g},${b},0.35)`);
    root.style.setProperty('--month-indicator-glow', `rgba(${r},${g},${b},0.12)`);
}

function initGeneralTab() {
    // Day-of-week toggles
    document.querySelectorAll('#settingsDowGrid input[type="checkbox"]').forEach(cb => {
        const dow = parseInt(cb.dataset.dow);
        cb.checked = !settings.hiddenDays.has(dow);
        cb.addEventListener('change', () => {
            if (cb.checked) settings.hiddenDays.delete(dow);
            else settings.hiddenDays.add(dow);
            if (state.raw.length > 0 && app.fullRender) app.fullRender();
        });
    });

    // Auto-focus threshold
    const afInput = document.getElementById('settingsAutoFocus');
    if (afInput) {
        afInput.value = settings.autoFocusThreshold;
        afInput.addEventListener('change', () => {
            settings.autoFocusThreshold = Math.max(0, parseInt(afInput.value) || 0);
            afInput.value = settings.autoFocusThreshold;
        });
    }

    // Auto-detect date column
    const autoDateCb = document.getElementById('settingsAutoDetectDate');
    if (autoDateCb) {
        autoDateCb.checked = settings.autoDetectDateColumn;
        autoDateCb.addEventListener('change', () => {
            settings.autoDetectDateColumn = autoDateCb.checked;
        });
    }
}

function initAppearanceTab() {
    // Palette picker
    const grid = document.getElementById('settingsPaletteGrid');
    if (grid) {
        palettes.forEach((p, i) => {
            const swatch = document.createElement('button');
            swatch.className = 'settings-swatch' + (i === (state.activePalette ?? 4) ? ' active' : '');
            swatch.innerHTML = `<div class="settings-swatch-color" style="background:${p.accent}"></div><span class="settings-swatch-label">${p.name}</span>`;
            swatch.addEventListener('click', () => {
                applyPalette(i);
                grid.querySelectorAll('.settings-swatch').forEach(s => s.classList.remove('active'));
                swatch.classList.add('active');
            });
            grid.appendChild(swatch);
        });
    }

    // Month padding + indicator color
    const monthPadCb = document.getElementById('settingsMonthPadding');
    const monthColorRow = document.getElementById('settingsMonthColorRow');
    if (monthPadCb) {
        monthPadCb.checked = settings.monthPadding;
        if (monthColorRow) monthColorRow.style.display = settings.monthPadding ? '' : 'none';
        monthPadCb.addEventListener('change', () => {
            settings.monthPadding = monthPadCb.checked;
            if (monthColorRow) monthColorRow.style.display = monthPadCb.checked ? '' : 'none';
            if (state.raw.length > 0 && app.fullRender) app.fullRender();
        });
    }

    const monthColorInput = document.getElementById('settingsMonthColor');
    if (monthColorInput) {
        monthColorInput.value = settings.monthIndicatorColor;
        applyMonthIndicatorColor(settings.monthIndicatorColor);
        monthColorInput.addEventListener('input', () => {
            settings.monthIndicatorColor = monthColorInput.value;
            applyMonthIndicatorColor(monthColorInput.value);
        });
    }
}

function initAdvancedTab() {
    // Developer mode toggle
    const devCb = document.getElementById('settingsDeveloperMode');
    if (devCb) {
        devCb.checked = settings.developerMode;
        devCb.addEventListener('change', () => {
            settings.developerMode = devCb.checked;
            if (app.applyDeveloperMode) app.applyDeveloperMode(settings.developerMode);
        });
    }
}

function initTabSwitching() {
    const tabs = document.querySelectorAll('.settings-tab');
    const panels = document.querySelectorAll('.settings-panel');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.settingsTab;
            tabs.forEach(t => t.classList.toggle('active', t === tab));
            panels.forEach(p => p.classList.toggle('active', p.dataset.settingsPanel === target));
            // Columns panel depends on loaded schema, so re-render each time it becomes active
            if (target === 'columns') renderColumnsPanel();
        });
    });
}

export function initSettingsModal() {
    const btn = document.getElementById('settingsBtn');
    const overlay = document.getElementById('settingsModalOverlay');
    const close = document.getElementById('settingsModalClose');
    if (!btn || !overlay) return;

    initTabSwitching();
    initGeneralTab();
    initAppearanceTab();
    initAdvancedTab();

    btn.addEventListener('click', () => {
        overlay.style.display = '';
        // Re-render the Columns panel every time the modal opens. Its content depends
        // on the currently loaded schema, which may have changed since last open. This
        // also handles the case where the user lands on the Columns tab (because it was
        // the last active tab) without clicking it, which was a reported bug in v0.5.0.
        renderColumnsPanel();
        logger.info('ui', 'Opened settings modal');
    });
    close.addEventListener('click', () => overlay.style.display = 'none');
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.style.display = 'none';
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.style.display !== 'none') {
            e.stopImmediatePropagation();
            overlay.style.display = 'none';
        }
    }, true);
}
