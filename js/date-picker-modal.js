/*
 * date-picker-modal.js — Date column picker shown on CSV load when auto-detect
 * is off OR when no recognized timestamp-alias header is present.
 *
 * Exports maybeShowDatePicker(records, headers) -> Promise<{timestampKey, timestampFormat} | null>
 *   Resolves to null if the user cancels. Resolves with the chosen column and
 *   its detected format otherwise.
 */

import {settings} from './state.js';
import {escapeHtml} from './utils.js';
import {detectTimestampFormat, parseTimestamp, TIMESTAMP_ALIASES} from './schema.js';

// Human-readable labels for detected formats
const FORMAT_LABELS = {
    'iso': 'ISO 8601',
    'epoch-s': 'Unix epoch (seconds)',
    'epoch-ms': 'Unix epoch (milliseconds)',
    'oracle-dmy': 'Oracle DD-MON-YY',
    'human-dmy': 'Day Month Year',
    'human-mdy': 'Month Day, Year',
    'us': 'US (MM/DD/YYYY)',
    'eu': 'EU (DD/MM/YYYY)',
};

function formatLabel(fmt) {
    return FORMAT_LABELS[fmt] || fmt;
}

/**
 * Score a column as a date candidate. Columns with a high parseable-date rate
 * are ranked higher. Returns { score, format, samples } where score is 0–1.
 * Exported for testing.
 */
export function analyzeColumn(records, key) {
    const samples = records.slice(0, 50).map(r => r[key]).filter(v => v != null && v !== '');
    if (samples.length === 0) return {score: 0, format: null, samples: []};

    const format = detectTimestampFormat(samples);

    // Count how many samples actually parse as dates under this format.
    // parseTimestamp handles all non-iso formats; for iso we use Date directly.
    let validCount = 0;
    for (const v of samples) {
        if (format === 'iso') {
            const d = new Date(v);
            if (!isNaN(d) && d.getFullYear() > 1900 && /\d{4}/.test(String(v))) validCount++;
        } else {
            if (parseTimestamp(v, format) !== null) validCount++;
        }
    }
    const score = validCount / samples.length;
    return {score, format, samples: samples.slice(0, 3)};
}

export function maybeShowDatePicker(records, headers) {
    return new Promise((resolve) => {
        const lowerHeaders = headers.map(h => h.toLowerCase().trim());
        const aliasIdx = lowerHeaders.findIndex(h => TIMESTAMP_ALIASES.includes(h));
        const aliasMatched = aliasIdx !== -1;

        // Auto-detect and skip picker only if setting is on AND we found a known alias
        if (settings.autoDetectDateColumn && aliasMatched) {
            const key = lowerHeaders[aliasIdx];
            const analysis = analyzeColumn(records, key);
            resolve({timestampKey: key, timestampFormat: analysis.format});
            return;
        }

        // Analyze every column
        const candidates = headers.map((h, i) => {
            const key = lowerHeaders[i];
            const isAlias = TIMESTAMP_ALIASES.includes(key);
            const a = analyzeColumn(records, key);
            return {
                key,
                header: h,
                format: a.format,
                score: a.score,
                samples: a.samples,
                isAlias,
                originalIdx: i,
            };
        });

        // Sort: score desc, then original order for ties (stable)
        candidates.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.originalIdx - b.originalIdx;
        });

        // Default selection: top of sorted list
        let selectedKey = candidates[0]?.key || lowerHeaders[0];

        // Warning threshold — if no column clears this, warn the user
        const CONFIDENCE_THRESHOLD = 0.5;
        const hasConfidentCandidate = candidates.some(c => c.score >= CONFIDENCE_THRESHOLD);

        // Build and show modal
        const overlay = document.getElementById('datePickerOverlay');
        const list = document.getElementById('datePickerList');
        const cancelBtn = document.getElementById('datePickerCancel');
        const closeBtn = document.getElementById('datePickerClose');
        const confirmBtn = document.getElementById('datePickerConfirm');
        if (!overlay || !list || !confirmBtn) {
            // Fallback: no modal in DOM, behave as if auto-detect succeeded
            resolve({timestampKey: selectedKey, timestampFormat: candidates[0]?.format || 'iso'});
            return;
        }

        list.innerHTML = '';

        // Warn if nothing clears the threshold
        if (!hasConfidentCandidate) {
            const warning = document.createElement('div');
            warning.className = 'date-picker-warning';
            warning.innerHTML = `
                <span class="date-picker-warning-icon">⚠</span>
                <div>
                    <strong>No column parsed cleanly as dates.</strong>
                    The highest confidence is ${Math.round(candidates[0].score * 100)}%. You may want to cancel
                    and check that your date column uses a recognized format (ISO 8601, Oracle DD-MON-YY, US/EU,
                    or Unix epoch), or pick the best available option below and see if it works.
                </div>`;
            list.appendChild(warning);
        }

        candidates.forEach(c => {
            const row = document.createElement('label');
            row.className = 'date-picker-row' + (c.key === selectedKey ? ' selected' : '');
            row.dataset.columnKey = c.key;
            const confidencePct = Math.round(c.score * 100);
            const confidenceClass = c.score >= 0.8 ? 'high' : c.score >= 0.4 ? 'med' : 'low';
            const samplesText = c.samples.length > 0 ? c.samples.join(', ') : '(no values)';
            row.innerHTML = `
                <input type="radio" name="datePickerColumn" value="${c.key}" ${c.key === selectedKey ? 'checked' : ''}>
                <div class="date-picker-row-main">
                    <div class="date-picker-row-header">
                        <span class="date-picker-col-name">${escapeHtml(c.header)}</span>
                        ${c.isAlias ? '<span class="date-picker-badge">named match</span>' : ''}
                        <span class="date-picker-confidence ${confidenceClass}">${confidencePct}%</span>
                    </div>
                    <div class="date-picker-row-detail">
                        <span class="date-picker-format">${formatLabel(c.format)}</span>
                        <span class="date-picker-samples">${escapeHtml(samplesText)}</span>
                    </div>
                </div>`;
            row.addEventListener('click', () => {
                selectedKey = c.key;
                list.querySelectorAll('.date-picker-row').forEach(r => r.classList.toggle('selected', r.dataset.columnKey === selectedKey));
                row.querySelector('input[type="radio"]').checked = true;
            });
            list.appendChild(row);
        });

        const finish = (value) => {
            overlay.style.display = 'none';
            cancelBtn?.removeEventListener('click', onCancel);
            closeBtn?.removeEventListener('click', onCancel);
            confirmBtn.removeEventListener('click', onConfirm);
            overlay.removeEventListener('click', onBackdrop);
            document.removeEventListener('keydown', onKey, true);
            resolve(value);
        };
        const onCancel = () => finish(null);
        const onConfirm = () => {
            const chosen = candidates.find(c => c.key === selectedKey);
            finish({timestampKey: chosen.key, timestampFormat: chosen.format});
        };
        const onBackdrop = (e) => { if (e.target === overlay) onCancel(); };
        const onKey = (e) => {
            if (e.key === 'Escape') { e.stopImmediatePropagation(); onCancel(); }
            else if (e.key === 'Enter') { e.stopImmediatePropagation(); onConfirm(); }
        };

        cancelBtn?.addEventListener('click', onCancel);
        closeBtn?.addEventListener('click', onCancel);
        confirmBtn.addEventListener('click', onConfirm);
        overlay.addEventListener('click', onBackdrop);
        document.addEventListener('keydown', onKey, true);

        overlay.style.display = '';
    });
}
