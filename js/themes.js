/*
 * themes.js — 12-palette theme system with picker
 */

import {state} from './state.js';

// Each palette overrides accent + heatmap colors + note indicator colors.
// noteDay: color of the day-level note outline (visible on accent-colored buttons)
// noteRow: color of the row-level note indicator (visible on log table rows)
// Both must contrast with the accent and the heatmap ramp, and remain distinct from each other.
export const palettes = [
    {
        name: 'Red',
        accent: '#e63636',
        dim: 'rgba(230,54,54,0.15)',
        hm: ['#3d1a1a', '#6a1e1e', '#a52828', '#e63636'],
        nhm: ['#1a2a3d', '#1e4a6a', '#2878a5', '#36b8e6'],
        hl: 'rgba(230,54,54,0.18)',
        noteDay: '#e8a838',
        noteRow: '#04D9FF'
    },
    {
        name: 'Orange',
        accent: '#e67836',
        dim: 'rgba(230,120,54,0.15)',
        hm: ['#3d2a1a', '#6a3e1e', '#a56228', '#e67836'],
        nhm: ['#1a2a3d', '#1e3e6a', '#285ea5', '#3698e6'],
        hl: 'rgba(230,120,54,0.18)',
        noteDay: '#e8d838',
        noteRow: '#04D9FF'
    },
    {
        name: 'Amber',
        accent: '#e6b836',
        dim: 'rgba(230,184,54,0.15)',
        hm: ['#3d2e1a', '#6a4e1e', '#a58028', '#e6b836'],
        nhm: ['#1e1a3d', '#3a1e6a', '#6028a5', '#9236e6'],
        hl: 'rgba(230,184,54,0.18)',
        noteDay: '#ff6b6b',
        noteRow: '#04D9FF'
    },
    {
        name: 'Yellow',
        accent: '#e6e636',
        dim: 'rgba(230,230,54,0.15)',
        hm: ['#3d3d1a', '#6a6a1e', '#a5a528', '#e6e636'],
        nhm: ['#2a1a3d', '#4a1e6a', '#7828a5', '#b836e6'],
        hl: 'rgba(230,230,54,0.18)',
        noteDay: '#ff6b6b',
        noteRow: '#04D9FF'
    },
    {
        name: 'Green',
        accent: '#b8e636',
        dim: 'rgba(184,230,54,0.15)',
        hm: ['#2d3a1a', '#4a6a1e', '#7aa528', '#b8e636'],
        nhm: ['#3d1a2a', '#6a1e3e', '#a52850', '#e63668'],
        hl: 'rgba(184,230,54,0.18)',
        noteDay: '#e8a838',
        noteRow: '#04D9FF'
    },
    {
        name: 'Teal',
        accent: '#36e6b8',
        dim: 'rgba(54,230,184,0.15)',
        hm: ['#1a3d2e', '#1e6a4e', '#28a580', '#36e6b8'],
        nhm: ['#3d1a1e', '#6a1e28', '#a52838', '#e63650'],
        hl: 'rgba(54,230,184,0.18)',
        noteDay: '#e8a838',
        noteRow: '#ff6bcc'
    },
    {
        name: 'Blue',
        accent: '#36b8e6',
        dim: 'rgba(54,184,230,0.15)',
        hm: ['#1a2a3d', '#1e4a6a', '#2878a5', '#36b8e6'],
        nhm: ['#3d2a1a', '#6a3e1e', '#a56228', '#e67836'],
        hl: 'rgba(54,184,230,0.18)',
        noteDay: '#e8a838',
        noteRow: '#ff6bcc'
    },
    {
        name: 'Purple',
        accent: '#b836e6',
        dim: 'rgba(184,54,230,0.15)',
        hm: ['#2a1a3d', '#4a1e6a', '#7828a5', '#b836e6'],
        nhm: ['#2d3a1a', '#4a6a1e', '#7aa528', '#b8e636'],
        hl: 'rgba(184,54,230,0.18)',
        noteDay: '#e8a838',
        noteRow: '#04D9FF'
    },
    {
        name: 'Pink',
        accent: '#e636a5',
        dim: 'rgba(230,54,165,0.15)',
        hm: ['#3d1a2a', '#6a1e4a', '#a52878', '#e636a5'],
        nhm: ['#1a3d2e', '#1e6a4e', '#28a580', '#36e6b8'],
        hl: 'rgba(230,54,165,0.18)',
        noteDay: '#e8d838',
        noteRow: '#04D9FF'
    },
    {
        name: 'Brown',
        accent: '#b8965a',
        dim: 'rgba(184,150,90,0.15)',
        hm: ['#2e2518', '#544028', '#7a6238', '#b8965a'],
        nhm: ['#1a2430', '#1e3a54', '#285a7a', '#368aae'],
        hl: 'rgba(184,150,90,0.18)',
        noteDay: '#e8d838',
        noteRow: '#04D9FF'
    },
    {
        name: 'Slate',
        accent: '#8a9bae',
        dim: 'rgba(138,155,174,0.15)',
        hm: ['#1e2228', '#2e3a44', '#4e6272', '#8a9bae'],
        nhm: ['#28221e', '#443a2e', '#72604e', '#ae958a'],
        hl: 'rgba(138,155,174,0.18)',
        noteDay: '#e8a838',
        noteRow: '#04D9FF'
    },
    {
        name: 'Hi-Con',
        accent: '#ffffff',
        dim: 'rgba(255,255,255,0.15)',
        hm: ['#222222', '#555555', '#999999', '#ffffff'],
        nhm: ['#221111', '#553333', '#995555', '#ff6666'],
        hl: 'rgba(255,255,255,0.18)',
        noteDay: '#ffd700',
        noteRow: '#00ffff'
    },
];

export function applyPalette(index) {
    const p = palettes[index];
    if (!p) return;
    state.activePalette = index;
    const root = document.documentElement;
    root.style.setProperty('--accent', p.accent);
    root.style.setProperty('--accent-dim', p.dim);
    root.style.setProperty('--hm1', p.hm[0]);
    root.style.setProperty('--hm2', p.hm[1]);
    root.style.setProperty('--hm3', p.hm[2]);
    root.style.setProperty('--hm4', p.hm[3]);
    root.style.setProperty('--nhm1', p.nhm[0]);
    root.style.setProperty('--nhm2', p.nhm[1]);
    root.style.setProperty('--nhm3', p.nhm[2]);
    root.style.setProperty('--nhm4', p.nhm[3]);
    root.style.setProperty('--row-highlight', p.hl);
    root.style.setProperty('--note-outline', p.noteDay);
    root.style.setProperty('--row-note-indicator', p.noteRow);
}

export function resetPalette() {
    state.activePalette = 4; // green default
    const props = ['accent', 'accent-dim', 'hm1', 'hm2', 'hm3', 'hm4', 'row-highlight', 'note-outline', 'row-note-indicator'];
    const root = document.documentElement;
    props.forEach(p => root.style.removeProperty(`--${p}`));
}
