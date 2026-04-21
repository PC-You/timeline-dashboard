/*
 * tests/schema.test.js — Tests for schema detection.
 */

import {assertEqual, assertDeepEqual, assertTrue, assertFalse} from './helpers.js';
import {detectSchema, detectTimestampFormat, parseTimestamp} from '../js/schema.js';

export const tests = {

    'detectTimestampFormat empty → iso default'() {
        assertEqual(detectTimestampFormat([]), 'iso');
        assertEqual(detectTimestampFormat([null, '', null]), 'iso');
    },

    'detectTimestampFormat ISO'() {
        assertEqual(detectTimestampFormat(['2026-01-01', '2026-04-15T10:30:00']), 'iso');
    },

    'detectTimestampFormat Oracle DD-MON-YY'() {
        assertEqual(detectTimestampFormat(['01-JAN-26', '15-APR-26']), 'oracle-dmy');
        assertEqual(detectTimestampFormat(['1-Jan-2026']), 'oracle-dmy');
    },

    'detectTimestampFormat epoch seconds vs millis'() {
        assertEqual(detectTimestampFormat(['1735689600']), 'epoch-s');   // 2025 in s
        assertEqual(detectTimestampFormat(['1735689600000']), 'epoch-ms');
    },

    'detectTimestampFormat US vs EU when unambiguous'() {
        // 13/01/2026 → must be EU (13 > 12)
        assertEqual(detectTimestampFormat(['13/01/2026']), 'eu');
        // 01/13/2026 → must be US (13 in day slot)
        assertEqual(detectTimestampFormat(['01/13/2026']), 'us');
    },

    'detectTimestampFormat defaults to US when ambiguous'() {
        assertEqual(detectTimestampFormat(['04/05/2026']), 'us');
    },

    'detectSchema picks first timestamp-aliased column'() {
        const headers = ['id', 'created_at', 'user'];
        const records = [{id: '1', created_at: '2026-01-01', user: 'alice'}];
        const s = detectSchema(headers, records);
        assertEqual(s.timestampKey, 'created_at');
        assertEqual(s.columns[1].type, 'datetime');
    },

    'detectSchema falls back to first column when no alias matches'() {
        const headers = ['when', 'who', 'what'];
        const records = [{when: '2026-01-01', who: 'alice', what: 'insert'}];
        const s = detectSchema(headers, records);
        assertEqual(s.timestampKey, 'when');
    },

    'detectSchema exposes non-timestamp columns as filters'() {
        const headers = ['ts', 'user', 'action', 'target'];
        const records = [{ts: '2026-01-01', user: 'alice', action: 'insert', target: 'x'}];
        const s = detectSchema(headers, records);
        assertDeepEqual(s.filterColumns, ['user', 'action', 'target']);
    },

    'detectSchema caps visible filters at 4'() {
        const headers = ['ts', 'a', 'b', 'c', 'd', 'e', 'f'];
        const records = [{ts: '2026-01-01', a: '1', b: '1', c: '1', d: '1', e: '1', f: '1'}];
        const s = detectSchema(headers, records);
        assertEqual(s.visibleFilterColumns.length, 4);
        assertDeepEqual(s.visibleFilterColumns, ['a', 'b', 'c', 'd']);
    },

    'detectSchema assigns displayOrder by header index'() {
        const headers = ['ts', 'alpha', 'beta', 'gamma'];
        const s = detectSchema(headers, []);
        const order = s.columns.map(c => ({key: c.key, order: c.displayOrder}));
        assertDeepEqual(order, [
            {key: 'ts', order: 0},
            {key: 'alpha', order: 1},
            {key: 'beta', order: 2},
            {key: 'gamma', order: 3},
        ]);
    },

    'detectSchema returns empty numericColumns (populated by ingest)'() {
        // Numeric detection moved to data.js in v0.5.0 to scan the full record set.
        // detectSchema now seeds an empty array that ingest() populates.
        const s = detectSchema(['ts', 'amount'], [{ts: '2026-01-01', amount: '100'}]);
        assertDeepEqual(s.numericColumns, []);
    },

    'detectSchema seeds empty columnStats'() {
        const s = detectSchema(['ts', 'x'], []);
        assertDeepEqual(s.columnStats, {});
    },

    'detectSchema sets primary and secondary columns'() {
        const headers = ['ts', 'user', 'action'];
        const records = [{ts: '2026-01-01', user: 'alice', action: 'insert'}];
        const s = detectSchema(headers, records);
        assertEqual(s.primaryColumn, 'user');
        assertEqual(s.secondaryColumn, 'action');
    },

    'parseTimestamp ISO'() {
        const d = parseTimestamp('2026-04-15T10:30:00', 'iso');
        assertTrue(d instanceof Date);
        assertEqual(d.getFullYear(), 2026);
        assertEqual(d.getMonth(), 3); // April
        assertEqual(d.getDate(), 15);
    },

    'parseTimestamp Oracle DD-MON-YY'() {
        const d = parseTimestamp('15-APR-26', 'oracle-dmy');
        assertTrue(d instanceof Date);
        assertEqual(d.getFullYear(), 2026);
        assertEqual(d.getMonth(), 3); // April
        assertEqual(d.getDate(), 15);
    },

    'parseTimestamp epoch seconds'() {
        // 2026-01-01T00:00:00Z = 1767225600
        const d = parseTimestamp('1767225600', 'epoch-s');
        assertTrue(d instanceof Date);
        assertEqual(d.getUTCFullYear(), 2026);
        assertEqual(d.getUTCMonth(), 0);
    },

    'parseTimestamp US MM/DD/YYYY'() {
        const d = parseTimestamp('04/15/2026', 'us');
        assertEqual(d.getMonth(), 3);
        assertEqual(d.getDate(), 15);
    },

    'parseTimestamp EU DD/MM/YYYY'() {
        const d = parseTimestamp('15/04/2026', 'eu');
        assertEqual(d.getMonth(), 3);
        assertEqual(d.getDate(), 15);
    },
};
