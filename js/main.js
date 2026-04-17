/*
 * main.js — Entry point: boot, wiring, drag-drop, keyboard shortcuts
 */

import {
    state,
    app,
    keysHeld,
    HORIZ_SCROLL_FACTOR,
    clearAllSelections,
    hasAnySelections,
    undoSelection,
    redoSelection,
    dateKey,
    settings
} from './state.js';
import {parseCSV} from './csv.js';
import {detectSchema, parseTimestamp} from './schema.js';
import {ingest, buildGeometry, applyFilters, switchMetric} from './data.js';
import {renderFilterBar, initFilterListeners} from './filters.js';
import {renderHeatmap, updateHeatmapLevels, updateDataSourceIndicator, selectDate} from './heatmap.js';
import {refreshNoteIndicators, initNoteListeners} from './notes.js';
import {refreshAllHighlights, selectAll, promoteSelectionToMulti, demoteSelectionFromMulti} from './highlights.js';
import {renderContent} from './content.js';
import {renderSidebar, syncHeatmap} from './sidebar.js';
import {applyPalette, palettes} from './themes.js';

// Register cross-module functions
app.renderContent = renderContent;
app.fullRender = fullRender;
app.updateHeatmapLevels = updateHeatmapLevels;
app.refreshNoteIndicators = refreshNoteIndicators;
app.refreshAllHighlights = refreshAllHighlights;

function fullRender() {
    buildGeometry();
    renderSidebar();
    renderFilterBar();
    renderHeatmap();
    renderContent();
    renderMetricTabs();
    const sidebar = document.getElementById('sidebar');
    setTimeout(() => {
        const slot = document.querySelector(`.year-slot[data-year="${state.activeYear}"]`);
        if (slot) sidebar.scrollTo({
            top: slot.offsetTop - sidebar.clientHeight / 2 + slot.clientHeight / 2,
            behavior: 'auto'
        });
        syncHeatmap();
    }, 60);
}

function loadCSVData(text, fileName) {
    const result = parseCSV(text);
    if (!result) {
        showLoadError('Could not parse file. Check that the delimiter is comma, tab, pipe, or semicolon, and that a "sep=" header is present for non-standard delimiters.');
        return;
    }
    const schema = detectSchema(result.headers, result.records);

    // Validate timestamp column has parseable dates
    const tsKey = schema.timestampKey;
    const fmt = schema.timestampFormat;
    const tsSamples = result.records.slice(0, 20).map(r => r[tsKey]).filter(Boolean);
    if (tsSamples.length > 0) {
        const validCount = tsSamples.filter(v => {
            if (fmt === 'iso') {
                const d = new Date(v);
                return !isNaN(d) && d.getFullYear() > 1900;
            }
            return parseTimestamp(v, fmt) !== null;
        }).length;
        if (validCount < tsSamples.length * 0.5) {
            showLoadError(`Timestamp column "${tsKey}" does not contain recognizable dates. Detected format: ${fmt}. Sample values: ${tsSamples.slice(0, 3).join(', ')}`);
            return;
        }
    }

    ingest(result.records, schema);
    state.dataSource = {name: fileName, type: 'csv', recordCount: result.records.length};
    fullRender();
}

function showLoadError(message) {
    const area = document.getElementById('contentArea');
    if (!area) return;
    area.innerHTML = `
    <div class="empty-state">
      <svg viewBox="0 0 24 24"><path d="M12 9v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      <h2>Failed to load data</h2>
      <p style="max-width:480px">${message}</p>
    </div>`;
}

function boot() {
    initFilterListeners();
    initNoteListeners();
    initCSVLoader();
    initStateIO();
    initDragDrop();
    initSidebarEvents();
    initHeatmapScroll();
    initKeyboardShortcuts();
    initHelpModal();
    initSettingsModal();
    // Sample data reset button
    document.getElementById('sampleResetBtn')?.addEventListener('click', () => {
        state.raw = [];
        state.filtered = [];
        state.schema = null;
        state.dataSource = null;
        state.dayValues = {};
        state.dayEntries = {};
        state.notes = {};
        state.metricPresets = [];
        state.activeMetricIndex = 0;
        state.selectedDate = null;
        state.sortColumn = null;
        state.sortDirection = 'asc';
        clearAllSelections();
        state.focusedDays.clear();
        fullRender();
    });
    fullRender();
}

