/*
 * toast.js — Lightweight transient notification system.
 *
 * Usage: toast('Cleared 3 active filters on user')
 *        toast('Failed to parse', {level: 'error', duration: 5000})
 *
 * Toasts stack at the bottom-right of the viewport, fade in on arrival, and
 * fade out after their duration expires. Multiple toasts visible simultaneously
 * are fine — they stack and time out independently.
 */

const DEFAULT_DURATION = 3500;

let container = null;

function ensureContainer() {
    if (container) return container;
    container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    return container;
}

/**
 * Show a toast notification.
 * @param {string} message - Text to display.
 * @param {object} [opts]
 * @param {'info'|'warn'|'error'} [opts.level='info'] - Visual styling.
 * @param {number} [opts.duration] - Milliseconds before auto-dismiss. Default 3500.
 */
export function toast(message, opts = {}) {
    const {level = 'info', duration = DEFAULT_DURATION} = opts;
    const el = document.createElement('div');
    el.className = `toast toast-${level}`;
    el.textContent = message;
    ensureContainer().appendChild(el);

    // Trigger fade-in on next frame so the transition actually runs
    requestAnimationFrame(() => el.classList.add('visible'));

    const dismiss = () => {
        el.classList.remove('visible');
        el.addEventListener('transitionend', () => el.remove(), {once: true});
        // Fallback if transitionend doesn't fire (e.g. element already detached)
        setTimeout(() => el.remove(), 400);
    };

    const timer = setTimeout(dismiss, duration);
    // Click to dismiss early
    el.addEventListener('click', () => {
        clearTimeout(timer);
        dismiss();
    });
}
