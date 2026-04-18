/*
 * keyboard.js — Global keyboard shortcuts (Esc, Ctrl+A/Z/Y, arrow keys, Ctrl promote).
 */

import {state, app, keysHeld, clearAllSelections, hasAnySelections, undoSelection, redoSelection} from './state.js';
import {dateKey} from './utils.js';
import {refreshAllHighlights, selectAll, promoteSelectionToMulti, demoteSelectionFromMulti} from './highlights.js';
import {selectDate} from './heatmap.js';

export function initKeyboardShortcuts() {
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
