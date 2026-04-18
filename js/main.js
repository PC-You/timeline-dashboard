/*
 * main.js — Entry point: boot, CSV loading, drag-drop, metric tabs,
 * heatmap/sidebar scroll. Keyboard, state I/O, and modals live in their own modules.
 */

import {HORIZ_SCROLL_FACTOR} from './constants.js';
import {state, app, clearAllSelections, settings} from './state.js';
import {parseCSV} from './csv.js';
import {detectSchema, parseTimestamp} from './schema.js';
import {ingest, buildGeometry, applyFilters, switchMetric} from './data.js';
import {renderFilterBar, initFilterListeners} from './filters.js';
import {renderHeatmap, updateHeatmapLevels, updateDataSourceIndicator} from './heatmap.js';
import {refreshNoteIndicators, initNoteListeners} from './notes.js';
import {refreshAllHighlights} from './highlights.js';
import {renderContent} from './content.js';
import {renderSidebar, syncHeatmap} from './sidebar.js';
import {applyPalette} from './themes.js';
import {initStateIO} from './state-io.js';
import {initKeyboardShortcuts} from './keyboard.js';
import {initHelpModal} from './help-modal.js';
import {initSettingsModal, applyMonthIndicatorColor} from './settings-modal.js';
import {maybeShowDatePicker} from './date-picker-modal.js';

// Register cross-module functions
app.renderContent = renderContent;
app.fullRender = fullRender;
app.updateHeatmapLevels = updateHeatmapLevels;
app.refreshNoteIndicators = refreshNoteIndicators;
app.refreshAllHighlights = refreshAllHighlights;
app.applyMonthIndicatorColor = applyMonthIndicatorColor;

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

async function loadCSVData(text, fileName) {
    const result = parseCSV(text);
    if (!result) {
        showLoadError('Could not parse file. Check that the delimiter is comma, tab, pipe, or semicolon, and that a "sep=" header is present for non-standard delimiters.');
        return;
    }

    // Ask the user to pick the date column (or auto-detect if settings allow)
    const picked = await maybeShowDatePicker(result.records, result.headers);
    if (!picked) return; // user cancelled

    const schema = detectSchema(result.headers, result.records, picked);

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
    // Sample data reset button — clears data and all session settings except theme
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
        // Reset session-only settings (palette stays — it's a global preference)
        settings.hiddenDays.clear();
        settings.monthPadding = false;
        settings.monthIndicatorColor = '#ffffff';
        settings.autoFocusThreshold = 7;
        settings.autoDetectDateColumn = true;
        // Sync settings UI controls
        document.querySelectorAll('#settingsDowGrid input[type="checkbox"]').forEach(cb => cb.checked = true);
        const mpCb = document.getElementById('settingsMonthPadding');
        if (mpCb) mpCb.checked = false;
        const mcIn = document.getElementById('settingsMonthColor');
        if (mcIn) mcIn.value = '#ffffff';
        const mcRow = document.getElementById('settingsMonthColorRow');
        if (mcRow) mcRow.style.display = 'none';
        const afIn = document.getElementById('settingsAutoFocus');
        if (afIn) afIn.value = 7;
        const adCb = document.getElementById('settingsAutoDetectDate');
        if (adCb) adCb.checked = true;
        if (app.applyMonthIndicatorColor) app.applyMonthIndicatorColor('#ffffff');
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
