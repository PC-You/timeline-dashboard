/*
 * filters.js — Schema-driven faceted filters with slide toggle and color picker
 */

import {HIGHLIGHT_PRESETS} from './constants.js';
import {escapeHtml} from './utils.js';
import {state, app, hasAnyExcludeFilters, hasAnyHighlightFilters} from './state.js';
import {applyFilters} from './data.js';

const FACET_PAGE_SIZE = 100;
const FUNNEL_SVG = '<svg viewBox="0 0 10 10"><path d="M0.5 1h9L6.5 5v3L3.5 7V5z"/></svg>';
const HIGHLIGHTER_SVG = '<svg viewBox="0 0 10 10"><path d="M7.5 0.5L3.5 4.5l2 2 4-4zM2.5 7.5l1.5-0.5-1 1z"/></svg>';

function createFacetSelect(col, label, options, selectedSet, onChange, highlightColor, animate) {
    const wrapper = document.createElement('div');
    wrapper.className = 'facet-select';
    if (col) wrapper.dataset.col = col;
    const trigger = document.createElement('div');
    trigger.className = 'facet-trigger';
    trigger.tabIndex = 0;
    const updateLabel = () => {
        if (selectedSet.size === 0) {
            trigger.innerHTML = `All ${label.toLowerCase()}s`;
            trigger.style.borderColor = '';
        } else {
            const countStyle = highlightColor ? ` style="background:${highlightColor}"` : '';
            trigger.innerHTML = `${label} <span class="facet-count"${countStyle}>${selectedSet.size}</span>`;
            trigger.style.borderColor = highlightColor || '';
        }
    };
    updateLabel();
    const dropdown = document.createElement('div');
    dropdown.className = 'facet-dropdown';
    const searchInput = document.createElement('input');
    searchInput.className = 'facet-search';
    searchInput.placeholder = `Search ${label.toLowerCase()}s...`;
    dropdown.appendChild(searchInput);
    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'facet-options';
    dropdown.appendChild(optionsContainer);

    // Footer: Select all | Clear | mode toggle (if selections exist)
    const actions = document.createElement('div');
    actions.className = 'facet-actions';
    const selectAllBtn = document.createElement('button');
    selectAllBtn.className = 'facet-action-btn';
    selectAllBtn.textContent = 'Select all';
    const clearAllBtn = document.createElement('button');
    clearAllBtn.className = 'facet-action-btn';
    clearAllBtn.textContent = 'Clear';
    actions.appendChild(selectAllBtn);
    actions.appendChild(clearAllBtn);

    // Mode toggle — only show if there are selections
    if (col && selectedSet.size > 0) {
        const spacer = document.createElement('div');
        spacer.style.flex = '1';
        actions.appendChild(spacer);
        actions.appendChild(createModeToggle(col, animate));
    }
    dropdown.appendChild(actions);

    let visibleCount = FACET_PAGE_SIZE;
    let currentFilter = '';

    const renderOpts = (filter) => {
        if (filter !== undefined) currentFilter = filter;
        const lf = currentFilter.toLowerCase();
        const filtered = lf ? options.filter(o => o.toLowerCase().includes(lf)) : options;
        const showing = filtered.slice(0, visibleCount);
        const hasMore = filtered.length > visibleCount;
        optionsContainer.innerHTML = '';
        showing.forEach(opt => {
            const el = document.createElement('div');
            el.className = 'facet-option' + (selectedSet.has(opt) ? ' selected' : '');
            el.innerHTML = `<div class="facet-checkbox"><svg viewBox="0 0 12 12"><polyline points="2 6 5 9 10 3"/></svg></div><span>${escapeHtml(opt)}</span>`;
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                if (selectedSet.has(opt)) selectedSet.delete(opt); else selectedSet.add(opt);
                el.classList.toggle('selected');
                updateLabel();
                onChange();
                // Re-render footer to show/hide toggle
                rebuildFooter();
            });
            optionsContainer.appendChild(el);
        });
        // Load more button
        if (hasMore) {
            const more = document.createElement('div');
            more.className = 'facet-load-more';
            more.textContent = `Show more (${filtered.length - visibleCount} remaining)`;
            more.addEventListener('click', (e) => {
                e.stopPropagation();
                visibleCount += FACET_PAGE_SIZE;
                renderOpts();
            });
            optionsContainer.appendChild(more);
        }
    };

    const rebuildFooter = () => {
        // Remove old toggle if present
        const oldSpacer = actions.querySelector('div[style*="flex"]');
        const oldToggle = actions.querySelector('.mode-toggle');
        if (oldSpacer) oldSpacer.remove();
        if (oldToggle) oldToggle.remove();
        // Add toggle if selections exist
        if (col && selectedSet.size > 0) {
            const spacer = document.createElement('div');
            spacer.style.flex = '1';
            actions.appendChild(spacer);
            actions.appendChild(createModeToggle(col, false));
        }
    };

    searchInput.addEventListener('input', () => {
        visibleCount = FACET_PAGE_SIZE;
        renderOpts(searchInput.value);
    });
    searchInput.addEventListener('click', (e) => e.stopPropagation());
    selectAllBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        options.forEach(o => selectedSet.add(o));
        renderOpts();
        updateLabel();
        onChange();
        rebuildFooter();
    });
    clearAllBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedSet.clear();
        renderOpts();
        updateLabel();
        onChange();
        rebuildFooter();
    });

    let isOpen = false;
    const open = () => {
        closeAllDropdowns();
        dropdown.classList.add('open');
        trigger.classList.add('open');
        isOpen = true;
        visibleCount = FACET_PAGE_SIZE;
        currentFilter = '';
        searchInput.value = '';
        renderOpts('');
        setTimeout(() => searchInput.focus(), 0);
    };
    const close = () => {
        dropdown.classList.remove('open');
        trigger.classList.remove('open');
        isOpen = false;
    };
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        isOpen ? close() : open();
    });
    wrapper.appendChild(trigger);
    wrapper.appendChild(dropdown);
    renderOpts(''); // pre-populate for reopenCol
    return wrapper;
}

