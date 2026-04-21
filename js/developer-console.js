/*
 * developer-console.js — Developer Console modal.
 *
 * Opens from a </> button in the heatmap footer when developer mode is enabled.
 * Shows the logger's ring buffer with filter-by-level and filter-by-category,
 * plus Clear / Copy / Export controls. Subscribes to logger for live updates
 * while open.
 */

import {logger} from './logger.js';
import {escapeHtml} from './utils.js';

const LEVEL_ORDER = ['info', 'warn', 'error'];

let unsubscribe = null;
let activeLevelFilter = 'all';   // 'all' | 'info' | 'warn' | 'error'
let activeCategoryFilter = 'all';

function fmtTs(ts) {
    const d = new Date(ts);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    return `${h}:${m}:${s}.${ms}`;
}

function collectCategories(entries) {
    const cats = new Set();
    entries.forEach(e => cats.add(e.category));
    return Array.from(cats).sort();
}

function entryMatches(entry) {
    if (activeLevelFilter !== 'all' && entry.level !== activeLevelFilter) return false;
    if (activeCategoryFilter !== 'all' && entry.category !== activeCategoryFilter) return false;
    return true;
}

function renderEntry(entry) {
    const metaHtml = entry.meta
        ? `<pre class="dev-console-meta">${escapeHtml(JSON.stringify(entry.meta, null, 2))}</pre>`
        : '';
    return `
      <div class="dev-console-entry dev-level-${entry.level}">
        <span class="dev-console-ts">${fmtTs(entry.ts)}</span>
        <span class="dev-console-level">${entry.level}</span>
        <span class="dev-console-cat">${escapeHtml(entry.category)}</span>
        <span class="dev-console-msg">${escapeHtml(entry.message)}</span>
        ${metaHtml}
      </div>`;
}

function renderAll() {
    const list = document.getElementById('devConsoleList');
    if (!list) return;
    const entries = logger.getEntries().filter(entryMatches);
    if (entries.length === 0) {
        list.innerHTML = '<div class="dev-console-empty">No entries match the current filter.</div>';
        return;
    }
    list.innerHTML = entries.map(renderEntry).join('');
    // Auto-scroll to bottom so new entries are visible
    list.scrollTop = list.scrollHeight;
}

function refreshCategoryDropdown() {
    const select = document.getElementById('devConsoleCategory');
    if (!select) return;
    const cats = collectCategories(logger.getEntries());
    const current = select.value || 'all';
    select.innerHTML = '<option value="all">all categories</option>' +
        cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    // Preserve selection if still valid
    if (current === 'all' || cats.includes(current)) {
        select.value = current;
    } else {
        select.value = 'all';
        activeCategoryFilter = 'all';
    }
}

function copyToClipboard() {
    const entries = logger.getEntries().filter(entryMatches);
    const text = entries.map(e => {
        const metaPart = e.meta ? ' ' + JSON.stringify(e.meta) : '';
        return `${fmtTs(e.ts)} [${e.level}] [${e.category}] ${e.message}${metaPart}`;
    }).join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
            () => flashButton('devConsoleCopy', 'Copied'),
            () => flashButton('devConsoleCopy', 'Failed')
        );
    } else {
        flashButton('devConsoleCopy', 'Not supported');
    }
}

function flashButton(id, label) {
    const btn = document.getElementById(id);
    if (!btn) return;
    const orig = btn.textContent;
    btn.textContent = label;
    setTimeout(() => { btn.textContent = orig; }, 1200);
}

function exportLog() {
    const entries = logger.getEntries();
    const payload = {
        exportedAt: new Date().toISOString(),
        entryCount: entries.length,
        entries,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timeline-dashboard-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function openDeveloperConsole() {
    const overlay = document.getElementById('devConsoleOverlay');
    if (!overlay) return;
    overlay.style.display = '';
    refreshCategoryDropdown();
    renderAll();
    // Subscribe to live updates
    if (unsubscribe) unsubscribe();
    unsubscribe = logger.subscribe(() => {
        refreshCategoryDropdown();
        renderAll();
    });
}

export function closeDeveloperConsole() {
    const overlay = document.getElementById('devConsoleOverlay');
    if (overlay) overlay.style.display = 'none';
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
}

export function initDeveloperConsole() {
    const overlay = document.getElementById('devConsoleOverlay');
    if (!overlay) return;

    document.getElementById('devConsoleClose')?.addEventListener('click', closeDeveloperConsole);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeDeveloperConsole();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.style.display !== 'none') {
            e.stopImmediatePropagation();
            closeDeveloperConsole();
        }
    }, true);

    // Level filter
    document.getElementById('devConsoleLevel')?.addEventListener('change', (e) => {
        activeLevelFilter = e.target.value;
        renderAll();
    });
    // Category filter
    document.getElementById('devConsoleCategory')?.addEventListener('change', (e) => {
        activeCategoryFilter = e.target.value;
        renderAll();
    });
    // Clear button
    document.getElementById('devConsoleClear')?.addEventListener('click', () => {
        logger.clear();
        renderAll();
        refreshCategoryDropdown();
    });
    // Copy button
    document.getElementById('devConsoleCopy')?.addEventListener('click', copyToClipboard);
    // Export button
    document.getElementById('devConsoleExport')?.addEventListener('click', exportLog);
}