// ===== CSV file loader =====
function initCSVLoader() {
    document.getElementById('csvInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => loadCSVData(ev.target.result, file.name);
        reader.readAsText(file);
    });
}

// ===== State export/import =====
function initStateIO() {
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

function closeToolbarMenu() {
    document.getElementById('toolbarDropdown')?.classList.remove('open');
}

function exportState() {
    const payload = {
        version: '0.4.4',
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

function importState(payload) {
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
            applyMonthIndicatorColor(settings.monthIndicatorColor);
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
    fullRender();
}

// ===== Drag and drop =====
function initDragDrop() {
    let lastOverTime = 0;
    let checkTimer = null;

    const showOverlay = () => {
        let overlay = document.getElementById('dropOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'dropOverlay';
            overlay.className = 'drop-overlay';
            overlay.innerHTML = `
        <div class="drop-overlay-content">
          <svg viewBox="0 0 24 24" width="48" height="48"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" fill="none" stroke="currentColor" stroke-width="1.5"/><polyline points="17 8 12 3 7 8" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="12" y1="3" x2="12" y2="15" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
          <span>Drop CSV or TSV file to load</span>
        </div>`;
            document.body.appendChild(overlay);
        }
        overlay.classList.add('visible');
    };
    const hideOverlay = () => {
        const overlay = document.getElementById('dropOverlay');
        if (overlay) overlay.classList.remove('visible');
        if (checkTimer) {
            clearInterval(checkTimer);
            checkTimer = null;
        }
    };

    const hasFiles = (e) => {
        if (!e.dataTransfer) return false;
        const types = e.dataTransfer.types;
        if (!types) return false;
        for (let i = 0; i < types.length; i++) {
            if (types[i] === 'Files') return true;
        }
        return false;
    };

    window.addEventListener('dragenter', (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        lastOverTime = Date.now();
        showOverlay();
        if (!checkTimer) {
            // Heartbeat: if dragover stops firing for >150ms, drag has left window
            checkTimer = setInterval(() => {
                if (Date.now() - lastOverTime > 150) hideOverlay();
            }, 100);
        }
    });
    window.addEventListener('dragover', (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        lastOverTime = Date.now();
    });
    window.addEventListener('drop', (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        hideOverlay();
        const file = e.dataTransfer.files[0];
        if (!file) return;
        if (!file.name.match(/\.(csv|tsv|txt)$/i)) {
            console.warn('Dropped file is not a CSV/TSV:', file.name);
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => loadCSVData(ev.target.result, file.name);
        reader.readAsText(file);
    });
    // Also hide on Escape key during drag (some browsers fire this)
    window.addEventListener('dragend', hideOverlay);
}

// ===== Keyboard shortcuts =====
function initKeyboardShortcuts() {
    let promotedDate = null;

    document.addEventListener('keydown', (e) => {
        keysHeld.add(e.key.toLowerCase());
        const tag = document.activeElement?.tagName;
        const inInput = tag === 'INPUT' || tag === 'TEXTAREA';

        // Esc: clear all selections
        if (e.key === 'Escape' && !inInput) {
            if (hasAnySelections() || state.selectedDate) {
                clearAllSelections();
                state.selectedDate = null;
                document.querySelectorAll('.heatmap-cell.selected').forEach(c => c.classList.remove('selected'));
                refreshAllHighlights();
                app.renderContent();
            }
        }

        // Ctrl+A: select all
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && !inInput) {
            e.preventDefault();
            if (state.raw.length > 0) selectAll();
        }

        // Ctrl+Z: undo selection
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey && !inInput) {
            e.preventDefault();
            if (undoSelection()) {
                refreshAllHighlights();
                app.renderContent();
            }
        }

        // Ctrl+Y / Ctrl+Shift+Z: redo selection
        if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) && !inInput) {
            e.preventDefault();
            if (redoSelection()) {
                refreshAllHighlights();
                app.renderContent();
            }
        }

        // Arrow keys: navigate single-select
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && !inInput && state.selectedDate && !hasAnySelections()) {
            e.preventDefault();
            const current = new Date(state.selectedDate + 'T00:00:00');
            let offset = 0;
            if (e.key === 'ArrowUp') offset = -1;
            else if (e.key === 'ArrowDown') offset = 1;
            else if (e.key === 'ArrowLeft') offset = -7;
            else if (e.key === 'ArrowRight') offset = 7;
            current.setDate(current.getDate() + offset);
            const newDk = dateKey(current);
            const targetCell = document.querySelector(`.heatmap-cell[data-date="${newDk}"]`);
            if (targetCell) {
                selectDate(newDk);
                // Scroll heatmap to keep cell visible
                const inner = document.getElementById('heatmapInner');
                const sidebar = document.getElementById('sidebar');
                if (inner && sidebar) {
                    const cellRect = targetCell.getBoundingClientRect();
                    const innerRect = inner.getBoundingClientRect();
                    const margin = 40; // px buffer from edge
                    if (cellRect.right > innerRect.right - margin) {
                        sidebar.scrollBy({top: 20, behavior: 'smooth'});
                    } else if (cellRect.left < innerRect.left + margin) {
                        sidebar.scrollBy({top: -20, behavior: 'smooth'});
                    }
                }
            }
        }

        // Ctrl pressed while a single day is selected and NO multi-select active: promote
        if ((e.key === 'Control' || e.key === 'Meta') && state.selectedDate && !hasAnySelections()) {
            promotedDate = state.selectedDate;
            promoteSelectionToMulti();
        }
    });

    document.addEventListener('keyup', (e) => {
        keysHeld.delete(e.key.toLowerCase());
        if ((e.key === 'Control' || e.key === 'Meta') && promotedDate) {
            demoteSelectionFromMulti(promotedDate);
            promotedDate = null;
        }
    });

    window.addEventListener('blur', () => {
        keysHeld.clear();
        if (promotedDate) {
            demoteSelectionFromMulti(promotedDate);
            promotedDate = null;
        }
    });
}

