/*
 * tests/date-picker-modal.test.js — Tests for analyzeColumn scoring logic.
 * The picker UI itself is not tested here (DOM-dependent).
 */

import {assertEqual, assertTrue, assertApprox} from './helpers.js';
import {analyzeColumn} from '../js/date-picker-modal.js';

export const tests = {

    'analyzeColumn scores 100% for clean ISO dates'() {
        const records = [
            {ts: '2026-01-01T10:00:00', name: 'alice'},
            {ts: '2026-01-02T10:00:00', name: 'bob'},
            {ts: '2026-01-03T10:00:00', name: 'carol'},
        ];
        const r = analyzeColumn(records, 'ts');
        assertEqual(r.score, 1);
        assertEqual(r.format, 'iso');
        assertEqual(r.samples.length, 3);
    },

    'analyzeColumn scores 0 for non-date strings that look nothing like dates'() {
        const records = [
            {name: 'alice', id: 'abc'},
            {name: 'bob', id: 'def'},
            {name: 'carol', id: 'ghi'},
        ];
        const r = analyzeColumn(records, 'name');
        // Format falls back to 'iso' but score is low because values don't parse
        assertTrue(r.score < 0.5, 'expected low score for non-dates, got ' + r.score);
    },

    'analyzeColumn handles empty column gracefully'() {
        const records = [
            {ts: '', other: 'a'},
            {ts: null, other: 'b'},
        ];
        const r = analyzeColumn(records, 'ts');
        assertEqual(r.score, 0);
        assertEqual(r.samples.length, 0);
    },

    'analyzeColumn detects Oracle DD-MON-YY format'() {
        const records = [
            {d: '13-APR-25'},
            {d: '14-APR-25'},
            {d: '15-APR-25'},
        ];
        const r = analyzeColumn(records, 'd');
        assertEqual(r.format, 'oracle-dmy');
        assertEqual(r.score, 1, 'confident non-iso formats score 1.0');
    },

    'analyzeColumn returns up to 3 samples'() {
        const records = Array.from({length: 20}, (_, i) => ({ts: `2026-01-${String(i + 1).padStart(2, '0')}`}));
        const r = analyzeColumn(records, 'ts');
        assertEqual(r.samples.length, 3);
        assertEqual(r.samples[0], '2026-01-01');
    },

    'analyzeColumn returns missing-key column as zero-score'() {
        const records = [
            {other: 'a'},
            {other: 'b'},
        ];
        const r = analyzeColumn(records, 'nonexistent');
        assertEqual(r.score, 0);
    },

    'analyzeColumn partial-date column scores between 0 and 1'() {
        const records = [
            {d: '2026-01-01'},
            {d: 'not a date'},
            {d: '2026-01-02'},
            {d: 'nope'},
        ];
        const r = analyzeColumn(records, 'd');
        assertApprox(r.score, 0.5, 0.01);
    },
};
