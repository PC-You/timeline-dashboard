/*
 * logger.js — Ring-buffer logger for developer diagnostics.
 *
 * When developer mode is off (default), log() is a no-op and records nothing.
 * When on, entries are buffered in memory (500-entry cap) and mirrored to the
 * browser console. The Developer Console modal reads from this buffer.
 *
 * Categories are free-form strings; agreed-upon ones:
 *   ingest, schema, csv, filter, metric, highlight, async, ui
 *
 * Levels: 'info' | 'warn' | 'error'
 */

const MAX_ENTRIES = 500;
const buffer = [];
const subscribers = new Set();

export const logger = {
    enabled: false,

    log(level, category, message, meta) {
        if (!this.enabled) return;
        const entry = {
            ts: Date.now(),
            level,
            category,
            message,
            meta: meta ?? null,
        };
        buffer.push(entry);
        if (buffer.length > MAX_ENTRIES) buffer.shift();

        // Mirror to browser console
        const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
        if (meta !== undefined) {
            fn(`[${category}] ${message}`, meta);
        } else {
            fn(`[${category}] ${message}`);
        }

        // Notify any live subscribers (the Developer Console if open)
        subscribers.forEach(fn => {
            try { fn(entry); } catch (e) { /* never let a subscriber error break logging */ }
        });
    },

    info(category, message, meta) { this.log('info', category, message, meta); },
    warn(category, message, meta) { this.log('warn', category, message, meta); },
    error(category, message, meta) { this.log('error', category, message, meta); },

    getEntries() {
        return buffer.slice();
    },

    clear() {
        buffer.length = 0;
        subscribers.forEach(fn => {
            try { fn(null); } catch (e) { /* ignore */ }
        });
    },

    subscribe(fn) {
        subscribers.add(fn);
        return () => subscribers.delete(fn);
    },
};
