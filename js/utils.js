/*
 * utils.js — Pure utility functions with no dependencies on state.
 * These are the primary targets for unit tests.
 */

export function dateKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dateKeyFromStr(ts) {
    return ts.substring(0, 10);
}

export function monthKeyFromDate(dk) {
    return dk.substring(0, 7);
}

export function getLevel(value, thresholds) {
    if (!thresholds) thresholds = [3, 8, 18];
    if (value === 0) return 0;
    const abs = Math.abs(value);
    const sign = value < 0 ? -1 : 1;
    if (abs <= thresholds[0]) return sign * 1;
    if (abs <= thresholds[1]) return sign * 2;
    if (abs <= thresholds[2]) return sign * 3;
    return sign * 4;
}

export function autoThresholds(values) {
    const sorted = values.filter(v => v > 0).sort((a, b) => a - b);
    if (sorted.length === 0) return [1, 2, 3];
    const p = (pct) => sorted[Math.min(Math.floor(pct * sorted.length), sorted.length - 1)];
    return [p(0.25), p(0.50), p(0.75)];
}

// escapeHtml uses DOM, but is called from many places for escaping untrusted strings.
// Keep a pure fallback for test environments where document isn't available.
export function escapeHtml(str) {
    if (typeof document !== 'undefined') {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
    // Fallback: minimal entity escaping for Node/test environments
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
