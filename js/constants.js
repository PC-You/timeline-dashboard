/*
 * constants.js — Application-wide constants. No state, no functions, no side effects.
 */

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEK_PX = 16;
export const MAX_LOG_ROWS = 80;
export const AUTO_FOCUS_THRESHOLD = 7; // initial default; user-configurable via settings
export const HORIZ_SCROLL_FACTOR = 0.3;

export const HIGHLIGHT_PRESETS = [
    {name: 'Amber', color: 'rgba(255, 180, 30, 0.75)'},
    {name: 'Cyan', color: 'rgba(0, 220, 255, 0.70)'},
    {name: 'Rose', color: 'rgba(255, 80, 80, 0.70)'},
    {name: 'Violet', color: 'rgba(180, 120, 255, 0.70)'},
    {name: 'Green', color: 'rgba(50, 230, 120, 0.70)'},
    {name: 'Blue', color: 'rgba(70, 150, 255, 0.70)'},
];