function createModeToggle(col, animate) {
    const isHighlight = state.filterModes[col] === 'highlight';
    const hlColor = state.filterHighlightColors[col] || HIGHLIGHT_PRESETS[0].color;
    const toggle = document.createElement('div');
    toggle.className = 'mode-toggle';
    toggle.title = isHighlight ? 'Highlight mode (click for Filter)' : 'Filter mode (click for Highlight)';

    // Both icons visible in track
    const iconLeft = document.createElement('span');
    iconLeft.className = 'mode-toggle-icon left';
    iconLeft.innerHTML = FUNNEL_SVG;
    const iconRight = document.createElement('span');
    iconRight.className = 'mode-toggle-icon right';
    iconRight.innerHTML = HIGHLIGHTER_SVG;
    const knob = document.createElement('div');
    knob.className = 'mode-toggle-knob';
    knob.innerHTML = isHighlight ? HIGHLIGHTER_SVG : FUNNEL_SVG;

    toggle.appendChild(iconLeft);
    toggle.appendChild(iconRight);
    toggle.appendChild(knob);

    if (animate) {
        if (isHighlight) {
            requestAnimationFrame(() => requestAnimationFrame(() => {
                toggle.classList.add('highlight');
                toggle.style.background = hlColor;
            }));
        } else {
            toggle.classList.add('highlight');
            toggle.style.background = hlColor;
            requestAnimationFrame(() => requestAnimationFrame(() => {
                toggle.classList.remove('highlight');
                toggle.style.background = '';
            }));
        }
    } else {
        if (isHighlight) {
            toggle.classList.add('highlight');
            toggle.style.background = hlColor;
        }
    }

    toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isHighlight) {
            state.filterModes[col] = 'exclude';
        } else {
            state.filterModes[col] = 'highlight';
            if (!state.filterHighlightColors[col]) {
                state.filterHighlightColors[col] = HIGHLIGHT_PRESETS[0].color;
            }
        }
        onFilterChange();
        renderFilterBar(col);
    });

    return toggle;
}