// ===== Help modal =====
function initHelpModal() {
    const btn = document.getElementById('helpModalBtn');
    const overlay = document.getElementById('helpModalOverlay');
    const close = document.getElementById('helpModalClose');
    if (!btn || !overlay) return;

    const tabs = overlay.querySelectorAll('.help-tab');
    const panels = {
        guide: document.getElementById('helpPanelGuide'),
        roadmap: document.getElementById('helpPanelRoadmap'),
        changelog: document.getElementById('helpPanelChangelog'),
    };

    function showTab(tabName) {
        tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
        for (const [name, panel] of Object.entries(panels)) {
            panel.style.display = name === tabName ? '' : 'none';
        }
        overlay.querySelector('.help-modal-body').scrollTop = 0;
    }

    tabs.forEach(tab => tab.addEventListener('click', () => showTab(tab.dataset.tab)));
    btn.addEventListener('click', () => {
        showTab('guide');
        overlay.style.display = '';
    });
    close.addEventListener('click', () => overlay.style.display = 'none');
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.style.display = 'none';
    });

    // Report a Bug: download state + open mailto
    const reportBtn = document.getElementById('reportBugBtn');
    if (reportBtn) {
        reportBtn.addEventListener('click', () => {
            // Build diagnostic state
            const bugState = {
                version: '0.4.4',
                userAgent: navigator.userAgent,
                recordCount: state.raw.length,
                schemaTimestampKey: state.schema?.timestampKey || null,
                activeFilters: {},
                notes: state.notes,
                filters: {},
                filterModes: state.filterModes,
                filterHighlightColors: state.filterHighlightColors,
                activePalette: state.activePalette,
            };
            if (state.schema) {
                state.schema.filterColumns.forEach(col => {
                    if (state.filters[col]?.size > 0) bugState.filters[col] = Array.from(state.filters[col]);
                });
            }
            // Download state file
            const blob = new Blob([JSON.stringify(bugState, null, 2)], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'timeline-dashboard-bug-report.json';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            // Open mailto
            setTimeout(() => {
                window.location.href = 'mailto:jordan.roberts4251@gmail.com?subject=Timeline%20Dashboard%20Bug%20Report&body=Please%20describe%20the%20issue%20and%20attach%20the%20downloaded%20state%20file.';
            }, 500);
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.style.display !== 'none') {
            e.stopImmediatePropagation();
            overlay.style.display = 'none';
        }
    }, true);
}

