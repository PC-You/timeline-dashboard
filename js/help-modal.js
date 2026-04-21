/*
 * help-modal.js — Help modal with Feature Guide / Roadmap / What's New tabs,
 * plus Report a Bug workflow (download state JSON + open mailto).
 */

import {state} from './state.js';

export function initHelpModal() {
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
            const bugState = {
                version: '0.5.0',
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
