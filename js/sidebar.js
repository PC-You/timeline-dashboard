/*
 * sidebar.js — Year sidebar navigation and heatmap sync
 */

import {WEEK_PX} from './constants.js';
import {state, app} from './state.js';

export function renderSidebar() {
    const container = document.getElementById('yearSlots');
    container.innerHTML = '';
    state.years.forEach(year => {
        const slot = document.createElement('div');
        slot.className = 'year-slot';
        slot.dataset.year = year;
        slot.innerHTML = `<div class="year-label">${year}</div>`;
        slot.addEventListener('click', () => {
            const sb = document.getElementById('sidebar');
            sb.scrollTo({top: slot.offsetTop - sb.clientHeight / 2 + slot.clientHeight / 2, behavior: 'smooth'});
        });
        container.appendChild(slot);
    });
}

export function syncHeatmap() {
    const sidebar = document.getElementById('sidebar');
    const slots = document.querySelectorAll('.year-slot');
    const sidebarRect = sidebar.getBoundingClientRect();
    const centerY = sidebarRect.top + sidebarRect.height / 2;
    let aboveSlot = null, belowSlot = null, aboveDist = Infinity, belowDist = Infinity;
    slots.forEach(slot => {
        const r = slot.getBoundingClientRect();
        const mid = r.top + r.height / 2, dist = mid - centerY;
        if (dist <= 0 && Math.abs(dist) < aboveDist) {
            aboveDist = Math.abs(dist);
            aboveSlot = {el: slot, mid, year: parseInt(slot.dataset.year)};
        }
        if (dist > 0 && dist < belowDist) {
            belowDist = dist;
            belowSlot = {el: slot, mid, year: parseInt(slot.dataset.year)};
        }
    });
    if (!aboveSlot && belowSlot) aboveSlot = belowSlot;
    if (!belowSlot && aboveSlot) belowSlot = aboveSlot;
    if (!aboveSlot) return;

    let t = 0;
    if (aboveSlot.year !== belowSlot.year) {
        t = Math.max(0, Math.min(1, (centerY - aboveSlot.mid) / (belowSlot.mid - aboveSlot.mid)));
    }
    const rangeA = state.yearWeekRanges[aboveSlot.year], rangeB = state.yearWeekRanges[belowSlot.year];
    if (!rangeA || !rangeB) return;
    const midA = ((rangeA.start + rangeA.end) / 2) * WEEK_PX, midB = ((rangeB.start + rangeB.end) / 2) * WEEK_PX;
    const targetCenter = midA + (midB - midA) * t;
    const viewportWidth = document.getElementById('heatmapInner').offsetWidth;
    const tx = -Math.max(0, targetCenter - viewportWidth / 2);
    document.getElementById('heatmapTrack').style.transform = `translateX(${tx}px)`;
    document.getElementById('monthMarkers').style.transform = `translateX(${tx}px)`;

    const visLeft = -tx;
    const visRight = visLeft + viewportWidth;
    const yearVisibility = {};
    let maxFraction = 0, mostVisibleYear = null;
    state.years.forEach(year => {
        const range = state.yearWeekRanges[year];
        if (!range) return;
        const yearLeft = range.start * WEEK_PX, yearRight = range.end * WEEK_PX;
        const yearWidth = yearRight - yearLeft;
        if (yearWidth <= 0) return;
        const overlap = Math.max(0, Math.min(visRight, yearRight) - Math.max(visLeft, yearLeft));
        const fraction = overlap / yearWidth;
        yearVisibility[year] = fraction;
        if (fraction > maxFraction) {
            maxFraction = fraction;
            mostVisibleYear = year;
        }
    });

    const MIN_BRIGHT = 28;
    const MAX_BRIGHT_R = 224, MAX_BRIGHT_G = 221, MAX_BRIGHT_B = 216;
    slots.forEach(slot => {
        const year = parseInt(slot.dataset.year);
        const fraction = yearVisibility[year] || 0;
        const isActive = year === mostVisibleYear;
        slot.classList.toggle('active', isActive);
        if (isActive) {
            slot.querySelector('.year-label').style.color = '';
        } else {
            const f = Math.pow(fraction, 0.6);
            const r = Math.round(MIN_BRIGHT + (MAX_BRIGHT_R - MIN_BRIGHT) * f);
            const g = Math.round(MIN_BRIGHT + (MAX_BRIGHT_G - MIN_BRIGHT) * f);
            const b = Math.round(MIN_BRIGHT + (MAX_BRIGHT_B - MIN_BRIGHT) * f);
            slot.querySelector('.year-label').style.color = `rgb(${r},${g},${b})`;
        }
    });

    if (mostVisibleYear && mostVisibleYear !== state.activeYear) {
        state.activeYear = mostVisibleYear;
        app.renderContent();
    }
}