// ===== Settings modal =====
function initSettingsModal() {
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
            if (state.raw.length > 0) fullRender();
        });
    });

    // Month padding toggle
    const monthPadCb = document.getElementById('settingsMonthPadding');
    monthPadCb.checked = settings.monthPadding;
    monthPadCb.addEventListener('change', () => {
        settings.monthPadding = monthPadCb.checked;
        if (state.raw.length > 0) fullRender();
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

function applyMonthIndicatorColor(hex) {
    const root = document.documentElement;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    root.style.setProperty('--month-indicator', `rgba(${r},${g},${b},0.35)`);
    root.style.setProperty('--month-indicator-glow', `rgba(${r},${g},${b},0.12)`);
}

// ===== Metric tabs =====
function renderMetricTabs() {
    const bar = document.getElementById('metricTabBar');
    if (!bar) return;
    bar.innerHTML = '';
    if (state.raw.length === 0 || state.metricPresets.length === 0) {
        bar.classList.remove('visible');
        return;
    }
    bar.classList.add('visible');

    state.metricPresets.forEach((preset, idx) => {
        const tab = document.createElement('button');
        tab.className = 'metric-tab' + (idx === state.activeMetricIndex ? ' active' : '');

        // Check if this preset targets a signed column
        const isSigned = preset.column && (state.schema?.numericColumns || []).some(c => c.key === preset.column && c.hasNegative);
        const isVolume = preset.type === 'volume';

        tab.textContent = preset.label;

        tab.addEventListener('click', () => {
            if (idx === state.activeMetricIndex) {
                openMetricPopover(bar, tab, idx);
            } else {
                switchMetric(idx);
                updateHeatmapLevels();
                renderMetricTabs();
            }
        });

        // Add net/volume toggle for signed sum/volume presets on active tab
        if (isSigned && (preset.type === 'sum' || preset.type === 'volume') && idx === state.activeMetricIndex) {
            const toggle = document.createElement('span');
            toggle.className = 'metric-mode-toggle';
            toggle.title = isVolume ? 'Switch to Net (signed)' : 'Switch to Volume (absolute)';
            toggle.textContent = isVolume ? '\u25A3' : '\u25C8';
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const colHeader = state.schema.columns.find(c => c.key === preset.column)?.header || preset.column;
                if (isVolume) {
                    preset.type = 'sum';
                    preset.label = `${colHeader} (Net)`;
                } else {
                    preset.type = 'volume';
                    preset.label = `${colHeader} (Volume)`;
                }
                switchMetric(state.activeMetricIndex);
                updateHeatmapLevels();
                renderMetricTabs();
            });
            tab.appendChild(toggle);
        }

        bar.appendChild(tab);
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'metric-tab-add';
    addBtn.textContent = '+';
    addBtn.title = 'Add metric tab';
    addBtn.addEventListener('click', () => openMetricPopover(bar, addBtn, -1));
    bar.appendChild(addBtn);

    // Update legend: diverging if data has negatives
    const legend = document.getElementById('heatmapLegend');
    if (legend) {
        const hasNeg = Object.values(state.dayValues).some(v => v < 0);
        if (hasNeg) {
            legend.innerHTML = `<span>\u2212</span>
        <div class="legend-cell" style="background:var(--nhm4)"></div>
        <div class="legend-cell" style="background:var(--nhm3)"></div>
        <div class="legend-cell" style="background:var(--nhm2)"></div>
        <div class="legend-cell" style="background:var(--nhm1)"></div>
        <div class="legend-cell" style="background:var(--hm0)"></div>
        <div class="legend-cell" style="background:var(--hm1)"></div>
        <div class="legend-cell" style="background:var(--hm2)"></div>
        <div class="legend-cell" style="background:var(--hm3)"></div>
        <div class="legend-cell" style="background:var(--hm4)"></div>
        <span>+</span>`;
        } else {
            legend.innerHTML = `<span>Less</span>
        <div class="legend-cell" style="background:var(--hm0)"></div>
        <div class="legend-cell" style="background:var(--hm1)"></div>
        <div class="legend-cell" style="background:var(--hm2)"></div>
        <div class="legend-cell" style="background:var(--hm3)"></div>
        <div class="legend-cell" style="background:var(--hm4)"></div>
        <span>More</span>`;
        }
    }
}

function openMetricPopover(bar, anchor, editIdx) {
    document.querySelectorAll('.metric-popover.open').forEach(p => p.remove());

    const isNew = editIdx === -1;
    const preset = isNew ? {label: '', type: 'count', column: null} : state.metricPresets[editIdx];
    const numCols = state.schema?.numericColumns || [];
    const allCols = (state.schema?.filterColumns || []).map(k => {
        const col = state.schema.columns.find(c => c.key === k);
        return {key: k, header: col?.header || k, numeric: numCols.some(n => n.key === k)};
    });

    const NUMERIC_TYPES = ['sum', 'volume', 'avg', 'min', 'max'];

    const popover = document.createElement('div');
    popover.className = 'metric-popover open';

    popover.innerHTML = `
    <label>Label</label>
    <input type="text" class="mp-label" value="${preset.label}" placeholder="Tab name">
    <label>Aggregation</label>
    <select class="mp-type">
      <option value="count"${preset.type === 'count' ? ' selected' : ''}>Count (records per day)</option>
      <option value="count_distinct"${preset.type === 'count_distinct' ? ' selected' : ''}>Count distinct</option>
      <option value="sum"${preset.type === 'sum' ? ' selected' : ''}>Sum (net)</option>
      <option value="volume"${preset.type === 'volume' ? ' selected' : ''}>Volume (absolute sum)</option>
      <option value="avg"${preset.type === 'avg' ? ' selected' : ''}>Average</option>
      <option value="min"${preset.type === 'min' ? ' selected' : ''}>Min</option>
      <option value="max"${preset.type === 'max' ? ' selected' : ''}>Max</option>
    </select>
    <div class="mp-column-wrap">
      <label>Column</label>
      <select class="mp-column"></select>
    </div>
    <div class="metric-popover-actions">
      ${!isNew && state.metricPresets.length > 1 ? '<button class="metric-popover-delete">Delete</button>' : ''}
      <button class="metric-popover-save">${isNew ? 'Add' : 'Save'}</button>
    </div>
  `;

    const typeSelect = popover.querySelector('.mp-type');
    const colSelect = popover.querySelector('.mp-column');
    const colWrap = popover.querySelector('.mp-column-wrap');

    function rebuildColumnOptions() {
        const type = typeSelect.value;
        colSelect.innerHTML = '';
        if (type === 'count') {
            colWrap.style.display = 'none';
            return;
        }
        colWrap.style.display = '';
        const isNumeric = NUMERIC_TYPES.includes(type);
        const available = isNumeric ? allCols.filter(c => c.numeric) : allCols;
        if (available.length === 0) {
            colSelect.innerHTML = '<option value="">\u2014 no columns available \u2014</option>';
            return;
        }
        available.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.key;
            opt.textContent = c.header;
            if (c.key === preset.column) opt.selected = true;
            colSelect.appendChild(opt);
        });
        if (!preset.column && available.length > 0) colSelect.selectedIndex = 0;
    }

    rebuildColumnOptions();
    typeSelect.addEventListener('change', () => {
        rebuildColumnOptions();
        repositionPopover();
    });

    function repositionPopover() {
        const r = anchor.getBoundingClientRect();
        popover.style.top = 'auto';
        popover.style.bottom = 'auto';
        popover.style.left = r.left + 'px';
        const popH = popover.getBoundingClientRect().height;
        if (r.bottom + 4 + popH > window.innerHeight) {
            popover.style.bottom = (window.innerHeight - r.top + 4) + 'px';
        } else {
            popover.style.top = (r.bottom + 4) + 'px';
        }
    }

    popover.style.position = 'fixed';
    document.body.appendChild(popover);
    repositionPopover();

    popover.querySelector('.metric-popover-save').addEventListener('click', () => {
        const label = popover.querySelector('.mp-label').value.trim();
        const type = typeSelect.value;
        const column = type === 'count' ? null : (colSelect.value || null);
        if (type !== 'count' && !column) {
            colSelect.focus();
            return;
        }
        const colHeader = column ? (state.schema.columns.find(c => c.key === column)?.header || column) : null;
        const typeLabels = {
            count_distinct: 'Distinct',
            volume: 'Volume',
            sum: 'Net',
            avg: 'Avg',
            min: 'Min',
            max: 'Max'
        };
        const typeLabel = typeLabels[type] || type.charAt(0).toUpperCase() + type.slice(1);
        const autoLabel = type === 'count' ? 'Activity' : `${colHeader} (${typeLabel})`;
        const finalLabel = label || autoLabel;

        if (isNew) {
            state.metricPresets.push({label: finalLabel, type, column});
            state.activeMetricIndex = state.metricPresets.length - 1;
        } else {
            state.metricPresets[editIdx] = {label: finalLabel, type, column};
        }
        switchMetric(state.activeMetricIndex);
        updateHeatmapLevels();
        renderMetricTabs();
        popover.remove();
    });

    const delBtn = popover.querySelector('.metric-popover-delete');
    if (delBtn) {
        delBtn.addEventListener('click', () => {
            state.metricPresets.splice(editIdx, 1);
            if (state.activeMetricIndex >= state.metricPresets.length) state.activeMetricIndex = state.metricPresets.length - 1;
            switchMetric(state.activeMetricIndex);
            updateHeatmapLevels();
            renderMetricTabs();
            popover.remove();
        });
    }

    popover.addEventListener('click', (e) => e.stopPropagation());
    popover.addEventListener('mousedown', (e) => e.stopPropagation());
    const closeHandler = (e) => {
        if (!popover.contains(e.target) && e.target !== anchor) {
            popover.remove();
            document.removeEventListener('mousedown', closeHandler);
        }
    };
    setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);
}

