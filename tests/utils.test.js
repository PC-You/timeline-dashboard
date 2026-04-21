/*
 * tests/utils.test.js — Tests for pure utility functions.
 */

import {assertEqual, assertDeepEqual, assertApprox} from './helpers.js';
import {dateKey, dateKeyFromStr, monthKeyFromDate, getLevel, autoThresholds, escapeHtml} from '../js/utils.js';

export const tests = {

    'dateKey formats YYYY-MM-DD with zero padding'() {
        assertEqual(dateKey(new Date(2026, 0, 1)), '2026-01-01');
        assertEqual(dateKey(new Date(2026, 11, 31)), '2026-12-31');
        assertEqual(dateKey(new Date(2023, 4, 9)), '2023-05-09');
    },

    'dateKeyFromStr extracts first 10 chars'() {
        assertEqual(dateKeyFromStr('2026-04-13T14:30:00'), '2026-04-13');
        assertEqual(dateKeyFromStr('2026-04-13'), '2026-04-13');
    },

    'monthKeyFromDate extracts YYYY-MM'() {
        assertEqual(monthKeyFromDate('2026-04-13'), '2026-04');
        assertEqual(monthKeyFromDate('2026-12-31'), '2026-12');
    },

    'getLevel zero'() {
        assertEqual(getLevel(0, [3, 8, 18]), 0);
    },

    'getLevel positive bins'() {
        assertEqual(getLevel(1, [3, 8, 18]), 1);
        assertEqual(getLevel(3, [3, 8, 18]), 1, 'lower boundary inclusive');
        assertEqual(getLevel(4, [3, 8, 18]), 2);
        assertEqual(getLevel(8, [3, 8, 18]), 2, 'boundary');
        assertEqual(getLevel(9, [3, 8, 18]), 3);
        assertEqual(getLevel(18, [3, 8, 18]), 3);
        assertEqual(getLevel(19, [3, 8, 18]), 4, 'above top');
        assertEqual(getLevel(1000, [3, 8, 18]), 4);
    },

    'getLevel negative bins mirror positive'() {
        assertEqual(getLevel(-1, [3, 8, 18]), -1);
        assertEqual(getLevel(-3, [3, 8, 18]), -1);
        assertEqual(getLevel(-4, [3, 8, 18]), -2);
        assertEqual(getLevel(-19, [3, 8, 18]), -4);
    },

    'getLevel falls back to default thresholds'() {
        // Default [3, 8, 18]
        assertEqual(getLevel(5), 2);
        assertEqual(getLevel(-5), -2);
    },

    'autoThresholds empty array'() {
        assertDeepEqual(autoThresholds([]), [1, 2, 3]);
    },

    'autoThresholds all zero or negative'() {
        assertDeepEqual(autoThresholds([0, 0, -1]), [1, 2, 3]);
    },

    'autoThresholds positive distribution uses quartiles'() {
        // 1..10 → p25=3, p50=5, p75=8 (index-based with Math.floor)
        const t = autoThresholds([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        assertEqual(t.length, 3);
        // With 10 items, Math.floor(0.25*10)=2 → sorted[2]=3
        //                Math.floor(0.50*10)=5 → sorted[5]=6
        //                Math.floor(0.75*10)=7 → sorted[7]=8
        assertDeepEqual(t, [3, 6, 8]);
    },

    'autoThresholds filters out non-positive values'() {
        // Negatives and zeros are dropped before sorting.
        // [1,2,3,4] → len=4. Math.floor(0.25*4)=1 → sorted[1]=2
        //                   Math.floor(0.50*4)=2 → sorted[2]=3
        //                   Math.floor(0.75*4)=3 → sorted[3]=4
        const t = autoThresholds([-5, -3, 0, 1, 2, 3, 4]);
        assertDeepEqual(t, [2, 3, 4]);
    },

    'escapeHtml escapes angle brackets'() {
        assertEqual(escapeHtml('<script>'), '&lt;script&gt;');
        assertEqual(escapeHtml('a & b'), 'a &amp; b');
    },

    'escapeHtml escapes quotes'() {
        assertEqual(escapeHtml('"hi"'), '&quot;hi&quot;');
        assertEqual(escapeHtml("it's"), 'it&#39;s');
    },

    'escapeHtml handles plain strings'() {
        assertEqual(escapeHtml('plain text'), 'plain text');
        assertEqual(escapeHtml(''), '');
    },
};