function createColorSwatches(col) {
    const currentColor = state.filterHighlightColors[col] || HIGHLIGHT_PRESETS[0].color;
    const swatches = document.createElement('div');
    swatches.className = 'hl-color-swatches';
    HIGHLIGHT_PRESETS.forEach(preset => {
        const swatch = document.createElement('button');
        swatch.className = 'hl-color-swatch' + (currentColor === preset.color ? ' active' : '');
        swatch.style.background = preset.color;
        swatch.title = preset.name;
        swatch.addEventListener('click', (e) => {
            e.stopPropagation();
            state.filterHighlightColors[col] = preset.color;
            onFilterChange();
            renderFilterBar();
        });
        swatches.appendChild(swatch);
    });
    return swatches;
}

function closeAllDropdowns() {
    document.querySelectorAll('.facet-dropdown.open').forEach(d => {
        d.classList.remove('open');
        d.parentElement.querySelector('.facet-trigger')?.classList.remove('open');
    });
    document.querySelectorAll('.clear-dropdown.open').forEach(d => d.classList.remove('open'));
    document.querySelectorAll('.column-picker-dropdown.open').forEach(d => d.classList.remove('open'));
}

function onFilterChange() {
    const prevYears = state.years.join(',');
    applyFilters();
    if (state.years.join(',') !== prevYears) {
        app.fullRender();
    } else {
        app.updateHeatmapLevels();
        app.refreshNoteIndicators();
        app.refreshAllHighlights();
        app.renderContent();
        refreshClearButton();
    }
}

function refreshClearButton() {
    const bar = document.getElementById('filterBar');
    if (!bar || !state.schema) return;
    // Remove existing clear element
    const old = bar.querySelector('.filter-clear, .clear-dropdown-wrapper');
    if (old) old.remove();
    // Add updated one
    const clearEl = createClearButton();
    if (clearEl) bar.appendChild(clearEl);
    // Update record count
    const countEl = bar.querySelector('.filter-active-count');
    if (countEl) countEl.textContent = `${state.filtered.length.toLocaleString()} ${state.schema.heatmapMetric.labelPlural || 'records'}`;
}

function createColumnPicker(schema) {
    const wrapper = document.createElement('div');
    wrapper.className = 'facet-select';
    const hiddenCols = schema.filterColumns.filter(c => !schema.visibleFilterColumns.includes(c));
    if (hiddenCols.length === 0) return null;

    const trigger = document.createElement('div');
    trigger.className = 'facet-trigger column-picker-trigger';
    trigger.textContent = `+ ${hiddenCols.length} more`;
    trigger.tabIndex = 0;

    const dropdown = document.createElement('div');
    dropdown.className = 'facet-dropdown column-picker-dropdown';
    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'facet-options';
    dropdown.appendChild(optionsContainer);

    const render = () => {
        optionsContainer.innerHTML = '';
        schema.filterColumns.forEach(col => {
            const colDef = schema.columns.find(c => c.key === col);
            const label = colDef ? colDef.header : col;
            const isVisible = schema.visibleFilterColumns.includes(col);
            const el = document.createElement('div');
            el.className = 'facet-option' + (isVisible ? ' selected' : '');
            el.innerHTML = `<div class="facet-checkbox"><svg viewBox="0 0 12 12"><polyline points="2 6 5 9 10 3"/></svg></div><span>${escapeHtml(label)}</span>`;
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                if (isVisible) schema.visibleFilterColumns = schema.visibleFilterColumns.filter(c => c !== col);
                else schema.visibleFilterColumns.push(col);
                renderFilterBar();
            });
            optionsContainer.appendChild(el);
        });
    };

    let isOpen = false;
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isOpen) {
            dropdown.classList.remove('open');
            isOpen = false;
        } else {
            closeAllDropdowns();
            dropdown.classList.add('open');
            isOpen = true;
            render();
        }
    });
    wrapper.appendChild(trigger);
    wrapper.appendChild(dropdown);
    return wrapper;
}

