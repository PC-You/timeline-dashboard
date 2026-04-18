/*
 * settings-modal.js — Settings modal: theme picker, day-of-week toggles,
 * month boundary indicators, auto-focus threshold, auto-detect date column.
 */

import {state, settings, app} from './state.js';
import {applyPalette, palettes} from './themes.js';

export function applyMonthIndicatorColor(hex) {
    const root = document.documentElement;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    root.style.setProperty('--month-indicator', `rgba(${r},${g},${b},0.35)`);
    root.style.setProperty('--month-indicator-glow', `rgba(${r},${g},${b},0.12)`);
}

export function initSettingsModal() {
    const btn = document.getElementById('settingsBtn');
    const overlay = document.getElementById('settingsModalOverlay');
    const close = document.getElementById('settingsModalClose');
    const grid = document.getElementById('settingsPaletteGrid');
    if (!btn || !overlay || !grid) return;

    // Build palette swatches
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

    // Month padding toggle
    const monthPadCb = document.getElementById('settingsMonthPadding');
    const monthColorRow = document.getElementById('settingsMonthColorRow');
    monthPadCb.checked = settings.monthPadding;
    if (monthColorRow) monthColorRow.style.display = settings.monthPadding ? '' : 'none';
    monthPadCb.addEventListener('change', () => {
        settings.monthPadding = monthPadCb.checked;
        if (monthColorRow) monthColorRow.style.display = monthPadCb.checked ? '' : 'none';
        if (state.raw.length > 0 && app.fullRender) app.fullRender();
    });

    // Month indicator color
    const monthColorInput = document.getElementById('settingsMonthColor');
    monthColorInput.value = settings.monthIndicatorColor;
    applyMonthIndicatorColor(settings.monthIndicatorColor);
    monthColorInput.addEventListener('input', () => {
        settings.monthIndicatorColor = monthColorInput.value;
        applyMonthIndicatorColor(monthColorInput.value);
    });

    // Auto-focus threshold
    const afInput = document.getElementById('settingsAutoFocus');
    afInput.value = settings.autoFocusThreshold;
    afInput.addEventListener('change', () => {
        settings.autoFocusThreshold = Math.max(0, parseInt(afInput.value) || 0);
        afInput.value = settings.autoFocusThreshold;
    });

    // Auto-detect date column
    const autoDateCb = document.getElementById('settingsAutoDetectDate');
    autoDateCb.checked = settings.autoDetectDateColumn;
    autoDateCb.addEventListener('change', () => {
        settings.autoDetectDateColumn = autoDateCb.checked;
    });

    btn.addEventListener('click', () => overlay.style.display = '');
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
