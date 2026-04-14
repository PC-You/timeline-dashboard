/*
 * notes.js — Day-level and row-level notes with heatmap indicators
 */

import {state, app} from './state.js';

export function setDayNote(dk, text) {
    if (!state.notes[dk]) state.notes[dk] = {dayNote: '', rowNotes: {}};
    state.notes[dk].dayNote = text;
    if (!text && Object.keys(state.notes[dk].rowNotes).length === 0) delete state.notes[dk];
}

export function setRowNote(dk, idx, text) {
    if (!state.notes[dk]) state.notes[dk] = {dayNote: '', rowNotes: {}};
    if (text) state.notes[dk].rowNotes[idx] = text;
    else delete state.notes[dk].rowNotes[idx];
    if (!state.notes[dk].dayNote && Object.keys(state.notes[dk].rowNotes).length === 0) delete state.notes[dk];
}

export function getRowNote(dk, idx) {
    const nd = state.notes[dk];
    return nd && nd.rowNotes[idx] ? nd.rowNotes[idx] : '';
}

export function hasDayNote(dk) {
    const nd = state.notes[dk];
    return nd && nd.dayNote && nd.dayNote.length > 0;
}

export function hasAnyRowNotes(dk) {
    const nd = state.notes[dk];
    return nd && Object.keys(nd.rowNotes).length > 0;
}

export function refreshNoteIndicators() {
    document.querySelectorAll('.heatmap-cell.has-day-note, .heatmap-cell.has-row-note').forEach(cell => {
        cell.classList.remove('has-day-note', 'has-row-note');
    });
    for (const dk in state.notes) {
        const nd = state.notes[dk];
        if (!nd) continue;
        const cell = document.querySelector(`.heatmap-cell[data-date="${dk}"]`);
        if (!cell) continue;
        if (nd.dayNote && nd.dayNote.length > 0) cell.classList.add('has-day-note');
        if (Object.keys(nd.rowNotes).length > 0) cell.classList.add('has-row-note');
    }
}

let noteModalState = {type: null, dateStr: null, rowIdx: null};

export function openNoteModal(type, dateStr, rowIdx) {
    noteModalState = {type, dateStr, rowIdx};
    const title = document.getElementById('noteModalTitle');
    const textarea = document.getElementById('noteTextarea');
    const deleteBtn = document.getElementById('noteDeleteBtn');
    if (type === 'day') {
        const d = new Date(dateStr + 'T00:00:00');
        title.textContent = `Note \u00b7 ${d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        })}`;
        const nd = state.notes[dateStr];
        textarea.value = nd ? nd.dayNote : '';
    } else {
        title.textContent = `Row Note \u00b7 Entry #${rowIdx + 1}`;
        textarea.value = getRowNote(dateStr, rowIdx);
    }
    deleteBtn.style.display = textarea.value ? '' : 'none';
    document.getElementById('noteModalOverlay').style.display = '';
    setTimeout(() => textarea.focus(), 0);
}

function closeNoteModal() {
    document.getElementById('noteModalOverlay').style.display = 'none';
}

export function initNoteListeners() {
    document.getElementById('noteModalClose').addEventListener('click', closeNoteModal);
    document.getElementById('noteCancelBtn').addEventListener('click', closeNoteModal);
    document.getElementById('noteModalOverlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeNoteModal();
    });
    document.getElementById('noteSaveBtn').addEventListener('click', () => {
        const text = document.getElementById('noteTextarea').value.trim();
        if (noteModalState.type === 'day') setDayNote(noteModalState.dateStr, text);
        else setRowNote(noteModalState.dateStr, noteModalState.rowIdx, text);
        refreshNoteIndicators();
        app.renderContent();
        closeNoteModal();
    });
    document.getElementById('noteDeleteBtn').addEventListener('click', () => {
        if (noteModalState.type === 'day') setDayNote(noteModalState.dateStr, '');
        else setRowNote(noteModalState.dateStr, noteModalState.rowIdx, '');
        refreshNoteIndicators();
        app.renderContent();
        closeNoteModal();
    });
}