function createClearButton() {
    const hasExclude = hasAnyExcludeFilters();
    const hasHighlight = hasAnyHighlightFilters();
    if (!hasExclude && !hasHighlight) return null;

    const options = [];
    if (hasExclude) options.push({label: 'Clear exclude filters', action: () => clearFiltersByMode('exclude')});
    if (hasHighlight) options.push({label: 'Clear highlight filters', action: () => clearFiltersByMode('highlight')});
    if (hasExclude && hasHighlight) options.push({label: 'Clear all filters', action: () => clearFiltersByMode('all')});

    if (options.length === 1) {
        const btn = document.createElement('button');
        btn.className = 'filter-clear';
        btn.style.marginLeft = 'auto';
        btn.textContent = options[0].label;
        btn.addEventListener('click', options[0].action);
        return btn;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'facet-select clear-dropdown-wrapper';
    wrapper.style.marginLeft = 'auto';
    const trigger = document.createElement('button');
    trigger.className = 'filter-clear';
    trigger.textContent = 'Clear\u2026';
    const dropdown = document.createElement('div');
    dropdown.className = 'clear-dropdown';
    options.forEach(opt => {
        const el = document.createElement('div');
        el.className = 'clear-dropdown-option';
        el.textContent = opt.label;
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            opt.action();
            dropdown.classList.remove('open');
        });
        dropdown.appendChild(el);
    });
    let isOpen = false;
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isOpen) {
            dropdown.classList.remove('open');
            isOpen = false;
        } else {
            closeAllDropdowns();
            dropdown.classList.add('open');
            isOpen = true;
        }
    });
    wrapper.appendChild(trigger);
    wrapper.appendChild(dropdown);
    return wrapper;
}

function clearFiltersByMode(mode) {
    state.schema.filterColumns.forEach(col => {
        if (mode === 'all' || state.filterModes[col] === mode || (mode === 'exclude' && state.filterModes[col] !== 'highlight')) {
            if (state.filters[col]) state.filters[col].clear();
        }
    });
    onFilterChange();
    renderFilterBar();
}

export function renderFilterBar(reopenCol) {
    const bar = document.getElementById('filterBar');
    if (state.raw.length === 0 || !state.schema) {
        bar.innerHTML = '';
        bar.style.display = 'none';
        return;
    }
    bar.style.display = '';
    bar.innerHTML = '';

    const schema = state.schema;
    const visibleCols = schema.visibleFilterColumns;

    visibleCols.forEach(col => {
        const colDef = schema.columns.find(c => c.key === col);
        const label = colDef ? colDef.header : col;
        const values = state.columnValues[col] || [];
        const selected = state.filters[col];
        const isHighlight = state.filterModes[col] === 'highlight';
        const hlColor = isHighlight ? (state.filterHighlightColors[col] || HIGHLIGHT_PRESETS[0].color) : null;

        const group = document.createElement('div');
        group.className = 'filter-group';
        const labelEl = document.createElement('span');
        labelEl.className = 'filter-label';
        labelEl.textContent = label;
        group.appendChild(labelEl);
        group.appendChild(createFacetSelect(col, label, values, selected, onFilterChange, hlColor, col === reopenCol));
        if (isHighlight && selected.size > 0) group.appendChild(createColorSwatches(col));
        bar.appendChild(group);
    });

    const picker = createColumnPicker(schema);
    if (picker) bar.appendChild(picker);

    const countSpan = document.createElement('span');
    countSpan.className = 'filter-active-count';
    countSpan.textContent = `${state.filtered.length.toLocaleString()} ${schema.heatmapMetric.labelPlural || 'records'}`;
    bar.appendChild(countSpan);

    const clearEl = createClearButton();
    if (clearEl) bar.appendChild(clearEl);

    // Re-open a specific column's dropdown after re-render
    if (reopenCol) {
        const facet = bar.querySelector(`.facet-select[data-col="${reopenCol}"]`);
        if (facet) {
            const trig = facet.querySelector('.facet-trigger');
            const dd = facet.querySelector('.facet-dropdown');
            if (trig && dd) {
                dd.classList.add('open');
                trig.classList.add('open');
            }
        }
    }
}

export function initFilterListeners() {
    document.addEventListener('click', closeAllDropdowns);
}