// ===== Sidebar scroll & toggle =====
function initSidebarEvents() {
    const sidebar = document.getElementById('sidebar');
    let ticking = false;
    sidebar.addEventListener('scroll', () => {
        if (!ticking) {
            requestAnimationFrame(() => {
                syncHeatmap();
                ticking = false;
            });
            ticking = true;
        }
    });

    // Smooth wheel scrolling
    let targetScroll = sidebar.scrollTop;
    let animating = false;
    const animateScroll = () => {
        const current = sidebar.scrollTop;
        const diff = targetScroll - current;
        if (Math.abs(diff) < 0.5) {
            sidebar.scrollTop = targetScroll;
            animating = false;
            return;
        }
        sidebar.scrollTop = current + diff * 0.2; // easing factor
        requestAnimationFrame(animateScroll);
    };

    sidebar.addEventListener('wheel', (e) => {
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
            e.preventDefault();
            return;
        }
        // Smooth vertical wheel
        e.preventDefault();
        // Sync target with current if we weren't mid-animation
        if (!animating) targetScroll = sidebar.scrollTop;
        targetScroll = Math.max(0, Math.min(sidebar.scrollHeight - sidebar.clientHeight, targetScroll + e.deltaY));
        if (!animating) {
            animating = true;
            requestAnimationFrame(animateScroll);
        }
    }, {passive: false});

    const sidebarWrapper = document.getElementById('sidebarWrapper');
    const sidebarToggleBtn = document.getElementById('sidebarToggle');
    sidebarToggleBtn.addEventListener('click', () => {
        sidebarWrapper.classList.toggle('collapsed');
        sidebarToggleBtn.classList.toggle('collapsed-btn');
        setTimeout(syncHeatmap, 360);
    });
}

// ===== Heatmap wheel scroll =====
function initHeatmapScroll() {
    const sidebar = document.getElementById('sidebar');
    let targetScroll = sidebar.scrollTop;
    let animating = false;
    const animateScroll = () => {
        const current = sidebar.scrollTop;
        const diff = targetScroll - current;
        if (Math.abs(diff) < 0.5) {
            sidebar.scrollTop = targetScroll;
            animating = false;
            return;
        }
        sidebar.scrollTop = current + diff * 0.2;
        requestAnimationFrame(animateScroll);
    };
    document.querySelector('.heatmap-container').addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX * HORIZ_SCROLL_FACTOR : e.deltaY;
        if (!animating) targetScroll = sidebar.scrollTop;
        targetScroll = Math.max(0, Math.min(sidebar.scrollHeight - sidebar.clientHeight, targetScroll + delta));
        if (!animating) {
            animating = true;
            requestAnimationFrame(animateScroll);
        }
    }, {passive: false});
}

window.addEventListener('resize', syncHeatmap);
boot();
